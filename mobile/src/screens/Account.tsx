/** Account — profile, tier, change password, logout. */
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useApp } from "../store/app";
import { endpoints } from "../lib/api";
import { Btn, C, ErrorNote, Spacing, styles as ui } from "../components/ui";

const TIER_LABEL: Record<string, string> = {
  tier1: "Tier 1 — Best price",
  tier2: "Tier 2 — Wholesale",
  tier3: "Tier 3",
  tier4: "Tier 4 — Retail",
  tier5: "Tier 5",
};

export function AccountScreen({ navigation }: { navigation: { navigate: (s: string, p?: unknown) => void } }) {
  const { customer, warehouse, logout } = useApp();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!customer) return null;

  const doLogout = async () => {
    setBusy(true);
    try {
      await logout();
      navigation.navigate("Login");
    } finally {
      setBusy(false);
    }
  };

  const changePw = async () => {
    setErr("");
    navigation.navigate("ChangePassword");
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: Spacing.l, paddingBottom: Spacing.xl * 2 }}>
      <View style={st.hero}>
        <View style={st.avatar}><Text style={st.avatarText}>{(customer.name || "?").slice(0, 1).toUpperCase()}</Text></View>
        <Text style={st.name}>{customer.name}</Text>
        <Text style={st.shop}>{customer.shopName}</Text>
        <View style={st.tierChip}>
          <Text style={st.tierText}>{TIER_LABEL[customer.tier] ?? customer.tier}</Text>
        </View>
      </View>

      <View style={st.card}>
        <Text style={st.rowLabel}>Phone</Text>
        <Text style={st.rowVal}>{customer.phone}</Text>
        {customer.email ? (<><Text style={st.rowLabel}>Email</Text><Text style={st.rowVal}>{customer.email}</Text></>) : null}
        <Text style={st.rowLabel}>Godown</Text>
        <Text style={st.rowVal}>{warehouse?.name ?? "—"}</Text>
        <Text style={st.rowLabel}>Address</Text>
        <Text style={st.rowVal}>{[customer.address, customer.city, customer.pincode].filter(Boolean).join(", ") || "—"}</Text>
        {customer.gstin ? (<><Text style={st.rowLabel}>GSTIN</Text><Text style={st.rowVal}>{customer.gstin}</Text></>) : null}
        <Text style={st.rowLabel}>Orders placed</Text>
        <Text style={st.rowVal}>{customer.orders} · lifetime {`₹${Math.round(customer.totalSpent).toLocaleString("en-IN")}`}</Text>
      </View>

      <ErrorNote msg={err} />

      <View style={{ marginTop: Spacing.l, gap: Spacing.s }}>
        <Btn label="Change password" onPress={changePw} kind="outline" />
        <Btn label="Logout" onPress={doLogout} kind="ghost" loading={busy} />
      </View>

      <Text style={st.footer}>Need help? Call DMK Mart on +91 93095 75173</Text>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: C.ink, borderRadius: 18, padding: Spacing.xl, alignItems: "center" },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: C.yellow, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 28, fontWeight: "900", color: C.ink },
  name: { color: C.yellow, fontSize: 20, fontWeight: "900", marginTop: Spacing.s },
  shop: { color: "#D1D5DB", fontSize: 13, marginTop: 2 },
  tierChip: { backgroundColor: C.yellow, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginTop: Spacing.m },
  tierText: { color: C.ink, fontWeight: "900", fontSize: 12 },
  card: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.lightGray, padding: Spacing.l, marginTop: Spacing.l },
  rowLabel: { fontSize: 11, fontWeight: "800", color: "#9CA3AF", textTransform: "uppercase", marginTop: 10 },
  rowVal: { fontSize: 14, color: C.ink, marginTop: 2, lineHeight: 19 },
  footer: { textAlign: "center", color: C.gray, fontSize: 12, marginTop: Spacing.xl },
});
