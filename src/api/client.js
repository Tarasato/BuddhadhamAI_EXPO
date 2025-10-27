import axios from "axios";
import { EXPO_PUBLIC_API_URL } from '@env';

/**
 * 📡 BASE API URL ที่ใช้ทุก service
 * ดึงมาจาก environment variable ของ Expo
 */
const API = EXPO_PUBLIC_API_URL;

/* ========================================================
 * 🔸 Axios Clients แยกเป็น service แต่ละประเภท
 * ====================================================== */

/** ✅ client สำหรับ user API */
const client = axios.create({
  baseURL: `${API}/user`,
});

/** 🧠 client สำหรับ QnA (ถาม-ตอบคำถาม) */
const qNaClient = axios.create({
  baseURL: `${API}/qNa`,
});

/** 💬 client สำหรับ chat (สร้าง/ดึง/แก้ไข/ลบแชต) */
const chatClient = axios.create({
  baseURL: `${API}/chat`,
});

/* ========================================================
 * 🔸 Export
 * ====================================================== */
export default client;
export { qNaClient, chatClient, API };
