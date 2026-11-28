/** Cart — edit lines (piece/pack steppers), fulfillment toggle, running
 *  estimate. The checkout response `bill` remains authoritative. */
import React, { useState } from "react";
import { FlatList, Image, StyleSheet, Text, View } from "react-native";
import { DELIVERY_FEE, formatINR, unitPriceForLine } from "../lib/pricing";
import { useApp } from "../store/app";
import { Btn, C, Spacing } from "../components/ui";
import type { Fulfillment } from "../lib/pricing";

export function CartScreen({ navigation }: { navigation: { navigate: (s: string, p?: unknown) => void } }) {
  const { cart, setLineQty, customer } = useApp();
  const [fulfillment, setFulfillment] = useState<Fulfillment>("DELIVERY");
  const tier = customer?.tier || "tier2";

  const itemTotal = cart.reduce((sum, l) => sum + unitPriceForLine(l.product, tier, l.unitType, fulfillment) * l.qty, 0);
  const deliveryFee = fulfillment === "PICKUP" ? 0 : DELIVERY_FEE;

  if (cart.length === 0) {
    return (
      <View style={st.empty}>
        <Text style={{ fontSize: 44 }}>🛒</Text>
        <Text style={st.emptyTitle}>Your cart is empty</Text>
        <Text style={st.emptyBody}>Add products from the home screen or search.</Text>
        <View style={{ marginTop: Spacing.l, width: 180 }}>
          <Btn label="Start shopping" onPress={() => navigation.navigate("Main", { screen: "Home" })} />
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* fulfillment toggle */}
      <View style={st.fulfilWrap}>
        {(["DELIVERY", "PICKUP"] as Fulfillment[]).map((f) => (
          <Text
            key={f}
            onPress={() => setFulfillment(f)}
            style={[st.fulfilBtn, f === fulfillment ? st.fulfilOn : null]}
          >
            {f === "DELIVERY" ? "Home delivery" : "Pickup from godown"}
          </Text>
        ))}
      </View>

      <FlatList
        data={cart}
        keyExtractor={(l, i) => l.product.id + l.unitType + i}
        contentContainerStyle={{ padding: Spacing.l }}
        renderItem={({ item: l }) => {
          const rate = unitPriceForLine(l.product, tier, l.unitType, fulfillment);
          const pieces = l.unitType === "PACK" ? Math.max(1, l.product.packQty || 1) : 1;
          return (
            <View style={st.line}>
              {l.product.image ? <Image source={{ uri: l.product.image }} style={st.lineImg} /> : <View style={[st.lineImg, st.lineImgPh]} />}
              <View style={{ flex: 1, paddingLeft: Spacing.m }}>
                <Text style={st.lineName} numberOfLines={2}>{l.product.name}</Text>
                <Text style={st.lineSub}>
                  {l.unitType === "PACK" ? `Pack (${pieces} pcs)` : "Single piece"} · {formatINR(rate)} each
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, gap: 10 }}>
                  <View style={st.stepper}>
                    <Text style={st.stepBtn} onPress={() => setLineQty(l.product.id, l.unitType, l.qty - 1)}>−</Text>
                    <Text style={st.stepVal}>{l.qty}</Text>
                    <Text style={st.stepBtn} onPress={() => setLineQty(l.product.id, l.unitType, l.qty + 1)}>+</Text>
                  </View>
                  <Text style={st.lineTotal}>{formatINR(rate * l.qty)}</Text>
                  <Text style={st.remove} onPress={() => setLineQty(l.product.id, l.unitType, 0)}>Remove</Text>
                </View>
              </View>
            </View>
          );
        }}
      />

      <View style={st.summary}>
        <View style={st.sumRow}>
          <Text style={st.sumLabel}>{fulfillment === "DELIVERY" ? "Items (delivered)" : "Items (pickup rates)"}</Text>
          <Text style={st.sumVal}>{formatINR(itemTotal)}</Text>
        </View>
        <View style={st.sumRow}>
          <Text style={st.sumLabel}>Delivery charge</Text>
          <Text style={st.sumVal}>{deliveryFee === 0 ? "FREE" : formatINR(deliveryFee)}</Text>
        </View>
        <View style={[st.sumRow, { borderBottomWidth: 0 }]}>
          <Text style={st.sumTotal}>Estimated total</Text>
          <Text style={st.sumTotalVal}>{formatINR(itemTotal + deliveryFee)}</Text>
        </View>
        <Text style={st.sumNote}>Final bill is calculated at checkout (quantity discounts + coupons apply).</Text>
        <View style={{ marginTop: Spacing.m }}>
          <Btn label="Proceed to checkout" onPress={() => navigation.navigate("Checkout", { fulfillment })} />
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  fulfilWrap: { flexDirection: "row", backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.lightGray, padding: Spacing.m, gap: Spacing.s },
  fulfilBtn: { flex: 1, textAlign: "center", fontSize: 13, fontWeight: "800", color: C.gray, borderWidth: 1.5, borderColor: C.lightGray, borderRadius: 10, paddingVertical: 9 },
  fulfilOn: { backgroundColor: C.yellow, color: C.ink, borderColor: C.ink },
  line: { flexDirection: "row", backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.lightGray, padding: Spacing.m, marginBottom: Spacing.s },
  lineImg: { width: 72, height: 72, borderRadius: 10, backgroundColor: "#F3F4F6" },
  lineImgPh: {},
  lineName: { fontWeight: "800", color: C.ink, fontSize: 13.5 },
  lineSub: { fontSize: 11, color: C.gray, marginTop: 2 },
  lineTotal: { fontWeight: "900", color: C.ink, fontSize: 14 },
  remove: { color: C.red, fontWeight: "800", fontSize: 12, marginLeft: "auto" },
  stepper: { flexDirection: "row", alignItems: "center", backgroundColor: C.bg, borderRadius: 10, overflow: "hidden" },
  stepBtn: { fontSize: 20, fontWeight: "900", color: C.ink, paddingHorizontal: 10, paddingVertical: 4 },
  stepVal: { fontSize: 14, fontWeight: "900", color: C.ink, minWidth: 24, textAlign: "center" },
  summary: { backgroundColor: C.white, borderTopWidth: 1, borderTopColor: C.lightGray, padding: Spacing.l },
  sumRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  sumLabel: { fontSize: 13, color: C.gray },
  sumVal: { fontSize: 13.5, fontWeight: "800", color: C.ink },
  sumTotal: { fontSize: 15, fontWeight: "900", color: C.ink },
  sumTotalVal: { fontSize: 17, fontWeight: "900", color: C.ink },
  sumNote: { fontSize: 10.5, color: "#9CA3AF", marginTop: 6 },
  empty: { flex: 1, backgroundColor: C.bg, alignItems: "center", justifyContent: "center", padding: Spacing.xl },
  emptyTitle: { fontSize: 18, fontWeight: "900", color: C.ink, marginTop: Spacing.m },
  emptyBody: { fontSize: 13, color: C.gray, marginTop: 4 },
});
