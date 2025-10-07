import client from "./client";

// สมัครสมาชิก
export const registerApi = async ({ userName, userEmail, userPassword }) => {
  const res = await client.post("/", { userName, userEmail, userPassword });
  return res.data; // { message, data? }
};

// ล็อกอิน
export const loginApi = async ({ userEmail, userPassword }) => {
  const res = await client.post("/login", { userEmail, userPassword });
  const raw = res.data;              // คาดว่า { message, data }
  const d = raw?.data || raw;        // กันเคสที่ backend ส่งโครงสร้างไม่เหมือนกัน

  // แปลงให้พร้อมใช้กับ Context
  return {
    message: raw?.message || "ok",
    user: {
      id: d?.userId ?? d?.id ?? null,
      name: d?.userName ?? d?.name ?? "",
      email: d?.userEmail ?? d?.email ?? userEmail,
      token: d?.token ?? null,
    },
  };
};
