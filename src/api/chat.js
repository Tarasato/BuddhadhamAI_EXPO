import { chatClient, qNaClient } from "./client";

/* ========================================================
 * 🔸 Helpers
 * ====================================================== */
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ควบคุมการยิง askQuestion ไม่ให้ยิงพร้อมกันซ้ำ
let inflightController = null;
let lastFiredAt = 0;
const MIN_COOLDOWN_MS = 500;

const TEMP_ERROR_SNIPPETS = [
  "Timed out fetching a new connection from the connection pool",
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNABORTED",
  "socket hang up",
  "Network Error",
];

/* ========================================================
 * 🔸 QnA: Ask Question
 * ====================================================== */
export const askQuestion = async ({ chatId, question, k, d, dbSaveHint } = {}) => {
  const q = (question ?? "").trim();
  const MAX_QUESTION_LEN = 4000;

  if (!q) {
    return {
      message: "Answered without saving (blank question, client guarded)",
      data: { savedRecordQuestion: null, savedRecordAnswer: null },
      answer: "กรุณาพิมพ์คำถาม",
      references: "ไม่มี",
      rejected: true,
      duration: 0,
    };
  }

  if (q.length > MAX_QUESTION_LEN) {
    return {
      message: "Answered without saving (question too long)",
      data: { savedRecordQuestion: null, savedRecordAnswer: null },
      answer: `คำถามยาวเกินไป (${q.length}/${MAX_QUESTION_LEN} ตัวอักษร)`,
      references: "ไม่มี",
      rejected: true,
      duration: 0,
    };
  }

  const now = Date.now();
  const delta = now - lastFiredAt;
  if (delta < MIN_COOLDOWN_MS) await sleep(MIN_COOLDOWN_MS - delta);
  lastFiredAt = Date.now();

  const payload = {
    question: q,
    ...(chatId != null ? { chatId } : {}),
    ...(k != null ? { k: clamp(parseInt(k, 10) || 3, 1, 50) } : { k: 10 }),
    ...(d != null ? { d: clamp(Number(d) || 0.75, 0, 1) } : { d: 0.75 }),
    ...(dbSaveHint ? { dbSaveHint } : {}), // ⬅️ ส่ง hint ให้ backend ถ้าต้องการบันทึกชื่อไฟล์/ข้อความ
  };

  if (inflightController) {
    try { inflightController.abort(); } catch { }
  }
  inflightController = new AbortController();

  const MAX_RETRIES = 2;
  const BASE_TIMEOUT_MS = 25000;
  const BASE_BACKOFF_MS = 600;

  let attempt = 0;
  while (true) {
    try {
      const { data } = await qNaClient.post("/ask", payload, {
        signal: inflightController.signal,
        timeout: BASE_TIMEOUT_MS,
      });
      inflightController = null;
      return data;
    } catch (err) {
      const isAbort = err?.name === "AbortError" || err?.message === "canceled";
      if (isAbort) {
        return {
          message: "Answered without saving (request aborted)",
          data: { savedRecordQuestion: null, savedRecordAnswer: null },
          answer: "ยกเลิกคำขอก่อนหน้าแล้ว ยิงคำถามล่าสุดแทน",
          references: "ไม่มี",
          rejected: true,
          duration: 0,
        };
      }

      const status = err?.response?.status;
      const msg = String(err?.response?.data?.message || err?.message || "");
      const looksTemporary =
        status === 429 ||
        status === 503 ||
        TEMP_ERROR_SNIPPETS.some((s) => msg.includes(s));

      if (looksTemporary && attempt < MAX_RETRIES) {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempt++);
        await sleep(backoff);
        continue;
      }

      return {
        message: "Answered without saving (request failed)",
        data: { savedRecordQuestion: null, savedRecordAnswer: null },
        answer:
          status === 429
            ? "คำถามเยอะเกินไปชั่วคราว กรุณาลองใหม่อีกครั้ง"
            : "เกิดข้อผิดพลาดขณะส่งคำถาม กรุณาลองใหม่",
        references: "ไม่มี",
        rejected: true,
        duration: 0,
        debug: { status, error: msg, attempt },
      };
    }
  }
};


