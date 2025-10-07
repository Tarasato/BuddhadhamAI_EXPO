// src/api/client.js
import axios from "axios";

// .env: EXPO_PUBLIC_API_URL=https://buddhadham-server-service.vercel.app
const API =
  process.env.EXPO_PUBLIC_API_URL

// แยก client ตามโมดูล
const client = axios.create({
  baseURL: `${API}/user`,
});

const qNaClient = axios.create({
  baseURL: `${API}/qNa`,
});

const chatClient = axios.create({
  baseURL: `${API}/chat`,
});

// Interceptors (ช่วย debug ตอน dev)
if (typeof __DEV__ !== "undefined" && __DEV__) {
  [client, qNaClient, chatClient].forEach((c) => {
    c.interceptors.request.use((cfg) => {
      console.log(
        "[HTTP] →",
        cfg.method?.toUpperCase(),
        (cfg.baseURL || "") + (cfg.url || ""),
        "timeout:",
        cfg.timeout
      );
      return cfg;
    });
    c.interceptors.response.use(
      (res) => {
        console.log(
          "[HTTP] ✓",
          res.status,
          (res.config.baseURL || "") + (res.config.url || "")
        );
        return res;
      },
      (err) => {
        console.log("[HTTP] ✗", err?.code, err?.message);
        return Promise.reject(err);
      }
    );
  });
}

export default client;
export { qNaClient, chatClient, API };
