/** Checkout — address / pickup godown, payment method, salesman, note.
 *  Places the order through the same POST /api/orders the website uses. */
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { endpoints, type ApiOrder } from "../lib/api";
import { DELIVERY_FEE, formatINR, unitPriceForLine } from "../lib/pricing";
import { useApp } from "../store/app";
import { Btn, C, ErrorNote, Spacing, styles as ui } from "../components/ui";
import type { Fulfillment } from "../lib/pricing";

export function CheckoutScreen({ route, navigation }: { route: { params: { fulfillment?: Fulfillment } }; navigation: { replace: (s: string, p?: unknown) => void; navigate: (s: string, p?: unknown) => void } }) {
  const { cart, customer, catalog, clearCart } = useApp();
  const [fulfillment, setFulfillment] = useState<Fulfillment>(route.params?.fulfillment ?? "DELIVERY");
  const [address, setAddress] = useState(customer?.address ?? "");
  const [city, setCity] = useState(customer?.city ?? "");
  const [pincode, setPincode] = useState(customer?.pincode ?? "");
  const [pickupWh, setPickupWh] = useState("");
  const [payment, setPayment] = useState<"UPI" | "COD">("UPI");
  const [salesman, setSalesman] = useState("");
  const [coupon, setCoupon] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const tier = customer?.tier || "tier2";
  const itemTotal = cart.reduce((s, l) => s + unitPriceForLine(l.product, tier, l.unitType, fulfillment) * l.qty, 0);
  const deliveryFee = fulfillment === "PICKUP" ? 0 : DELIVERY_FEE;

  const place = async () => {
    setErr("");
    if (!customer) return;
    if (cart.length === 0) {
      setErr("Your cart is empty.");
      return;
    }
    if (fulfillment === "DELIVERY") {
      if (address.trim().length < 6) return setErr("Enter the complete delivery address.");
      if (city.trim().length < 2) return setErr("Enter the city.");
      if (!/^\d{6}$/.test(pincode.trim())) return setErr("Enter a valid 6-digit pincode.");
    } else if (!pickupWh) {
      return setErr("Choose the godown you will pick up from.");
    }
    setBusy(true);
    try {
      const r = await endpoints.placeOrder({
        customerName: `${customer.name}${customer.shopName ? ` — ${customer.shopName}` : ""}`.slice(0, 120),
        phone: customer.phone,
        email: customer.email || "",
        addressLine: fulfillment === "DELIVERY" ? address.trim() : "",
        city: fulfillment === "DELIVERY" ? city.trim() : "",
        pincode: fulfillment === "DELIVERY" ? pincode.trim() : "",
        fulfillment,
        pickupWarehouseId: fulfillment === "PICKUP" ? pickupWh : "",
        paymentMethod: payment,
        salesman: salesman || "",
        couponCode: coupon.trim() || "",
        note: note.trim() || "",
        waOptIn: true,
        items: cart.map((l) => ({ id: l.product.id, unitType: l.unitType, qty: l.qty })),
      });
      clearCart();
      const order = { id: r.orderId, invoiceNo: r.invoiceNo, otp: r.otp, bill: r.bill } as unknown as ApiOrder;
      navigation.replace("OrderSuccess", { order });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not place the order");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: Spacing.l, paddingBottom: Spacing.xl * 2 }} keyboardShouldPersistTaps="handled">
      {/* fulfillment */}
      <Text style={st.h2}>How do you want the order?</Text>
      <View style={{ flexDirection: "row", gap: Spacing.s, marginTop: Spacing.s }}>
        {(["DELIVERY", "PICKUP"] as Fulfillment[]).map((f) => (
          <Text key={f} onPress={() => setFulfillment(f)} style={[st.pickBtn, f === fulfillment ? st.pickOn : null]}>
            {f === "DELIVERY" ? "Home delivery" : "Pickup from godown"}
          </Text>
        ))}
      </View>

      {fulfillment === "DELIVERY" ? (
        <View style={{ marginTop: Spacing.l }}>
          <Text style={st.label}>Delivery address</Text>
          <TextInput value={address} onChangeText={setAddress} multiline placeholderTextColor="#9CA3AF" placeholder="Shop / street / landmark" style={[ui.input, { minHeight: 70 }]} />
          <View style={{ flexDirection: "row", gap: Spacing.s, marginTop: Spacing.s }}>
            <TextInput value={city} onChangeText={setCity} placeholderTextColor="#9CA3AF" placeholder="City / town" style={[ui.input, { flex: 1 }]} />
            <TextInput value={pincode} onChangeText={setPincode} placeholderTextColor="#9CA3AF" placeholder="Pincode" keyboardType="number-pad" style={[ui.input, { width: 110 }]} />
          </View>
        </View>
      ) : (
        <View style={{ marginTop: Spacing.l }}>
          <Text style={st.label}>Pickup godown</Text>
          {(catalog?.warehouses ?? []).map((w) => (
            <Text key={w.id} onPress={() => setPickupWh(w.id)} style={[st.pickRow, pickupWh === w.id ? st.pickRowOn : null]}>
              <Text style={{ fontWeight: "900", color: pickupWh === w.id ? C.ink : C.dark }}>{w.name}</Text>
              {w.city ? <Text style={{ color: C.gray }}> — {w.city}</Text> : null}
            </Text>
          ))}
          <Text style={st.hint}>Collect from the godown — pickup rates apply, no delivery charge.</Text>
        </View>
      )}

      {/* payment */}
      <Text style={[st.h2, { marginTop: Spacing.l }]}>Payment method</Text>
      <View style={{ flexDirection: "row", gap: Spacing.s, marginTop: Spacing.s }}>
        {(["UPI", "COD"] as const).map((m) => (
          <Text key={m} onPress={() => setPayment(m)} style={[st.pickBtn, payment === m ? st.pickOn : null]}>
            {m === "UPI" ? "UPI / Online" : "Cash on delivery"}
          </Text>
        ))}
      </View>

      {/* salesman */}
      {(catalog?.salespersons ?? []).length > 0 && (
        <>
          <Text style={[st.h2, { marginTop: Spacing.l }]}>Your salesman (optional)</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: Spacing.s, marginTop: Spacing.s }}>
            {(catalog?.salespersons ?? []).map((s) => (
              <Text key={s.id} onPress={() => setSalesman(salesman === s.name ? "" : s.name)} style={[st.salesChip, salesman === s.name ? st.pickOn : null]}>
                {s.name}
              </Text>
            ))}
          </View>
        </>
      )}

      {/* coupon + note */}
      <Text style={[st.label, { marginTop: Spacing.l }]}>Coupon code (optional)</Text>
      <TextInput value={coupon} onChangeText={setCoupon} autoCapitalize="characters" placeholderTextColor="#9CA3AF" placeholder="e.g. DIWALI50" style={ui.input} />
      <Text style={[st.label, { marginTop: Spacing.m }]}>Note for DMK Mart (optional)</Text>
      <TextInput value={note} onChangeText={setNote} multiline placeholderTextColor="#9CA3AF" placeholder="Anything we should know?" style={[ui.input, { minHeight: 56 }]} />

      {/* summary */}
      <View style={st.sumCard}>
        <View style={st.sumRow}><Text style={st.sumLabel}>Items</Text><Text style={st.sumVal}>{formatINR(itemTotal)}</Text></View>
        <View style={st.sumRow}><Text style={st.sumLabel}>Delivery charge</Text><Text style={st.sumVal}>{deliveryFee === 0 ? "FREE" : formatINR(deliveryFee)}</Text></View>
        <View style={[st.sumRow, { borderBottomWidth: 0 }]}><Text style={st.sumTotal}>Estimated total</Text><Text style={st.sumTotalVal}>{formatINR(itemTotal + deliveryFee)}</Text></View>
        <Text style={st.hint}>Quantity discounts and the coupon (if any) are applied on the server — the confirmation screen shows the final bill.</Text>
      </View>

      <ErrorNote msg={err} />
      <View style={{ marginTop: Spacing.l }}>
        <Btn label={`Place order · ${formatINR(itemTotal + deliveryFee)}`} onPress={place} loading={busy} />
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  h2: { fontSize: 15, fontWeight: "900", color: C.ink },
  label: { fontSize: 12.5, fontWeight: "800", color: C.dark, marginBottom: 6 },
  hint: { fontSize: 11, color: "#9CA3AF", marginTop: 6, lineHeight: 15 },
  pickBtn: { flex: 1, textAlign: "center", fontSize: 13, fontWeight: "800", color: C.gray, borderWidth: 1.5, borderColor: C.lightGray, borderRadius: 10, paddingVertical: 10, backgroundColor: C.white },
  pickOn: { backgroundColor: C.yellow, color: C.ink, borderColor: C.ink, fontWeight: "900" },
  pickRow: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.lightGray, borderRadius: 12, padding: Spacing.m, marginBottom: Spacing.s, fontSize: 14, color: C.dark },
  pickRowOn: { borderColor: C.ink, backgroundColor: "#FEF9C3" },
  salesChip: { fontSize: 12.5, fontWeight: "800", color: C.gray, borderWidth: 1.5, borderColor: C.lightGray, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, backgroundColor: C.white },
  sumCard: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.lightGray, padding: Spacing.m, marginTop: Spacing.l },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  sumLabel: { fontSize: 13, color: C.gray },
  sumVal: { fontSize: 13.5, fontWeight: "800", color: C.ink },
  sumTotal: { fontSize: 15, fontWeight: "900", color: C.ink },
  sumTotalVal: { fontSize: 17, fontWeight: "900", color: C.ink },
});
