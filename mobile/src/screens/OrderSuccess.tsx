/** Order success — real bill from the server, delivery OTP shown for pickup/verification. */
import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { formatINR } from "../lib/pricing";
import { useApp } from "../store/app";
import { Btn, C, Spacing } from "../components/ui";

type Nav = {
  route: { params: { order: { id: string; invoiceNo: string; otp: string; bill: { itemTotal: number; discount: number; deliveryFee: number; grandTotal: number; totalSavings: number; fulfillment: string; pickupWarehouseName?: string; totalPieces?: number } } } };
  navigation: { navigate: (s: string, p?: unknown) => void };
};

export function OrderSuccessScreen({ route, navigation }: Nav) {
  const { order } = route.params;
  const { refreshMe } = useApp();
  const b = order.bill;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: Spacing.xl }}>
      <View style={st.hero}>
        <Text style={{ fontSize: 46 }}>✅</Text>
        <Text style={st.heroTitle}>Order placed!</Text>
        <Text style={st.heroSub}>Invoice {order.invoiceNo || order.id.slice(-8).toUpperCase()}</Text>
        {order.otp ? (
          <View style={st.otpBox}>
            <Text style={st.otpLabel}>Delivery OTP (share when you receive goods)</Text>
            <Text style={st.otpVal}>{order.otp}</Text>
          </View>
        ) : null}
      </View>

      <View style={st.card}>
        <Text style={st.cardTitle}>Bill</Text>
        <View style={st.row}><Text style={st.k}>Items</Text><Text style={st.v}>{formatINR(b.itemTotal)}</Text></View>
        {b.discount > 0 && (
          <View style={st.row}><Text style={st.k}>Discount</Text><Text style={[st.v, { color: C.green }]}>− {formatINR(b.discount)}</Text></View>
        )}
        <View style={st.row}><Text style={st.k}>Delivery charge</Text><Text style={st.v}>{b.deliveryFee === 0 ? "FREE" : formatINR(b.deliveryFee)}</Text></View>
        <View style={[st.row, { borderBottomWidth: 0 }]}>
          <Text style={[st.k, { fontWeight: "900", color: C.ink, fontSize: 15 }]}>Grand total</Text>
          <Text style={st.grand}>{formatINR(b.grandTotal)}</Text>
        </View>
        <Text style={st.mode}>
          {b.fulfillment === "PICKUP"
            ? `Pickup from ${b.pickupWarehouseName ?? "your godown"} — no delivery charge`
            : "Home delivery — our team will confirm on WhatsApp"}
        </Text>
      </View>

      <Text style={st.note}>
        The DMK Mart team checks stock and confirms your order. You will get a WhatsApp message — order details in the app stay hidden until confirmation, same as the website.
      </Text>

      <View style={{ marginTop: Spacing.l, gap: Spacing.s }}>
        <Btn label="View my orders" onPress={() => { refreshMe().catch(() => {}); navigation.navigate("Main", { screen: "Orders" }); }} kind="dark" />
        <Btn label="Keep shopping" onPress={() => navigation.navigate("Main", { screen: "Home" })} />
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  hero: { backgroundColor: C.ink, borderRadius: 18, padding: Spacing.xl, alignItems: "center" },
  heroTitle: { color: C.yellow, fontSize: 24, fontWeight: "900", marginTop: 6 },
  heroSub: { color: "#D1D5DB", fontSize: 13, marginTop: 4 },
  otpBox: { backgroundColor: C.yellow, borderRadius: 12, padding: Spacing.m, marginTop: Spacing.l, alignItems: "center", width: "100%" },
  otpLabel: { fontSize: 10.5, fontWeight: "800", color: C.dark },
  otpVal: { fontSize: 30, fontWeight: "900", color: C.ink, letterSpacing: 8, marginTop: 4 },
  card: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.lightGray, padding: Spacing.m, marginTop: Spacing.l },
  cardTitle: { fontWeight: "900", color: C.ink, fontSize: 13.5, marginBottom: 6 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  k: { fontSize: 13, color: C.gray },
  v: { fontSize: 13.5, fontWeight: "800", color: C.ink },
  grand: { fontSize: 18, fontWeight: "900", color: C.ink },
  mode: { fontSize: 11.5, color: C.amber, fontWeight: "700", marginTop: 8 },
  note: { fontSize: 12, color: C.gray, lineHeight: 18, marginTop: Spacing.l },
});
