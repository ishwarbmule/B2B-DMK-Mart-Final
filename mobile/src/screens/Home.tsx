/** Home — sliders, category grid, brands strip, Ready-to-Dispatch + Featured
 *  sections (brand-grouped, same data as the website home). */
import React, { useEffect, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useApp } from "../store/app";
import { endpoints, type ApiProduct } from "../lib/api";
import { C, Spacing, styles as ui } from "../components/ui";
import { ProductCard } from "../components/ProductCard";

export function HomeScreen({ navigation }: { navigation: { navigate: (s: string, p?: unknown) => void } }) {
  const { catalog, loadCatalog, warehouse, customer } = useApp();
  const [q, setQ] = useState("");
  const [topProducts, setTopProducts] = useState<ApiProduct[]>([]);
  const [featProducts, setFeatProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState("");
  const sliderW = Dimensions.get("window").width - Spacing.xl * 2;

  const load = async () => {
    setErr("");
    try {
      if (!catalog) await loadCatalog();
      const [t, f] = await Promise.all([
        endpoints.products({ flag: "top", flagAll: 1, limit: 60 }),
        endpoints.products({ flag: "featured", flagAll: 1, limit: 60 }),
      ]);
      setTopProducts(t.products ?? []);
      setFeatProducts(f.products ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load the store");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warehouse?.id]);

  const openList = (params: Record<string, unknown>, title: string) =>
    navigation.navigate("ProductList", { params, title });

  const sliders = (catalog?.sliders ?? []).slice(0, 5);
  const tops = catalog?.tops ?? [];
  const brands = catalog?.brands ?? [];

  return (
    <ScrollView
      style={{ backgroundColor: C.bg, flex: 1 }}
      contentContainerStyle={{ padding: Spacing.xl, paddingBottom: Spacing.xl * 2 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* header greeting */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View>
          <Text style={{ fontSize: 11, fontWeight: "800", color: C.gray, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {customer?.shopName || "Welcome"}
          </Text>
          <Text style={{ fontSize: 18, fontWeight: "900", color: C.ink }}>{customer?.name ?? ""}</Text>
        </View>
        <View style={st.whChip}>
          <Text style={st.whChipText}>{warehouse?.name ?? "godown"}</Text>
        </View>
      </View>

      {/* search */}
      <Pressable style={[ui.input, { marginTop: Spacing.l, flexDirection: "row", alignItems: "center" }]} onPress={() => navigation.navigate("Search", {})}>
        <Text style={{ color: "#9CA3AF", fontSize: 14.5 }}>Search products, brands, SKU…</Text>
      </Pressable>

      {err ? <Text style={st.err}>{err}</Text> : null}

      {/* sliders */}
      {sliders.length > 0 && (
        <FlatList
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          data={sliders}
          keyExtractor={(s) => s.id}
          style={{ marginTop: Spacing.m, marginHorizontal: -Spacing.xl }}
          renderItem={({ item: s }) => (
            <Pressable
              style={{ width: Dimensions.get("window").width, paddingHorizontal: Spacing.xl }}
              onPress={() => openList({ flag: "top", flagAll: 1 }, "Ready to Dispatch")}
            >
              {s.mobileImage || s.image ? (
                <Image source={{ uri: s.mobileImage || s.image }} style={{ width: sliderW, height: sliderW * 0.62, borderRadius: 16, backgroundColor: "#111" }} resizeMode="cover" />
              ) : null}
            </Pressable>
          )}
        />
      )}

      {/* categories */}
      <Text style={st.section}>Shop by category</Text>
      <View style={st.catGrid}>
        {tops.map((t) => (
          <Pressable key={t.id} style={[st.catTile, { backgroundColor: t.color || C.yellow }]} onPress={() => openList({ top: t.id }, t.name)}>
            {t.image ? (
              <Image source={{ uri: t.image }} style={st.catImg} />
            ) : (
              <Text style={{ fontSize: 26 }}>{t.emoji || "🧺"}</Text>
            )}
            <Text style={st.catName} numberOfLines={2}>{t.name}</Text>
          </Pressable>
        ))}
      </View>

      {/* brands */}
      {brands.length > 0 && (
        <>
          <Text style={st.section}>Top brands</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={brands}
            keyExtractor={(b) => b.id}
            contentContainerStyle={{ gap: Spacing.m, paddingRight: Spacing.xl }}
            renderItem={({ item: b }) => (
              <Pressable style={st.brandTile} onPress={() => openList({ brand: b.slug }, b.name)}>
                {b.logo ? (
                  <Image source={{ uri: b.logo }} style={{ width: 56, height: 56, borderRadius: 10, backgroundColor: "#fff" }} resizeMode="contain" />
                ) : (
                  <View style={[st.brandPh, { backgroundColor: b.color || C.ink }]}><Text style={{ color: C.yellow, fontWeight: "900" }}>{b.name.slice(0, 2).toUpperCase()}</Text></View>
                )}
                <Text style={st.brandName} numberOfLines={1}>{b.name}</Text>
              </Pressable>
            )}
          />
        </>
      )}

      {/* ready to dispatch */}
      {topProducts.length > 0 && (
        <>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: Spacing.xl }}>
            <Text style={st.section2}>Ready to Dispatch</Text>
            <Pressable onPress={() => openList({ flag: "top", flagAll: 1 }, "Ready to Dispatch")}>
              <Text style={st.seeAll}>See all</Text>
            </Pressable>
          </View>
          <View style={st.grid}>
            {topProducts.slice(0, 8).map((p) => (
              <ProductCard key={p.id} p={p} onOpen={() => navigation.navigate("ProductDetail", { product: p })} />
            ))}
          </View>
        </>
      )}

      {/* featured */}
      {featProducts.length > 0 && (
        <>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: Spacing.l }}>
            <Text style={st.section2}>Featured</Text>
            <Pressable onPress={() => openList({ flag: "featured", flagAll: 1 }, "Featured")}>
              <Text style={st.seeAll}>See all</Text>
            </Pressable>
          </View>
          <View style={st.grid}>
            {featProducts.slice(0, 8).map((p) => (
              <ProductCard key={p.id} p={p} onOpen={() => navigation.navigate("ProductDetail", { product: p })} />
            ))}
          </View>
        </>
      )}

      {loading && <Text style={st.loading}>Loading the store…</Text>}
      {!loading && topProducts.length === 0 && featProducts.length === 0 && !err && (
        <Text style={st.loading}>No products in this godown yet.</Text>
      )}
    </ScrollView>
  );
}

const st = StyleSheet.create({
  whChip: { backgroundColor: C.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  whChipText: { color: C.yellow, fontSize: 11.5, fontWeight: "800" },
  section: { fontSize: 16.5, fontWeight: "900", color: C.ink, marginTop: Spacing.xl, marginBottom: Spacing.m },
  section2: { fontSize: 16.5, fontWeight: "900", color: C.ink },
  catGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  catTile: { width: "31%", marginHorizontal: 4, marginBottom: 8, borderRadius: 14, paddingVertical: 14, alignItems: "center", overflow: "hidden" },
  catImg: { width: 44, height: 44, borderRadius: 10 },
  catName: { fontSize: 11, fontWeight: "800", color: C.ink, textAlign: "center", marginTop: 6, paddingHorizontal: 6 },
  brandTile: { width: 84, alignItems: "center" },
  brandPh: { width: 56, height: 56, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  brandName: { fontSize: 10.5, fontWeight: "700", color: C.dark, marginTop: 5, textAlign: "center" },
  seeAll: { color: C.amber, fontWeight: "800", fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  err: { color: C.red, fontSize: 12.5, marginTop: Spacing.m, fontWeight: "600" },
  loading: { color: C.gray, textAlign: "center", marginTop: Spacing.l, fontSize: 13 },
});
