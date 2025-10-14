
import client from "./client";

export const registerApi = async ({ userName, userEmail, userPassword }) => {
  const res = await client.post("/", { userName, userEmail, userPassword });
  return res.data;
};


export const loginApi = async ({ userInput, userPassword }) => {
  const res = await client.post("/login", { userInput, userPassword });
  const raw = res.data; 

  
  const u =
    raw?.user ??
    raw?.data?.user ??
    raw?.data ??
    raw?.payload ??
    raw?.result ??
    null;

 
  const token =
    u?.token ?? raw?.token ?? raw?.accessToken ?? raw?.data?.token ?? null;

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
