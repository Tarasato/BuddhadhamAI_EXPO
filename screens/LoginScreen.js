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
import AsyncStorage from "@react-native-async-storage/async-storage";

import { loginApi } from "../src/api/auth";
import { useAuth } from "../src/auth/AuthContext";

/** ============== Theme Key (UI only) ============== */
const THEME_KEY = "ui_theme_dark";

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
            containerBg: "#4A5368",
            headerText: "#F8FAFC",
            cardBg: "#F7F8FB",
            cardBorder: "#E5E9F2",
            fieldBg: "#EDEFF3",
            fieldText: "#111827",
            fieldPlaceholder: "#9AA0A6",
            buttonBg: "#6B7280",
            buttonText: "#FFFFFF",
            linkText: "#4B5563",
            errorText: "#FF6B6B",
            chipBg: "rgba(255,255,255,0.12)",
            chipText: "#E5E7EB",
            border: "#D9DEE8",
            shadow: "#000",
          }
        : {
            containerBg: "#EEF2F7",
            headerText: "#0F172A",
            cardBg: "#FFFFFF",
            cardBorder: "#E6ECF5",
            fieldBg: "#F3F4F6",
            fieldText: "#0F172A",
            fieldPlaceholder: "#6B7280",
            buttonBg: "#6B7280",
            buttonText: "#FFFFFF",
            linkText: "#374151",
            errorText: "#EF4444",
            chipBg: "#E8EDF6",
            chipText: "#0F172A",
            border: "#E5EAF2",
            shadow: "#000",
          },
    [isDark]
  );

  /** ------------------- State ------------------- */
  const [userInput, setUserInput] = useState("");
  const [userPassword, setUserPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  /** ------------------- ล็อกอิน ------------------- */
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
        CommonActions.reset({ index: 0, routes: [{ name: "Chat" }] })
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

      {/* ปุ่มสลับธีม */}
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

      <View style={styles.contentWrapper}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: C.cardBg,
              borderColor: C.cardBorder,
              shadowColor: C.shadow,
            },
          ]}
        >
          <Text style={[styles.title, { color: "#111" }]}>ลงชื่อเข้าใช้</Text>

          {!!error && (
            <Text style={[styles.errorText, { color: C.errorText }]}>
              {error}
            </Text>
          )}

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: C.fieldBg,
                color: C.fieldText,
                borderColor: C.cardBorder,
              },
            ]}
            placeholder="อีเมล"
            placeholderTextColor={C.fieldPlaceholder}
            autoCapitalize="none"
            keyboardType="email-address"
            value={userInput}
            onChangeText={setUserInput}
          />

          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: C.fieldBg,
                color: C.fieldText,
                borderColor: C.cardBorder,
              },
            ]}
            placeholder="รหัสผ่าน"
            placeholderTextColor={C.fieldPlaceholder}
            secureTextEntry
            value={userPassword}
            onChangeText={setUserPassword}
          />

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
                ลงชื่อเข้าใช้
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate("Register")}
            style={{ marginTop: 12 }}
          >
            <Text style={[styles.linkText, { color: C.linkText }]}>
              ยังไม่มีบัญชีอยู่? สมัครสมาชิก
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

/** ================= Styles ================= */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingLeft: 30,
    paddingRight: 30,
  },

  contentWrapper: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },

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

  title: {
    fontSize: 20,
    fontWeight: "bold",
    textAlign: "center",
    marginBottom: 14,
  },

  input: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
  },

  button: {
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "bold",
  },

  linkText: { textAlign: "center", fontSize: 13 },
  errorText: { textAlign: "center", marginBottom: 8 },

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
