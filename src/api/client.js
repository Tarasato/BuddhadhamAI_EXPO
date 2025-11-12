import axios from "axios";
import { EXPO_PUBLIC_API_URL } from '@env';

const API = EXPO_PUBLIC_API_URL;

/** =============== client user  =============== */
const client = axios.create({
  baseURL: `${API}/user`,
});

/**  =============== client QnA =============== */
const qNaClient = axios.create({
  baseURL: `${API}/qNa`,
});

/** =============== client  chat =============== */
const chatClient = axios.create({
  baseURL: `${API}/chat`,
});

export default client;
export { qNaClient, chatClient, API };
