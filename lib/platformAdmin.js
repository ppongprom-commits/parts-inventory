import { supabaseAdmin } from "./supabaseAdminClient";

// ระดับสิทธิ์ platform admin (การ์ด "Platform admin role tiers")
// Super Admin: ดูได้ทุกอย่าง + join-as-support + แก้ subscription/billing + เพิ่ม/ลบ admin
// Support:     ดูได้ทุกอย่าง + join-as-support (ห้ามแตะ billing, ห้ามจัดการ admin คนอื่น)
// Analyst:     ดูได้ทุกอย่างเท่านั้น (read-only เต็มรูปแบบ)
export const PLATFORM_ROLES = ["super_admin", "support", "analyst"];

// ตรวจว่า request มี Bearer token ของบัญชีที่เป็น platform admin จริง
// คืนค่า { userId, role } ถ้าผ่าน หรือ { error, status } ถ้าไม่ผ่าน
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
    .select("user_id, role")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!adminRow) {
    return { error: "บัญชีนี้ไม่มีสิทธิ์เข้าหน้า Platform Admin", status: 403 };
  }

  return { userId: userData.user.id, role: adminRow.role || "support" };
}

// เช็คว่า role ของ caller อยู่ใน allowedRoles ไหม — ใช้ครอบ verifyPlatformAdmin สำหรับ
// endpoint ที่ต้องจำกัดสิทธิ์ตาม permission matrix (ดู README/การ์ด Role tiers)
// คืนค่า { userId, role } ถ้าผ่าน หรือ { error, status } ถ้าไม่ผ่าน (401/403)
//
// หมายเหตุการออกแบบ (ตัดสินใจแล้ว 19 ก.ค. 2026): UI ไม่ซ่อนปุ่มตาม role เลย — ทุกคนเห็น UI
// เหมือนกัน อาศัย API นี้เป็น source of truth เดียว กดปุ่มที่ไม่มีสิทธิ์จะได้ 403 ง่ายกว่าทำ
// conditional rendering ทุกจุด (และป้องกัน bug ประเภท "ซ่อนปุ่มแต่ endpoint ยังเปิดอยู่")
export async function requirePlatformRole(request, allowedRoles) {
  const authResult = await verifyPlatformAdmin(request);
  if (authResult.error) return authResult;

  if (!allowedRoles.includes(authResult.role)) {
    return {
      error: `บทบาท "${authResult.role}" ไม่มีสิทธิ์ทำรายการนี้`,
      status: 403,
    };
  }

  return authResult;
}

// เช็คเฉพาะ business logic: ป้องกัน super_admin คนสุดท้ายถูก demote/ลบตัวเอง
// (พลาดข้อนี้ = ล็อกทั้ง platform ถาวร — ไม่มีใครกู้สิทธิ์คืนได้เองอีกเลยนอกจากเข้า DB ตรง)
export async function wouldRemoveLastSuperAdmin(targetUserId, newRole) {
  if (newRole === "super_admin") return false;

  const { count } = await supabaseAdmin
    .from("platform_admins")
    .select("user_id", { count: "exact", head: true })
    .eq("role", "super_admin");

  if ((count || 0) > 1) return false;

  // เหลือ super_admin คนเดียว — เช็คว่าคนที่กำลังจะโดนแก้คือคนนั้นไหม
  const { data: targetRow } = await supabaseAdmin
    .from("platform_admins")
    .select("role")
    .eq("user_id", targetUserId)
    .maybeSingle();

  return targetRow?.role === "super_admin";
}

// บันทึก platform_audit_log แถวหนึ่ง — best-effort logger ใช้ตอน mutation จริง
// (การ์ด "Platform admin audit log" ตัดสินใจไว้ว่าอยากให้ block การกระทำหลักถ้า log ไม่สำเร็จ —
// แต่นั่นต้องทำผ่าน RPC เดียวกันเป็นทรานแซคชัน ซึ่งเป็นขอบเขตของการ์ดนั้นโดยตรง ฟังก์ชันนี้เป็น
// helper เขียน log แบบง่ายที่ route ปัจจุบันเรียกได้ทันทีระหว่างรอทำ RPC เวอร์ชันทรานแซคชันเต็มรูป)
export async function logPlatformAction({
  adminUserId,
  adminRole,
  action,
  status = "success",
  targetShopId = null,
  targetUserId = null,
  oldData = null,
  newData = null,
  errorMessage = null,
}) {
  try {
    await supabaseAdmin.from("platform_audit_log").insert({
      admin_user_id: adminUserId,
      admin_role: adminRole,
      action,
      status,
      target_shop_id: targetShopId,
      target_user_id: targetUserId,
      old_data: oldData,
      new_data: newData,
      error_message: errorMessage,
    });
  } catch (err) {
    // best-effort เท่านั้นในเวอร์ชันนี้ — ไม่ throw ทับ error หลักของ route
    console.error("logPlatformAction failed:", err);
  }
}