/* ========================================================
 * 🔸 Chat: CRUD / Fetch
 * ====================================================== */
export const getUserChats = async (userId) => {
  if (!userId) return [];
  const { data } = await chatClient.get(`/all/${userId}`);
  return Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
      ? data
      : [];
};

export const createChat = async ({ chatHeader, userId }) => {
  if (!chatHeader || !String(chatHeader).trim())
    throw new Error("chatHeader is required");

  const body = {
    chatHeader: String(chatHeader).trim(),
    ...(userId != null ? { userId } : {}),
  };

  const { data } = await chatClient.post(`/`, body);
  return data?.data ?? data;
};

export const editChat = async (chatId, updatedData) => {
  if (!chatId) throw new Error("chatId is required");
  const { data } = await chatClient.put(`/${chatId}`, updatedData || {});
  return data?.data ?? data;
};

export const deleteChat = async (chatId) => {
  if (!chatId) throw new Error("chatId is required");
  const { data } = await chatClient.delete(`/${chatId}`);
  return data?.data ?? data;
};

export const getChatById = async (chatId) => {
  if (!chatId) return null;
  const { data } = await chatClient.get(`/one/${chatId}`);
  return data?.data ?? data;
};

export const getAllChats = async () => {
  const { data } = await chatClient.get(`/all`);
  return Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
      ? data
      : [];
};

/* ========================================================
 * 🔸 QnA: History / Cancel / Delete
 * ====================================================== */
export const getChatQna = async (chatId) => {
  if (!chatId) return [];
  try {
    const { data } = await qNaClient.get(`/${chatId}`);
    return Array.isArray(data?.data)
      ? data.data
      : Array.isArray(data)
        ? data
        : [];
  } catch (err) {
    if (err?.response?.status === 404) return [];
    throw err;
  }
};

export const cancelAsk = async (taskId, payload = {}) => {
  if (!taskId) throw new Error("taskId is required");
  const { data } = await qNaClient.post(`/cancel/${taskId}`, payload);
  return data?.data ?? data;
};

export const deleteQna = async (qNaId) => {
  const idNum = Number(qNaId);
  if (!idNum) return { ok: false, message: "Invalid qNaId" };

  try {
    const { data } = await qNaClient.delete(`/${idNum}`);
    return data?.data ?? data;
  } catch (e1) {
    const status1 = e1?.response?.status;
    if (status1 === 404 || status1 === 405) {
      try {
        const { data } = await qNaClient.delete(`/deleteqNa/${idNum}`);
        return data?.data ?? data;
      } catch (e2) {
        try {
          const { data } = await qNaClient.post(`/deleteqNa/${idNum}`);
          return data?.data ?? data;
        } catch (e3) {
          const status3 = e3?.response?.status;
          if (status3 === 404) return { ok: true, deleted: false };
          throw e3;
        }
      }
    }

    if (status1 === 404) return { ok: true, deleted: false };
    throw e1;
  }
};

export const checkStatus = async (taskId) => {
  if (!taskId) throw new Error("taskId is required");
  const { data } = await qNaClient.get(`/status/${encodeURIComponent(taskId)}`);
  return data?.data ?? data;
};

// ==============================
// บันทึกคำตอบเออเรอร์/ข้อความผลลัพธ์
// ==============================
export const saveAnswer = async ({ taskId, chatId, qNaWords }) => {
  if (!taskId) throw new Error("taskId is required");
  if (!chatId) throw new Error("chatId is required");
  if (!qNaWords) throw new Error("qNaWords is required");

  const payload = {
    taskId: String(taskId),
    chatId: Number(chatId),
    qNaWords: String(qNaWords),
  };


  const { data } = await qNaClient.post(`/answer`, payload);
  return data?.data ?? data;
};
