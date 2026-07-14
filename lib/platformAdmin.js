import { supabaseAdmin } from "./supabaseAdminClient";

// ตรวจว่า request มี Bearer token ของบัญชีที่เป็น platform admin จริง
// คืนค่า { userId } ถ้าผ่าน หรือ { error, status } ถ้าไม่ผ่าน
export async function verifyPlatformAdmin(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) {
    return { error: "ไม่พบ token กรุณาเข้าสู่ระบบใหม่", status: 401 };
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return { error: "session ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่", status: 401 };
  }

  const { data: adminRow } = await supabaseAdmin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!adminRow) {
    return { error: "บัญชีนี้ไม่มีสิทธิ์เข้าหน้า Platform Admin", status: 403 };
  }

  return { userId: userData.user.id };
}
