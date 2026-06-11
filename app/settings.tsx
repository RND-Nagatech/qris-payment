import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { clearQrisString, loadQrisString, saveQrisString } from "../lib/dataStore";
import { getMerchantInfo, normalizeQris, validateQris } from "../lib/qris";

export default function Settings() {
  const [value, setValue] = useState("");
  const [savedValue, setSavedValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    loadQrisString()
      .then((saved) => {
        if (saved) {
          setValue(saved);
          setSavedValue(saved);
          setIsEditing(false);
        } else {
          setIsEditing(true);
        }
      })
      .catch(() => {
        setIsEditing(true);
        Alert.alert("Backend tidak terhubung", "QRIS belum bisa dimuat dari API. Pastikan server berjalan dan URL API benar.");
      });
  }, []);

  const hasSavedQris = Boolean(savedValue);
  const displayValue = isEditing ? value : savedValue;

  const preview = useMemo(() => {
    try {
      return displayValue ? getMerchantInfo(normalizeQris(displayValue)) : null;
    } catch {
      return null;
    }
  }, [displayValue]);

  const save = async () => {
    const nextValue = normalizeQris(value);
    if (!nextValue) {
      Alert.alert("QRIS kosong", "Tempelkan QRIS string statis terlebih dahulu.");
      return;
    }

    try {
      validateQris(nextValue);
      const info = getMerchantInfo(nextValue);
      if (info.method !== "Static") {
        Alert.alert("Bukan QRIS statis", "Simpan QRIS statis agar nominal bisa dibuat dinamis.");
        return;
      }

      await saveQrisString(nextValue);
      setSavedValue(nextValue);
      setValue(nextValue);
      setIsEditing(false);
      Alert.alert("Tersimpan", "QRIS string berhasil disimpan.");
    } catch (error) {
      Alert.alert("QRIS belum tersimpan", error instanceof Error ? error.message : "Backend API tidak bisa dijangkau.");
    }
  };

  const clearSavedQris = async () => {
    try {
      await clearQrisString();
      setValue("");
      setSavedValue("");
      setIsEditing(true);
      Alert.alert("Dikosongkan", "QRIS tersimpan sudah dihapus. Halaman utama akan memakai mode demo.");
    } catch {
      Alert.alert("Gagal menghapus", "Backend API tidak bisa dijangkau. Coba lagi setelah server aktif.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Pengaturan⚙️</Text>
        <Text style={styles.screenSubtitle}>Atur QRIS merchant dan mode pembayaran</Text>
      </View>

      {hasSavedQris && !isEditing ? (
        <View style={styles.savedBanner}>
          <Ionicons name="checkmark-circle-outline" size={20} color="#047857" />
          <View style={styles.savedBannerText}>
            <Text style={styles.savedTitle}>QRIS Merchant Tersimpan</Text>
            <Text style={styles.savedSubtitle}>App akan memakai QRIS ini untuk generate nominal pembayaran.</Text>
          </View>
        </View>
      ) : null}

      {preview ? (
        <View style={styles.panel}>
          <View style={styles.titleRow}>
            <Ionicons name="information-circle-outline" size={18} color="#059669" />
            <Text style={styles.title}>Preview Merchant</Text>
          </View>
          <InfoRow label="Merchant" value={preview.merchant || "-"} />
          <InfoRow label="City" value={preview.city || "-"} />
          <InfoRow label="Postal Code" value={preview.postalCode || "-"} />
          <InfoRow label="Issuer" value={preview.issuer || "-"} />
          <InfoRow label="Method" value={preview.method} />
          <InfoRow label="Category" value={preview.category || "-"} />
          <InfoRow label="Currency" value={preview.currency || "-"} last />
        </View>
      ) : null}

      {isEditing ? (
        <>
          <View style={styles.panel}>
            <View style={styles.titleRow}>
              <Ionicons name="qr-code-outline" size={18} color="#059669" />
              <Text style={styles.title}>{hasSavedQris ? "Edit QRIS String" : "QRIS String Statis"}</Text>
            </View>
            <TextInput
              value={value}
              onChangeText={setValue}
              multiline
              placeholder="00020101021126..."
              placeholderTextColor="#94A3B8"
              style={styles.textarea}
              autoCapitalize="characters"
              autoCorrect={false}
            />
          </View>

          <Pressable style={styles.primaryButton} onPress={save}>
            <Ionicons name="save-outline" size={16} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>{hasSavedQris ? "Simpan Perubahan" : "Simpan QRIS"}</Text>
          </Pressable>

          {hasSavedQris ? (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => {
                setValue(savedValue);
                setIsEditing(false);
              }}
            >
              <Ionicons name="close-outline" size={18} color="#0F172A" />
              <Text style={styles.secondaryButtonText}>Batal Edit</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <Pressable style={styles.primaryButton} onPress={() => setIsEditing(true)}>
          <Ionicons name="create-outline" size={16} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>Edit QRIS Merchant</Text>
        </Pressable>
      )}

      <Pressable style={styles.dangerButton} onPress={clearSavedQris}>
        <Ionicons name="trash-outline" size={16} color="#B91C1C" />
        <Text style={styles.dangerButtonText}>Kosongkan QRIS Tersimpan</Text>
      </Pressable>
    </ScrollView>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, last && styles.infoRowLast]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#F7FAF9",
    gap: 14,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === "ios" ? 74 : 54,
    paddingBottom: 32,
  },
  screenHeader: {
    marginBottom: 2,
  },
  screenTitle: {
    color: "#0F172A",
    fontSize: 21,
    fontWeight: "700",
  },
  screenSubtitle: {
    color: "#64748B",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  panel: {
    backgroundColor: "#FFFFFF",
    borderColor: "#BFD0CC",
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 13,
    elevation: 2,
  },
  savedBanner: {
    alignItems: "flex-start",
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  savedBannerText: {
    flex: 1,
  },
  savedTitle: {
    color: "#047857",
    fontSize: 14,
    fontWeight: "700",
  },
  savedSubtitle: {
    color: "#047857",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  titleRow: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 12,
  },
  title: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "700",
  },
  textarea: {
    color: "#0F172A",
    fontFamily: "Courier",
    fontSize: 12,
    lineHeight: 18,
    minHeight: 180,
    padding: 12,
    textAlignVertical: "top",
  },
  infoRow: {
    alignItems: "center",
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 42,
    paddingHorizontal: 12,
  },
  infoRowLast: {
    borderBottomWidth: 0,
  },
  infoLabel: {
    color: "#64748B",
    fontSize: 12,
  },
  infoValue: {
    color: "#0F172A",
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#059669",
    borderRadius: 16,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 52,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 2,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 52,
  },
  secondaryButtonText: {
    color: "#0F172A",
    fontSize: 14,
    fontWeight: "700",
  },
  dangerButton: {
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 52,
  },
  dangerButtonText: {
    color: "#B91C1C",
    fontSize: 14,
    fontWeight: "700",
  },
});
