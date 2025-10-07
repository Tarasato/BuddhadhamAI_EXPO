import { io } from "socket.io-client";
import Markdown from "react-native-markdown-display";
import React, { useRef, useState, useEffect } from "react";
import {
  Animated,
  FlatList,
  Image,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar,
  Modal,
  Dimensions,
  Pressable,
  Keyboard,
  TouchableWithoutFeedback,
  ActivityIndicator,
  Alert,
} from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth/AuthContext";
import buddhadhamBG from "../assets/buddhadham.png";

import {
  getUserChats,
  createChat,
  deleteChat as apiDeleteChat,
  getChatQna,
  askQuestion,
  editChat as apiEditChat,
  cancelAsk,
} from "../src/api/chat";

import AsyncStorage from "@react-native-async-storage/async-storage";

/** ==============================
 *  ค่าคงที่/การตั้งค่าทั่วไปของ UI ช่องพิมพ์
 *  ============================== */
const MIN_H = 40;
const MAX_H = 140;
const LINE_H = 20;
const PAD_V_TOP = 10;
const PAD_V_BOTTOM = 10;
const EXTRA_BOTTOM_GAP = 24;

const SOCKET_URL = process.env.EXPO_PUBLIC_API_URL;
const STORAGE_PREFIX = "chat_state_v1:";

/** ==============================
 *  Storage helper
 *  ============================== */
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

/** ==============================
 *  แปลงเวลาเป็นไทย
 *  ============================== */
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

/** ==============================
 *  Component หลัก
 *  ============================== */
