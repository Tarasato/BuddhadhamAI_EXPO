import React, { createContext, useContext, useMemo, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { id, name, email, token? }

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem("auth:user");
        if (raw) setUser(JSON.parse(raw));
      } catch (e) {
        console.warn("Load auth from storage failed:", e);
      }
    })();
  }, []);

  const login = async (userObj) => {
    setUser(userObj);
    await AsyncStorage.setItem("auth:user", JSON.stringify(userObj));
  };

  const logout = async () => {
    setUser(null);
    await AsyncStorage.removeItem("auth:user");
  };

  const value = useMemo(() => ({ user, login, logout }), [user]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
