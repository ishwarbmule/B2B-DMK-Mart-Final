/** Catalog product card — mirrors the website card: image, brand, piece price
 *  for DELIVERY + pack price for PICKUP, MRP strike, honest in-stock dot,
 *  quick-add buttons for Piece and Pack. */
import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import type { ApiProduct } from "../lib/api";
import { displayPrice, formatINR, piecePriceOf } from "../lib/pricing";
import { C } from "./ui";
import { useApp } from "../store/app";

export function ProductCard({ p, onOpen }: { p: ApiProduct; onOpen: () => void }) {
  const { customer, addToCart } = useApp();
  const tier = customer?.tier || "tier2";
  const mrp = p.locPrice?.mrp ?? p.mrp;
  const piece = piecePriceOf(p, tier);
  const packPrice = displayPrice(p, tier, "PICKUP", "PACK");
  const dealActive = p.isDeal && (p.dealPrice ?? 0) > 0;
  const packPieces = Math.max(1, p.packQty || 1);

  return (
    <View style={st.card}>
      <Pressable onPress={onOpen} style={st.imgWrap}>
        {p.image ? (
          <Image source={{ uri: p.image }} style={st.img} resizeMode="cover" />
        ) : (
          <View style={[st.img, st.noImg]}>
            <Text style={{ fontSize: 30 }}>🧺</Text>
          </View>
        )}
        <View style={[st.dot, { backgroundColor: p.inStock ? C.green : C.lightGray }]} />
        {dealActive && (
          <View style={st.dealBadge}>
            <Text style={st.dealBadgeText}>DEAL</Text>
          </View>
        )}
      </Pressable>

      <Pressable onPress={onOpen} style={st.info}>
        <Text style={st.company} numberOfLines={1}>
          {p.company || p.brand?.name || ""}
        </Text>
        <Text style={st.name} numberOfLines={2}>
          {p.name}
        </Text>
        <View style={st.priceRow}>
          <Text style={st.price}>{formatINR(dealActive ? (p.dealPrice ?? piece) : piece)}</Text>
          {mrp > piece && <Text style={st.mrp}>{formatINR(mrp)}</Text>}
        </View>
        <Text style={st.rateLine}>Delivery {formatINR(dealActive ? (p.dealPrice ?? piece) : piece)}/pc · Pickup {formatINR(packPrice)}/{p.unit === "PCS" ? "pack" : (p.unit || "pack").toLowerCase()}</Text>
        {packPieces > 1 ? (
          <Text style={st.packLine}>1 pack = {packPieces} pieces</Text>
        ) : null}
        <View style={st.actions}>
          <Pressable
            style={[st.addBtn, { backgroundColor: C.yellow }]}
            onPress={() => addToCart(p, "SINGLE", 1)}
          >
            <Text style={st.addBtnText}>+ Piece</Text>
          </Pressable>
          <Pressable
            style={[st.addBtn, { backgroundColor: C.ink }]}
            onPress={() => addToCart(p, "PACK", 1)}
          >
            <Text style={[st.addBtnText, { color: C.yellow }]}>+ Pack</Text>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.lightGray,
    margin: 4,
    overflow: "hidden",
  },
  imgWrap: { position: "relative", backgroundColor: "#F3F4F6" },
  img: { width: "100%", aspectRatio: 1 },
  noImg: { alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", right: 8, bottom: 8, width: 10, height: 10, borderRadius: 5 },
  dealBadge: { position: "absolute", left: 8, top: 8, backgroundColor: C.red, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  dealBadgeText: { color: C.white, fontSize: 10, fontWeight: "900" },
  info: { padding: 10 },
  company: { fontSize: 10.5, fontWeight: "800", color: C.amber, textTransform: "uppercase", letterSpacing: 0.4 },
  name: { fontSize: 13.5, fontWeight: "700", color: C.ink, marginTop: 3, minHeight: 34 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 6 },
  price: { fontSize: 16.5, fontWeight: "900", color: C.ink },
  mrp: { fontSize: 11, color: "#9CA3AF", textDecorationLine: "line-through" },
  rateLine: { fontSize: 10.5, color: C.gray, marginTop: 3 },
  packLine: { fontSize: 10.5, color: C.gray, marginTop: 1 },
  actions: { flexDirection: "row", gap: 6, marginTop: 8 },
  addBtn: { flex: 1, borderRadius: 9, paddingVertical: 7, alignItems: "center" },
  addBtnText: { fontSize: 12.5, fontWeight: "800", color: C.ink },
});
