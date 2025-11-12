import { useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** ================= Keys ================= */
const THEME_KEY = "ui_theme_dark";

/** ================= Storage helper ================= */
const storage = {
    async getItem(key) {
        try {
            if (AsyncStorage?.getItem) return await AsyncStorage.getItem(key);
        } catch { }
        if (Platform.OS === "web") {
            try { return window.localStorage.getItem(key); } catch { }
        }
        return null;
    },
    async setItem(key, val) {
        try {
            if (AsyncStorage?.setItem) return await AsyncStorage.setItem(key, val);
        } catch { }
        if (Platform.OS === "web") {
            try { window.localStorage.setItem(key, val); } catch { }
        }
    },
};

/** ================= Base tokens ================= */
const BASE = {
    light: { shadow: "#000" },
    dark: { shadow: "#000" },
};

/** ================= Per-area overrides ================= */
const AREA_OVERRIDES = {
    auth: {
        dark: {
            containerBg: "#4A5368",
            headerText: "#F8FAFC",
            cardBg: "#F7F8FB",
            cardBorder: "#E5E9F2",
            fieldBg: "#EDEFF3",
            fieldText: "#111827",
            fieldPlaceholder: "#9AA0A6",
            buttonBg: "#6B7280",
            buttonText: "#FFFFFF",
            linkText: "#4B5563",
            errorText: "#FF6B6B",
            chipBg: "rgba(255,255,255,0.12)",
            chipText: "#E5E7EB",
            border: "#D9DEE8",
        },
        light: {
            containerBg: "#EEF2F7",
            headerText: "#0F172A",
            cardBg: "#FFFFFF",
            cardBorder: "#E6ECF5",
            fieldBg: "#F3F4F6",
            fieldText: "#0F172A",
            fieldPlaceholder: "#6B7280",
            buttonBg: "#6B7280",
            buttonText: "#FFFFFF",
            linkText: "#374151",
            errorText: "#EF4444",
            chipBg: "#E8EDF6",
            chipText: "#0F172A",
            border: "#E5EAF2",
        },
    },

    chat: {
        dark: {
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
            attachmentIcon: "#0F172A",
        },
        light: {
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
            attachmentIcon: "#0F172A",
        },
    },
};

/** ============== Core theme state (ไม่ผูกกับ area) ============== */
function useThemeCore() {
    const initialDark =
        Platform.OS === "web" && typeof window !== "undefined"
            ? window.localStorage.getItem(THEME_KEY)
            : null;

    const [isDark, setIsDark] = useState(
        initialDark === "true" ? true : initialDark === "false" ? false : true
    );

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

    return { isDark, toggleTheme };
}

/** ================= Build merged palette ================= */
function makePalette(area, isDark) {
    const mode = isDark ? "dark" : "light";
    return {
        ...BASE[mode],
        ...(AREA_OVERRIDES[area] ? AREA_OVERRIDES[area][mode] : {}),
    };
}

/** ================= Hook ================= */
export default function useThemePreference(area = "chat") {
    const { isDark, toggleTheme } = useThemeCore();
    const C = useMemo(() => makePalette(area, isDark), [area, isDark]);
    return { isDark, toggleTheme, C };
}

