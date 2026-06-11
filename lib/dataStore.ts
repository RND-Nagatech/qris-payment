import AsyncStorage from "@react-native-async-storage/async-storage";

const QRIS_STORAGE_KEY = "@qris_string";
const PAYMENTS_STORAGE_KEY = "@payment_items";
const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");

export type PaymentItem = {
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

type StoredPaymentItem = Partial<PaymentItem> & {
  id: string;
  amount: number;
  createdAt: string;
  title?: string;
  customer?: string;
};

type PaymentPayload = {
  note: string;
  amount: number;
  feeType: "none" | "fixed" | "percent";
  feeValue: string;
};

export function calculateFeeAmount(amount: number, feeType: PaymentItem["feeType"], feeValue: string): number {
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

function normalizeStoredPayment(item: StoredPaymentItem): PaymentItem {
  const feeType = item.feeType ?? "none";
  const feeValue = item.feeValue ?? "";
  const feeAmount = item.feeAmount ?? calculateFeeAmount(item.amount, feeType, feeValue);

  return {
    id: item.id,
    note: item.note || item.title || item.customer || "Pembayaran",
    amount: item.amount,
    feeType,
    feeValue,
    feeAmount,
    totalAmount: item.totalAmount ?? item.amount + feeAmount,
    status: item.status ?? "pending",
    createdAt: item.createdAt,
    paidAt: item.paidAt,
  };
}

async function loadAllLocalPayments(): Promise<PaymentItem[]> {
  const savedPayments = await AsyncStorage.getItem(PAYMENTS_STORAGE_KEY);
  const parsed = savedPayments ? (JSON.parse(savedPayments) as StoredPaymentItem[]) : [];
  return parsed.map(normalizeStoredPayment);
}

function isTodayLocal(isoDate?: string): boolean {
  if (!isoDate) return false;
  return new Date(isoDate).toDateString() === new Date().toDateString();
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new Error("API URL is not configured.");
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch {
    throw new Error("Backend API tidak bisa dijangkau. Pastikan server berjalan dan EXPO_PUBLIC_API_URL memakai IP yang benar.");
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? "API request failed.");
  }

  return response.json() as Promise<T>;
}

export async function loadQrisString(): Promise<string> {
  if (API_URL) {
    const data = await apiRequest<{ qrisString: string | null }>("/api/settings/qris");
    return data.qrisString ?? "";
  }

  return (await AsyncStorage.getItem(QRIS_STORAGE_KEY)) ?? "";
}

export async function saveQrisString(qrisString: string): Promise<void> {
  if (API_URL) {
    await apiRequest("/api/settings/qris", {
      method: "PUT",
      body: JSON.stringify({ qrisString }),
    });
    return;
  }

  await AsyncStorage.setItem(QRIS_STORAGE_KEY, qrisString);
}

export async function clearQrisString(): Promise<void> {
  if (API_URL) {
    await apiRequest("/api/settings/qris", { method: "DELETE" });
    return;
  }

  await AsyncStorage.removeItem(QRIS_STORAGE_KEY);
}

export async function loadPayments(): Promise<PaymentItem[]> {
  if (API_URL) {
    const data = await apiRequest<{ payments: PaymentItem[] }>("/api/payments");
    return data.payments.map(normalizeStoredPayment);
  }

  return (await loadAllLocalPayments()).filter((item) => item.status === "pending");
}

export async function loadTodayHistory(): Promise<PaymentItem[]> {
  if (API_URL) {
    const data = await apiRequest<{ payments: PaymentItem[] }>("/api/payments/history/today");
    return data.payments.map(normalizeStoredPayment);
  }

  return (await loadAllLocalPayments())
    .filter((item) => isTodayLocal(item.status === "paid" ? item.paidAt : item.createdAt))
    .sort((a, b) => new Date(b.paidAt ?? b.createdAt).getTime() - new Date(a.paidAt ?? a.createdAt).getTime());
}

export async function createPayment(payload: PaymentPayload): Promise<PaymentItem> {
  if (API_URL) {
    const data = await apiRequest<{ payment: PaymentItem }>("/api/payments", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return normalizeStoredPayment(data.payment);
  }

  const payments = await loadAllLocalPayments();
  const feeAmount = calculateFeeAmount(payload.amount, payload.feeType, payload.feeValue);
  const payment: PaymentItem = {
    id: `PAY-${Date.now()}`,
    note: payload.note.trim() || "Pembayaran",
    amount: payload.amount,
    feeType: payload.feeType,
    feeValue: payload.feeType === "none" ? "" : payload.feeValue,
    feeAmount,
    totalAmount: payload.amount + feeAmount,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify([payment, ...payments]));
  return payment;
}

export async function deletePayment(id: string): Promise<void> {
  if (API_URL) {
    await apiRequest(`/api/payments/${encodeURIComponent(id)}`, { method: "DELETE" });
    return;
  }

  const payments = await loadAllLocalPayments();
  await AsyncStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(payments.filter((item) => item.id !== id)));
}

export async function markPaymentPaid(id: string): Promise<void> {
  if (API_URL) {
    await apiRequest(`/api/payments/${encodeURIComponent(id)}/paid`, { method: "PATCH" });
    return;
  }

  const payments = await loadAllLocalPayments();
  const nextPayments = payments.map((item) => (
    item.id === id ? { ...item, status: "paid" as const, paidAt: new Date().toISOString() } : item
  ));
  await AsyncStorage.setItem(PAYMENTS_STORAGE_KEY, JSON.stringify(nextPayments));
}
