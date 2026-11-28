/** Change password — forced on migrated accounts (mustChangePassword = true),
 *  same endpoint as the website's mandatory popup. */
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { endpoints } from "../lib/api";
import { useApp } from "../store/app";
import { Btn, C, ErrorNote, Spacing, styles as ui } from "../components/ui";

export function ChangePasswordScreen() {
  const { customer, refreshMe } = useApp();
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const go = async () => {
    setErr("");
    if (next.length < 6) {
      setErr("New password must be at least 6 characters.");
      return;
    }
    if (next !== confirm) {
      setErr("New password and confirm password do not match.");
      return;
    }
    setBusy(true);
    try {
      await endpoints.changePassword(cur, next);
      await refreshMe(); // mustChangePassword flips to false
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
      <View style={st.badge}>
        <Text style={st.badgeText}>Security check</Text>
      </View>
      <Text style={st.h1}>Set your new password</Text>
      <Text style={st.body}>
        {customer?.name ? `${customer.name}, ` : ""}your account uses a temporary password from DMK Mart. Choose a new password to continue.
      </Text>

      <Text style={st.label}>Current / temporary password</Text>
      <TextInput value={cur} onChangeText={setCur} secureTextEntry autoCapitalize="none" placeholderTextColor="#9CA3AF" placeholder="Current password" style={ui.input} />
      <Text style={[st.label, { marginTop: Spacing.m }]}>New password (min 6 characters)</Text>
      <TextInput value={next} onChangeText={setNext} secureTextEntry autoCapitalize="none" placeholderTextColor="#9CA3AF" placeholder="New password" style={ui.input} />
      <Text style={[st.label, { marginTop: Spacing.m }]}>Confirm new password</Text>
      <TextInput value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" placeholderTextColor="#9CA3AF" placeholder="Repeat new password" style={ui.input} />
      <ErrorNote msg={err} />
      <View style={{ marginTop: Spacing.l }}>
        <Btn label="Save password" onPress={go} loading={busy} />
      </View>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  wrap: { flexGrow: 1, backgroundColor: C.bg, padding: Spacing.xl, justifyContent: "center" },
  badge: { backgroundColor: C.orangeBg, alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginBottom: Spacing.m },
  badgeText: { color: C.orange, fontWeight: "800", fontSize: 12 },
  h1: { fontSize: 22, fontWeight: "900", color: C.ink, marginBottom: 6 },
  body: { fontSize: 13.5, color: C.gray, lineHeight: 20, marginBottom: Spacing.l },
  label: { fontSize: 12.5, fontWeight: "800", color: C.dark, marginBottom: 6 },
});
