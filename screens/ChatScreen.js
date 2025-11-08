import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  PermissionsAndroid,
  KeyboardAvoidingView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Markdown from "react-native-markdown-display";
import Icon from "react-native-vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Voice from "@react-native-voice/voice";

import { useAuth } from "../src/auth/AuthContext";
import { useWS } from "../src/ws/WSContext";

import buddhadhamBG from "../assets/buddhadham.png";
import userAvatar from "../assets/userAvatar.png";
import botAvatar from "../assets/botAvatar.png";

import {
  askQuestion,
  cancelAsk,
  createChat,
  deleteChat as apiDeleteChat,
  editChat as apiEditChat,
  getChatQna,
  getUserChats,
  checkStatus,
  saveAnswer,

} from "../src/api/chat";

import AsyncStorage from "@react-native-async-storage/async-storage";

// ============================== Config ==============================
const MIN_H = 40;
const MAX_H = 140;
const LINE_H = 20;
const PAD_V_TOP = 10;
const PAD_V_BOTTOM = 10;
const EXTRA_BOTTOM_GAP = 24;
const AVATAR_SIZE = 44;
const CORNER_NEAR_AVATAR = 6;

const STORAGE_PREFIX = "chat_state_v1:";
const LAST_CHAT_ID_KEY = "last_selected_chat_id";
const THEME_KEY = "ui_theme_dark";

// ============================== Helpers ==============================

