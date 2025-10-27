import React, { useRef, useState, useEffect, useCallback } from "react";
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
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Markdown from "react-native-markdown-display";
import Icon from "react-native-vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../src/auth/AuthContext";
import { useWS } from "../src/ws/WSContext";

import buddhadhamBG from "../assets/buddhadham.png";

import {
  askQuestion,
  cancelAsk,
  createChat,
  deleteChat as apiDeleteChat,
  editChat as apiEditChat,
  getChatQna,
  getUserChats,
} from "../src/api/chat";

import AsyncStorage from "@react-native-async-storage/async-storage";

/* =============================================================================
 * UI CONFIG
 * ========================================================================== */
const MIN_H = 40;
const MAX_H = 140;
const LINE_H = 20;
const PAD_V_TOP = 10;
const PAD_V_BOTTOM = 10;
const EXTRA_BOTTOM_GAP = 24;

const STORAGE_PREFIX = "chat_state_v1:";
const LAST_CHAT_ID_KEY = "last_selected_chat_id";

/* =============================================================================
 * STORAGE HELPER (RN + Web fallback)
 * ========================================================================== */
const storage = {
  /** อ่านค่า string จาก AsyncStorage หรือ localStorage */
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
  /** เซฟค่า string ไป AsyncStorage หรือ localStorage */
  async setItem(key, val) {
    try {
      if (AsyncStorage?.setItem) {
        await AsyncStorage.setItem(key, val);
        return;
      }
    } catch {}
    if (Platform.OS === "web") {
      try {
        window.localStorage.setItem(key, val);
      } catch {}
    }
  },
  /** ลบค่าใน AsyncStorage หรือ localStorage */
  async removeItem(key) {
    try {
      if (AsyncStorage?.removeItem) {
        await AsyncStorage.removeItem(key);
        return;
      }
    } catch {}
    if (Platform.OS === "web") {
      try {
        window.localStorage.removeItem(key);
      } catch {}
    }
  },
};

/* =============================================================================
 * UTILS
 * ========================================================================== */
/** บีบ/ขยายความสูงกล่อง input ให้อยู่ในช่วง MIN_H..MAX_H */
const clampH = (h) => Math.min(MAX_H, Math.max(MIN_H, Math.ceil(h || MIN_H)));

/** ฟอร์แมต timestamp เป็น string ภาษาไทย */
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

/** แปลงค่าเวลาที่รับมา (string/number) ให้เป็น millis (number) ปลอดภัย */
const toTS = (v) => {
  if (!v) return 0;
  const n = typeof v === "number" ? v : Date.parse(v);
  return Number.isFinite(n) ? n : 0;
};

/* =============================================================================
 * MAIN COMPONENT
 * ========================================================================== */
