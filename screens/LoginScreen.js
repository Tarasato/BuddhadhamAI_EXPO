import React, { useState } from "react";
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

/**
 * หน้าล็อกอินของระบบ
 * - รองรับกรอกอีเมลและรหัสผ่าน
 * - เรียก API เพื่อล็อกอิน
 * - ถ้าสำเร็จ → เซฟข้อมูลผู้ใช้ใน Context แล้วนำไปหน้า Chat
 */
export default function LoginScreen({ navigation }) {
  const { login } = useAuth();

  /** ------------------- State ------------------- */
  const [userInput, setUserInput] = useState("");        // อีเมล / username
  const [userPassword, setUserPassword] = useState("");  // รหัสผ่าน
  const [loading, setLoading] = useState(false);         // กำลังโหลด
  const [error, setError] = useState("");                // ข้อความ error

  /** ------------------- ฟังก์ชันล็อกอิน ------------------- */
  const handleLogin = async () => {
    setError("");

    // เช็กค่าว่าง
    const userInputData = userInput.trim();
    const passwordData = userPassword.trim();
    if (!userInputData || !passwordData) {
      setError("กรอกอีเมลและรหัสผ่านให้ครบ");
      return;
    }

    setLoading(true);
    try {
      // เรียก API
      const { user, message } = await loginApi({
        userInput: userInputData,
        userPassword: passwordData,
      });

      // ตรวจสอบว่าได้ข้อมูลผู้ใช้ครบไหม
      if (!user?.id && !user?.token) {
        throw new Error(message || "ข้อมูลผู้ใช้ไม่ครบ");
      }

      // บันทึกข้อมูลผู้ใช้ใน AuthContext
      await login(user);

      // ล้าง stack แล้วนำผู้ใช้ไปหน้า Chat
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "Chat" }],
        })
      );
    } catch (e) {
      // ดึงข้อความ error จาก response หรือ fallback
      const msg = e?.response?.data?.message || e?.message || "ล็อกอินไม่สำเร็จ";
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
        Platform.OS !== "web" && { paddingTop: StatusBar.currentHeight || 20 },
      ]}
    >
      {/* ปุ่มย้อนกลับ */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.navigate("Chat")}
      >
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      {/* หัวข้อ */}
      <Text style={styles.title}>เข้าสู่ระบบ</Text>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      {/* ช่องกรอกอีเมล */}
      <TextInput
        style={styles.input}
        placeholder="อีเมล"
        placeholderTextColor="#aaa"
        autoCapitalize="none"
        keyboardType="email-address"
        value={userInput}
        onChangeText={setUserInput}
      />

      {/* ช่องกรอกรหัสผ่าน */}
      <TextInput
        style={styles.input}
        placeholder="รหัสผ่าน"
        placeholderTextColor="#aaa"
        secureTextEntry
        value={userPassword}
        onChangeText={setUserPassword}
      />

      {/* ปุ่มล็อกอิน */}
      <TouchableOpacity
        style={[styles.button, loading && { opacity: 0.7 }]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>เข้าสู่ระบบ</Text>
        )}
      </TouchableOpacity>

      {/* ลิงก์ไปสมัครสมาชิก */}
      <TouchableOpacity onPress={() => navigation.navigate("Register")}>
        <Text style={styles.linkText}>ยังไม่มีบัญชี? สมัครสมาชิก</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

/** ------------------- Styles ------------------- */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#2f3640",
    paddingTop: 20,
    paddingLeft: 30,
    paddingRight: 30,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 20,
    textAlign: "center",
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 15,
  },
  button: {
    backgroundColor: "#0097e6",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 5,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "bold",
  },
  linkText: {
    color: "#ccc",
    marginTop: 15,
    textAlign: "center",
  },
  errorText: {
    color: "#ff7675",
    textAlign: "center",
    marginBottom: 10,
  },
  backButton: {
    position: "absolute",
    top: Platform.OS === "web" ? 20 : StatusBar.currentHeight || 20,
    left: 15,
    padding: 6,
    zIndex: 1,
  },
});
