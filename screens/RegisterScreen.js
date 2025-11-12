import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Platform,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import useThemePreference from "../src/hooks/useThemePreference";
import { registerApi } from "../src/api/auth";

/* ============== Storage ============== */

const storage = {
  async getItem(key) {
    try { if (AsyncStorage?.getItem) return await AsyncStorage.getItem(key); } catch { }
    if (Platform.OS === "web") { try { return window.localStorage.getItem(key); } catch { } }
    return null;
  },
  async setItem(key, val) {
    try { if (AsyncStorage?.setItem) return await AsyncStorage.setItem(key, val); } catch { }
    if (Platform.OS === "web") { try { window.localStorage.setItem(key, val); } catch { } }
  },
};

export default function RegisterScreen({ navigation }) {
  /* =============== State =============== */
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /* =============== Theme =============== */
  const { isDark, toggleTheme, C } = useThemePreference("auth");

  /* =============== Derived / Validate =============== */
  const trimmed = useMemo(
    () => ({
      name: userName.trim(),
      email: userEmail.trim().toLowerCase(),
      password: userPassword,
      confirm: confirm,
    }),
    [userName, userEmail, userPassword, confirm]
  );

  const validate = () => {
    if (!trimmed.name) return "กรุณากรอกชื่อผู้ใช้";
    if (!trimmed.email) return "กรุณากรอกอีเมล";
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.email);
    if (!emailOk) return "อีเมลไม่ถูกต้อง";
    if (trimmed.password.length < 6) return "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
    if (trimmed.password !== trimmed.confirm) return "รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน";
    return "";
  };

  /* =============== Submit =============== */
  const handleRegister = async () => {
    if (loading) return;
    const v = validate();
    if (v) { setError(v); return; }

    setError("");
    setLoading(true);
    try {
      await registerApi({
        userName: trimmed.name,
        userEmail: trimmed.email,
        userPassword: trimmed.password,
      });
      navigation.replace("Login");
    } catch (e) {
      const msg = e?.response?.data?.message || e?.message || "สมัครสมาชิกไม่สำเร็จ";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  /* =============== UI =============== */
  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: C.containerBg },
        Platform.OS !== "web" && { paddingTop: StatusBar.currentHeight || 20 },
      ]}
    >
      {/* =============== Back ===============*/}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.navigate("Login")}
        accessibilityRole="button"
        accessibilityLabel="ย้อนกลับ"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="arrow-back" size={24} color={C.headerText} />
      </TouchableOpacity>

      {/* =============== Theme toggle =============== */}
      <TouchableOpacity
        onPress={toggleTheme}
        style={[styles.themeToggle, { backgroundColor: C.chipBg, borderColor: C.border }]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name={isDark ? "moon" : "sunny"} size={16} color={C.chipText} style={{ marginRight: 6 }} />
        <Text style={{ color: C.chipText, fontSize: 12 }}>{isDark ? "Dark" : "Light"}</Text>
      </TouchableOpacity>

      <View style={styles.contentWrapper}>
        <View style={[styles.card, { backgroundColor: C.cardBg, borderColor: C.cardBorder, shadowColor: C.shadow }]}>
          <Text style={[styles.title, { color: "#111" }]}>ลงทะเบียน</Text>

          {!!error && <Text style={[styles.errorText, { color: C.errorText }]}>{error}</Text>}

          <TextInput
            style={[styles.input, { backgroundColor: C.fieldBg, color: C.fieldText, borderColor: C.cardBorder }]}
            placeholder="ชื่อผู้ใช้"
            placeholderTextColor={C.fieldPlaceholder}
            value={userName}
            onChangeText={setUserName}
            autoCapitalize="words"
            returnKeyType="next"
          />

          <TextInput
            style={[styles.input, { backgroundColor: C.fieldBg, color: C.fieldText, borderColor: C.cardBorder }]}
            placeholder="อีเมล"
            placeholderTextColor={C.fieldPlaceholder}
            value={userEmail}
            onChangeText={setUserEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            returnKeyType="next"
          />

          <View style={styles.inputWrapper}>
            <TextInput
              style={[styles.input, { paddingRight: 42, backgroundColor: C.fieldBg, color: C.fieldText, borderColor: C.cardBorder }]}
              placeholder="รหัสผ่าน"
              placeholderTextColor={C.fieldPlaceholder}
              secureTextEntry={!showPass}
              value={userPassword}
              onChangeText={setUserPassword}
              returnKeyType="next"
            />
            <TouchableOpacity
              style={styles.eye}
              onPress={() => setShowPass((s) => !s)}
              accessibilityRole="button"
              accessibilityLabel={showPass ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
            >
              <Ionicons name={showPass ? "eye-off" : "eye"} size={20} color={C.eye} />
            </TouchableOpacity>
          </View>

          <View style={styles.inputWrapper}>
            <TextInput
              style={[styles.input, { paddingRight: 42, backgroundColor: C.fieldBg, color: C.fieldText, borderColor: C.cardBorder }]}
              placeholder="ยืนยันรหัสผ่าน"
              placeholderTextColor={C.fieldPlaceholder}
              secureTextEntry={!showConfirm}
              value={confirm}
              onChangeText={setConfirm}
              returnKeyType="go"
              onSubmitEditing={() => { if (!loading) handleRegister(); }}
            />
            <TouchableOpacity
              style={styles.eye}
              onPress={() => setShowConfirm((s) => !s)}
              accessibilityRole="button"
              accessibilityLabel={showConfirm ? "ซ่อนรหัสผ่านยืนยัน" : "แสดงรหัสผ่านยืนยัน"}
            >
              <Ionicons name={showConfirm ? "eye-off" : "eye"} size={20} color={C.eye} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, { backgroundColor: C.buttonBg }, loading && { opacity: 0.7 }]}
            onPress={handleRegister}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="สมัครสมาชิก"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={[styles.buttonText, { color: C.buttonText }]}>สมัครสมาชิก</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate("Login")} style={{ marginTop: 12 }}>
            <Text style={[styles.linkText, { color: C.linkText }]}>มีบัญชีอยู่แล้ว? ลงชื่อเข้าใช้</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

/* ============== Styles ============== */
const styles = StyleSheet.create({
  container: { flex: 1, paddingLeft: 30, paddingRight: 30 },
  contentWrapper: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 24 },
  card: {
    width: "90%",
    maxWidth: 440,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderWidth: 1,
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  title: { fontSize: 20, fontWeight: "bold", textAlign: "center", marginBottom: 14 },
  errorText: { textAlign: "center", marginBottom: 8 },
  inputWrapper: { position: "relative" },
  eye: { position: "absolute", right: 12, top: 12, padding: 6 },
  input: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, marginBottom: 12, borderWidth: 1 },
  button: { padding: 12, borderRadius: 10, alignItems: "center", marginTop: 4 },
  buttonText: { fontSize: 16, fontWeight: "bold" },
  linkText: { textAlign: "center", fontSize: 13 },
  backButton: {
    position: "absolute",
    top: Platform.OS === "web" ? 20 : StatusBar.currentHeight || 20,
    left: 15,
    padding: 6,
    zIndex: 2,
  },
  themeToggle: {
    position: "absolute",
    top: Platform.OS === "web" ? 20 : StatusBar.currentHeight || 20,
    right: 15,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    zIndex: 2,
  },
});
