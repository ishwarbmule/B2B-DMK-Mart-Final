/** Warehouse (godown) chooser — shown after login; the chosen godown decides
 *  which products and which warehouse prices the buyer sees. */
import React, { useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { useApp } from "../store/app";
import { Btn, C, ErrorNote, Spacing } from "../components/ui";

export function WarehouseSelectScreen() {
  const { warehouses, chooseWarehouse } = useApp();
  const [busyId, setBusyId] = useState("");
  const [err, setErr] = useState("");

  const pick = async (id: string) => {
    setErr("");
    const w = warehouses.find((x) => x.id === id);
    if (!w) return;
    setBusyId(id);
    try {
      await chooseWarehouse(w);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not select warehouse");
    } finally {
      setBusyId("");
    }
  };

  return (
    <ScrollView contentContainerStyle={st.wrap}>
      <Text style={st.kicker}>One step before you start</Text>
      <Text style={st.h1}>Choose your godown</Text>
      <Text style={st.body}>Pick the DMK Mart godown you buy from — the app shows that godown's products and prices.</Text>
      <ErrorNote msg={err} />
      <View style={{ marginTop: Spacing.l, gap: Spacing.m }}>
        {warehouses.map((w) => (
          <View key={w.id} style={st.card}>
            {w.image ? <Image source={{ uri: w.image }} style={st.img} /> : <View style={[st.img, st.imgPh]} />}
            <View style={{ flex: 1, paddingLeft: Spacing.m }}>
              <Text style={st.name}>{w.name}</Text>
              {w.city ? <Text style={st.city}>{w.city}</Text> : null}
              {w.address ? <Text style={st.addr} numberOfLines={2}>{w.address}</Text> : null}
              <View style={{ marginTop: Spacing.s }}>
                <Btn
                  label={busyId === w.id ? "Selecting…" : "Select"}
                  onPress={() => pick(w.id)}
                  disabled={!!busyId}
                  small
                  kind="dark"
                />
              </View>
            </View>
          </View>
        ))}
        {warehouses.length === 0 && !err && <Text style={st.body}>Loading godowns…</Text>}
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { flexGrow: 1, backgroundColor: C.bg, padding: Spacing.xl },
  kicker: { color: C.amber, fontWeight: "800", fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
  h1: { fontSize: 24, fontWeight: "900", color: C.ink, marginTop: 4 },
  body: { fontSize: 13.5, color: C.gray, marginTop: 6, lineHeight: 19 },
  card: { flexDirection: "row", backgroundColor: C.white, borderRadius: 16, padding: Spacing.m, borderWidth: 1, borderColor: C.lightGray },
  img: { width: 92, height: 92, borderRadius: 12, backgroundColor: "#F3F4F6" },
  imgPh: {},
  name: { fontSize: 16, fontWeight: "900", color: C.ink },
  city: { fontSize: 12.5, color: C.amber, fontWeight: "700", marginTop: 2 },
  addr: { fontSize: 11.5, color: C.gray, marginTop: 3 },
});