export default function ChatScreen({ navigation }) {
  /* ----- Contexts ----- */
  const { on, subscribeTask } = useWS(); // ฟัง event แบบ global และตาม taskId
  const { user, logout } = useAuth(); // ข้อมูลผู้ใช้/ฟังก์ชันออกจากระบบ
  const insets = useSafeAreaInsets();

  /* ----- State: Pending/Task ----- */
  const [sending, setSending] = useState(false); // กำลังรอคำตอบอยู่หรือไม่
  const awaitingRef = useRef(false); // ref mirror ของ sending (ใช้ใน callback)
  useEffect(() => {
    awaitingRef.current = sending;
  }, [sending]);

  const [showStop, setShowStop] = useState(false); // แสดงปุ่มหยุดเมื่อรอเกิน 450ms
  const stopTimerRef = useRef(null); // timer ของปุ่มหยุด

  const [currentTaskId, setCurrentTaskId] = useState(null); // task ปัจจุบัน
  const currentTaskIdRef = useRef(null); // ref mirror ของ task ปัจจุบัน
  useEffect(() => {
    currentTaskIdRef.current = currentTaskId;
  }, [currentTaskId]);

  const [pendingQnaId, setPendingQnaId] = useState(null); // id Q&A ค้าง
  const [pendingUserMsgId, setPendingUserMsgId] = useState(null); // id ข้อความ user ค้าง

  /* ----- State: Chat UI ----- */
  const [messages, setMessages] = useState([]); // array ของข้อความ (user/bot/pending)
  const [inputText, setInputText] = useState(""); // ข้อความในช่องพิมพ์
  const [sidebarOpen, setSidebarOpen] = useState(false); // เปิด/ปิด sidebar
  const sidebarAnim = useState(new Animated.Value(-250))[0]; // animation slide sidebar

  /* ----- State: Input Height (autosize) ----- */
  const [inputHeight, setInputHeight] = useState(MIN_H);

  /* ----- State: Keyboard shift ----- */
  const kbBottom = useRef(new Animated.Value(0)).current;
  const [kbBtmNum, setKbBtmNum] = useState(0);

  /* ----- List reference (auto scroll) ----- */
  const listRef = useRef(null);

  /* ----- Chats list / selection ----- */
  const [chats, setChats] = useState([]); // รายชื่อห้องแชต
  const [selectedChatId, setSelectedChatId] = useState(null); // id แชตที่เลือก
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const selectedChatIdRef = useRef(null); // mirror ของ selectedChatId
  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  /* ----- Popup menu: 3-dots / rename ----- */
  const [menuFor, setMenuFor] = useState(null); // chatId ที่เรียกเมนู
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 }); // ตำแหน่ง popup
  const [editingId, setEditingId] = useState(null); // chatId ที่กำลัง rename
  const [editingText, setEditingText] = useState(""); // ข้อความชื่อใหม่

  /* ----- Persist guard (กันเขียนซ้ำระหว่างโหลด) ----- */
  const persistSuspendedRef = useRef(false);

  /* ----- Web input autosize (เฉพาะเว็บ) ----- */
  const webRef = useRef(null);
  /** ปรับความสูง textarea (เว็บ) ตามเนื้อหา */
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

  /* ----- Keyboard shift (เลื่อนอินพุตตามคีย์บอร์ด) ----- */
  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    /** เมื่อคีย์บอร์ดขึ้น: ขยับ bottom ของอินพุตขึ้นตามความสูงคีย์บอร์ด */
    const onShow = (e) => {
      const kh = e?.endCoordinates?.height ?? 0;
      const bottom = Math.max(0, kh - (insets.bottom || 0));
      setKbBtmNum(bottom);
      Animated.timing(kbBottom, {
        toValue: bottom,
        duration: e?.duration ?? 220,
        useNativeDriver: false,
      }).start();
    };

    /** เมื่อคีย์บอร์ดลง: รีเซ็ต bottom ของอินพุต */
    const onHide = (e) => {
      setKbBtmNum(0);
      Animated.timing(kbBottom, {
        toValue: 0,
        duration: e?.duration ?? 200,
        useNativeDriver: false,
      }).start();
    };

    const s1 = Keyboard.addListener(showEvt, onShow);
    const s2 = Keyboard.addListener(hideEvt, onHide);
    return () => {
      s1.remove();
      s2.remove();
    };
  }, [insets.bottom, kbBottom]);

  /* ----- Auto scroll เมื่อลิสต์เพิ่มรายการใหม่ ----- */
  useEffect(() => {
    requestAnimationFrame(() =>
      listRef.current?.scrollToEnd({ animated: true })
    );
  }, [messages.length]);

  /* =============================================================================
   * POPUP MENU HELPERS
   * ========================================================================== */
  /** เปิด popup เมนูของห้องแชตที่ id และจดตำแหน่งคลิก */
  const openItemMenu = (id, x, y) => {
    setMenuFor(id);
    setMenuPos({ x, y });
  };
  /** ปิด popup เมนู */
  const closeItemMenu = () => setMenuFor(null);
  /** คำนวณสไตล์ popup ให้ไม่ล้นขอบหน้าจอ */
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

  /* =============================================================================
   * SIDEBAR
   * ========================================================================== */
  /** เปิด/ปิด sidebar ด้วยแอนิเมชัน */
  const toggleSidebar = () => {
    const toOpen = !sidebarOpen;
    Animated.timing(sidebarAnim, {
      toValue: toOpen ? 0 : -250,
      duration: 250,
      useNativeDriver: false,
    }).start(() => setSidebarOpen(toOpen));
  };

  /* =============================================================================
   * PENDING BUBBLE HELPERS
   * ========================================================================== */
  /** แปลง taskId -> id ของ bubble pending */
  const pendingBubbleId = (taskId) => `pending-${taskId}`;
  /** สร้าง bubble pending (ข้อความ “กำลังค้นหาคำตอบ...”) */
  const makePendingBubble = (taskId) => ({
    id: taskId ? pendingBubbleId(taskId) : "pending-generic",
    from: "bot",
    pending: true,
    text: "กำลังค้นหาคำตอบ...",
    time: formatTS(Date.now()),
  });
  /** เพิ่ม bubble pending (กันซ้ำ) */
  const addPendingBotBubble = (taskId) => {
    const id = taskId ? pendingBubbleId(taskId) : "pending-generic";
    setMessages((prev) => {
      if (prev.some((m) => m.id === id)) return prev;
      return [...prev, makePendingBubble(taskId)];
    });
  };
  /** ลบ bubble pending (จาก taskId เฉพาะ หรืออันแรกที่เจอ) */
  const removePendingBotBubble = (taskId) => {
    setMessages((prev) => {
      if (taskId) {
        const id = pendingBubbleId(taskId);
        return prev.filter((m) => m.id !== id);
      }
      const idx = prev.findIndex((m) => m.pending === true);
      if (idx < 0) return prev;
      const copy = [...prev];
      copy.splice(idx, 1);
      return copy;
    });
  };
  /** อัปเกรด bubble pending-generic ให้กลายเป็นของ taskId ที่เพิ่งรู้ */
  const upgradePendingBubble = (taskId) => {
    if (!taskId) return;
    setMessages((prev) => {
      const genIdx = prev.findIndex(
        (m) => m.pending === true && m.id === "pending-generic"
      );
      if (genIdx === -1) return prev;
      const upgraded = { ...prev[genIdx], id: `pending-${taskId}` };
      const copy = [...prev];
      copy.splice(genIdx, 1, upgraded);
      return copy;
    });
  };

  /* =============================================================================
   * WS EVENT HANDLERS
   * ========================================================================== */
  /** ฟังสัญญาณ global 'done' จากเซิร์ฟเวอร์ เพื่อเคลียร์ pending */
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
    return () => {
      unbind?.();
    };
  }, [on]);

  /** ฟังสัญญาณตาม taskId (ข้อความผลลัพธ์บอท) */
  useEffect(() => {
    const taskId = currentTaskIdRef.current;
    if (!taskId) return;

    const handler = (msgObj) => {
      // ---- คัดกรองว่าเป็น event ของเราจริงไหม ----
      const matchesTask =
        !!msgObj?.taskId && msgObj.taskId === currentTaskIdRef.current;
      const matchesChat =
        !!msgObj?.chatId &&
        String(msgObj.chatId) === String(selectedChatIdRef.current);
      let accept = matchesTask || matchesChat;
      if (!accept && awaitingRef.current) accept = true;
      if (!accept) return;

      // ---- แปลง payload เป็นข้อความสุดท้ายที่จะเรนเดอร์ ----
      const finalText =
        typeof msgObj === "string"
          ? msgObj
          : msgObj?.text ?? JSON.stringify(msgObj);

      // ถ้า taskId เปลี่ยนกลางทาง -> อัปเดตและอัปเกรดบับเบิล
      if (msgObj?.taskId && msgObj.taskId !== currentTaskIdRef.current) {
        setCurrentTaskId(msgObj.taskId);
        upgradePendingBubble(msgObj.taskId);
      }

      // แทนที่ bubble pending ด้วยข้อความจริง
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
          return copy;
        }
        return [...prev, newMsg];
      });

      // เคลียร์สถานะรอ และยืนยัน cache ว่าไม่ pending แล้ว
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
    return () => {
      unsubscribe?.();
    };
  }, [subscribeTask, currentTaskId]);

  /* =============================================================================
   * CHAT LIST / HISTORY LOADERS
   * ========================================================================== */
  /** โหลดรายชื่อแชตของผู้ใช้ และเลือกแชตล่าสุด */
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
        // ไม่มีห้อง -> สร้างใหม่ให้เลย
        const created = await createChat({
          userId: user.id || user._id,
          chatHeader: "แชตใหม่",
        });
        const newChatId = String(created.chatId ?? created.id);
        const newChats = [
          { id: newChatId, title: created.chatHeader || "แชตใหม่" },
        ];
        setChats(newChats);
        setSelectedChatId(newChatId);
      } else {
        // พยายามเลือกห้องเดิมล่าสุด (ถ้ามี)
        const lastIdIsValid =
          !!lastSelectedId &&
          mapped.some((c) => String(c.id) === String(lastSelectedId));
        setSelectedChatId(
          lastIdIsValid ? String(lastSelectedId) : String(mapped[0].id)
        );
      }
    } catch (err) {
      console.error("loadUserChats error:", err);
      Alert.alert("ผิดพลาด", "ไม่สามารถโหลดรายชื่อแชตได้");
    } finally {
      setLoadingChats(false);
    }
  };

  /** โหลดประวัติแชต + แก้เคส pending ค้างด้วยการเช็คตามเวลา */
  const loadHistory = async (chatId) => {
    if (!chatId) return;
    setLoadingHistory(true);
    persistSuspendedRef.current = true;

    // รีเซ็ตสถานะ pending ทุกอย่างก่อน
    setSending(false);
    setShowStop(false);
    setCurrentTaskId(null);
    setPendingQnaId(null);
    setPendingUserMsgId(null);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);

    try {
      const rows = await getChatQna(chatId);

      // เรียงแน่ๆ ตามเวลา (เก่า -> ใหม่)
      const sorted = (rows || []).slice().sort((a, b) => {
        const ta = toTS(a?.createdAt || a?.createAt);
        const tb = toTS(b?.createdAt || b?.createAt);
        return ta - tb;
      });

      // map เป็น messages พร้อม tsNum (ไว้เช็คเวลา)
      const historyMsgs = sorted.map((r, idx) => {
        const tsNum = toTS(r?.createdAt || r?.createAt || Date.now());
        return {
          id: String(r.qNaId || idx),
          from: r.qNaType === "Q" ? "user" : "bot",
          text: r.qNaWords,
          time: formatTS(tsNum),
          tsNum,
        };
      });

      let nextMsgs = [...historyMsgs];

      // กู้สถานะจาก cache เพื่อชี้ว่า "ตอนออกจากหน้าไปยังรออยู่ไหม"
      const raw = await storage.getItem(STORAGE_PREFIX + chatId);
      if (raw) {
        const saved = JSON.parse(raw);

        if (saved?.sending) {
          // เวลาข้อความ user ล่าสุดที่ค้าง (ถ้ามี)
          const pendingUserTs =
            toTS(saved?.pendingUserMsg?.time) ||
            toTS(saved?.pendingUserMsgTs) ||
            toTS(saved?.savedAt);

          // มีบอทตอบหลังเวลานี้ไหม?
          const hasBotAfterPending = historyMsgs.some(
            (m) => m.from === "bot" && m.tsNum >= pendingUserTs
          );

          if (hasBotAfterPending) {
            // มีคำตอบแล้ว -> เคลียร์ pending ใน cache
            await storage.setItem(
              STORAGE_PREFIX + String(chatId),
              JSON.stringify({ sending: false, savedAt: Date.now() })
            );
          } else {
            // ยังรอจริง -> โชว์ pending bubble + ตั้งธงส่ง
            const pendId = saved.currentTaskId
              ? `pending-${saved.currentTaskId}`
              : "pending-generic";
            const existPend = nextMsgs.some((m) => m.id === pendId);
            if (!existPend)
              nextMsgs.push({
                id: pendId,
                from: "bot",
                pending: true,
                text: "กำลังค้นหาคำตอบ...",
                time: formatTS(Date.now()),
                tsNum: Date.now(),
              });

            setSending(true);
            setCurrentTaskId(saved.currentTaskId ?? null);
            setPendingQnaId(saved.pendingQnaId ?? null);
            setPendingUserMsgId(saved.pendingUserMsgId ?? null);

            setShowStop(false);
            if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
            stopTimerRef.current = setTimeout(() => setShowStop(true), 450);
          }
        }
      }

      setMessages(nextMsgs);
    } catch (err) {
      console.error("loadHistory error:", err);
      Alert.alert("ผิดพลาด", "ไม่สามารถโหลดประวัติแชตได้");
      setMessages([]);
    } finally {
      setLoadingHistory(false);
      persistSuspendedRef.current = false;
    }
  };

  /* =============================================================================
   * LIFECYCLE & PERSISTENCE
   * ========================================================================== */
  /** จดจำห้องที่เลือกล่าสุด */
  useEffect(() => {
    if (selectedChatId) {
      storage.setItem(LAST_CHAT_ID_KEY, String(selectedChatId));
    }
  }, [selectedChatId]);

  /** เมื่อผู้ใช้ล็อกอิน/เปลี่ยนผู้ใช้ -> โหลดรายชื่อห้อง */
  useEffect(() => {
    if (!user) {
      setChats([]);
      setSelectedChatId(null);
      return;
    }
    loadUserChats();
  }, [user]);

  /** เมื่อเปลี่ยนห้อง -> โหลดประวัติห้องนั้น */
  useEffect(() => {
    if (!selectedChatId) return;
    loadHistory(selectedChatId);
  }, [selectedChatId]);

  /** เซฟสถานะ (เช่น กำลังรอ/ข้อความค้าง) ลง cache ของห้อง */
  useEffect(() => {
    (async () => {
      if (!selectedChatId) return;
      if (persistSuspendedRef.current) return;

      const data = {
        sending,
        currentTaskId,
        pendingQnaId,
        pendingUserMsgId,
        pendingUserMsg:
          pendingUserMsgId &&
          messages.find((m) => m.id === pendingUserMsgId && m.from === "user"),
        // สำหรับดีด pending ออกเมื่อกลับหน้ามา
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

  /** เมื่อหน้าโฟกัสกลับมา -> เคลียร์สถานะค้างที่เกิน TTL (กันค้างถาวร) */
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const chatId = selectedChatIdRef.current;
        if (!chatId) return;

        const raw = await storage.getItem(STORAGE_PREFIX + String(chatId));
        if (!raw) return;

        const saved = JSON.parse(raw);
        if (saved?.sending) {
          const TTL_MS = 30 * 1000; // 30 วินาที
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

  /** กัน unload (เว็บ) – เผื่ออยากเพิ่ม logic ในอนาคต */
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const handleBeforeUnload = () => {};
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  /* =============================================================================
   * ACTIONS: AUTH / CHAT CRUD
   * ========================================================================== */
  /** กล่องยืนยันลบแชต (RN + Web) */
  const confirmDelete = () => {
    if (Platform.OS === "web") {
      return Promise.resolve(window.confirm("ต้องการลบแชตนี้หรือไม่?"));
    }
    return new Promise((resolve) => {
      Alert.alert(
        "ยืนยัน",
        "ต้องการลบแชตนี้หรือไม่?",
        [
          { text: "ยกเลิก", style: "cancel", onPress: () => resolve(false) },
          { text: "ลบ", style: "destructive", onPress: () => resolve(true) },
        ],
        { cancelable: true }
      );
    });
  };

  /** ออกจากระบบ + รีเซ็ต state + นำทาง */
  const handleLogout = async () => {
    try {
      await logout();
      if (Platform.OS === "web") {
        window.location.reload();
      } else {
        setChats([]);
        setSelectedChatId(null);
        setMessages([]);
        navigation.reset({ index: 0, routes: [{ name: "Login" }] });
      }
    } catch (e) {
      console.error("logout error:", e);
    }
  };

  /** ลบแชตที่เลือก (พร้อมอัปเดต state) */
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

  /** เริ่มแก้ชื่อห้อง (inline) */
  const startRenameInline = (id) => {
    const current = chats.find((c) => String(c.id) === String(id));
    setEditingId(String(id));
    setEditingText(current?.title || "");
    closeItemMenu();
  };

  /** ยกเลิกแก้ชื่อห้อง (inline) */
  const cancelRenameInline = () => {
    setEditingId(null);
    setEditingText("");
  };

  /** ยืนยันแก้ชื่อห้อง (inline) */
  const confirmRenameInline = async () => {
    const id = editingId;
    const title = (editingText || "").trim();
    if (!id) return;
    if (!title) {
      Alert.alert("กรุณาระบุชื่อแชต");
      return;
    }
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

  /** เพิ่มแชตใหม่และเลือกแชตนั้นทันที */
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
      const newChatId = String(created.chatId ?? created.id);
      const item = {
        id: newChatId,
        title: created.chatHeader || "แชตใหม่",
      };
      setChats((prev) => [item, ...prev]);
      setSelectedChatId(newChatId);
      setMessages([]);
    } catch (err) {
      console.error("createChat error:", err);
      Alert.alert("ผิดพลาด", "ไม่สามารถสร้างแชตใหม่ได้");
    }
  };

  /* =============================================================================
   * SEND / CANCEL MESSAGE
   * ========================================================================== */
  /** ส่งคำถาม -> แสดงข้อความผู้ใช้ + เพิ่ม pending bubble + ยิง API */
  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text) {
      Alert.alert("แจ้งเตือน", "กรุณาพิมพ์คำถาม");
      return;
    }

    // 1) แสดงข้อความผู้ใช้
    const now = Date.now();
    const userMessage = {
      id: now.toString(),
      from: "user",
      text,
      time: formatTS(now),
    };
    setPendingUserMsgId(userMessage.id);
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setInputHeight(MIN_H);
    requestAnimationFrame(() =>
      listRef.current?.scrollToEnd({ animated: true })
    );

    // 2) ตั้งสถานะกำลังรอ + ตั้ง timer แสดงปุ่มหยุด
    setSending(true);
    setShowStop(false);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => setShowStop(true), 450);

    // 3) แสดง pending bubble (ยังไม่รู้ taskId)
    addPendingBotBubble(null);

    // 4) บันทึก cache (เผื่อผู้ใช้สลับหน้า)
    if (selectedChatId) {
      storage.setItem(
        STORAGE_PREFIX + String(selectedChatId),
        JSON.stringify({
          sending: true,
          currentTaskId: null,
          pendingQnaId: null,
          pendingUserMsgId: userMessage.id,
          pendingUserMsg: userMessage,
          pendingUserMsgTs: now,
          savedAt: now,
        })
      );
    }

    // 5) ยิง API
    try {
      const resp = await askQuestion({
        chatId: user ? selectedChatId : undefined,
        question: text,
      });

      const taskId =
        resp?.taskId ??
        resp?.id ??
        resp?.data?.taskId ??
        resp?.data?.id ??
        null;
      setCurrentTaskId(taskId);

      const qId =
        resp?.qNaId ??
        resp?.data?.qNaId ??
        resp?.data?.savedRecordQuestion?.qNaId ??
        resp?.savedRecordQuestion?.qNaId ??
        resp?.questionRecord?.qNaId ??
        null;
      setPendingQnaId(qId);

      if (taskId) upgradePendingBubble(taskId);

      // อัปเดต cache พร้อม taskId
      if (selectedChatId) {
        storage.setItem(
          STORAGE_PREFIX + String(selectedChatId),
          JSON.stringify({
            sending: true,
            currentTaskId: taskId,
            pendingQnaId: qId,
            pendingUserMsgId: userMessage.id,
            pendingUserMsg: userMessage,
            pendingUserMsgTs: now,
            savedAt: Date.now(),
          })
        );
      }
    } catch (error) {
      console.error("askQuestion error:", error);
      const botReply = {
        id: (Date.now() + 1).toString(),
        from: "bot",
        text: "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์",
        time: formatTS(Date.now()),
      };
      setMessages((prev) => [...prev, botReply]);
      hardResetPendingState();
    }
  };

  /** ยกเลิกการส่ง/การรอ (ยิง cancel ไป backend + ล้าง pending bubble) */
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

      if (currentTaskId) {
        removePendingBotBubble(currentTaskId);
      } else {
        removePendingBotBubble(null);
      }
    } finally {
      hardResetPendingState();
    }
  };

  /** รีเซ็ตสถานะการรอ + ปุ่มหยุด + ค่า task/qna + เซฟ cache ว่าไม่ pending */
  const hardResetPendingState = () => {
    setSending(false);
    setShowStop(false);
    setCurrentTaskId(null);
    setPendingQnaId(null);
    setPendingUserMsgId(null);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);

    const chatId = selectedChatIdRef.current;
    if (chatId) {
      storage.setItem(
        STORAGE_PREFIX + String(chatId),
        JSON.stringify({ sending: false, savedAt: Date.now() })
      );
    }
  };

  /* =============================================================================
   * RENDERERS
   * ========================================================================== */
  /** renderer ของ item แต่ละข้อความในลิสต์ */
  const renderItem = ({ item }) => {
    const isPending = item.pending === true;
    return (
      <View
        style={[
          styles.messageWrapper,
          item.from === "user" ? styles.userWrapper : styles.botWrapper,
        ]}
      >
        {isPending ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.botMessageText}>กำลังค้นหาคำตอบ...</Text>
          </View>
        ) : (
          <Markdown
            style={{
              body:
                item.from === "user"
                  ? styles.userMessageText
                  : styles.botMessageText,
              strong:
                item.from === "user"
                  ? { color: "white" }
                  : { color: "#ffffffff" },
              em:
                item.from === "user"
                  ? { color: "white" }
                  : { color: "#ffffffff" },
              code_block:
                item.from === "user"
                  ? { color: "white", backgroundColor: "#333" }
                  : { color: "#ffffffff", backgroundColor: "#333" },
              blockquote:
                item.from === "user"
                  ? {
                      color: "white",
                      backgroundColor: "#333",
                      fontStyle: "italic",
                    }
                  : {
                      color: "#ffffffff",
                      backgroundColor: "#333",
                      fontStyle: "italic",
                    },
            }}
          >
            {item.text}
          </Markdown>
        )}
        <Text style={styles.timeText}>{item.time}</Text>
      </View>
    );
  };

  /* =============================================================================
   * DERIVED VALUES
   * ========================================================================== */
  /** ระยะ padding ด้านล่างของลิสต์ (กันทับ input) */
  const listBottomPad =
    10 + inputHeight + 12 + (insets.bottom || 0) + kbBtmNum + EXTRA_BOTTOM_GAP;

  /* =============================================================================
   * UI
   * ========================================================================== */
  return (
    <SafeAreaView
      style={[
        styles.container,
        Platform.OS !== "web" && { paddingTop: StatusBar.currentHeight || 20 },
      ]}
    >
      {/* Sidebar */}
      <Animated.View style={[styles.sidebar, { left: sidebarAnim }]}>
        <View style={styles.sidebarHeader}>
          <Text style={styles.sidebarTitle}>
            {user ? `ประวัติการแชท (${chats.length})` : "โหมดไม่บันทึก (Guest)"}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <TouchableOpacity
              onPress={toggleSidebar}
              style={{ paddingLeft: 8 }}
            >
              <Icon name="close" size={24} color="#333" />
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
              return (
                <View key={chat.id} style={styles.sidebarItemRow}>
                  {isEditing ? (
                    <View style={styles.renameInlineRow}>
                      <TextInput
                        value={editingText}
                        onChangeText={setEditingText}
                        placeholder="ชื่อแชต"
                        style={styles.renameInlineInput}
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
                            String(selectedChatId) === String(chat.id) && {
                              fontWeight: "bold",
                            },
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
                        <Icon name="ellipsis-vertical" size={20} color="#555" />
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
            <TouchableOpacity style={styles.sidebarButton} onPress={addNewChat}>
              <Text style={{ color: "#fff" }}>เพิ่มแชตใหม่</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>

      {sidebarOpen && (
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={toggleSidebar}
        />
      )}

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerSideLeft}>
          <TouchableOpacity onPress={toggleSidebar}>
            <Icon name="menu" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View pointerEvents="none" style={styles.headerCenter}>
          <Text style={styles.headerTitle}>พุทธธรรม</Text>
        </View>

        <View style={styles.headerSideRight}>
          {user ? (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={styles.userBadge}>
                <Text style={styles.userNameText} numberOfLines={1}>
                  {user.name || "ผู้ใช้"}
                </Text>
              </View>
              <TouchableOpacity onPress={handleLogout}>
                <View style={styles.logoutButton}>
                  <Text style={styles.logoutText}>ออกจากระบบ</Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={() => navigation.navigate("Login")}>
              <View style={styles.loginButton}>
                <Text style={styles.loginText}>ลงชื่อเข้าใช้</Text>
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Body */}
      <Animated.View style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.background}>
            {/* background image (ลายน้ำ) */}
            <View style={styles.bgCenterWrap} pointerEvents="none">
              <Image
                source={buddhadhamBG}
                style={styles.bgImage}
                resizeMode="contain"
              />
            </View>

            {/* ประวัติข้อความ */}
            {user && loadingHistory ? (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ActivityIndicator />
                <Text style={{ color: "#ddd", marginTop: 8 }}>
                  กำลังโหลดประวัติ...
                </Text>
              </View>
            ) : (
              <FlatList
                ref={listRef}
                data={messages}
                renderItem={renderItem}
                keyExtractor={(item) => item.id.toString()}
                contentContainerStyle={{
                  padding: 10,
                  paddingBottom: listBottomPad,
                }}
                ListFooterComponent={
                  <View style={{ height: EXTRA_BOTTOM_GAP }} />
                }
                keyboardShouldPersistTaps="handled"
                onContentSizeChange={() =>
                  listRef.current?.scrollToEnd({ animated: false })
                }
              />
            )}

            {/* Input */}
            <Animated.View
              style={[
                styles.inputContainerAbs,
                { bottom: kbBottom, paddingBottom: 12 + (insets.bottom || 0) },
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
                      if (!sending && inputText.trim()) sendMessage();
                    }
                  }}
                  disabled={sending}
                  style={{
                    flex: 1,
                    marginRight: 8,
                    backgroundColor: "#fff",
                    borderRadius: 20,
                    border: "none",
                    outline: "none",
                    resize: "none",
                    padding: `${PAD_V_TOP}px 12px ${PAD_V_BOTTOM}px`,
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
                    if (!sending && inputText.trim()) sendMessage();
                  }}
                  scrollEnabled={inputHeight >= MAX_H}
                />
              )}

              {sending ? (
                <TouchableOpacity
                  onPress={showStop ? cancelSending : undefined}
                  disabled={!showStop}
                  activeOpacity={0.85}
                  style={[
                    styles.actionButton,
                    showStop ? styles.cancelButton : styles.sendButton,
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
                    if (!sending && inputText.trim()) sendMessage();
                  }}
                  disabled={sending || !inputText.trim()}
                  activeOpacity={0.85}
                  style={[
                    styles.actionButton,
                    styles.sendButton,
                    (sending || !inputText.trim()) && { opacity: 0.6 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="ส่งข้อความ"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Icon name="send" size={20} color="#fff" />
                </TouchableOpacity>
              )}
            </Animated.View>
          </View>
        </TouchableWithoutFeedback>
      </Animated.View>

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

/* =============================================================================
 * STYLES
 * ========================================================================== */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#2f3640" },

  header: {
    backgroundColor: "#1e272e",
    height: 60,
    paddingHorizontal: 10,
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
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "bold" },

  loginButton: {
    backgroundColor: "#ccc",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  loginText: { fontSize: 14 },

  userBadge: {
    maxWidth: 160,
    backgroundColor: "#2f3640",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  userNameText: { color: "#fff", fontSize: 16 },
  logoutButton: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  logoutText: { color: "#fff", fontSize: 14 },

  background: { flex: 1 },

  bgCenterWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  bgImage: {
    width: "70%",
    aspectRatio: 1,
    opacity: 0.06,
    transform: [{ translateY: -50 }],
  },

  messageWrapper: {
    maxWidth: "80%",
    marginVertical: 5,
    padding: 10,
    borderRadius: 15,
  },
  userWrapper: { backgroundColor: "#fff", alignSelf: "flex-end" },
  botWrapper: { backgroundColor: "#333", alignSelf: "flex-start" },
  botMessageText: { fontSize: 16, color: "#ffffffff" },
  userMessageText: { fontSize: 16, color: "#333" },
  timeText: {
    fontSize: 10,
    color: "#bbb",
    marginTop: 3,
    alignSelf: "flex-end",
  },

  input: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 20,
    paddingHorizontal: 12,
    fontSize: 16,
    marginRight: 8,
    minHeight: MIN_H,
  },

  inputContainerAbs: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 30,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: "#444",
    backgroundColor: "#1e272e",
  },

  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 9999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  sendButton: { backgroundColor: "#0097e6" },
  cancelButton: { backgroundColor: "#e74c3c" },

  sidebar: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    width: 250,
    backgroundColor: "#dcdde1",
    padding: 15,
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
    borderColor: "#ccc",
  },
  sidebarItemText: { paddingRight: 8 },
  dotButton: { paddingHorizontal: 4, paddingVertical: 4 },

  sidebarButton: {
    backgroundColor: "#1e272e",
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
    backgroundColor: "rgba(0,0,0,0.3)",
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
    borderColor: "#ccc",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "#fff",
    fontSize: 14,
  },
  renameInlineBtns: {
    flexDirection: "row",
    alignItems: "center",
  },
  inlineIconBtn: { paddingHorizontal: 6, paddingVertical: 4 },
});