export default function ChatScreen({ navigation }) {
  /** ---------- Socket ---------- */
  const [socket, setSocket] = useState(null);
  const [showStop, setShowStop] = useState(false);
  const stopTimerRef = useRef(null);

  /** ---------- Pending ---------- */
  const [sending, setSending] = useState(false);
  const awaitingRef = useRef(false);
  useEffect(() => {
    awaitingRef.current = sending;
  }, [sending]);

  const [currentTaskId, setCurrentTaskId] = useState(null);
  const currentTaskIdRef = useRef(null);
  useEffect(() => {
    currentTaskIdRef.current = currentTaskId;
  }, [currentTaskId]);

  const [pendingQnaId, setPendingQnaId] = useState(null);
  const [pendingUserMsgId, setPendingUserMsgId] = useState(null);

  /** ---------- User/Insets ---------- */
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();

  /** ---------- Messages/UI ---------- */
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarAnim = useState(new Animated.Value(-250))[0];

  /** ---------- Input height ---------- */
  const [inputHeight, setInputHeight] = useState(MIN_H);
  const clampH = (h) => Math.min(MAX_H, Math.max(MIN_H, Math.ceil(h || MIN_H)));

  /** ---------- Web textarea autosize ---------- */
  const webRef = useRef(null);
  const adjustWebHeight = () => {
    if (Platform.OS !== "web") return;
    const el = webRef.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, MAX_H);
    el.style.height = `${next}px`;
    el.style.overflowY = next >= MAX_H ? "auto" : "hidden";
    setInputHeight(next < MIN_H ? MIN_H : next);
  };
  useEffect(() => {
    if (Platform.OS === "web") adjustWebHeight();
  }, []);

  /** ---------- Keyboard shift ---------- */
  const kbBottom = useRef(new Animated.Value(0)).current;
  const [kbBtmNum, setKbBtmNum] = useState(0);
  useEffect(() => {
    const showEvt =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

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

  /** ---------- Auto scroll ---------- */
  const listRef = useRef(null);
  useEffect(() => {
    requestAnimationFrame(() =>
      listRef.current?.scrollToEnd({ animated: true })
    );
  }, [messages.length]);

  /** ---------- Chats ---------- */
  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const selectedChatIdRef = useRef(null);
  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  /** ---------- Dots menu / rename ---------- */
  const [menuFor, setMenuFor] = useState(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const openItemMenu = (id, x, y) => {
    setMenuFor(id);
    setMenuPos({ x, y });
  };
  const closeItemMenu = () => setMenuFor(null);
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState("");

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

  /** ---------- Sidebar ---------- */
  const toggleSidebar = () => {
    const toOpen = !sidebarOpen;
    Animated.timing(sidebarAnim, {
      toValue: toOpen ? 0 : -250,
      duration: 250,
      useNativeDriver: false,
    }).start(() => setSidebarOpen(toOpen));
  };

  /** ---------- Persist guard ---------- */
  const persistSuspendedRef = useRef(false);

  /** ---------- Pending bubble helpers ---------- */
  const pendingBubbleId = (taskId) => `pending-${taskId}`;
  const makePendingBubble = (taskId) => ({
    id: taskId ? pendingBubbleId(taskId) : "pending-generic",
    from: "bot",
    pending: true,
    text: "กำลังค้นหาคำตอบ...",
    time: formatTS(Date.now()),
  });
  const addPendingBotBubble = (taskId) => {
    const id = taskId ? pendingBubbleId(taskId) : "pending-generic";
    setMessages((prev) => {
      if (prev.some((m) => m.id === id)) return prev;
      return [...prev, makePendingBubble(taskId)];
    });
  };
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

  /** ---------- Socket ---------- */
  useEffect(() => {
    const socket = io(SOCKET_URL);
    setSocket(socket);

    socket.on("connect", () => {
      console.log("✅ Socket connected! ID:", socket.id);
    });

    socket.on("connect_error", (err) => {
      console.error("❌ Socket connect error:", err.message);
    });

    socket.on("message", (msgObj) => {
      const matchesTask =
        !!msgObj?.taskId && msgObj.taskId === currentTaskIdRef.current;
      const matchesChat =
        !!msgObj?.chatId && msgObj.chatId === selectedChatIdRef.current;

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
          return copy;
        }
        return [...prev, newMsg];
      });

      hardResetPendingState();
    });

    socket.on?.("done", (payload) => {
      const matchesTask =
        !!payload?.taskId && payload.taskId === currentTaskIdRef.current;
      const matchesChat =
        !!payload?.chatId && payload.chatId === selectedChatIdRef.current;
      if (!matchesTask && !matchesChat) return;
      hardResetPendingState();
    });

    return () => socket.disconnect();
  }, []);

  /** ---------- Load chats ---------- */
  const loadUserChats = async () => {
    if (!user?.id && !user?._id) return;
    setLoadingChats(true);
    try {
      const list = await getUserChats(user.id || user._id);
      const mapped = (list || []).map((c) => ({
        id: c.chatId || c.id,
        title: c.chatHeader || "แชต",
      }));
      setChats(mapped);

      if (mapped.length === 0) {
        const created = await createChat({
          userId: user.id || user._id,
          chatHeader: "แชตใหม่",
        });
        const newChatId = created.chatId || created.id;
        const newChats = [
          { id: newChatId, title: created.chatHeader || "แชตใหม่" },
        ];
        setChats(newChats);
        setSelectedChatId(newChatId);
        setMessages([]);
      } else {
        setSelectedChatId(mapped[0].id);
      }
    } catch (err) {
      console.error("loadUserChats error:", err);
      Alert.alert("ผิดพลาด", "ไม่สามารถโหลดรายชื่อแชตได้");
    } finally {
      setLoadingChats(false);
    }
  };

  /** ---------- Load history ---------- */
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
      const rows = await getChatQna(chatId);
      const historyMsgs = (rows || []).map((r, idx) => ({
        id: String(r.qNaId || idx),
        from: r.qNaType === "Q" ? "user" : "bot",
        text: r.qNaWords,
        time: formatTS(r.createdAt || r.createAt || Date.now()),
      }));

      let nextMsgs = [...historyMsgs];

      const raw = await storage.getItem(STORAGE_PREFIX + chatId);
      if (raw) {
        const saved = JSON.parse(raw);

        if (saved?.sending) {
          const pendId = saved.currentTaskId
            ? pendingBubbleId(saved.currentTaskId)
            : "pending-generic";
          const existPend = nextMsgs.some((m) => m.id === pendId);
          if (!existPend) nextMsgs.push(makePendingBubble(saved.currentTaskId));

          setSending(true);
          setCurrentTaskId(saved.currentTaskId ?? null);
          setPendingQnaId(saved.pendingQnaId ?? null);
          setPendingUserMsgId(saved.pendingUserMsgId ?? null);

          setShowStop(false);
          if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
          stopTimerRef.current = setTimeout(() => setShowStop(true), 450);
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

  /** ---------- Lifecycle ---------- */
  useEffect(() => {
    if (!user) {
      setChats([]);
      setSelectedChatId(null);
      return;
    }
    loadUserChats();
  }, [user]);

  useEffect(() => {
    if (!selectedChatId) return;
    loadHistory(selectedChatId);
  }, [selectedChatId]);

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
        savedAt: Date.now(),
      };

      await storage.setItem(
        STORAGE_PREFIX + selectedChatId,
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

  /** ---------- Web beforeunload ---------- */
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const onBeforeUnload = () => {};
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  /** ---------- Chat actions ---------- */
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

  const deleteChat = async (id) => {
    const ok = await confirmDelete();
    if (!ok) return;

    try {
      await apiDeleteChat(id);
      setChats((prev) => prev.filter((c) => c.id !== id));
      if (selectedChatId === id) {
        if (chats.length > 1) {
          const next = chats.find((c) => c.id !== id);
          setSelectedChatId(next?.id || null);
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
    const current = chats.find((c) => c.id === id);
    setEditingId(id);
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
    if (!title) {
      Alert.alert("กรุณาระบุชื่อแชต");
      return;
    }
    try {
      await apiEditChat(id, { chatHeader: title });
      setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
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
      const newChatId = created.chatId || created.id;
      const item = { id: newChatId, title: created.chatHeader || "แชตใหม่" };
      setChats((prev) => [item, ...prev]);
      setSelectedChatId(newChatId);
      setMessages([]);
    } catch (err) {
      console.error("createChat error:", err);
      Alert.alert("ผิดพลาด", "ไม่สามารถสร้างแชตใหม่ได้");
    }
  };

  /** ---------- Send / cancel ---------- */
  const sendMessage = async () => {
    const text = inputText.trim();
    if (!text) {
      Alert.alert("แจ้งเตือน", "กรุณาพิมพ์คำถาม");
      return;
    }

    const userMessage = {
      id: Date.now().toString(),
      from: "user",
      text,
      time: formatTS(Date.now()),
    };
    setPendingUserMsgId(userMessage.id);
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setInputHeight(MIN_H);
    requestAnimationFrame(() =>
      listRef.current?.scrollToEnd({ animated: true })
    );

    setSending(true);
    setShowStop(false);
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    stopTimerRef.current = setTimeout(() => setShowStop(true), 450);

    addPendingBotBubble(null);

    if (selectedChatId) {
      storage.setItem(
        STORAGE_PREFIX + selectedChatId,
        JSON.stringify({
          sending: true,
          currentTaskId: null,
          pendingQnaId: null,
          pendingUserMsgId: userMessage.id,
          pendingUserMsg: userMessage,
          savedAt: Date.now(),
        })
      );
    }

    try {
      const resp = await askQuestion({
        chatId: user ? selectedChatId : undefined,
        question: text,
      });

      const taskId =
        resp?.taskId ||
        resp?.id ||
        resp?.data?.taskId ||
        resp?.data?.id ||
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

      if (selectedChatId) {
        storage.setItem(
          STORAGE_PREFIX + selectedChatId,
          JSON.stringify({
            sending: true,
            currentTaskId: taskId,
            pendingQnaId: qId,
            pendingUserMsgId: userMessage.id,
            pendingUserMsg: userMessage,
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
        STORAGE_PREFIX + chatId,
        JSON.stringify({ sending: false, savedAt: Date.now() })
      );
    }
  };

  /** ---------- Render message ---------- */
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
                item.from === "user" ? { color: "white" } : { color: "#ffffffff" },
              em:
                item.from === "user" ? { color: "white" } : { color: "#ffffffff" },
              code_block:
                item.from === "user"
                  ? { color: "white", backgroundColor: "#333" }
                  : { color: "#ffffffff", backgroundColor: "#333" },
              blockquote:
                item.from === "user"
                  ? { color: "white", backgroundColor: "#333", fontStyle: "italic" }
                  : { color: "#ffffffff", backgroundColor: "#333", fontStyle: "italic" },
            }}
          >
            {item.text}
          </Markdown>
        )}
        <Text style={styles.timeText}>{item.time}</Text>
      </View>
    );
  };

  /** ---------- Bottom pad ---------- */
  const listBottomPad =
    10 + inputHeight + 12 + (insets.bottom || 0) + kbBtmNum + EXTRA_BOTTOM_GAP;

  /** ---------- UI ---------- */
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
            <TouchableOpacity onPress={toggleSidebar} style={{ paddingLeft: 8 }}>
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
              const isEditing = editingId === chat.id;
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
                          setSelectedChatId(chat.id);
                          closeItemMenu();
                        }}
                      >
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.sidebarItemText,
                            selectedChatId === chat.id && { fontWeight: "bold" },
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

      {/* Body + Background image (centered, no layout impact) */}
      <Animated.View style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.background}>
            {/* ชั้นพื้นหลัง absolute ที่จัดกึ่งกลางรูปเท่านั้น */}
            <View style={styles.bgCenterWrap} pointerEvents="none">
              <Image source={buddhadhamBG} style={styles.bgImage} resizeMode="contain" />
            </View>

            {user && loadingHistory ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <ActivityIndicator />
                <Text style={{ color: "#ddd", marginTop: 8 }}>กำลังโหลดประวัติ...</Text>
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
                ListFooterComponent={<View style={{ height: EXTRA_BOTTOM_GAP }} />}
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
                  onInput={() => {
                    adjustWebHeight();
                  }}
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
          <View className="popupArrow" style={styles.popupArrow} />
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

/** ==============================
 *  Styles
 *  ============================== */
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

  // เลเยอร์พื้นหลัง absolute เต็มหน้าจอ แล้วจัดกึ่งกลาง "เฉพาะรูป"
  bgCenterWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  // ตัวรูป – ใช้ contain เพื่อไม่บิดสัดส่วน
  bgImage: {
    width: "70%",      // ปรับได้ตามต้องการ (เช่น 60–80%)
    aspectRatio: 1,    // ถ้ารูปเป็นสี่เหลี่ยมจัตุรัส; ลบออกได้ถ้าไม่ต้องการบังคับ
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
