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
import { registerApi } from "../src/api/auth";

/**
 * RegisterScreen (เพิ่มสลับธีม — UI เท่านั้น)
 */
const THEME_KEY = "ui_theme_dark"; // 'true' | 'false'

const storage = {
  async getItem(key) {
    try {
      if (AsyncStorage?.getItem) return await AsyncStorage.getItem(key);
    } catch {}
    if (Platform.OS === "web") {
      try {
        return window.localStorage.getItem(key);
      } catch {}
    }
    return null;
  },
  async setItem(key, val) {
    try {
      if (AsyncStorage?.setItem) return await AsyncStorage.setItem(key, val);
    } catch {}
    if (Platform.OS === "web") {
      try {
        window.localStorage.setItem(key, val);
      } catch {}
    }
  },
};

export default function RegisterScreen({ navigation }) {
  /** ---------- Local state ---------- */
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /** ---------- Theme (UI only) ---------- */
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    (async () => {
      const saved = await storage.getItem(THEME_KEY);
      if (saved === "true") setIsDark(true);
      if (saved === "false") setIsDark(false);
    })();
  }, []);
  const toggleTheme = async () => {
    const next = !isDark;
    setIsDark(next);
    await storage.setItem(THEME_KEY, next ? "true" : "false");
  };

  const C = useMemo(
    () =>
      isDark
        ? {
            containerBg: "#2f3640",
            headerText: "#ffffff",
            fieldBg: "#ffffff",
            fieldText: "#111111",
            fieldPlaceholder: "#9AA0A6",
            buttonBg: "#0097e6",
            buttonText: "#ffffff",
            linkText: "#d1d5db",
            errorText: "#ff7675",
            chipBg: "rgba(255,255,255,0.12)",
            chipText: "#ffffff",
            border: "#3f4650",
            eye: "#555",
          }
        : {
            containerBg: "#f6f7fb",
            headerText: "#111111",
            fieldBg: "#ffffff",
            fieldText: "#111111",
            fieldPlaceholder: "#6b7280",
            buttonBg: "#2563eb",
            buttonText: "#ffffff",
            linkText: "#374151",
            errorText: "#ef4444",
            chipBg: "#e9eef6",
            chipText: "#111111",
            border: "#d9dee5",
            eye: "#555",
          },
    [isDark]
  );

  /** ---------- Derived state ---------- */
  const trimmed = useMemo(
    () => ({
      name: userName.trim(),
      email: userEmail.trim().toLowerCase(),
      password: userPassword,
      confirm: confirm,
    }),
    [userName, userEmail, userPassword, confirm]
  );

  /** ---------- Helpers ---------- */
  const validate = () => {
    if (!trimmed.name) return "กรุณากรอกชื่อผู้ใช้";
    if (!trimmed.email) return "กรุณากรอกอีเมล";
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.email);
    if (!emailOk) return "อีเมลไม่ถูกต้อง";
    if (trimmed.password.length < 6) return "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
    if (trimmed.password !== trimmed.confirm) return "รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน";
    return "";
  };

  /** ---------- Actions (คงเดิม ไม่เปลี่ยนลอจิก) ---------- */
  const handleRegister = async () => {
    if (loading) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }

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

  /** ---------- UI ---------- */
  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: C.containerBg },
        Platform.OS !== "web" && { paddingTop: StatusBar.currentHeight || 20 },
      ]}
    >
      {/* ปุ่มย้อนกลับ */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.navigate("Login")}
        accessibilityRole="button"
        accessibilityLabel="ย้อนกลับ"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="arrow-back" size={24} color={C.headerText} />
      </TouchableOpacity>

      {/* ปุ่มสลับธีม (ขวาบน) */}
      <TouchableOpacity
        onPress={toggleTheme}
        style={[
          styles.themeToggle,
          { backgroundColor: C.chipBg, borderColor: C.border },
        ]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons
          name={isDark ? "moon" : "sunny"}
          size={16}
          color={C.chipText}
          style={{ marginRight: 6 }}
        />
        <Text style={{ color: C.chipText, fontSize: 12 }}>
          {isDark ? "Dark" : "Light"}
        </Text>
      </TouchableOpacity>

      <Text style={[styles.title, { color: C.headerText }]}>สมัครสมาชิก</Text>

      {!!error && <Text style={[styles.errorText, { color: C.errorText }]}>{error}</Text>}

      {/* ชื่อผู้ใช้ */}
      <TextInput
        style={[
          styles.input,
          { backgroundColor: C.fieldBg, borderColor: C.border, color: C.fieldText },
        ]}
        placeholder="ชื่อผู้ใช้"
        placeholderTextColor={C.fieldPlaceholder}
        value={userName}
        onChangeText={setUserName}
        autoCapitalize="words"
        returnKeyType="next"
      />

      {/* อีเมล */}
      <TextInput
        style={[
          styles.input,
          { backgroundColor: C.fieldBg, borderColor: C.border, color: C.fieldText },
        ]}
        placeholder="อีเมล"
        placeholderTextColor={C.fieldPlaceholder}
        value={userEmail}
        onChangeText={setUserEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        returnKeyType="next"
      />

      {/* รหัสผ่าน */}
      <View style={styles.inputWrapper}>
        <TextInput
          style={[
            styles.input,
            { paddingRight: 42, backgroundColor: C.fieldBg, borderColor: C.border, color: C.fieldText },
          ]}
          placeholder="รหัสผ่าน"
          placeholderTextColor={C.fieldPlaceholder}
          secureTextEntry={!showPass}
          value={userPassword}
          onChangeText={setUserPassword}
          returnKeyType="next"
          onSubmitEditing={() => {}}
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

      {/* ยืนยันรหัสผ่าน */}
      <View style={styles.inputWrapper}>
        <TextInput
          style={[
            styles.input,
            { paddingRight: 42, backgroundColor: C.fieldBg, borderColor: C.border, color: C.fieldText },
          ]}
          placeholder="ยืนยันรหัสผ่าน"
          placeholderTextColor={C.fieldPlaceholder}
          secureTextEntry={!showConfirm}
          value={confirm}
          onChangeText={setConfirm}
          returnKeyType="go"
          onSubmitEditing={() => {
            if (!loading) handleRegister();
          }}
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

      {/* ปุ่มสมัครสมาชิก */}
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

      {/* ลิงก์ไปหน้า Login */}
      <TouchableOpacity onPress={() => navigation.navigate("Login")}>
        <Text style={[styles.linkText, { color: C.linkText }]}>มีบัญชีแล้ว? เข้าสู่ระบบ</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

/** ---------- Styles (ฐาน) ---------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 20,
    paddingLeft: 30,
    paddingRight: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
  },

  inputWrapper: { position: "relative" },
  eye: { position: "absolute", right: 12, top: 12, padding: 6 },

  input: {
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 15,
    borderWidth: 1,
  },

  button: {
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 5,
  },
  buttonText: { fontSize: 16, fontWeight: "bold" },

  linkText: { marginTop: 15, textAlign: "center" },
  errorText: { textAlign: "center", marginBottom: 10 },

  backButton: {
    position: "absolute",
    top: Platform.OS === "web" ? 20 : StatusBar.currentHeight || 20,
    left: 15,
    padding: 6,
    zIndex: 2,
  },
  themeToggle: {
    position: "absolute",
    top: Platform.OS === "web" ? 20 : (StatusBar.currentHeight || 20),
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
