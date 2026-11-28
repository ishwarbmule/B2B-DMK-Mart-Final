/** Shared theme + small UI atoms for the DMK Mart customer app. */
import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

export const C = {
  yellow: "#FACC15",
  amber: "#F59E0B",
  ink: "#111111",
  dark: "#1F2937",
  gray: "#6B7280",
  lightGray: "#E5E7EB",
  bg: "#F9FAFB",
  white: "#FFFFFF",
  green: "#16A34A",
  red: "#DC2626",
  orange: "#D97706",
  orangeBg: "#FEF3C7",
};

export const Spacing = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };

export const Btn = ({
  label,
  onPress,
  kind = "primary",
  disabled,
  loading,
  small,
}: {
  label: string;
  onPress: () => void;
  kind?: "primary" | "dark" | "outline" | "ghost";
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled || loading}
    style={({ pressed }) => [
      styles.btn,
      small && styles.btnSmall,
      kind === "primary" && { backgroundColor: C.yellow },
      kind === "dark" && { backgroundColor: C.ink },
      kind === "outline" && { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.ink },
      kind === "ghost" && { backgroundColor: C.bg, borderWidth: 1, borderColor: C.lightGray },
      (disabled || loading) && { opacity: 0.55 },
      pressed && { opacity: 0.85 },
    ]}
  >
    {loading ? (
      <ActivityIndicator size="small" color={kind === "primary" ? C.ink : C.white} />
    ) : (
      <Text style={[styles.btnText, small && styles.btnTextSmall, kind === "primary" ? { color: C.ink } : kind === "outline" ? { color: C.ink } : { color: C.white }]}>
        {label}
      </Text>
    )}
  </Pressable>
);

export const Chip = ({ text, tone = "gray" }: { text: string; tone?: "gray" | "green" | "red" | "yellow" }) => (
  <View
    style={[
      styles.chip,
      tone === "gray" && { backgroundColor: "#F3F4F6" },
      tone === "green" && { backgroundColor: "#DCFCE7" },
      tone === "red" && { backgroundColor: "#FEE2E2" },
      tone === "yellow" && { backgroundColor: C.orangeBg },
    ]}
  >
    <Text style={[styles.chipText, tone === "green" && { color: C.green }, tone === "red" && { color: C.red }, tone === "yellow" && { color: C.orange }]}>
      {text}
    </Text>
  </View>
);

export const ErrorNote = ({ msg }: { msg: string }) =>
  msg ? (
    <View style={styles.errorNote}>
      <Text style={styles.errorText}>{msg}</Text>
    </View>
  ) : null;

export const styles = StyleSheet.create({
  btn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", justifyContent: "center" },
  btnSmall: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 12 },
  btnText: { fontSize: 16, fontWeight: "800", letterSpacing: 0.2 },
  btnTextSmall: { fontSize: 13, fontWeight: "800" },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" },
  chipText: { fontSize: 11, fontWeight: "800", color: C.dark },
  errorNote: { backgroundColor: "#FEE2E2", borderRadius: 10, padding: 10, marginTop: 10 },
  errorText: { color: C.red, fontSize: 13, fontWeight: "600" },
  input: { backgroundColor: C.white, borderWidth: 1, borderColor: C.lightGray, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.ink },
  h1: { fontSize: 22, fontWeight: "900", color: C.ink },
  h2: { fontSize: 17, fontWeight: "800", color: C.ink },
  body: { fontSize: 14, color: C.dark },
  muted: { fontSize: 12, color: C.gray },
});
