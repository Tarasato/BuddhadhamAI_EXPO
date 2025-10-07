// screens/RegisterScreen.js
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, Platform, StatusBar, ActivityIndicator
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { registerApi } from '../src/api/auth';

export default function RegisterScreen({ navigation }) {
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const validate = () => {
    if (!userName.trim()) return 'กรุณากรอกชื่อผู้ใช้';
    if (!userEmail.trim()) return 'กรุณากรอกอีเมล';
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail.trim());
    if (!emailOk) return 'อีเมลไม่ถูกต้อง';
    if (userPassword.length < 6) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร';
    if (userPassword !== confirm) return 'รหัสผ่านและยืนยันรหัสผ่านไม่ตรงกัน';
    return '';
  };

  const handleRegister = async () => {
    const v = validate();
    if (v) { setError(v); return; }
    setError('');
    setLoading(true);
    try {
      await registerApi({
        userName: userName.trim(),
        userEmail: userEmail.trim().toLowerCase(),
        userPassword,
      });
      navigation.replace('Login'); // เสร็จแล้วกลับหน้า Login
    } catch (e) {
      setError(e?.message || 'สมัครสมาชิกไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, Platform.OS !== 'web' && { paddingTop: StatusBar.currentHeight || 20 }]}>
      {/* ปุ่มย้อนกลับ */}
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.navigate('Login')}>
        <Ionicons name="arrow-back" size={24} color="#fff" />
      </TouchableOpacity>

      <Text style={styles.title}>สมัครสมาชิก</Text>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <TextInput
        style={styles.input}
        placeholder="ชื่อผู้ใช้"
        placeholderTextColor="#aaa"
        value={userName}
        onChangeText={setUserName}
      />
      <TextInput
        style={styles.input}
        placeholder="อีเมล"
        placeholderTextColor="#aaa"
        value={userEmail}
        onChangeText={setUserEmail}
        autoCapitalize="none"
        keyboardType="email-address"
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
        />
        <TouchableOpacity style={styles.eye} onPress={() => setShowPass(s => !s)}>
          <Ionicons name={showPass ? 'eye-off' : 'eye'} size={20} color="#555" />
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
        />
        <TouchableOpacity style={styles.eye} onPress={() => setShowConfirm(s => !s)}>
          <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={20} color="#555" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.button, loading && { opacity: 0.7 }]}
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>สมัครสมาชิก</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={styles.linkText}>มีบัญชีแล้ว? เข้าสู่ระบบ</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2f3640', paddingTop: 20, paddingLeft: 30, paddingRight: 30 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 20, textAlign: 'center' },

  inputWrapper: { position: 'relative' },
  eye: { position: 'absolute', right: 12, top: 12, padding: 6 },

  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 15
  },
  button: {
    backgroundColor: '#0097e6',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 5
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  linkText: { color: '#ccc', marginTop: 15, textAlign: 'center' },
  errorText: { color: '#ff7675', textAlign: 'center', marginBottom: 10 },

  backButton: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 20 : (StatusBar.currentHeight || 20),
    left: 15,
    padding: 6,
    zIndex: 1
  }
});
