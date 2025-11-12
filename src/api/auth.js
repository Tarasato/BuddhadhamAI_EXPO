
import client from "./client";

/* =============== Auth: Register / Login =============== */
export const registerApi = async ({ userName, userEmail, userPassword }) => {
  const res = await client.post("/", { userName, userEmail, userPassword });
  return res.data;
};

export const loginApi = async ({ userInput, userPassword }) => {
  const res = await client.post("/login", { userInput, userPassword });
  const raw = res.data; 

  
  /* =============== Normalize User Data =============== */
  const u =
    raw?.user ??
    raw?.data?.user ??
    raw?.data ??
    raw?.payload ??
    raw?.result ??
    null;

 
  /* =============== Extract Token =============== */
  const token =
    u?.token ?? raw?.token ?? raw?.accessToken ?? raw?.data?.token ?? null;

  /* =============== Return Standardized Object =============== */
  return {
    message: raw?.message || "ok",
    user: {
      id:
        u?.userId ??
        u?.id ??
        u?._id ??
        (typeof u?.uid === "string" ? u.uid : null),
      name: u?.userName ?? u?.name ?? u?.fullName ?? "",
      email: u?.userEmail ?? u?.email ?? u?.userInput ?? userInput,
      token,
    },
  };
};
