import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import QRCode from "react-native-qrcode-svg";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as Sharing from "expo-sharing";
import { useFocusEffect, useNavigation } from "expo-router";
import {
  createPayment,
  deletePayment as deleteStoredPayment,
  loadPayments,
  loadQrisString,
  markPaymentPaid,
  type PaymentItem,
} from "../lib/dataStore";
import { formatRupiah, getMerchantInfo, normalizeQris } from "../lib/qris";
import { DEMO_STATIC_QRIS, generateDynamicQris } from "../contohqris";

export default function Home() {
  const navigation = useNavigation();
  const [qris, setQris] = useState("");
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newFeeType, setNewFeeType] = useState<"none" | "fixed" | "percent">("none");
  const [newFeeValue, setNewFeeValue] = useState("");
  const qrCodeRef = useRef<{ toDataURL: (callback: (data: string) => void) => void } | null>(null);

  const activeQris = qris || DEMO_STATIC_QRIS;
  const isDemoMode = !qris;
  const selectedPayment = payments.find((item) => item.id === selectedPaymentId) ?? null;

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: selectedPayment
        ? { display: "none" }
        : {
            backgroundColor: "#FFFFFF",
            borderTopColor: "#E5E7EB",
            height: 72,
            paddingBottom: 10,
            paddingTop: 8,
          },
    });
  }, [navigation, selectedPayment]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      Promise.all([loadQrisString(), loadPayments()]).then(([savedQris, savedPayments]) => {
        if (!isActive) return;
        setQris(savedQris);
        setPayments(savedPayments);
      }).catch(() => {
        if (!isActive) return;
        setQris("");
        setPayments([]);
      });

      return () => {
        isActive = false;
      };
    }, [])
  );

  const info = useMemo(() => {
    try {
      return activeQris ? getMerchantInfo(activeQris) : null;
    } catch {
      return null;
    }
  }, [activeQris]);

  const totalAmount = payments.reduce((sum, item) => sum + item.totalAmount, 0);

  const nextDynamicQris = useMemo(() => {
    if (!selectedPayment) return "";

    try {
      const mappedFeeType = selectedPayment.feeType === "percent" ? "Persentase" : "Rupiah";
      const mappedFeeValue =
        selectedPayment.feeType === "none"
          ? ""
          : selectedPayment.feeType === "fixed"
            ? selectedPayment.feeValue.replace(/\D/g, "")
            : selectedPayment.feeValue.replace(",", ".");

      return generateDynamicQris(
        normalizeQris(activeQris),
        String(selectedPayment.amount),
        mappedFeeType,
        mappedFeeValue,
      );
    } catch {
      return "";
    }
  }, [activeQris, selectedPayment]);

  const closeDetail = () => {
    setSelectedPaymentId(null);
  };

  const addPayment = async () => {
    const amount = Number(newAmount.replace(/\D/g, ""));
    if (amount <= 0) {
      Alert.alert("Nominal belum valid", "Masukkan nominal pembayaran terlebih dahulu.");
      return;
    }

    try {
      const nextItem = await createPayment({
        note: newNote.trim() || "Pembayaran",
        amount,
        feeType: newFeeType,
        feeValue: newFeeType === "none" ? "" : newFeeValue,
      });

      setPayments([nextItem, ...payments]);
      setNewNote("");
      setNewAmount("");
      setNewFeeType("none");
      setNewFeeValue("");
      setIsAddOpen(false);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert("Gagal menyimpan", "Backend API tidak bisa dijangkau. Pastikan server berjalan dan URL API benar.");
    }
  };

  const deletePayment = async (id: string) => {
    try {
      await deleteStoredPayment(id);
      const nextPayments = payments.filter((item) => item.id !== id);
      setPayments(nextPayments);
      if (selectedPaymentId === id) closeDetail();
    } catch {
      Alert.alert("Gagal menghapus", "Backend API tidak bisa dijangkau. Coba lagi setelah server aktif.");
    }
  };

  const simulatePaid = async () => {
    if (!selectedPayment) return;

    try {
      await markPaymentPaid(selectedPayment.id);
      setPayments(payments.filter((item) => item.id !== selectedPayment.id));
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Pembayaran Berhasil", `${selectedPayment.note} senilai ${formatRupiah(selectedPayment.totalAmount)} sudah dibayar.`, [
        { text: "OK", onPress: closeDetail },
      ]);
    } catch {
      Alert.alert("Gagal update pembayaran", "Backend API tidak bisa dijangkau. Status belum diubah.");
    }
  };

  const downloadQr = async () => {
    if (!nextDynamicQris || !qrCodeRef.current) {
      Alert.alert("QR belum tersedia", "QR belum bisa dibuat untuk pembayaran ini.");
      return;
    }

    try {
      const base64 = await new Promise<string>((resolve) => {
        qrCodeRef.current?.toDataURL(resolve);
      });
      const fileUri = `${FileSystem.cacheDirectory}qris-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          dialogTitle: "Download QRIS",
          mimeType: "image/png",
          UTI: "public.png",
        });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("QR Code Tersimpan", "QR code berhasil dibuat.");
      } else {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("QR tersimpan", fileUri);
      }
    } catch {
      Alert.alert("Download gagal", "QR belum bisa disimpan sebagai gambar.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {isDemoMode ? (
        <View style={styles.demoBox}>
          <Ionicons name="flask-outline" size={18} color="#B45309" />
          <View style={styles.demoTextWrap}>
            <Text style={styles.demoTitle}>Mode Demo</Text>
            <Text style={styles.demoText}>Belum ada QRIS asli. App memakai contohqris.ts untuk simulasi.</Text>
          </View>
        </View>
      ) : null}

      {selectedPayment ? (
        <PaymentDetail
          generatedQris={nextDynamicQris}
          infoName={info?.merchant ?? "Merchant"}
          payment={selectedPayment}
          qrCodeRef={qrCodeRef}
          onBack={closeDetail}
          onCopy={async () => {
            await Clipboard.setStringAsync(nextDynamicQris);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            Alert.alert("Tersalin", "QRIS string tersalin ke clipboard.");
          }}
          onDelete={() => deletePayment(selectedPayment.id)}
          onDownload={downloadQr}
          onPaid={simulatePaid}
        />
      ) : (
        <>
          <View style={styles.summaryCard}>
            <View style={styles.summaryBlock}>
              <Text style={styles.summaryLabel}>TOTAL DATA</Text>
              <Text style={styles.summaryValue}>{payments.length}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryBlock}>
              <Text style={styles.summaryLabel}>MENUNGGU</Text>
              <Text style={styles.summaryAmount}>{payments.length ? formatRupiah(totalAmount) : "Tidak Ada"}</Text>
            </View>
          </View>

          <Pressable style={styles.addButton} onPress={() => setIsAddOpen(true)}>
            <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
            <Text style={styles.addButtonText}>Tambah Data Pembayaran</Text>
          </Pressable>

          {payments.length ? (
            <View style={styles.paymentList}>
              {payments.map((payment) => (
                <Pressable
                  key={payment.id}
                  style={styles.paymentCard}
                  onPress={() => {
                    setSelectedPaymentId(payment.id);
                  }}
                >
                  <View style={styles.paymentTopRow}>
                    <Text style={styles.paymentCode}>{payment.id}</Text>
                    <View style={styles.waitingBadge}>
                      <Text style={styles.waitingBadgeText}>BELUM BAYAR</Text>
                    </View>
                  </View>
                  <Text style={styles.paymentTitle}>{payment.note}</Text>
                  <View style={styles.paymentMetaRow}>
                    <Text style={styles.paymentMetaLabel}>Nominal</Text>
                    <Text style={styles.paymentAmount}>{formatRupiah(payment.amount)}</Text>
                  </View>
                  <View style={styles.paymentMetaRow}>
                    <Text style={styles.paymentMetaLabel}>Service Fee</Text>
                    <Text style={styles.paymentFee}>{formatFee(payment)}</Text>
                  </View>
                  <View style={styles.paymentMetaRow}>
                    <Text style={styles.paymentMetaLabel}>Total Bayar</Text>
                    <Text style={styles.paymentTotal}>{formatRupiah(payment.totalAmount)}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="receipt-outline" size={32} color="#94A3B8" />
              <Text style={styles.emptyTitle}>Belum ada data pembayaran</Text>
              <Text style={styles.emptyText}>Tambahkan nominal pembayaran, lalu pilih card untuk generate QR.</Text>
            </View>
          )}

        </>
      )}

      <Modal animationType="fade" transparent visible={isAddOpen} onRequestClose={() => setIsAddOpen(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalDialog}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tambah Data Pembayaran</Text>
              <Pressable style={styles.iconButton} onPress={() => setIsAddOpen(false)}>
                <Ionicons name="close" size={20} color="#0F172A" />
              </Pressable>
            </View>

            <Text style={styles.fieldLabel}>Nominal (Rupiah)</Text>
            <View style={styles.amountWrap}>
              <Text style={styles.rp}>Rp</Text>
              <TextInput
                value={newAmount ? Number(newAmount.replace(/\D/g, "")).toLocaleString("id-ID") : ""}
                onChangeText={(text) => setNewAmount(text.replace(/\D/g, ""))}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor="#94A3B8"
                style={styles.amountInput}
              />
            </View>

            <Text style={styles.fieldLabel}>Keterangan</Text>
            <TextInput
              value={newNote}
              onChangeText={setNewNote}
              placeholder="Contoh: Penjualan, DP pesanan, atau bebas"
              placeholderTextColor="#94A3B8"
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>Service Fee</Text>
            <View style={styles.segment}>
              {(["none", "fixed", "percent"] as const).map((type) => (
                <Pressable
                  key={type}
                  onPress={() => {
                    setNewFeeType(type);
                    setNewFeeValue("");
                    Haptics.selectionAsync();
                  }}
                  style={[styles.segItem, newFeeType === type && styles.segItemActive]}
                >
                  <Text style={[styles.segText, newFeeType === type && styles.segTextActive]}>
                    {type === "none" ? "Tidak ada" : type === "fixed" ? "Tetap (Rp)" : "Persen (%)"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {newFeeType !== "none" ? (
              newFeeType === "fixed" ? (
                <View style={styles.amountWrap}>
                  <Text style={styles.rp}>Rp</Text>
                  <TextInput
                    value={newFeeValue ? Number(newFeeValue.replace(/\D/g, "")).toLocaleString("id-ID") : ""}
                    onChangeText={(text) => setNewFeeValue(text.replace(/\D/g, ""))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor="#94A3B8"
                    style={styles.amountInput}
                  />
                </View>
              ) : (
                <TextInput
                  value={newFeeValue}
                  onChangeText={(text) => setNewFeeValue(text.replace(/[^0-9,.]/g, ""))}
                  keyboardType="decimal-pad"
                  placeholder="% biaya"
                  placeholderTextColor="#94A3B8"
                  style={styles.input}
                />
              )
            ) : null}

            <Pressable style={styles.addButton} onPress={addPayment}>
              <Ionicons name="save-outline" size={18} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Simpan Data</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

function PaymentDetail({
  generatedQris,
  infoName,
  payment,
  qrCodeRef,
  onBack,
  onCopy,
  onDelete,
  onDownload,
  onPaid,
}: {
  generatedQris: string;
  infoName: string;
  payment: PaymentItem;
  qrCodeRef: MutableRefObject<{ toDataURL: (callback: (data: string) => void) => void } | null>;
  onBack: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onDownload: () => void;
  onPaid: () => void;
}) {
  return (
    <>
      <View style={styles.detailHeader}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Ionicons name="chevron-back" size={18} color="#059669" />
          <Text style={styles.backButtonText}>Daftar</Text>
        </Pressable>
        <Pressable style={styles.deleteButton} onPress={onDelete}>
          <Ionicons name="trash-outline" size={16} color="#B91C1C" />
          <Text style={styles.deleteButtonText}>Hapus</Text>
        </Pressable>
      </View>

      <View style={styles.detailNoteCard}>
        <View style={styles.paymentTopRow}>
          <Text style={styles.detailNoteTitle}>{payment.note}</Text>
          <View style={styles.waitingBadge}>
            <Text style={styles.waitingBadgeText}>BELUM BAYAR</Text>
          </View>
        </View>
        <Text style={styles.detailNoteSub}>{payment.id}</Text>
      </View>

      {generatedQris ? (
        <View style={[styles.card, styles.qrCard]}>
          <View style={styles.statusBar}>
            <Ionicons name="time-outline" size={18} color="#B45309" />
            <Text style={styles.statusText}>Menunggu pembayaran</Text>
          </View>
          <View style={styles.qrBox}>
            <QRCode
              value={generatedQris}
              size={240}
              getRef={(ref) => {
                qrCodeRef.current = ref;
              }}
            />
          </View>
          <Text style={styles.merchantName}>{infoName}</Text>
          <Text style={styles.amountBig}>{formatRupiah(payment.totalAmount)}</Text>
          <Text style={styles.amountBreakdown}>{formatPaymentBreakdown(payment)}</Text>

          <Pressable style={styles.downloadButton} onPress={onDownload}>
            <Ionicons name="download-outline" size={18} color="#FFFFFF" />
            <Text style={styles.downloadButtonText}>Download QR</Text>
          </Pressable>

          <View style={styles.secondaryActionRow}>
            <Pressable style={styles.pillActionButton} onPress={onCopy}>
              <Ionicons name="copy-outline" size={18} color="#0F172A" />
              <Text style={styles.pillActionText}>Salin String</Text>
            </Pressable>
            <Pressable style={styles.pillActionButton} onPress={onPaid}>
              <Ionicons name="checkmark" size={19} color="#0F172A" />
              <Text style={styles.pillActionText}>Simulasi Bayar</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>QR belum bisa dibuat. Cek QRIS string di pengaturan.</Text>
        </View>
      )}
    </>
  );
}

function formatFee(payment: PaymentItem): string {
  if (payment.feeType === "fixed") {
    return payment.feeAmount > 0 ? formatRupiah(payment.feeAmount) : "Tidak ada";
  }

  if (payment.feeType === "percent") {
    return payment.feeAmount > 0 ? `${payment.feeValue.replace(".", ",")}% / ${formatRupiah(payment.feeAmount)}` : "Tidak ada";
  }

  return "Tidak ada";
}

function formatPaymentBreakdown(payment: PaymentItem): string {
  if (payment.feeAmount <= 0) {
    return `Nominal ${formatRupiah(payment.amount)}`;
  }

  return `Nominal ${formatRupiah(payment.amount)} + Fee ${formatRupiah(payment.feeAmount)}`;
}

const styles = StyleSheet.create({
  container: { backgroundColor: "#F7FAF9", padding: 14, gap: 14, paddingBottom: 40 },
  demoBox: {
    alignItems: "flex-start",
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  demoTextWrap: { flex: 1 },
  demoTitle: { color: "#92400E", fontSize: 13, fontWeight: "800" },
  demoText: { color: "#B45309", fontSize: 12, lineHeight: 17, marginTop: 2 },
  summaryCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E6EEF0",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 94,
    padding: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  summaryBlock: { flex: 1 },
  summaryDivider: { backgroundColor: "#E6EEF0", height: 54, marginHorizontal: 14, width: 1 },
  summaryLabel: { color: "#64748B", fontSize: 11, fontWeight: "800" },
  summaryValue: { color: "#0F766E", fontSize: 30, fontWeight: "800", marginTop: 8 },
  summaryAmount: { color: "#059669", fontSize: 19, fontWeight: "800", marginTop: 8 },
  addButton: {
    alignItems: "center",
    backgroundColor: "#059669",
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 2,
  },
  addButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  paymentList: { gap: 12 },
  paymentCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E6EEF0",
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 13,
    elevation: 2,
  },
  paymentTopRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  paymentCode: { color: "#64748B", flex: 1, fontSize: 12, fontWeight: "700", letterSpacing: 0.2 },
  waitingBadge: { backgroundColor: "#FEF3C7", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  waitingBadgeText: { color: "#92400E", fontSize: 10, fontWeight: "900" },
  paymentTitle: { color: "#0F172A", fontSize: 17, fontWeight: "800", marginBottom: 16 },
  paymentMetaRow: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginTop: 10 },
  paymentMetaLabel: { color: "#64748B", fontSize: 13, fontWeight: "700" },
  paymentAmount: { color: "#D97706", fontSize: 18, fontWeight: "800" },
  paymentFee: { color: "#0F172A", fontSize: 14, fontWeight: "800" },
  paymentTotal: { color: "#059669", fontSize: 20, fontWeight: "800" },
  detailNoteCard: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E6EEF0",
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  detailNoteTitle: { color: "#0F172A", flex: 1, fontSize: 17, fontWeight: "800" },
  detailNoteSub: { color: "#64748B", fontSize: 12, fontWeight: "700", marginTop: 4 },
  emptyCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E6EEF0",
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 18,
  },
  emptyTitle: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  emptyText: { color: "#64748B", fontSize: 13, lineHeight: 18, textAlign: "center" },
  detailHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  backButton: { alignItems: "center", flexDirection: "row", gap: 4, paddingVertical: 8 },
  backButtonText: { color: "#059669", fontSize: 14, fontWeight: "800" },
  deleteButton: {
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  deleteButtonText: { color: "#B91C1C", fontSize: 12, fontWeight: "800" },
  card: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E6EEF0",
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 14,
    elevation: 2,
  },
  fieldLabel: { color: "#334155", fontSize: 12, fontWeight: "700", marginBottom: 6, marginHorizontal: 12, marginTop: 14 },
  amountWrap: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    height: 46,
    marginHorizontal: 12,
    paddingHorizontal: 12,
  },
  rp: { color: "#94A3B8", fontSize: 12, fontWeight: "600", marginRight: 10 },
  amountInput: { color: "#0F172A", flex: 1, fontSize: 14, fontWeight: "700" },
  input: {
    borderColor: "#CBD5E1",
    borderRadius: 12,
    borderWidth: 1,
    color: "#0F172A",
    fontSize: 14,
    height: 46,
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 12,
  },
  segment: { flexDirection: "row", gap: 8, marginBottom: 12, marginHorizontal: 12 },
  segItem: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 42,
  },
  segItemActive: { backgroundColor: "#ECFDF5", borderColor: "#059669" },
  segText: { color: "#64748B", fontSize: 13, fontWeight: "600" },
  segTextActive: { color: "#047857" },
  generateButton: {
    alignItems: "center",
    backgroundColor: "#059669",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    margin: 12,
    minHeight: 46,
  },
  generateButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "800" },
  qrCard: { alignItems: "center", paddingBottom: 16, paddingTop: 14 },
  statusBar: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 12,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  statusText: { color: "#B45309", fontSize: 13, fontWeight: "800" },
  qrBox: { backgroundColor: "#FFFFFF", borderColor: "#E6EEF0", borderRadius: 20, borderWidth: 1, marginTop: 22, padding: 14 },
  merchantName: { color: "#475569", fontSize: 14, fontWeight: "600", marginTop: 14 },
  amountBig: { color: "#059669", fontSize: 28, fontWeight: "800", marginTop: 4 },
  amountBreakdown: { color: "#64748B", fontSize: 12, fontWeight: "700", marginTop: 4, textAlign: "center" },
  downloadButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: "#059669",
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginHorizontal: 12,
    marginTop: 18,
    minHeight: 58,
    paddingHorizontal: 14,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 2,
  },
  downloadButtonText: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  secondaryActionRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    gap: 12,
    marginHorizontal: 12,
    marginTop: 12,
  },
  pillActionButton: {
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderColor: "#E2E8F0",
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 52,
  },
  pillActionText: { color: "#0F172A", fontSize: 15, fontWeight: "800" },
  modalBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(15, 23, 42, 0.48)",
    flex: 1,
    justifyContent: "center",
    padding: 18,
  },
  modalDialog: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    gap: 8,
    maxWidth: 520,
    padding: 16,
    width: "100%",
  },
  modalHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 4 },
  modalTitle: { color: "#0F172A", fontSize: 17, fontWeight: "800" },
  iconButton: {
    alignItems: "center",
    borderColor: "#E2E8F0",
    borderRadius: 12,
    borderWidth: 1,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
});
