/** My orders — same privacy rule as the website: items and money stay hidden
 *  until the admin confirms the order (orange bar with item count instead). */
import React, { useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { endpoints, type ApiOrder } from "../lib/api";
import { formatINR } from "../lib/pricing";
import { useApp } from "../store/app";
import { C, Spacing } from "../components/ui";

export function OrdersScreen() {
  const { customer } = useApp();
  const [orders, setOrders] = useState<ApiOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    setErr("");
    try {
      const me = await endpoints.me();
      setOrders(me.recentOrders ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  React.useEffect(() => {
    load();
  }, []);

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    } catch {
      return iso?.slice(0, 10) ?? "";
    }
  };

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: C.bg }}
      contentContainerStyle={{ padding: Spacing.l }}
      data={orders}
      keyExtractor={(o) => o.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      ListHeaderComponent={
        <>
          <Text style={st.h1}>My orders</Text>
          {customer?.shopName ? <Text style={st.sub}>{customer.shopName}</Text> : null}
          {err ? <Text style={st.err}>{err}</Text> : null}
        </>
      }
      ListEmptyComponent={!loading ? <Text style={st.empty}>No orders yet — your first order will appear here.</Text> : <Text style={st.empty}>Loading orders…</Text>}
      renderItem={({ item: o }) => {
        const confirmed = !!o.confirmedAt;
        return (
          <View style={st.card}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={st.invoice}>{o.invoiceNo || o.id.slice(-8).toUpperCase()}</Text>
              <View style={[st.statusChip, { backgroundColor: confirmed ? "#DCFCE7" : C.orangeBg }]}>
                <Text style={[st.statusText, { color: confirmed ? C.green : C.orange }]}>
                  {confirmed ? "Confirmed" : "Awaiting confirmation"}
                </Text>
              </View>
            </View>
            <Text style={st.date}>{fmtDate(o.createdAt)} · {o.itemCount ?? o.items?.length ?? 0} item(s)</Text>

            {confirmed ? (
              <>
                {o.items?.length > 0 && (
                  <View style={{ marginTop: 6 }}>
                    {o.items.slice(0, 4).map((it, idx) => (
                      <View key={it.id ?? idx} style={st.itemRow}>
                        <Text style={st.itemName} numberOfLines={1}>{it.name ?? "Product"}</Text>
                        <Text style={st.itemQty}>×{it.qty ?? ""}</Text>
                      </View>
                    ))}
                    {(o.items?.length ?? 0) > 4 && <Text style={st.moreItems}>+ {(o.items?.length ?? 0) - 4} more items</Text>}
                  </View>
                )}
                <View style={st.totalRow}>
                  <Text style={st.totalLabel}>Grand total</Text>
                  <Text style={st.totalVal}>{formatINR(o.grandTotal)}</Text>
                </View>
              </>
            ) : (
              <View style={st.pendingBar}>
                <Text style={st.pendingText}>
                  {o.itemCount ?? o.items?.length ?? 0} item(s) ordered — details shown once confirmed by DMK Mart
                </Text>
              </View>
            )}
          </View>
        );
      }}
    />
  );
}

const st = StyleSheet.create({
  h1: { fontSize: 22, fontWeight: "900", color: C.ink },
  sub: { fontSize: 12.5, color: C.gray, marginTop: 2 },
  err: { color: C.red, fontSize: 12.5, marginTop: Spacing.m, fontWeight: "600" },
  empty: { textAlign: "center", color: C.gray, marginTop: Spacing.xl, fontSize: 13.5 },
  card: { backgroundColor: C.white, borderRadius: 14, borderWidth: 1, borderColor: C.lightGray, padding: Spacing.m, marginTop: Spacing.m },
  invoice: { fontSize: 15, fontWeight: "900", color: C.ink },
  statusChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 10.5, fontWeight: "900" },
  date: { fontSize: 11.5, color: C.gray, marginTop: 3 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  itemName: { flex: 1, fontSize: 12.5, color: C.dark, fontWeight: "600" },
  itemQty: { fontSize: 12.5, color: C.gray, fontWeight: "800" },
  moreItems: { fontSize: 11, color: C.gray, marginTop: 2 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#F3F4F6", marginTop: 8, paddingTop: 8 },
  totalLabel: { fontSize: 13, fontWeight: "800", color: C.gray },
  totalVal: { fontSize: 15, fontWeight: "900", color: C.ink },
  pendingBar: { backgroundColor: C.orangeBg, borderRadius: 10, padding: 10, marginTop: 8 },
  pendingText: { color: C.orange, fontSize: 12, fontWeight: "700", lineHeight: 17 },
});