const wrapSingle = (s) => String(s).replace(/'/g, "\\'");




const storage = {
  async getItem(key) {
    try {
      if (AsyncStorage?.getItem) return await AsyncStorage.getItem(key);
    } catch { }
    if (Platform.OS === "web") {
      try {
        return window.localStorage.getItem(key);
      } catch { }
    }
    return null;
  },
  async setItem(key, val) {
    try {
      if (AsyncStorage?.setItem) return await AsyncStorage.setItem(key, val);
    } catch { }
    if (Platform.OS === "web") {
      try {
        window.localStorage.setItem(key, val);
      } catch { }
    }
  },
};

const clampH = (h) => Math.min(MAX_H, Math.max(MIN_H, Math.ceil(h || MIN_H)));
const formatTS = (d) =>
  new Date(d).toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
const toTS = (v) => {
  if (!v) return 0;
  const n = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(n) ? n : 0;
};

// ============================== Component ==============================
export default function ChatScreen({ navigation }) {
  const { on, subscribeTask } = useWS();
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();

  // Theme
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
          headerBg: "#2F3644",
          headerText: "#F8FAFC",
          chipBg: "rgba(255,255,255,0.08)",
          chipText: "#E5E7EB",
          sidebarBg: "#D7D9DE",
          sidebarText: "#222222",
          divider: "#B9BDC6",
          bubbleUserBg: "#FFFFFF",
          bubbleUserText: "#0F172A",
          bubbleBotBg: "#2E3140",
          bubbleBotText: "#FFFFFF",
          timeText: "#D1D5DB",
          inputBg: "#FFFFFF",
          inputBarBg: "#2F3644",
          border: "#404656",
          sendBtn: "#60A5FA",
          cancelBtn: "#F05252",
          overlay: "rgba(0,0,0,0.35)",
          avatarRing: "#111827",
          logoTint: "#FFFFFF",
          dateChip: "rgba(255,255,255,0.18)",
        }
        : {
          containerBg: "#EEF2F7",
          headerBg: "#FFFFFF",
          headerText: "#0F172A",
          chipBg: "#E8EDF6",
          chipText: "#0F172A",
          sidebarBg: "#F1F3F6",
          sidebarText: "#1F2937",
          divider: "#D7DDEA",
          bubbleUserBg: "#FFFFFF",
          bubbleUserText: "#0F172A",
          bubbleBotBg: "#E9EDF6",
          bubbleBotText: "#0F172A",
          timeText: "#6B7280",
          inputBg: "#FFFFFF",
          inputBarBg: "#FFFFFF",
          border: "#D4D9E5",
          sendBtn: "#2563EB",
          cancelBtn: "#DC2626",
          overlay: "rgba(0,0,0,0.18)",
          avatarRing: "#93C5FD",
          logoTint: "#000000",
          dateChip: "rgba(15,23,42,0.06)",
        },
    [isDark]
  );

  // Helpers: pending state reset
  const firingRef = useRef(false);
  const triggerSend = async () => {
    if (firingRef.current || sending) return; // กันซ้ำ
    firingRef.current = true;
    try {
      await sendMessage();
    } finally {
      firingRef.current = false;
    }
  };
  // Async State
  const [sending, setSending] = useState(false);
  const awaitingRef = useRef(false);
  useEffect(() => {
    awaitingRef.current = sending;
  }, [sending]);

  const [showStop, setShowStop] = useState(false);
  const stopTimerRef = useRef(null);

  const [currentTaskId, setCurrentTaskId] = useState(null);
  const currentTaskIdRef = useRef(null);
  useEffect(() => {
    currentTaskIdRef.current = currentTaskId;
  }, [currentTaskId]);

  const [pendingQnaId, setPendingQnaId] = useState(null);
  const [pendingUserMsgId, setPendingUserMsgId] = useState(null);

  // Chat/UI State
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnim = useState(new Animated.Value(-260))[0];
  const [inputHeight, setInputHeight] = useState(MIN_H);

  // List/Scroll
  const listRef = useRef(null);
  const scrollToBottom = (animated = true) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
      setTimeout(() => listRef.current?.scrollToEnd({ animated }), 60);
    });
  };

  // Chats
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const selectedChatIdRef = useRef(null);
  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  // Popup / Rename
  const [menuFor, setMenuFor] = useState(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");

  // Persist Guard
  const persistSuspendedRef = useRef(false);

  // Web autosize
  const webRef = useRef(null);
  const adjustWebHeight = () => {
    if (Platform.OS !== "web") return;
    const el = webRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = clampH(el.scrollHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = next >= MAX_H ? "auto" : "hidden";
    setInputHeight(next);
  };
  useEffect(() => {
    if (Platform.OS === "web") adjustWebHeight();
  }, []);

  // Ensure active chat
  const ensureActiveChat = async () => {
    if (!user) return { id: null, created: false };

    const currentId = selectedChatIdRef.current;
    if (currentId && chats.some((c) => String(c.id) === String(currentId))) {
      return { id: currentId, created: false };
    }

    if (chats.length > 0) {
      const id = String(chats[0].id);
      setSelectedChatId(id);
      return { id, created: false };
    }

    try {
      const created = await createChat({
        userId: user?.id || user?._id,
        chatHeader: "แชตใหม่",
      });
      const newChatId = String(created?.chatId ?? created?.id);
      const item = { id: newChatId, title: created?.chatHeader || "แชตใหม่" };
      setChats([item]);
      setSelectedChatId(newChatId);
      return { id: newChatId, created: true };
    } catch (e) {
      console.error("ensureActiveChat create error:", e);
      Alert.alert("ผิดพลาด", "ไม่สามารถสร้างแชตใหม่ได้");
      return { id: null, created: false };
    }
  };

  // Sidebar / Popup helpers
  const openItemMenu = (id, x, y) => {
    setMenuFor(id);
    setMenuPos({ x, y });
  };
  const closeItemMenu = () => setMenuFor(null);
  const getPopupStyle = () => {
    const { width, height } = Dimensions.get("window");
    const MW = 200,
      MH = 160,
      PAD = 10;
    return {
      left: Math.min(menuPos.x, width - MW - PAD),
      top: Math.min(menuPos.y, height - MH - PAD),
      width: MW,
    };
  };
  const toggleSidebar = () => {
    const toOpen = !sidebarOpen;
    Animated.timing(sidebarAnim, {
      toValue: toOpen ? 0 : -260,
      duration: 260,
      useNativeDriver: false,
    }).start(() => setSidebarOpen(toOpen));
  };

  // Pending bubbles
  const pendingBubbleId = (taskId) => `pending-${taskId}`;
  const makePendingBubble = (taskId) => ({
    id: taskId ? pendingBubbleId(taskId) : "pending-generic",
    from: "bot",
    pending: true,
    text: "กำลังประมวลผล...",
    time: formatTS(Date.now()),
  });
  const addPendingBotBubble = (taskId) => {
    const id = taskId ? pendingBubbleId(taskId) : "pending-generic";
    setMessages((prev) =>
      prev.some((m) => m.id === id)
        ? prev
        : [...prev, makePendingBubble(taskId)]
    );
  };
  const removePendingBotBubble = (taskId) => {
    setMessages((prev) => {
      if (taskId) return prev.filter((m) => m.id !== pendingBubbleId(taskId));
      const idx = prev.findIndex((m) => m.pending === true);
      if (idx < 0) return prev;
      const copy = [...prev];
      copy.splice(idx, 1);
      return copy;
    });
  };
  const upgradePendingBubble = (taskId) => {
    if (!taskId) return;
    setMessages((prev) => {
      const genIdx = prev.findIndex(
        (m) => m.pending === true && m.id === "pending-generic"
      );
      if (genIdx === -1) return prev;
      const copy = [...prev];
      copy.splice(genIdx, 1, { ...prev[genIdx], id: `pending-${taskId}` });
      return copy;
    });
  };

  // WS handlers
  useEffect(() => {
    const doneHandler = (payload) => {
      const matchesTask =
        !!payload?.taskId && payload.taskId === currentTaskIdRef.current;
      const matchesChat =
        !!payload?.chatId &&
        String(payload.chatId) === String(selectedChatIdRef.current);
      if (!matchesTask && !matchesChat) return;
      hardResetPendingState();
    };
    const unbind = on("done", doneHandler);
    return () => unbind?.();
  }, [on]);

  useEffect(() => {
    const taskId = currentTaskIdRef.current;
    if (!taskId) return;
    const handler = (msgObj) => {
      const matchesTask =
        !!msgObj?.taskId && msgObj.taskId === currentTaskIdRef.current;
      const matchesChat =
        !!msgObj?.chatId &&
        String(msgObj.chatId) === String(selectedChatIdRef.current);
      let accept = matchesTask || matchesChat;
      if (!accept && awaitingRef.current) accept = true;
      if (!accept) return;

      const finalText =
        typeof msgObj === "string"
          ? msgObj
          : msgObj?.text ?? JSON.stringify(msgObj);

      if (msgObj?.taskId && msgObj.taskId !== currentTaskIdRef.current) {
        setCurrentTaskId(msgObj.taskId);
        upgradePendingBubble(msgObj.taskId);
      }

      const tId = msgObj?.taskId || currentTaskIdRef.current;
      setMessages((prev) => {
        const pendId = tId ? pendingBubbleId(tId) : "pending-generic";
        let idx = prev.findIndex((m) => m.id === pendId);
        if (idx < 0) idx = prev.findIndex((m) => m.pending === true);

        const newMsg = {
          id: Date.now().toString(),
          from: "bot",
          text: finalText,
          time: formatTS(Date.now()),
        };
        if (idx >= 0) {
          const copy = [...prev];
          copy.splice(idx, 1, newMsg);
          setTimeout(() => scrollToBottom(true), 0);
          return copy;
        }
        const next = [...prev, newMsg];
        setTimeout(() => scrollToBottom(true), 0);
        return next;
      });

      hardResetPendingState();
      const chatId2 = selectedChatIdRef.current;
      if (chatId2) {
        storage.setItem(
          STORAGE_PREFIX + String(chatId2),
          JSON.stringify({ sending: false, savedAt: Date.now() })
        );
      }
    };
    const unsubscribe = subscribeTask(taskId, handler);
    return () => unsubscribe?.();
  }, [subscribeTask, currentTaskId]);

  // ============================== Pending Poll helpers ==============================
  const pollTimerRef = useRef(null);
  const heartbeatRef = useRef(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    return () => {
      unmountedRef.current = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  const stopPendingPoll = () => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  };

  const startHeartbeat = (chatId) => {
    // อัปเดต savedAt เป็นระยะๆ กัน TTL เคลียร์สถานะ (ทุก 10s)
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(async () => {
      if (!chatId) return;
      const raw = await storage.getItem(STORAGE_PREFIX + String(chatId));
      const s = raw ? JSON.parse(raw) : {};
      await storage.setItem(
        STORAGE_PREFIX + String(chatId),
        JSON.stringify({ ...s, savedAt: Date.now() })
      );
    }, 10_000);
  };

  const startPendingPoll = ({
    chatId,
    taskId,
    pendingQnaId,
    pendingUserMsgId,
    pendingUserMsg,
    initialDelay = 1200,
  }) => {
    stopPendingPoll();         // กันซ้อน
    startHeartbeat(chatId);    // ต่ออายุ savedAt ไปเรื่อยๆ

    const poll = async (delay) => {
      if (unmountedRef.current) return;
      pollTimerRef.current = setTimeout(async () => {
        try {
          const st = await checkStatus(taskId);
          const state =
            st?.state || st?.responseData?.state || st?.data?.state || null;

          if (state === "running" || state === "queued") {
            // ต่อคิว → โปะ pending ต่อ แล้ววน poll ถี่ขึ้นนิดหน่อย (max 3s, min 1s)
            const nextDelay = Math.min(3000, Math.max(1000, Math.floor(delay * 1.2)));

            // เก็บ state กลับ storage ให้มี currentTaskId เสมอ
            await storage.setItem(
              STORAGE_PREFIX + String(chatId),
              JSON.stringify({
                sending: true,
                currentTaskId: taskId,
                pendingQnaId,
                pendingUserMsgId,
                pendingUserMsg,
                pendingUserMsgTs: Date.now(),
                savedAt: Date.now(),
              })
            );

            // ถ้า pending-generic ยังไม่อัปเกรด ให้ผูกกับ taskId
            upgradePendingBubble(taskId);

            poll(nextDelay);
            return;
          }

          if (state === "failed" || state === "error") {
            const errText = "เกิดข้อผิดพลาดในการประมวลผลจากเซิร์ฟเวอร์";
            try {
              await saveAnswer({ taskId, chatId, qNaWords: errText });
            } catch (eSave) {
              console.warn("saveAnswer failed:", eSave?.message || eSave);
            }
            removePendingBotBubble(taskId);
            setMessages((prev) => [
              ...prev,
              {
                id: `ans-error-${Date.now()}`,
                from: "bot",
                text: errText,
                time: formatTS(Date.now()),
              },
            ]);
            hardResetPendingState();
            stopPendingPoll();
            return;
          }

          if (state === "done") {
            // รอ WS มาลงคำตอบ (หรือเซิร์ฟเวอร์เขียน DB แล้ว)
            await storage.setItem(
              STORAGE_PREFIX + String(chatId),
              JSON.stringify({ sending: false, savedAt: Date.now() })
            );
            stopPendingPoll();
            return;
          }

          // state ไม่รู้จัก → ลองอีกสักพัก
          poll(Math.min(4000, delay + 500));
        } catch (e) {
          console.warn("poll checkStatus error:", e?.message || e);
          // error ชั่วคราว → ลองใหม่แบบ backoff
          poll(Math.min(5000, delay * 1.5));
        }
      }, delay);
    };

    poll(initialDelay);
  };


  // Load chats/history
  const loadUserChats = async () => {
    if (!user?.id && !user?._id) return;
    setLoadingChats(true);
    const lastSelectedId = await storage.getItem(LAST_CHAT_ID_KEY);
    try {
      const list = await getUserChats(user.id || user._id);
      const mapped = (list || []).map((c) => ({
        id: String(c.chatId ?? c.id),
        title: c.chatHeader || "แชต",
      }));
      setChats(mapped);

      if (mapped.length === 0) {
        const created = await createChat({
          userId: user.id || user._id,
          chatHeader: "แชตใหม่",
        });
        const newChatId = String(created?.chatId ?? created?.id);
        setChats([{ id: newChatId, title: created?.chatHeader || "แชตใหม่" }]);
        setSelectedChatId(newChatId);
      } else {
        const lastIsValid =
          !!lastSelectedId &&
          mapped.some((c) => String(c.id) === String(lastSelectedId));
        setSelectedChatId(
          lastIsValid ? String(lastSelectedId) : String(mapped[0].id)
        );
      }
    } catch (err) {
      console.error("loadUserChats error:", err);
      Alert.alert("ผิดพลาด", "ไม่สามารถโหลดรายชื่อแชตได้");
    } finally {
      setLoadingChats(false);
    }
  };


  const loadHistory = async (chatId) => {
    if (!chatId) return;
    setLoadingHistory(true);
    persistSuspendedRef.current = true;

    setSending(false);
    setShowStop(false);
    setCurrentTaskId(null);
    setPendingQnaId(null);
    setPendingUserMsgId(null);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);

    try {
      //ดึงประวัติจาก DB
      const rows = await getChatQna(chatId);
      const sorted = (rows || [])
        .slice()
        .sort(
          (a, b) =>
            toTS(a && (a.createdAt || a.createAt)) -
            toTS(b && (b.createdAt || b.createAt))
        );

      const historyMsgs = sorted.map((r, idx) => {
        const tsNum = toTS((r && (r.createdAt || r.createAt)) || Date.now());
        return {
          id: String((r && r.qNaId) || idx),
          from: r && r.qNaType === "Q" ? "user" : "bot",
          text: r && r.qNaWords,
          time: formatTS(tsNum),
          tsNum,
        };
      });

      let nextMsgs = historyMsgs.slice();

      // กู้ state ที่ค้างจาก storage
      const rawSaved = await storage.getItem(STORAGE_PREFIX + String(chatId));
      if (rawSaved) {
        const saved = JSON.parse(rawSaved || "{}");

        if (saved && saved.sending) {
          const savedPendingMsg = saved.pendingUserMsg || null;
          const savedPendingTs =
            toTS(savedPendingMsg && savedPendingMsg.time) ||
            toTS(saved.pendingUserMsgTs) ||
            toTS(saved.savedAt);

          const TEXT_NORM = (s) => (s || "").trim();
          const WITHIN = (a, b, ms) => Math.abs((a || 0) - (b || 0)) <= ms;

          const hasSameUserQRecorded =
            !!savedPendingMsg &&
            historyMsgs.some(
              (m) =>
                m.from === "user" &&
                TEXT_NORM(m.text) === TEXT_NORM(savedPendingMsg.text)
            );


          const hasBotAfterPending = historyMsgs.some(
            (m) => m.from === "bot" && (m.tsNum || 0) >= (savedPendingTs || 0)
          );

          // คืนสถานะ UI กำลังส่งเสมอ
          setSending(true);
          setShowStop(false);
          if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
          stopTimerRef.current = setTimeout(() => setShowStop(true), 450);

          if (hasBotAfterPending) {
            // มีบอทตอบแล้ว → ปิดสถานะค้าง
            await storage.setItem(
              STORAGE_PREFIX + String(chatId),
              JSON.stringify({ sending: false, savedAt: Date.now() })
            );
            setSending(false);
            setShowStop(false);
            setCurrentTaskId(null);
            setPendingQnaId(null);
            setPendingUserMsgId(null);
          } else {
            // ยังไม่มีคำตอบ → ลองกู้สถานะงาน
            const taskId = saved.currentTaskId || null;
            const qId = saved.pendingQnaId || null;

            // ใส่ generic pending bubble ถ้ายังไม่มี
            if (!nextMsgs.some((m) => m.pending === true)) {
              nextMsgs.push({
                id: "pending-generic",
                from: "bot",
                pending: true,
                text: "กำลังประมวลผล...",
                time: formatTS(Date.now()),
                tsNum: Date.now(),
              });
            }

            if (taskId) {
              // 🟢 มี taskId → ตั้งค่า UI + เริ่ม poll
              // คืนข้อความผู้ใช้ที่ค้าง ถ้ายังไม่ซ้ำ  
              const hasSameUserQInNext =
                !!savedPendingMsg &&
                nextMsgs.some(
                  (m) => m.from === "user" && TEXT_NORM(m.text) === TEXT_NORM(savedPendingMsg.text)
                );
              if (savedPendingMsg && !hasSameUserQInNext) {

                nextMsgs.push({
                  id: savedPendingMsg.id,
                  from: "user",
                  text: savedPendingMsg.text,
                  time: savedPendingMsg.time,
                  tsNum: toTS(savedPendingMsg.time) || Date.now(),
                });
              }

              // อัปเกรด bubble เป็นของ task นี้
              const pendId = "pending-" + String(taskId);
              if (!nextMsgs.some((m) => m.id === pendId)) {
                const genIdx = nextMsgs.findIndex((m) => m.id === "pending-generic");
                if (genIdx >= 0) nextMsgs.splice(genIdx, 1);
                nextMsgs.push({
                  id: pendId,
                  from: "bot",
                  pending: true,
                  text: "กำลังประมวลผล...",
                  time: formatTS(Date.now()),
                  tsNum: Date.now(),
                });
              }

              setCurrentTaskId(taskId);
              setPendingQnaId(qId || null);
              setPendingUserMsgId(saved.pendingUserMsgId || null);

              await storage.setItem(
                STORAGE_PREFIX + String(chatId),
                JSON.stringify({
                  sending: true,
                  currentTaskId: taskId,
                  pendingQnaId: qId || null,
                  pendingUserMsgId: saved.pendingUserMsgId || null,
                  pendingUserMsg: savedPendingMsg || null,
                  pendingUserMsgTs: savedPendingTs || Date.now(),
                  savedAt: Date.now(),
                })
              );

              // ✅ เริ่ม poll สถานะซ้ำๆ แทนที่จะเช็กครั้งเดียว
              startPendingPoll({
                chatId,
                taskId,
                pendingQnaId: qId || null,
                pendingUserMsgId: saved.pendingUserMsgId || null,
                pendingUserMsg: savedPendingMsg || null,
              });
            } else {
              // ❗ ไม่มี taskId → ยิงคำถามเดิมซ้ำเพื่อเอา task ใหม่ แล้วเข้าโหมด poll เช่นกัน
              if (savedPendingMsg && !hasBotAfterPending && !hasSameUserQRecorded) {
                try {
                  if (!nextMsgs.some((m) => m.id === saved.pendingUserMsgId)) {
                    nextMsgs.push({
                      id: savedPendingMsg.id,
                      from: "user",
                      text: savedPendingMsg.text,
                      time: savedPendingMsg.time || formatTS(savedPendingTs || Date.now()),
                      tsNum: savedPendingTs || Date.now(),
                    });
                  }

                  const resp2 = await askQuestion({ chatId, question: savedPendingMsg.text });
                  const newTaskId =
                    resp2?.taskId || resp2?.id || resp2?.data?.taskId || resp2?.data?.id || null;
                  const newQId =
                    resp2?.qNaId ||
                    resp2?.data?.qNaId ||
                    resp2?.data?.savedRecordQuestion?.qNaId ||
                    resp2?.savedRecordQuestion?.qNaId ||
                    resp2?.questionRecord?.qNaId ||
                    null;

                  setCurrentTaskId(newTaskId);
                  setPendingQnaId(newQId);

                  if (newTaskId) {
                    const genIdx = nextMsgs.findIndex((m) => m.id === "pending-generic");
                    if (genIdx >= 0) nextMsgs.splice(genIdx, 1);
                    nextMsgs.push({
                      id: `pending-${newTaskId}`,
                      from: "bot",
                      pending: true,
                      text: "กำลังประมวลผล...",
                      time: formatTS(Date.now()),
                      tsNum: Date.now(),
                    });
                  }

                  await storage.setItem(
                    STORAGE_PREFIX + String(chatId),
                    JSON.stringify({
                      sending: true,
                      currentTaskId: newTaskId,
                      pendingQnaId: newQId,
                      pendingUserMsgId: saved.pendingUserMsgId,
                      pendingUserMsg: savedPendingMsg,
                      pendingUserMsgTs: savedPendingTs,
                      savedAt: Date.now(),
                    })
                  );

                  // ✅ เข้า poll ต่อเนื่องด้วย task ใหม่
                  if (newTaskId) {
                    startPendingPoll({
                      chatId,
                      taskId: newTaskId,
                      pendingQnaId: newQId || null,
                      pendingUserMsgId: saved.pendingUserMsgId || null,
                      pendingUserMsg: savedPendingMsg || null,
                    });
                  }
                } catch (eReask) {
                  console.warn("Re-ask failed:", eReask?.message || eReask);
                  // ปล่อย pending-generic ไว้ ผู้ใช้กดส่งใหม่ได้ หรือรอ reload รอบต่อไป
                }
              } else {
                await storage.setItem(
                  STORAGE_PREFIX + String(chatId),
                  JSON.stringify({ sending: false, savedAt: Date.now() })
                );
                setSending(false);
                setShowStop(false);
                setCurrentTaskId(null);
                setPendingQnaId(null);
                setPendingUserMsgId(null);
              }
            }

          }
        }
      }

      nextMsgs.sort((a, b) => (a.tsNum || 0) - (b.tsNum || 0));
      setMessages(nextMsgs);
      setTimeout(() => scrollToBottom(false), 0);
    } catch (err) {
      console.error("loadHistory error:", err);
      Alert.alert("ผิดพลาด", "ไม่สามารถโหลดประวัติแชตได้");
      setMessages([]);
    } finally {
      setLoadingHistory(false);
      persistSuspendedRef.current = false;
    }
  };




  useEffect(() => {
    if (selectedChatId)
      storage.setItem(LAST_CHAT_ID_KEY, String(selectedChatId));
  }, [selectedChatId]);

  useEffect(() => {
    if (!user) {
      setChats([]);
      setSelectedChatId(null);
      return;
    }
    loadUserChats();
  }, [user]);

  useEffect(() => {
    if (selectedChatId) loadHistory(selectedChatId);
  }, [selectedChatId]);

  useEffect(() => {
    (async () => {
      if (!selectedChatId || persistSuspendedRef.current) return;
      const data = {
        sending,
        currentTaskId,
        pendingQnaId,
        pendingUserMsgId,
        pendingUserMsg:
          pendingUserMsgId &&
          messages.find((m) => m.id === pendingUserMsgId && m.from === "user"),
        pendingUserMsgTs: Date.now(),
        savedAt: Date.now(),
      };
      await storage.setItem(
        STORAGE_PREFIX + String(selectedChatId),
        JSON.stringify(data)
      );
    })();
  }, [
    sending,
    currentTaskId,
    pendingQnaId,
    pendingUserMsgId,
    selectedChatId,
    messages,
  ]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const chatId = selectedChatIdRef.current;
        if (!chatId) return;
        const raw = await storage.getItem(STORAGE_PREFIX + String(chatId));
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved?.sending) {
          const TTL_MS = 30 * 1000;
          if (!saved.savedAt || Date.now() - saved.savedAt > TTL_MS) {
            await storage.setItem(
              STORAGE_PREFIX + String(chatId),
              JSON.stringify({ sending: false, savedAt: Date.now() })
            );
            setSending(false);
            setShowStop(false);
            setCurrentTaskId(null);
            setPendingQnaId(null);
            setPendingUserMsgId(null);
            removePendingBotBubble(null);
          }
        }
      })();
    }, [])
  );

  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handleBeforeUnload = () => { };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    scrollToBottom(true);
    const t = setTimeout(() => scrollToBottom(true), 120);
    return () => clearTimeout(t);
  }, [messages.length, sending, currentTaskId]);

  const confirmDelete = () => {
    if (Platform.OS === "web")
      return Promise.resolve(window.confirm("ต้องการลบแชตนี้หรือไม่?"));
    return new Promise((resolve) => {
      Alert.alert("ยืนยัน", "ต้องการลบแชตนี้หรือไม่?", [
        { text: "ยกเลิก", style: "cancel", onPress: () => resolve(false) },
        { text: "ลบ", style: "destructive", onPress: () => resolve(true) },
      ]);
    });
  };

  const handleLogout = async () => {
    try {
      await logout();
      if (Platform.OS === "web") window.location.reload();
      else {
        setChats([]);
        setSelectedChatId(null);
        setMessages([]);
        navigation.reset({ index: 0, routes: [{ name: "Login" }] });
      }
    } catch (e) {
      console.error("logout error:", e);
    }
  };

  const deleteChat = async (id) => {
    const ok = await confirmDelete();
    if (!ok) return;
    try {
      await apiDeleteChat(id);
      setChats((prev) => prev.filter((c) => String(c.id) !== String(id)));
      if (String(selectedChatId) === String(id)) {
        if (chats.length > 1) {
          const next = chats.find((c) => String(c.id) !== String(id));
          setSelectedChatId(next ? String(next.id) : null);
        } else {
          setSelectedChatId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      console.error("deleteChat error:", err);
      Alert.alert("ผิดพลาด", "ลบแชตไม่สำเร็จ");
    }
  };

  const startRenameInline = (id) => {
    const current = chats.find((c) => String(c.id) === String(id));
    setEditingId(String(id));
    setEditingText(current?.title || "");
    closeItemMenu();
  };
  const cancelRenameInline = () => {
    setEditingId(null);
    setEditingText("");
  };
  const confirmRenameInline = async () => {
    const id = editingId;
    const title = (editingText || "").trim();
    if (!id) return;
    if (!title) return Alert.alert("กรุณาระบุชื่อแชต");
    try {
      await apiEditChat(id, { chatHeader: title });
      setChats((prev) =>
        prev.map((c) => (String(c.id) === String(id) ? { ...c, title } : c))
      );
      setEditingId(null);
      setEditingText("");
    } catch (e) {
      console.error("rename chat error:", e);
      Alert.alert("ผิดพลาด", "แก้ไขชื่อแชตไม่สำเร็จ");
    }
  };

  const addNewChat = async () => {
    if (!user) {
      Alert.alert(
        "โหมดไม่บันทึก",
        "กรุณาเข้าสู่ระบบเพื่อสร้างห้องแชตและบันทึกประวัติ"
      );
      return;
    }
    try {
      const created = await createChat({
        userId: user?.id || user?._id,
        chatHeader: "แชตใหม่",
      });
      const newChatId = String(created?.chatId ?? created?.id);
      const item = { id: newChatId, title: created?.chatHeader || "แชตใหม่" };
      setChats((prev) => [item, ...prev]);
      setSelectedChatId(newChatId);
      setMessages([]);
      setTimeout(() => scrollToBottom(false), 0);
    } catch (err) {
      console.error("createChat error:", err);
      Alert.alert("ผิดพลาด", "ไม่สามารถสร้างแชตใหม่ได้");
    }
  };

  // Send / Cancel

  const sendMessage = async () => {
    const raw = (inputText || "").trim();
    if (!raw) return Alert.alert("แจ้งเตือน", "กรุณาพิมพ์คำถาม");

    let chatIdToUse = null;
    let createdNewRoom = false;

    if (user) {
      const res = await ensureActiveChat();
      chatIdToUse = res && res.id ? String(res.id) : null;
      createdNewRoom = !!(res && res.created);
      if (!chatIdToUse) {
        const botReply = {
          id: String(Date.now() + 1),
          from: "bot",
          text: "ไม่สามารถเตรียมห้องแชตได้ กรุณาลองอีกครั้ง",
          time: formatTS(Date.now()),
        };
        setMessages((prev) => [...prev, botReply]);
        return;
      }
    }

    const now = Date.now();
    const userMsg = {
      id: String(now),
      from: "user",
      text: raw,
      time: formatTS(now),
    };

    // UI: เคลียร์อินพุต 
    setInputText("");
    setInputHeight(MIN_H);
    setPendingUserMsgId(userMsg.id);
    setMessages((prev) => [...prev, userMsg]);
    scrollToBottom(true);

    setSending(true);
    setShowStop(false);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => setShowStop(true), 450);

    addPendingBotBubble(null);

    // persist state 
    if (chatIdToUse) {
      storage.setItem(
        STORAGE_PREFIX + String(chatIdToUse),
        JSON.stringify({
          sending: true,
          currentTaskId: null,
          pendingQnaId: null,
          pendingUserMsgId: userMsg.id,
          pendingUserMsg: userMsg,
          pendingUserMsgTs: now,
          savedAt: now,
        })
      );
    }

    try {
      const resp = await askQuestion({
        chatId: user ? chatIdToUse : undefined,
        question: raw,
      });

      const taskId =
        (resp && (resp.taskId || resp.id)) ||
        (resp && resp.data && (resp.data.taskId || resp.data.id)) ||
        null;
      setCurrentTaskId(taskId);

      const qId =
        (resp && resp.qNaId) ||
        (resp && resp.data && resp.data.qNaId) ||
        (resp &&
          resp.data &&
          resp.data.savedRecordQuestion &&
          resp.data.savedRecordQuestion.qNaId) ||
        (resp && resp.savedRecordQuestion && resp.savedRecordQuestion.qNaId) ||
        (resp && resp.questionRecord && resp.questionRecord.qNaId) ||
        null;
      setPendingQnaId(qId);

      if (taskId) upgradePendingBubble(taskId);

      if (chatIdToUse) {
        storage.setItem(
          STORAGE_PREFIX + String(chatIdToUse),
          JSON.stringify({
            sending: true,
            currentTaskId: taskId,
            pendingQnaId: qId,
            pendingUserMsgId: userMsg.id,
            pendingUserMsg: userMsg,
            pendingUserMsgTs: now,
            savedAt: Date.now(),
          })
        );
      }

      if (createdNewRoom && chatIdToUse) {
        await loadHistory(chatIdToUse);
        addPendingBotBubble(taskId || null);
        scrollToBottom(true);
      }
    } catch (error) {
      console.error("askQuestion error:", error);
      removePendingBotBubble(null);
      const botReply = {
        id: String(Date.now() + 1),
        from: "bot",
        text: "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์",
        time: formatTS(Date.now()),
      };
      setMessages((prev) => [...prev, botReply]);
      hardResetPendingState();
    }
  };



  const cancelSending = async () => {
    try {
      if (currentTaskId) {
        try {
          await cancelAsk(currentTaskId, {
            qNaId: pendingQnaId || null,
            chatId: selectedChatIdRef.current || null,
          });
        } catch (e) {
          console.warn("cancelAsk error:", e?.message || e);
        }
      }
      if (pendingUserMsgId) {
        setMessages((prev) => prev.filter((m) => m.id !== pendingUserMsgId));
      }
      if (currentTaskId) removePendingBotBubble(currentTaskId);
      else removePendingBotBubble(null);
    } finally {
      hardResetPendingState();
    }
  };

  const hardResetPendingState = () => {
    setSending(false);
    setShowStop(false);
    setCurrentTaskId(null);
    setPendingQnaId(null);
    setPendingUserMsgId(null);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopPendingPoll(); // ✅ หยุด poll/heartbeat ด้วย

    const chatId = selectedChatIdRef.current;
    if (chatId)
      storage.setItem(
        STORAGE_PREFIX + String(chatId),
        JSON.stringify({ sending: false, savedAt: Date.now() })
      );
  };



  // Speech To Text
  const [recording, setRecording] = useState(false);
  const webRecRef = useRef(null);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const onSpeechStart = () => setRecording(true);
    const onSpeechEnd = () => setRecording(false);
    const onSpeechError = (e) => {
      setRecording(false);
      console.warn("STT error:", e?.error);
      Alert.alert("ไมโครโฟน", "ไม่สามารถใช้งานไมโครโฟนได้");
    };
    const onSpeechResults = (e) => {
      const txt = e?.value?.[0] || "";
      if (txt) setInputText((prev) => (prev ? prev + " " + txt : txt));
    };
    Voice.onSpeechStart = onSpeechStart;
    Voice.onSpeechEnd = onSpeechEnd;
    Voice.onSpeechError = onSpeechError;
    Voice.onSpeechResults = onSpeechResults;
    return () => {
      Voice.destroy().then(() => Voice.removeAllListeners());
    };
  }, []);

  const ensureAndroidMicPermission = async () => {
    if (Platform.OS !== "android") return true;
    try {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (e) {
      console.warn("Permission error:", e);
      return false;
    }
  };

  const getWebRecognizer = () => {
    if (Platform.OS !== "web") return null;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    return SR ? new SR() : null;
  };

  const startVoice = async () => {
    if (Platform.OS === "web") {
      const rec = getWebRecognizer();
      if (!rec)
        return Alert.alert(
          "ไม่รองรับ",
          "เบราว์เซอร์นี้ไม่รองรับพิมพ์ด้วยเสียง"
        );
      webRecRef.current = rec;
      rec.lang = "th-TH";
      rec.interimResults = false;
      rec.continuous = false;
      rec.onstart = () => setRecording(true);
      rec.onerror = () => setRecording(false);
      rec.onend = () => setRecording(false);
      rec.onresult = (e) => {
        const txt = e?.results?.[0]?.[0]?.transcript || "";
        if (txt) setInputText((prev) => (prev ? prev + " " + txt : txt));
      };
      try {
        rec.start();
      } catch { }
      return;
    }
    const ok = await ensureAndroidMicPermission();
    if (!ok)
      return Alert.alert(
        "ต้องการสิทธิ์",
        "กรุณาอนุญาตไมโครโฟนเพื่อใช้พิมพ์ด้วยเสียง"
      );
    try {
      await Voice.destroy();
      await Voice.start("th-TH");
    } catch (e) {
      console.warn("Voice.start error:", e);
      Alert.alert("ไมโครโฟน", "เริ่มพิมพ์ด้วยเสียงไม่สำเร็จ");
      setRecording(false);
    }
  };

  const stopVoice = async () => {
    if (Platform.OS === "web") {
      try {
        webRecRef.current?.stop?.();
      } catch { }
      setRecording(false);
      return;
    }
    try {
      await Voice.stop();
    } catch { }
    setRecording(false);
  };

  // Render message item
  const renderItem = ({ item }) => {
    const isUser = item.from === "user";
    const isPending = item.pending === true;

    const cornerShift = AVATAR_SIZE / 2 - CORNER_NEAR_AVATAR;
    const ROW_HPAD = 10;
    const GAP_BETWEEN = 10;
    const screenW = Dimensions.get("window").width;
    const HALF_W = Math.floor(screenW * 0.45) - (ROW_HPAD + GAP_BETWEEN);
    const BUBBLE_MAX_W = Math.max(160, HALF_W);

    const bubbleStyle = [
      styles.messageWrapper,
      {
        backgroundColor: isUser ? C.bubbleUserBg : C.bubbleBotBg,
        alignSelf: isUser ? "flex-end" : "flex-start",
        borderTopLeftRadius: isUser ? 16 : 6,
        borderTopRightRadius: isUser ? 6 : 16,
        borderBottomLeftRadius: 16,
        borderBottomRightRadius: 16,
        shadowColor: "#000",
        shadowOpacity: 0.1,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
        marginTop: cornerShift,
        maxWidth: BUBBLE_MAX_W,
        flexShrink: 1,
      },
    ];

    return (
      <View style={[styles.msgRow, isUser ? styles.rowR : styles.rowL]}>
        <View
          style={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            borderRadius: AVATAR_SIZE / 2,
            overflow: "hidden",
            borderWidth: 2,
            borderColor: C.avatarRing,
            backgroundColor: "#fff",
          }}
        >
          <Image
            source={isUser ? userAvatar : botAvatar}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        </View>

        <View>
          <View style={bubbleStyle}>
            {isPending ? (
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <ActivityIndicator color={isDark ? "#fff" : "#000"} />
                <Text
                  style={{
                    color: isUser ? C.bubbleUserText : C.bubbleBotText,
                    fontSize: 16,
                  }}
                >
                  กำลังประมวลผล...
                </Text>
              </View>
            ) : (
              <Markdown
                style={{
                  body: {
                    fontSize: 16,
                    color: isUser ? C.bubbleUserText : C.bubbleBotText,
                    lineHeight: 22,
                    ...(Platform.OS === "web"
                      ? { wordBreak: "break-word", overflowWrap: "anywhere" }
                      : {}),
                  },
                  strong: {
                    color: isUser ? C.bubbleUserText : C.bubbleBotText,
                  },
                  em: { color: isUser ? C.bubbleUserText : C.bubbleBotText },
                  code_block: {
                    color: isUser ? C.bubbleUserText : C.bubbleBotText,
                    backgroundColor: isDark ? "#2b2b2b" : "#f1f5f9",
                    borderRadius: 8,
                    padding: 8,
                  },
                  blockquote: {
                    color: isUser ? C.bubbleUserText : C.bubbleBotText,
                    backgroundColor: isDark ? "#2b2b2b" : "#f1f5f9",
                    fontStyle: "italic",
                    borderLeftWidth: 3,
                    borderLeftColor: isDark ? "#64748b" : "#c7d2fe",
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 8,
                  },
                }}
              >
                {item.text}
              </Markdown>
            )}
          </View>

          <Text
            style={[
              styles.timeText,
              {
                color: C.timeText,
                marginHorizontal: 6,
                marginTop: 4,
                textAlign: isUser ? "right" : "left",
                maxWidth: BUBBLE_MAX_W,
                alignSelf: isUser ? "flex-end" : "flex-start",
              },
            ]}
          >
            {item.time}
          </Text>
        </View>
      </View>
    );
  };

  const listContentPadBottom = 16;

  // UI
  return (
    <SafeAreaView
      style={[
        styles.container,
        { backgroundColor: C.containerBg },
        Platform.OS !== "web" && { paddingTop: StatusBar.currentHeight || 20 },
      ]}
    >
      {/* Sidebar */}
      <Animated.View
        style={[
          styles.sidebar,
          {
            left: sidebarAnim,
            backgroundColor: C.sidebarBg,
            borderRightColor: C.divider,
            borderRightWidth: 1,
          },
        ]}
      >
        <View style={styles.sidebarHeader}>
          <Text style={[styles.sidebarTitle, { color: C.sidebarText }]}>
            {user ? `ประวัติการแชท (${chats.length})` : "โหมดไม่บันทึก (Guest)"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity
              onPress={toggleSidebar}
              style={{ paddingLeft: 8 }}
            >
              <Icon name="close" size={22} color="#333" />
            </TouchableOpacity>
          </View>
        </View>

        {user ? (
          loadingChats ? (
            <View style={{ paddingVertical: 10 }}>
              <ActivityIndicator />
            </View>
          ) : (
            chats.map((chat) => {
              const isEditing = String(editingId) === String(chat.id);
              const isActive = String(selectedChatId) === String(chat.id);
              return (
                <View
                  key={chat.id}
                  style={[
                    styles.sidebarItemRow,
                    {
                      borderColor: C.divider,
                      backgroundColor: isActive
                        ? isDark
                          ? "#C9CCD3"
                          : "#E6E9F0"
                        : "transparent",
                      borderRadius: 8,
                      paddingHorizontal: 8,
                    },
                  ]}
                >
                  {isEditing ? (
                    <View style={styles.renameInlineRow}>
                      <TextInput
                        value={editingText}
                        onChangeText={setEditingText}
                        placeholder="ชื่อแชต"
                        style={[
                          styles.renameInlineInput,
                          { borderColor: C.divider, backgroundColor: "#fff" },
                        ]}
                        autoFocus
                        onSubmitEditing={confirmRenameInline}
                        returnKeyType="done"
                      />
                      <View style={styles.renameInlineBtns}>
                        <TouchableOpacity
                          onPress={confirmRenameInline}
                          style={styles.inlineIconBtn}
                        >
                          <Icon name="checkmark" size={18} color="#2ecc71" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={cancelRenameInline}
                          style={styles.inlineIconBtn}
                        >
                          <Icon name="close" size={18} color="#e74c3c" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={{ flex: 1, minWidth: 0 }}
                        onPress={() => {
                          setSelectedChatId(String(chat.id));
                          closeItemMenu();
                        }}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.sidebarItemText,
                            { color: C.sidebarText },
                            isActive && { fontWeight: "700" },
                          ]}
                        >
                          {chat.title}
                        </Text>
                      </TouchableOpacity>

                      <Pressable
                        onPress={(e) =>
                          openItemMenu(
                            chat.id,
                            e?.nativeEvent?.pageX ?? 0,
                            e?.nativeEvent?.pageY ?? 0
                          )
                        }
                        style={styles.dotButton}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Icon name="ellipsis-vertical" size={18} color="#555" />
                      </Pressable>
                    </>
                  )}
                </View>
              );
            })
          )
        ) : (
          <Text style={{ color: "#555" }}>
            เข้าสู่ระบบเพื่อสร้างห้องและบันทึกประวัติการสนทนา
          </Text>
        )}

        {user && (
          <View style={{ marginTop: "auto" }}>
            <TouchableOpacity
              style={[styles.sidebarButton, { backgroundColor: C.headerBg }]}
              onPress={addNewChat}
            >
              <Text style={{ color: isDark ? "#fff" : "#111" }}>
                เพิ่มแชตใหม่
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>

      {sidebarOpen && (
        <TouchableOpacity
          style={[styles.backdrop, { backgroundColor: C.overlay }]}
          activeOpacity={1}
          onPress={toggleSidebar}
        />
      )}

      {/* Header */}
      <View style={[styles.header, { backgroundColor: C.headerBg }]}>
        <View style={styles.headerSideLeft}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity onPress={toggleSidebar}>
              <Icon name="menu" size={24} color={C.headerText} />
            </TouchableOpacity>
            <Image
              source={buddhadhamBG}
              style={{
                width: 34,
                height: 34,
                resizeMode: "contain",
                tintColor: C.logoTint,
              }}
            />
          </View>
        </View>

        <View pointerEvents="none" style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: C.headerText }]}>
            พุทธธรรม
          </Text>
        </View>

        <View
          style={[
            styles.headerSideRight,
            { flexDirection: "row", alignItems: "center", gap: 8 },
          ]}
        >
          <TouchableOpacity
            onPress={toggleTheme}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: C.chipBg,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Icon
                name={isDark ? "moon" : "sunny"}
                size={16}
                color={C.chipText}
              />
              <Text style={{ color: C.chipText, fontSize: 12 }}>
                {isDark ? "Dark" : "Light"}
              </Text>
            </View>
          </TouchableOpacity>

          {user ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={[styles.userBadge, { backgroundColor: C.chipBg }]}>
                <Text
                  style={[styles.userNameText, { color: C.chipText }]}
                  numberOfLines={1}
                >
                  {user.name || "ผู้ใช้"}
                </Text>
              </View>
              <TouchableOpacity onPress={handleLogout}>
                <View
                  style={[
                    styles.logoutButton,
                    { backgroundColor: "transparent" },
                  ]}
                >
                  <Text style={[styles.logoutText, { color: C.headerText }]}>
                    ออกจากระบบ
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <View style={[styles.loginButton, { backgroundColor: C.chipBg }]}>
                <Text style={[styles.loginText, { color: C.chipText }]}>
                  ลงชื่อเข้าใช้
                </Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Body + Input */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View
            style={[
              styles.background,
              { backgroundColor: C.containerBg, flex: 1 },
            ]}
          >
            <Image
              source={buddhadhamBG}
              style={{
                position: "absolute",
                width: "85%",
                height: "85%",
                opacity: isDark ? 0.08 : 0.12,
                alignSelf: "center",
                top: "3%",
                tintColor: isDark ? "#000" : "#334155",
                resizeMode: "contain",
              }}
            />

            {user && loadingHistory ? (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator />
                <Text style={{ color: isDark ? "#ddd" : "#333", marginTop: 8 }}>
                  กำลังโหลดประวัติ...
                </Text>
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={messages}
                renderItem={renderItem}
                keyExtractor={(item) => item.id.toString()}
                style={{ flex: 1 }}
                contentContainerStyle={{
                  paddingTop: 12,
                  paddingBottom: listContentPadBottom,
                }}
                ListFooterComponent={
                  <View style={{ height: EXTRA_BOTTOM_GAP }} />
                }
                keyboardShouldPersistTaps="handled"
                onLayout={() => scrollToBottom(false)}
                onContentSizeChange={() => scrollToBottom(false)}
              />
            )}

            {/* Input Bar */}
            <View
              style={[
                styles.inputContainerFixed,
                { backgroundColor: C.inputBarBg, borderTopColor: C.border },
              ]}
            >
              {Platform.OS === "web" ? (
                <textarea
                  ref={webRef}
                  value={inputText}
                  placeholder="พิมพ์ข้อความ..."
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (inputText.trim()) triggerSend();
                    }
                  }}

                  disabled={sending}
                  style={{
                    flex: 1,
                    marginRight: 8,
                    backgroundColor: C.inputBg,
                    color: "#111",
                    borderRadius: 22,
                    border: `1px solid ${C.border}`,
                    outline: "none",
                    resize: "none",
                    padding: `${PAD_V_TOP}px 14px ${PAD_V_BOTTOM}px`,
                    fontSize: 16,
                    lineHeight: `${LINE_H}px`,
                    minHeight: MIN_H,
                    maxHeight: MAX_H,
                    overflowY: inputHeight >= MAX_H ? "auto" : "hidden",
                    boxSizing: "border-box",
                    opacity: sending ? 0.6 : 1,
                  }}
                  onInput={adjustWebHeight}
                />
              ) : (
                <TextInput
                  style={[
                    styles.input,
                    {
                      height: inputHeight,
                      maxHeight: MAX_H,
                      textAlignVertical: "top",
                      lineHeight: LINE_H,
                      paddingTop: PAD_V_TOP,
                      paddingBottom: PAD_V_BOTTOM,
                      opacity: sending ? 0.6 : 1,
                      backgroundColor: C.inputBg,
                      borderColor: C.border,
                      borderWidth: 1,
                      color: "#111",
                    },
                  ]}
                  value={inputText}
                  placeholder="พิมพ์ข้อความ..."
                  editable={!sending}
                  multiline
                  blurOnSubmit={false}
                  returnKeyType="send"
                  enablesReturnKeyAutomatically
                  onChangeText={setInputText}
                  onContentSizeChange={(e) => {
                    const h = e.nativeEvent.contentSize?.height ?? MIN_H;
                    setInputHeight((prev) => {
                      const next = clampH(h);
                      return next === prev ? prev : next;
                    });
                  }}
                  onKeyPress={(e) => {
                    if (e.nativeEvent.key === "Enter") {
                      setInputText((prev) => prev.replace("\n", ""));
                      if (!sending && inputText.trim()) sendMessage();
                    }
                  }}
                  onSubmitEditing={() => {
                    if (inputText.trim()) triggerSend();
                  }}

                  scrollEnabled={inputHeight >= MAX_H}
                />
              )}

              <TouchableOpacity
                onPress={recording ? stopVoice : startVoice}
                activeOpacity={0.85}
                style={[
                  styles.actionButton,
                  {
                    backgroundColor: recording ? C.cancelBtn : C.sendBtn,
                    marginRight: 8,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={
                  recording ? "หยุดพิมพ์ด้วยเสียง" : "พิมพ์ด้วยเสียง"
                }
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon
                  name={recording ? "mic-off" : "mic"}
                  size={20}
                  color="#fff"
                />
              </TouchableOpacity>

              {sending ? (
                <TouchableOpacity
                  onPress={showStop ? cancelSending : undefined}
                  disabled={!showStop}
                  activeOpacity={0.85}
                  style={[
                    styles.actionButton,
                    showStop
                      ? { backgroundColor: C.cancelBtn }
                      : { backgroundColor: C.sendBtn, opacity: 0.6 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={showStop ? "ยกเลิกการส่ง" : "กำลังส่ง..."}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  {showStop ? (
                    <Icon name="stop" size={20} color="#fff" />
                  ) : (
                    <ActivityIndicator color="#fff" />
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    if (inputText.trim()) triggerSend();
                  }}

                  disabled={sending || !inputText.trim()}
                  activeOpacity={0.85}
                  style={[
                    styles.actionButton,
                    { backgroundColor: C.sendBtn },
                    (sending || !inputText.trim()) && { opacity: 0.6 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="ส่งข้อความ"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Icon name="send" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* Popup Menu */}
      <Modal
        transparent
        visible={!!menuFor}
        animationType="fade"
        onRequestClose={closeItemMenu}
      >
        <TouchableOpacity
          style={styles.popupBackdrop}
          activeOpacity={1}
          onPress={closeItemMenu}
        />
        <View style={[styles.popupMenu, getPopupStyle()]}>
          <View style={styles.popupArrow} />
          <TouchableOpacity
            style={styles.popupItem}
            onPress={() => {
              const id = menuFor;
              if (!id) return;
              startRenameInline(id);
              closeItemMenu();
            }}
          >
            <Text>แก้ไขชื่อแชต</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.popupItem}
            onPress={() => {
              closeItemMenu();
              if (menuFor) deleteChat(menuFor);
            }}
          >
            <Text style={{ color: "#e74c3c" }}>ลบแชตนี้</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.popupItem} onPress={closeItemMenu}>
            <Text>ยกเลิก</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ============================== Styles ==============================
const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    height: 60,
    paddingHorizontal: 12,
    justifyContent: "center",
    zIndex: 2,
  },
  headerCenter: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  headerSideLeft: {
    position: "absolute",
    left: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  headerSideRight: {
    position: "absolute",
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "flex-end",
  },
  headerTitle: { fontSize: 18, fontWeight: "bold", letterSpacing: 0.3 },

  loginButton: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  loginText: { fontSize: 14 },

  userBadge: {
    maxWidth: 160,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  userNameText: { fontSize: 16 },
  logoutButton: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  logoutText: { fontSize: 14 },

  background: { flex: 1 },

  messageWrapper: { paddingVertical: 10, paddingHorizontal: 12 },
  timeText: { fontSize: 10 },

  input: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 14,
    fontSize: 16,
    marginRight: 8,
    minHeight: MIN_H,
  },

  inputContainerFixed: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: 1,
  },

  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 9999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },

  sidebar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 260,
    padding: 14,
    zIndex: 5,
  },
  sidebarTitle: { fontWeight: "bold", fontSize: 16 },
  sidebarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  sidebarItemRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  sidebarItemText: { paddingRight: 8 },
  dotButton: { paddingHorizontal: 4, paddingVertical: 4 },
  sidebarButton: {
    padding: 10,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },

  backdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 4,
  },

  popupBackdrop: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "transparent",
  },
  popupMenu: {
    position: "absolute",
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 6,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    zIndex: 1000,
  },
  popupArrow: {
    position: "absolute",
    top: -8,
    left: 16,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderBottomColor: "#fff",
  },
  popupItem: { paddingVertical: 10, paddingHorizontal: 14 },

  renameInlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
  },
  renameInlineInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
  },
  renameInlineBtns: { flexDirection: "row", alignItems: "center" },
  inlineIconBtn: { paddingHorizontal: 6, paddingVertical: 4 },

  msgRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 10,
    marginVertical: 6,
  },
  rowR: { flexDirection: "row-reverse" },
  rowL: { flexDirection: "row" },
});
