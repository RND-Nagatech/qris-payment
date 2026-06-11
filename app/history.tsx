import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "expo-router";
import { loadTodayHistory, type PaymentItem } from "../lib/dataStore";
import { formatRupiah } from "../lib/qris";

export default function History() {
  const [payments, setPayments] = useState<PaymentItem[]>([]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      loadTodayHistory()
        .then((items) => {
          if (isActive) setPayments(items);
        })
        .catch(() => {
          if (isActive) setPayments([]);
        });

      return () => {
        isActive = false;
      };
    }, [])
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Riwayat</Text>
        <Text style={styles.subtitle}>{payments.length} transaksi hari ini</Text>
      </View>

      {payments.length ? (
        <View style={styles.list}>
          {payments.map((payment) => (
            <View key={payment.id} style={styles.card}>
              <View style={styles.cardLeft}>
                <Text style={styles.code}>{payment.id}</Text>
                <Text style={styles.note}>{payment.note}</Text>
                <Text style={styles.date}>{formatDateTime(payment.status === "paid" ? payment.paidAt : payment.createdAt)}</Text>
              </View>
              <View style={styles.cardRight}>
                <Text style={styles.amount}>{formatRupiah(payment.totalAmount)}</Text>
                <View style={[styles.badge, payment.status === "paid" && styles.badgePaid]}>
                  <Text style={[styles.badgeText, payment.status === "paid" && styles.badgeTextPaid]}>
                    {payment.status === "paid" ? "LUNAS" : "BELUM"}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Ionicons name="time-outline" size={32} color="#94A3B8" />
          <Text style={styles.emptyTitle}>Belum ada riwayat hari ini</Text>
          <Text style={styles.emptyText}>Pembayaran pending dan lunas hari ini akan muncul di sini.</Text>
        </View>
      )}
    </ScrollView>
  );
}

function formatDateTime(isoDate?: string): string {
  if (!isoDate) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(isoDate));
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F7FAF9",
    flexGrow: 1,
    padding: 14,
    paddingBottom: 32,
  },
  header: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E6EEF0",
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 16,
    padding: 18,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 1,
  },
  title: {
    color: "#0F172A",
    fontSize: 26,
    fontWeight: "800",
  },
  subtitle: {
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  list: {
    gap: 12,
  },
  card: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E6EEF0",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 13,
    elevation: 2,
  },
  cardLeft: {
    flex: 1,
    paddingRight: 12,
  },
  cardRight: {
    alignItems: "flex-end",
  },
  code: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "700",
  },
  note: {
    color: "#0F172A",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 8,
  },
  date: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 8,
  },
  amount: {
    color: "#059669",
    fontSize: 16,
    fontWeight: "800",
  },
  badge: {
    backgroundColor: "#FEF3C7",
    borderRadius: 999,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgePaid: {
    backgroundColor: "#DCFCE7",
  },
  badgeText: {
    color: "#B45309",
    fontSize: 11,
    fontWeight: "900",
  },
  badgeTextPaid: {
    color: "#047857",
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#E6EEF0",
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 24,
  },
  emptyTitle: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "800",
  },
  emptyText: {
    color: "#64748B",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
