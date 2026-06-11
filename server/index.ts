import cors from "cors";
import "dotenv/config";
import express from "express";
import { MongoClient } from "mongodb";

type PaymentDocument = {
  id: string;
  note: string;
  amount: number;
  feeType: "none" | "fixed" | "percent";
  feeValue: string;
  feeAmount: number;
  totalAmount: number;
  status: "pending" | "paid";
  createdAt: string;
  paidAt?: string;
};

type SettingDocument = {
  _id: string;
  qrisString?: string;
  updatedAt?: string;
};

const uri = process.env.MONGODB_URI;
const port = Number(process.env.PORT ?? 4000);

if (!uri) {
  throw new Error("MONGODB_URI is required.");
}

const client = new MongoClient(uri);
const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

async function getDb() {
  await client.connect();
  return client.db();
}

function calculateFeeAmount(amount: number, feeType: PaymentDocument["feeType"], feeValue: string): number {
  if (feeType === "fixed") {
    return Math.max(0, Math.floor(Number(feeValue.replace(/\D/g, "")) || 0));
  }

  if (feeType === "percent") {
    const percent = Number(feeValue.replace(",", "."));
    if (!Number.isFinite(percent) || percent <= 0) return 0;
    return Math.floor((amount * percent) / 100);
  }

  return 0;
}

function jakartaDateKey(isoDate?: string): string {
  if (!isoDate) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(isoDate));
}

function isTodayJakarta(payment: PaymentDocument): boolean {
  const today = jakartaDateKey(new Date().toISOString());
  const relevantDate = payment.status === "paid" ? payment.paidAt : payment.createdAt;
  return jakartaDateKey(relevantDate) === today;
}

app.get("/health", async (_req, res, next) => {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/settings/qris", async (_req, res, next) => {
  try {
    const db = await getDb();
    const setting = await db.collection<SettingDocument>("settings").findOne({ _id: "qris" });
    res.json({ qrisString: setting?.qrisString ?? null });
  } catch (error) {
    next(error);
  }
});

app.put("/api/settings/qris", async (req, res, next) => {
  try {
    const qrisString = String(req.body?.qrisString ?? "").trim();
    if (!qrisString) {
      res.status(400).json({ message: "qrisString is required." });
      return;
    }

    const db = await getDb();
    await db.collection<SettingDocument>("settings").updateOne(
      { _id: "qris" },
      { $set: { qrisString, updatedAt: new Date().toISOString() } },
      { upsert: true },
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/settings/qris", async (_req, res, next) => {
  try {
    const db = await getDb();
    await db.collection<SettingDocument>("settings").deleteOne({ _id: "qris" });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/payments", async (_req, res, next) => {
  try {
    const db = await getDb();
    const payments = await db
      .collection<PaymentDocument>("payments")
      .find({ status: "pending" })
      .sort({ createdAt: -1 })
      .project({ _id: 0, id: 1, note: 1, amount: 1, feeType: 1, feeValue: 1, feeAmount: 1, totalAmount: 1, status: 1, createdAt: 1, paidAt: 1 })
      .toArray();

    res.json({ payments });
  } catch (error) {
    next(error);
  }
});

app.get("/api/payments/history/today", async (_req, res, next) => {
  try {
    const db = await getDb();
    const payments = await db
      .collection<PaymentDocument>("payments")
      .find({})
      .project({ _id: 0, id: 1, note: 1, amount: 1, feeType: 1, feeValue: 1, feeAmount: 1, totalAmount: 1, status: 1, createdAt: 1, paidAt: 1 })
      .toArray() as PaymentDocument[];

    res.json({
      payments: payments
        .filter((payment) => isTodayJakarta(payment))
        .sort((a, b) => new Date(b.paidAt ?? b.createdAt).getTime() - new Date(a.paidAt ?? a.createdAt).getTime()),
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/payments", async (req, res, next) => {
  try {
    const amount = Number(req.body?.amount);
    const note = String(req.body?.note ?? "").trim() || "Pembayaran";
    const feeType = ["none", "fixed", "percent"].includes(req.body?.feeType) ? req.body.feeType : "none";
    const feeValue = feeType === "none" ? "" : String(req.body?.feeValue ?? "").trim();
    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ message: "Valid amount is required." });
      return;
    }

    const feeAmount = calculateFeeAmount(amount, feeType, feeValue);
    const payment: PaymentDocument = {
      id: `PAY-${Date.now()}`,
      note,
      amount,
      feeType,
      feeValue,
      feeAmount,
      totalAmount: amount + feeAmount,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    const db = await getDb();
    await db.collection<PaymentDocument>("payments").insertOne(payment);
    res.status(201).json({
      payment: {
        id: payment.id,
        note: payment.note,
        amount: payment.amount,
        feeType: payment.feeType,
        feeValue: payment.feeValue,
        feeAmount: payment.feeAmount,
        totalAmount: payment.totalAmount,
        status: payment.status,
        createdAt: payment.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/payments/:id/paid", async (req, res, next) => {
  try {
    const db = await getDb();
    const result = await db.collection<PaymentDocument>("payments").updateOne(
      { id: req.params.id, status: "pending" },
      { $set: { status: "paid", paidAt: new Date().toISOString() } },
    );

    if (!result.matchedCount) {
      res.status(404).json({ message: "Payment not found." });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/payments/:id", async (req, res, next) => {
  try {
    const db = await getDb();
    await db.collection<PaymentDocument>("payments").deleteOne({ id: req.params.id });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({ message: error instanceof Error ? error.message : "Internal server error." });
});

app.listen(port, () => {
  console.log(`QRIS API listening on http://localhost:${port}`);
});
