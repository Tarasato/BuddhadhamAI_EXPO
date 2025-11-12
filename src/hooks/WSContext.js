import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { io } from "socket.io-client";
import { EXPO_PUBLIC_SOCKET_URL } from '@env';

/** ================= Socket URL ================= */
const SOCKET_URL = EXPO_PUBLIC_SOCKET_URL;


const WSContext = createContext(null);

/* =============== PROVIDER =============== */
export const WSProvider = ({ children }) => {

  /* =============== Connection State / Main Variables =============== */
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);

  /* =============== App-level listeners =============== */
  const appListenersRef = useRef(new Map());

  /* ================ App-level emit ================= */
  const appEmit = (event, ...args) => {
    const set = appListenersRef.current.get(event);
    if (!set || set.size === 0) return;
    set.forEach((fn) => {
      try {
        fn(...args);
      } catch (e) {
        console.warn(`[WS] app listener "${event}" error:`, e);
      }
    });
  };

  /* =============== Task-level handlers / socket listeners =============== */
  const taskHandlersRef = useRef(new Map());
  const taskSocketListenerRef = useRef(new Map());

  /* ================ Attach / Detach Task Socket Listener ================= */
  const attachTaskSocketListener = (taskId) => {
    const socket = socketRef.current;
    if (!socket || !taskId) return;
    if (taskSocketListenerRef.current.has(taskId)) return; // กันซ้ำ

    const route = (payload) => {
      const set = taskHandlersRef.current.get(taskId);
      if (!set || set.size === 0) return;
      set.forEach((fn) => {
        try {
          fn(payload);
        } catch (e) {
          console.warn("[WS] task handler error:", e);
        }
      });
    };

    socket.on(taskId, route);
    taskSocketListenerRef.current.set(taskId, route);


    try {
      socket.emit("task:subscribe", { taskId });
    } catch { }
  };

  /* ================ Detach Task Socket Listener ================= */
  const detachTaskSocketListener = (taskId) => {
    const socket = socketRef.current;
    const route = taskSocketListenerRef.current.get(taskId);
    if (socket && route) socket.off(taskId, route);
    taskSocketListenerRef.current.delete(taskId);

    try {
      socket?.emit?.("task:unsubscribe", { taskId });
    } catch { }
  };

  /* =============== Bootstrap / Lifecycle =============== */
  useEffect(() => {

    if (socketRef.current) return;

    if (!SOCKET_URL) {
      console.warn("[WS] EXPO_PUBLIC_SOCKET_URL is not set. Skipping socket init.");
      return;
    }

    /* =============== Create Socket =============== */
    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    /* =============== Socket Event Handlers =============== */
    socket.on("connect", () => {
      // เข้าเชื่อมต่อสำเร็จ
      setConnected(true);
      console.log("✅ [WS] connected:", socket.id);

      const taskIds = Array.from(taskHandlersRef.current.keys());
      if (taskIds.length) {
        try {
          socket.emit("task:bulk_subscribe", { taskIds });
        } catch { }
      }
    });

    // เชื่อมต่อผิดพลาด
    socket.on("connect_error", (err) => {
      console.log("❌ [WS] connect_error:", err?.message || err);
    });

    // หลุดการเชื่อมต่อ
    socket.on("disconnect", (reason) => {
      setConnected(false);
      console.log("⚠️ [WS] disconnected:", reason);
    });

    /* =============== App-level socket listeners =============== */
    socket.on("task:done", (payload) => {
      appEmit("done", payload);
      const t = payload?.taskId;
      if (t && taskHandlersRef.current.has(t)) {
        const set = taskHandlersRef.current.get(t);
        set.forEach((fn) => {
          try {
            fn(payload);
          } catch (e) {
            console.warn("[WS] task:done -> handler error:", e);
          }
        });
      }
    });


    socket.on("task:error", (payload) => {
      appEmit("done", payload);
      const t = payload?.taskId;
      if (t && taskHandlersRef.current.has(t)) {
        const set = taskHandlersRef.current.get(t);
        set.forEach((fn) => {
          try {
            fn(payload);
          } catch (e) {
            console.warn("[WS] task:error -> handler error:", e);
          }
        });
      }
    });

    /* =============== Cleanup on unmount =============== */
    return () => {
      try {
        socket.removeAllListeners();
        socket.disconnect();
      } catch { }
      socketRef.current = null;
      taskSocketListenerRef.current.clear();

    };
  }, []);

  /* =============== WS Methods =============== */

  const on = (event, handler) => {
    if (!appListenersRef.current.has(event)) {
      appListenersRef.current.set(event, new Set());
    }
    appListenersRef.current.get(event).add(handler);


    socketRef.current?.on?.(event, handler);

    return () => off(event, handler);
  };

  /* =============== once(event, handler) =============== */
  const once = (event, handler) => {
    socketRef.current?.once?.(event, handler);
  };

  /* =============== off(event, handler) =============== */
  const off = (event, handler) => {
    const set = appListenersRef.current.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) appListenersRef.current.delete(event);
    }
    socketRef.current?.off?.(event, handler);
  };

  /* =============== emit(event, payload) =============== */
  const emit = (event, payload) => {
    socketRef.current?.emit?.(event, payload);
  };

  /* =============== subscribeTask(taskId, handler) =============== */
  const subscribeTask = (taskId, handler) => {
    if (!taskId) return () => { };
    if (!taskHandlersRef.current.has(taskId)) {
      taskHandlersRef.current.set(taskId, new Set());
    }
    taskHandlersRef.current.get(taskId).add(handler);

    attachTaskSocketListener(taskId);

    return () => {
      const set = taskHandlersRef.current.get(taskId);
      if (!set) return;
      set.delete(handler);
      if (set.size === 0) {
        taskHandlersRef.current.delete(taskId);
        detachTaskSocketListener(taskId);
      }
    };
  };

  /* =============== Memoize Context Value =============== */
  const value = useMemo(
    () => ({
      socket: socketRef.current,
      connected,
      on,
      once,
      off,
      emit,
      subscribeTask,
    }),
    [connected]
  );

  return <WSContext.Provider value={value}>{children}</WSContext.Provider>;
};

/* =============== Hook to use WSContext =============== */
export const useWS = () => {
  const ctx = useContext(WSContext);
  if (!ctx) throw new Error("useWS must be used within a WSProvider");
  return ctx;
};

export default WSContext;
