import React, { useState, useMemo } from "react";
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
import { registerApi } from "../src/api/auth";

/**
 * RegisterScreen
 * หน้าสมัครสมาชิก: รับชื่อ, อีเมล, รหัสผ่าน และยืนยันรหัสผ่าน
 * มีการ validate ฝั่ง client + แสดง error จาก backend
 */
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

  /** ---------- Derived state (memo) ---------- */
  // ตัด space ปลายทางไว้ตั้งแต่ต้น เพื่อให้การตรวจสอบ/ส่งค่าไป API สะอาด
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
  // validate(): ตรวจความถูกต้องของข้อมูลก่อน call API
  const validate = () => {
    if (!trimmed.name) return "กรุณากรอกชื่อผู้ใช้";
    if (!trimmed.email) return "กรุณากรอกอีเมล";
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.email);
    if (!emailOk) return "อีเมลไม่ถูกต้อง";
    if (trimmed.password.length < 6)
      return "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร";
    if (trimmed.password !== trimmed.confirm)
      return "รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน";
    return "";
  };

  /** ---------- Actions ---------- */
  // handleRegister(): กดปุ่มสมัครสมาชิก → validate → call API → ไปหน้า Login
  const handleRegister = async () => {
    if (loading) return; // กันการกดรัวๆ ระหว่างรอ API
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
      // สมัครสำเร็จ → ไปหน้า Login
      navigation.replace("Login");
    } catch (e) {
      // โชว์ข้อความผิดพลาดจาก backend ถ้ามี
      const msg =
        e?.response?.data?.message || e?.message || "สมัครสมาชิกไม่สำเร็จ";
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
        Platform.OS !== "web" && { paddingTop: StatusBar.currentHeight || 20 },
      ]}
    >
      {/* ปุ่มย้อนกลับไปหน้า Login */}
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.navigate("Login")}
        accessibilityRole="button"
        accessibilityLabel="ย้อนกลับ"
      >
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      <Text style={styles.title}>สมัครสมาชิก</Text>

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      {/* ชื่อผู้ใช้ */}
      <TextInput
        style={styles.input}
        placeholder="ชื่อผู้ใช้"
        placeholderTextColor="#aaa"
        value={userName}
        onChangeText={setUserName}
        autoCapitalize="words"
        returnKeyType="next"
      />

      {/* อีเมล */}
      <TextInput
        style={styles.input}
        placeholder="อีเมล"
        placeholderTextColor="#aaa"
        value={userEmail}
        onChangeText={setUserEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        returnKeyType="next"
      />

      {/* รหัสผ่าน */}
      <View style={styles.inputWrapper}>
        <TextInput
          style={[styles.input, { paddingRight: 42 }]}
          placeholder="รหัสผ่าน"
          placeholderTextColor="#aaa"
          secureTextEntry={!showPass}
          value={userPassword}
          onChangeText={setUserPassword}
          returnKeyType="next"
          // บน web: กด Enter เพื่อเลื่อนไปช่องถัดไป (หรือส่ง)
          onSubmitEditing={() => {}}
        />
        <TouchableOpacity
          style={styles.eye}
          onPress={() => setShowPass((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={showPass ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
        >
          <Ionicons
            name={showPass ? "eye-off" : "eye"}
            size={20}
            color="#555"
          />
        </TouchableOpacity>
      </View>

      {/* ยืนยันรหัสผ่าน */}
      <View style={styles.inputWrapper}>
        <TextInput
          style={[styles.input, { paddingRight: 42 }]}
          placeholder="ยืนยันรหัสผ่าน"
          placeholderTextColor="#aaa"
          secureTextEntry={!showConfirm}
          value={confirm}
          onChangeText={setConfirm}
          returnKeyType="go"
          onSubmitEditing={() => {
            // รองรับกด Enter/Go เพื่อส่งฟอร์ม
            if (!loading) handleRegister();
          }}
        />
        <TouchableOpacity
          style={styles.eye}
          onPress={() => setShowConfirm((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={
            showConfirm ? "ซ่อนรหัสผ่านยืนยัน" : "แสดงรหัสผ่านยืนยัน"
          }
        >
          <Ionicons
            name={showConfirm ? "eye-off" : "eye"}
            size={20}
            color="#555"
          />
        </TouchableOpacity>
      </View>

      {/* ปุ่มสมัครสมาชิก */}
      <TouchableOpacity
        style={[styles.button, loading && { opacity: 0.7 }]}
        onPress={handleRegister}
        disabled={loading}
        accessibilityRole="button"
        accessibilityLabel="สมัครสมาชิก"
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>สมัครสมาชิก</Text>
        )}
      </TouchableOpacity>

      {/* ลิงก์ไปหน้า Login */}
      <TouchableOpacity onPress={() => navigation.navigate("Login")}>
        <Text style={styles.linkText}>มีบัญชีแล้ว? เข้าสู่ระบบ</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

/** ---------- Styles ---------- */
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

  inputWrapper: { position: "relative" },
  eye: { position: "absolute", right: 12, top: 12, padding: 6 },

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
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },

  linkText: { color: "#ccc", marginTop: 15, textAlign: "center" },
  errorText: { color: "#ff7675", textAlign: "center", marginBottom: 10 },

  backButton: {
    position: "absolute",
    top: Platform.OS === "web" ? 20 : StatusBar.currentHeight || 20,
    left: 15,
    padding: 6,
    zIndex: 1,
  },
});
