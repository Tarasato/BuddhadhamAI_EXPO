  import React, { useState } from "react";
  import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    SafeAreaView, Platform, StatusBar, ActivityIndicator
  } from "react-native";
  import { Ionicons } from "@expo/vector-icons";
  import { loginApi } from "../src/api/auth";
  import { useAuth } from "../src/auth/AuthContext";

  export default function LoginScreen({ navigation }) {
    const { login } = useAuth();
    const [userEmail, setUserEmail] = useState("");
    const [userPassword, setUserPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleLogin = async () => {
      setError("");
      const email = userEmail.trim().toLowerCase();
      if (!email || !userPassword.trim()) {
        setError("กรอกอีเมลและรหัสผ่านให้ครบ");
        return;
      }

      setLoading(true);
      try {
        const { user, message } = await loginApi({ userEmail: email, userPassword });
        if (!user?.id && !user?.name) throw new Error(message || "ข้อมูลผู้ใช้ไม่ครบ");
        await login(user);                 // เก็บลง Context + AsyncStorage
        navigation.replace("Chat");        // กลับหน้าแชต
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || "ล็อกอินไม่สำเร็จ";
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    return (
      <SafeAreaView style={[styles.container, Platform.OS !== "web" && { paddingTop: StatusBar.currentHeight || 20 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate("Chat")}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        <Text style={styles.title}>เข้าสู่ระบบ</Text>
        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TextInput
          style={styles.input}
          placeholder="อีเมล"
          placeholderTextColor="#aaa"
          autoCapitalize="none"
          keyboardType="email-address"
          value={userEmail}
          onChangeText={setUserEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="รหัสผ่าน"
          placeholderTextColor="#aaa"
          secureTextEntry
          value={userPassword}
          onChangeText={setUserPassword}
        />

        <TouchableOpacity
          style={[styles.button, loading && { opacity: 0.7 }]}
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>เข้าสู่ระบบ</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.navigate("Register")}>
          <Text style={styles.linkText}>ยังไม่มีบัญชี? สมัครสมาชิก</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#2f3640", paddingTop: 20, paddingLeft: 30, paddingRight: 30 },
    title: { fontSize: 24, fontWeight: "bold", color: "#fff", marginBottom: 20, textAlign: "center" },
    input: {
      backgroundColor: "#fff",
      borderRadius: 10,
      paddingHorizontal: 15,
      paddingVertical: 10,
      fontSize: 16,
      marginBottom: 15
    },
    button: {
      backgroundColor: "#0097e6",
      padding: 15,
      borderRadius: 10,
      alignItems: "center",
      marginTop: 5
    },
    buttonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
    linkText: { color: "#ccc", marginTop: 15, textAlign: "center" },
    errorText: { color: "#ff7675", textAlign: "center", marginBottom: 10 },
    backButton: {
      position: "absolute",
      top: Platform.OS === "web" ? 20 : (StatusBar.currentHeight || 20),
      left: 15,
      padding: 6,
      zIndex: 1
    }
  });
