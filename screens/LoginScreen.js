import React, { useState, useEffect, useMemo } from "react";
import { CommonActions } from "@react-navigation/native";
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

import { loginApi } from "../src/api/auth";
import { useAuth } from "../src/auth/AuthContext";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * หน้าล็อกอินของระบบ (เพิ่มสลับโหมดมืด/สว่าง — UI เท่านั้น)
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

export default function LoginScreen({ navigation }) {
  const { login } = useAuth();

  // ---------- Theme (UI only) ----------
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
            // dark
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
          }
        : {
            // light
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
          },
    [isDark]
  );

  /** ------------------- State ------------------- */
  const [userInput, setUserInput] = useState(""); // อีเมล / username
  const [userPassword, setUserPassword] = useState(""); // รหัสผ่าน
  const [loading, setLoading] = useState(false); // กำลังโหลด
  const [error, setError] = useState(""); // ข้อความ error

  /** ------------------- ฟังก์ชันล็อกอิน (ไม่เปลี่ยนลอจิก) ------------------- */
  const handleLogin = async () => {
    setError("");

    const userInputData = userInput.trim();
    const passwordData = userPassword.trim();
    if (!userInputData || !passwordData) {
      setError("กรอกอีเมลและรหัสผ่านให้ครบ");
      return;
    }

    setLoading(true);
    try {
      const { user, message } = await loginApi({
        userInput: userInputData,
        userPassword: passwordData,
      });

      if (!user?.id && !user?.token) {
        throw new Error(message || "ข้อมูลผู้ใช้ไม่ครบ");
      }

      await login(user);

      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "Chat" }],
        })
      );
    } catch (e) {
      const msg =
        e?.response?.data?.message || e?.message || "ล็อกอินไม่สำเร็จ";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  /** ------------------- UI ------------------- */
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
        onPress={() => navigation.navigate("Chat")}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="arrow-back" size={24} color={C.headerText} />
      </TouchableOpacity>

      {/* ปุ่มสลับธีม (มุมขวาบน) */}
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

      {/* หัวข้อ */}
      <Text style={[styles.title, { color: C.headerText }]}>เข้าสู่ระบบ</Text>
      {!!error && (
        <Text style={[styles.errorText, { color: C.errorText }]}>{error}</Text>
      )}

      {/* ช่องกรอกอีเมล */}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: C.fieldBg,
            borderColor: C.border,
            color: C.fieldText,
          },
        ]}
        placeholder="อีเมล"
        placeholderTextColor={C.fieldPlaceholder}
        autoCapitalize="none"
        keyboardType="email-address"
        value={userInput}
        onChangeText={setUserInput}
      />

      {/* ช่องกรอกรหัสผ่าน */}
      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: C.fieldBg,
            borderColor: C.border,
            color: C.fieldText,
          },
        ]}
        placeholder="รหัสผ่าน"
        placeholderTextColor={C.fieldPlaceholder}
        secureTextEntry
        value={userPassword}
        onChangeText={setUserPassword}
      />

      {/* ปุ่มล็อกอิน */}
      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: C.buttonBg },
          loading && { opacity: 0.7 },
        ]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={[styles.buttonText, { color: C.buttonText }]}>
            เข้าสู่ระบบ
          </Text>
        )}
      </TouchableOpacity>

      {/* ลิงก์ไปสมัครสมาชิก */}
      <TouchableOpacity onPress={() => navigation.navigate("Register")}>
        <Text style={[styles.linkText, { color: C.linkText }]}>
          ยังไม่มีบัญชี? สมัครสมาชิก
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

/** ------------------- Styles (ฐาน) ------------------- */
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
  buttonText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  linkText: {
    marginTop: 15,
    textAlign: "center",
  },
  errorText: {
    textAlign: "center",
    marginBottom: 10,
  },
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
