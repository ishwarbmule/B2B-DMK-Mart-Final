/** Login — phone/email + password, same accounts as the website. */
import React, { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { endpoints } from "../lib/api";
import { useApp } from "../store/app";
import { Btn, C, ErrorNote, Spacing, styles as ui } from "../components/ui";

export function LoginScreen() {
  const { loginDone } = useApp();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const go = async () => {
    setErr("");
    if (!id.trim() || !pw) {
      setErr("Enter your mobile number / email and password.");
      return;
    }
    setBusy(true);
    try {
      const r = await endpoints.login(id.trim(), pw);
      await loginDone(r.token, r.customer);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.ink }} behavior={Platform.OS === "android" ? undefined : "padding"}>
      <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
        <View style={st.brandBlock}>
          <View style={st.logoBox}>
            <Image source={require("../../assets/icon.png")} style={st.logo} />
          </View>
          <Text style={st.title}>DMK Mart</Text>
          <Text style={st.sub}>Wholesale partner app — same account as the website</Text>
        </View>

        <View style={st.form}>
          <Text style={st.label}>Mobile number or email</Text>
          <TextInput
            value={id}
            onChangeText={setId}
            placeholder="e.g. 9876543210"
            placeholderTextColor="#9CA3AF"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="default"
            style={ui.input}
          />
          <Text style={[st.label, { marginTop: Spacing.m }]}>Password</Text>
          <TextInput
            value={pw}
            onChangeText={setPw}
            placeholder="Your password"
            placeholderTextColor="#9CA3AF"
            secureTextEntry
            autoCapitalize="none"
            style={ui.input}
          />
          <ErrorNote msg={err} />
          <View style={{ marginTop: Spacing.l }}>
            <Btn label="Login" onPress={go} loading={busy} />
          </View>
          <Text style={st.note}>
            New shop? Call us on +91 93095 75173 — the DMK Mart team creates your account and shares your password on WhatsApp.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  wrap: { flexGrow: 1, backgroundColor: C.ink, padding: Spacing.xl, justifyContent: "center" },
  brandBlock: { alignItems: "center", marginBottom: Spacing.xl },
  logoBox: { backgroundColor: C.yellow, borderRadius: 28, padding: 14, marginBottom: Spacing.m },
  logo: { width: 72, height: 72, borderRadius: 14 },
  title: { color: C.yellow, fontSize: 30, fontWeight: "900", letterSpacing: 1 },
  sub: { color: "#9CA3AF", fontSize: 13, marginTop: 4, textAlign: "center" },
  form: { backgroundColor: C.white, borderRadius: 18, padding: Spacing.l },
  label: { fontSize: 12.5, fontWeight: "800", color: C.dark, marginBottom: 6 },
  note: { color: C.gray, fontSize: 12.5, marginTop: Spacing.m, lineHeight: 18 },
});
