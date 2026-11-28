/** Product detail — big image, both rates (receipt style), qty steppers for
 *  Piece and Pack, add-to-cart. */
import React, { useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ApiProduct } from "../lib/api";
import { DELIVERY_FEE, deliveryUnitPrice, formatINR, pickupUnitPrice, piecesForUnit } from "../lib/pricing";
import { useApp } from "../store/app";
import { Btn, C, Chip, Spacing } from "../components/ui";

export function ProductDetailScreen({ route, navigation }: { route: { params: { product: ApiProduct } }; navigation: { goBack: () => void; navigate: (s: string, p?: unknown) => void } }) {
  const p = route.params.product;
  const { customer, addToCart } = useApp();
  const tier = customer?.tier || "tier2";
  const [qtyPiece, setQtyPiece] = useState(1);
  const [qtyPack, setQtyPack] = useState(1);

  const mrp = p.locPrice?.mrp ?? p.mrp;
  const deliveryPiece = p.isDeal && (p.dealPrice ?? 0) > 0 ? p.dealPrice : deliveryUnitPrice(p, tier, "SINGLE");
  const pickupPiece = pickupUnitPrice(p, tier, "SINGLE");
  const pickupPack = pickupUnitPrice(p, tier, "PACK");
  const packPieces = Math.max(1, p.packQty || 1);
  const casePieces = piecesForUnit("BULK", p.packQty, p.piecesPerBox);

  const add = (unitType: "SINGLE" | "PACK", qty: number) => {
    addToCart(p, unitType, qty);
    navigation.navigate("Main", { screen: "Cart" });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: Spacing.l, paddingBottom: Spacing.xl * 2 }}>
      <View style={st.imgCard}>
        {p.image ? (
          <Image source={{ uri: p.image }} style={st.img} resizeMode="cover" />
        ) : (
          <View style={[st.img, st.noImg]}><Text style={{ fontSize: 44 }}>🧺</Text></View>
        )}
      </View>

      <Text style={st.company}>{p.company || p.brand?.name || ""}</Text>
      <Text style={st.name}>{p.name}</Text>

      <View style={{ flexDirection: "row", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        {p.inStock ? <Chip text="In stock at your godown" tone="green" /> : <Chip text="Out of stock" tone="red" />}
        {p.isDeal && (p.dealPrice ?? 0) > 0 ? <Chip text="Deal price" tone="yellow" /> : null}
        {p.isTop ? <Chip text="Ready to dispatch" tone="gray" /> : null}
      </View>

      {/* receipt-style rates */}
      <View style={st.rateCard}>
        <Text style={st.rateTitle}>Your rates</Text>
        <View style={st.rateRow}>
          <Text style={st.rateLabel}>Delivery — per piece</Text>
          <Text style={st.ratePrice}>{formatINR(deliveryPiece)}</Text>
        </View>
        <View style={st.rateRow}>
          <Text style={st.rateLabel}>Delivery — full pack ({packPieces} pcs)</Text>
          <Text style={st.ratePrice}>{formatINR(deliveryUnitPrice(p, tier, "PACK"))}</Text>
        </View>
        <View style={[st.rateRow, { borderBottomWidth: 0 }]}>
          <Text style={st.rateLabel}>Pickup — full pack (collect from godown)</Text>
          <Text style={st.ratePrice}>{formatINR(pickupPack)}</Text>
        </View>
        {mrp > deliveryPiece && (
          <Text style={st.mrpLine}>MRP {formatINR(mrp)} — you save with your tier price</Text>
        )}
        <Text style={st.tierNote}>Flat delivery charge {formatINR(DELIVERY_FEE)} per order. Pickup from the godown is free.</Text>
      </View>

      {/* piece stepper */}
      <View style={st.qtyCard}>
        <View style={{ flex: 1 }}>
          <Text style={st.qtyTitle}>Single pieces</Text>
          <Text style={st.qtySub}>{formatINR(deliveryPiece)} × {qtyPiece} = {formatINR(deliveryPiece * qtyPiece)}</Text>
        </View>
        <View style={st.stepper}>
          <Text style={st.stepBtn} onPress={() => setQtyPiece(Math.max(1, qtyPiece - 1))}>−</Text>
          <Text style={st.stepVal}>{qtyPiece}</Text>
          <Text style={st.stepBtn} onPress={() => setQtyPiece(qtyPiece + 1)}>+</Text>
        </View>
        <View style={{ width: 108 }}>
          <Btn label="Add" onPress={() => add("SINGLE", qtyPiece)} small kind="primary" />
        </View>
      </View>

      {/* pack stepper */}
      {packPieces > 1 && (
        <View style={st.qtyCard}>
          <View style={{ flex: 1 }}>
            <Text style={st.qtyTitle}>Packs ({packPieces} pcs each)</Text>
            <Text style={st.qtySub}>
              {formatINR(pickupPiece)}/pc pickup · {formatINR(pickupPack)} per pack · {casePieces} pcs/case
            </Text>
          </View>
          <View style={st.stepper}>
            <Text style={st.stepBtn} onPress={() => setQtyPack(Math.max(1, qtyPack - 1))}>−</Text>
            <Text style={st.stepVal}>{qtyPack}</Text>
            <Text style={st.stepBtn} onPress={() => setQtyPack(qtyPack + 1)}>+</Text>
          </View>
          <View style={{ width: 108 }}>
            <Btn label="Add" onPress={() => add("PACK", qtyPack)} small kind="dark" />
          </View>
        </View>
      )}

      <Text style={st.sku}>SKU {p.sku} · Barcode {p.barcode || "—"}</Text>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  imgCard: { borderRadius: 16, overflow: "hidden", backgroundColor: "#F3F4F6" },
  img: { width: "100%", aspectRatio: 1 },
  noImg: { alignItems: "center", justifyContent: "center" },
  company: { color: C.amber, fontWeight: "900", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginTop: Spacing.m },
  name: { fontSize: 19, fontWeight: "900", color: C.ink, marginTop: 3, lineHeight: 25 },
  rateCard: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.lightGray, padding: Spacing.m, marginTop: Spacing.m },
  rateTitle: { fontWeight: "900", color: C.ink, fontSize: 13.5, marginBottom: 8 },
  rateRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  rateLabel: { fontSize: 12.5, color: C.gray, flex: 1, paddingRight: 8 },
  ratePrice: { fontSize: 14, fontWeight: "900", color: C.ink },
  mrpLine: { fontSize: 11.5, color: C.gray, marginTop: 8 },
  tierNote: { fontSize: 10.5, color: "#9CA3AF", marginTop: 3 },
  qtyCard: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.lightGray, padding: Spacing.m, marginTop: Spacing.m, flexDirection: "row", alignItems: "center", gap: 10 },
  qtyTitle: { fontWeight: "900", color: C.ink, fontSize: 14 },
  qtySub: { fontSize: 11, color: C.gray, marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center", backgroundColor: C.bg, borderRadius: 10, overflow: "hidden" },
  stepBtn: { fontSize: 22, fontWeight: "900", color: C.ink, paddingHorizontal: 12, paddingVertical: 6 },
  stepVal: { fontSize: 15, fontWeight: "900", color: C.ink, minWidth: 26, textAlign: "center" },
  sku: { fontSize: 11, color: "#9CA3AF", marginTop: Spacing.m },
});
