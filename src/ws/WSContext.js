import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { io } from "socket.io-client";

/* ============================================================================
 * CONFIG
 * ========================================================================== */
const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL;

/** คอนเท็กซ์หลักของ WebSocket */
const WSContext = createContext(null);

/* ============================================================================
 * PROVIDER
 * ========================================================================== */
export const WSProvider = ({ children }) => {
  /* -------------------- สถานะการเชื่อมต่อ / ตัวแปรหลัก -------------------- */
  const [connected, setConnected] = useState(false);        // true เมื่อ socket.connect แล้ว
  const socketRef = useRef(null);                           // ออบเจ็กต์ socket.io

  // === App-level listeners (เช่น on("done", ...)) ===
  // เก็บเป็น Map<event, Set<handlers>> เพื่อให้ถอด-ใส่ได้เป็นรายตัว
  const appListenersRef = useRef(new Map());

  /**
   * appEmit(event, ...args)
   * ตัวช่วยสำหรับ "ยิง" อีเวนต์ภายในแอป (เรียก handler ที่ลงทะเบียนผ่าน on/off)
   * ใช้ในกรณีที่ socket รับ event จาก server แล้วอยาก broadcast ต่อในแอป
   */
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

  // === Task multiplexing ===
  // กรณีต้อง subscribe เหตุการณ์แยกตาม taskId -> เก็บเป็น Map<taskId, Set<handlers>>
  const taskHandlersRef = useRef(new Map());        // taskId -> Set(handlers)
  const taskSocketListenerRef = useRef(new Map());  // taskId -> listener fn ที่ผูกกับ socket

  /**
   * attachTaskSocketListener(taskId)
   * ผูก socket.on(taskId, route) หนึ่งครั้งต่อ taskId
   * แล้ว route จะ fan-out payload ไปยัง handler ทั้งหมดของ task นั้น
   */
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

    // (ออปชัน) แจ้ง server ว่ามีการ subscribe task ช่องนี้
    try {
      socket.emit("task:subscribe", { taskId });
    } catch {}
  };

  /**
   * detachTaskSocketListener(taskId)
   * ถอด socket.off(taskId, route) และลบ route ออกจากแผนที่
   * ใช้เมื่อ taskId นั้นไม่มี handler เหลือแล้ว
   */
  const detachTaskSocketListener = (taskId) => {
    const socket = socketRef.current;
    const route = taskSocketListenerRef.current.get(taskId);
    if (socket && route) socket.off(taskId, route);
    taskSocketListenerRef.current.delete(taskId);

    // (ออปชัน) แจ้ง server ว่ายกเลิก subscribe ช่องนี้
    try {
      socket?.emit?.("task:unsubscribe", { taskId });
    } catch {}
  };

  /* --------------------------- Bootstrap / Lifecycle --------------------------- */
  useEffect(() => {
    // กันสร้าง socket ซ้ำ (รองรับ Hot Reload)
    if (socketRef.current) return;

    if (!SOCKET_URL) {
      console.warn("[WS] EXPO_PUBLIC_SOCKET_URL is not set. Skipping socket init.");
      return;
    }

    // สร้าง socket instance
    const socket = io(SOCKET_URL, {
      transports: ["websocket"],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    // เชื่อมต่อสำเร็จ
    socket.on("connect", () => {
      setConnected(true);
      console.log("✅ [WS] connected:", socket.id);

      // Re-subscribe taskId ทั้งหมด (ถ้าฝั่ง server ต้องการ)
      const taskIds = Array.from(taskHandlersRef.current.keys());
      if (taskIds.length) {
        try {
          socket.emit("task:bulk_subscribe", { taskIds });
        } catch {}
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

    // ===== Bridge events from server -> App =====
    // 1) task:done : แจ้งทั้ง app-level ("done") และ task-level (taskId เฉพาะ)
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

    // 2) task:error : ใช้สัญญาณเดียวกับ “done” เพื่อให้จบงานฝั่ง UI ได้
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

    // cleanup
    return () => {
      try {
        socket.removeAllListeners();
        socket.disconnect();
      } catch {}
      socketRef.current = null;
      taskSocketListenerRef.current.clear();
      // NOTE: ไม่ล้าง taskHandlersRef เพื่อรองรับ Hot Reload
      // ถ้าต้องการเคลียร์ทั้งหมด ให้รีสตาร์ตแอปหรือเพิ่มปุ่ม clear เอง
    };
  }, []);

  /* ============================================================================
   * PUBLIC API
   * ========================================================================== */

  /**
   * on(event, handler)
   * ลงทะเบียนฟังเหตุการณ์ (ทั้ง app-level และจาก socket ตรงๆ)
   * คืนฟังก์ชัน off เพื่อยกเลิก
   */
  const on = (event, handler) => {
    if (!appListenersRef.current.has(event)) {
      appListenersRef.current.set(event, new Set());
    }
    appListenersRef.current.get(event).add(handler);

    // เผื่อกรณีอยากฟังเหตุการณ์จาก server ชื่อเดียวกันโดยตรง
    socketRef.current?.on?.(event, handler);

    return () => off(event, handler);
  };

  /**
   * once(event, handler)
   * ฟังเหตุการณ์ครั้งเดียวผ่าน socket.io โดยตรง
   */
  const once = (event, handler) => {
    socketRef.current?.once?.(event, handler);
  };

  /**
   * off(event, handler)
   * ยกเลิกฟังเหตุการณ์จากทั้ง app-level registry และ socket
   */
  const off = (event, handler) => {
    const set = appListenersRef.current.get(event);
    if (set) {
      set.delete(handler);
      if (set.size === 0) appListenersRef.current.delete(event);
    }
    socketRef.current?.off?.(event, handler);
  };

  /**
   * emit(event, payload)
   * ส่งเหตุการณ์ขึ้น server ผ่าน socket
   */
  const emit = (event, payload) => {
    socketRef.current?.emit?.(event, payload);
  };

  /**
   * subscribeTask(taskId, handler)
   * สมัครฟังเหตุการณ์สำหรับ taskId เฉพาะ (socket channel = taskId)
   * คืนฟังก์ชัน unsubscribe ที่จะถอด handler ออก และถ้า handler หมดจะถอด socket listener ออกด้วย
   */
  const subscribeTask = (taskId, handler) => {
    if (!taskId) return () => {};
    if (!taskHandlersRef.current.has(taskId)) {
      taskHandlersRef.current.set(taskId, new Set());
    }
    taskHandlersRef.current.get(taskId).add(handler);

    // ผูก socket listener ของ taskId นี้ (ถ้ายังไม่ผูก)
    attachTaskSocketListener(taskId);

    // ถอดออกเมื่อไม่ใช้
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

  // memo value
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

/* ============================================================================
 * HOOK
 * ========================================================================== */
/**
 * useWS()
 * ดึงค่า context ของ WS; บังคับให้ใช้ภายใน <WSProvider>
 */
export const useWS = () => {
  const ctx = useContext(WSContext);
  if (!ctx) throw new Error("useWS must be used within a WSProvider");
  return ctx;
};

export default WSContext;
