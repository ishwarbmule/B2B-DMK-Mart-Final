/** Product list — used for search results, category browsing, brand pages and
 *  flag sections. Server-side pagination, honest per-godown stock dot. */
import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, TextInput, View } from "react-native";
import { endpoints, type ApiProduct } from "../lib/api";
import { C, ErrorNote, Spacing } from "../components/ui";
import { ProductCard } from "../components/ProductCard";

type Nav = {
  route: { params: { params?: Record<string, unknown>; title?: string; query?: string } };
  navigation: { setOptions: (o: unknown) => void; navigate: (s: string, p?: unknown) => void };
};

export function ProductListScreen({ route, navigation }: Nav) {
  const base = route.params?.params ?? {};
  const fixedQuery = route.params?.query ?? "";
  const title = route.params?.title ?? "Products";
  const [q, setQ] = useState(fixedQuery);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPagePages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    navigation.setOptions({ title });
  }, [title, navigation]);

  const load = async (p: number, replace: boolean) => {
    if (p === 1) setLoading(true);
    else setMore(true);
    setErr("");
    try {
      const r = await endpoints.products({ ...base, q: p === 1 ? q : "", page: p, limit: 24 });
      setProducts((cur) => (replace ? r.products : [...cur, ...r.products]));
      setPage(r.page);
      setPagePages(r.pages);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load products");
    } finally {
      setLoading(false);
      setMore(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => load(1, true), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, JSON.stringify(base)]);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ padding: Spacing.l, paddingBottom: 0 }}>
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search products, brands, SKU…"
          placeholderTextColor="#9CA3AF"
          style={st.search}
        />
      </View>
      <ErrorNote msg={err} />
      <FlatList
        data={products}
        numColumns={2}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: Spacing.l - 4 }}
        renderItem={({ item }) => (
          <ProductCard p={item} onOpen={() => navigation.navigate("ProductDetail", { product: item })} />
        )}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (!loading && !more && page < pages) load(page + 1, false);
        }}
        ListFooterComponent={
          loading ? (
            <Text style={st.foot}>Loading products…</Text>
          ) : more ? (
            <Text style={st.foot}>Loading more…</Text>
          ) : products.length === 0 && !err ? (
            <Text style={st.foot}>No products found.</Text>
          ) : undefined
        }
      />
    </View>
  );
}

const st = StyleSheet.create({
  search: { backgroundColor: C.white, borderWidth: 1, borderColor: C.lightGray, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14.5, color: C.ink },
  foot: { textAlign: "center", color: C.gray, padding: Spacing.l, fontSize: 13 },
});
