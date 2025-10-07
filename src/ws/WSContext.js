// src/ws/WSContext.js
import { io } from "socket.io-client";
import React, { createContext, useEffect, useState } from "react";

export const WSContext = createContext();

export const WSProvider = ({ children }) => {
  const [ws, setWs] = useState(null);
  const [messages, setMessages] = useState([]);

  useEffect(() => {
    // const socket = io(`http://${process.env.EXPO_PUBLIC_API_SERVER}:${process.env.EXPO_PUBLIC_API_PORT}`);
    const socket = io(`${EXPO_PUBLIC_SOCKET_URL}`);

    socket.on("connect", () => {
      console.log("WebSocket connected");
      // socket.send("Hello from client!");
    });

    socket.onmessage = (event) => {
      console.log("Received:", event.data);
      setMessages((prev) => [...prev, event.data]);
    };

    socket.on("message", (msgObj) => {
      const botReply = {
        id: Date.now().toString(),
        from: "bot",
        text: msgObj.text,
        time: new Date().toLocaleTimeString(),
      };
      console.log("WS received message:", botReply);
      setMessages((prev) => [...prev, botReply]);
    });

    socket.onerror = (error) => {
      console.log("WebSocket error:", error);
    };

    socket.onclose = () => {
      console.log("WebSocket closed");
    };

    setWs(socket);

    return () => {
      socket.close();
    };
  }, []);

  const sendMessage = (msg) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
  };

  return (
    <WSContext.Provider value={{ ws, messages, sendMessage }}>
      {children}
    </WSContext.Provider>
  );
};