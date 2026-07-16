import { supabaseAdmin } from "./supabaseAdminClient";
import { getTierConfig, isUnlimited } from "../config/subscriptionTiers";

// ตรวจ Bearer token ว่า login อยู่จริงไหม คืน { userId } หรือ { error, status }
export async function verifyCaller(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return { error: "ไม่พบ token กรุณาเข้าสู่ระบบใหม่", status: 401 };

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return { error: "session ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่", status: 401 };
  }
  return { userId: userData.user.id };
}

// ตรวจว่า userId เป็น owner/manager ของ shopId จริงไหม
export async function verifyShopManager(shopId, userId) {
  const { data: callerMember } = await supabaseAdmin
    .from("shop_members")
    .select("role")
    .eq("shop_id", shopId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (!callerMember || !["owner", "manager"].includes(callerMember.role)) {
    return { error: "ไม่มีสิทธิ์จัดการทีมของอู่นี้", status: 403 };
  }
  return { ok: true, role: callerMember.role };
}

// เช็คว่าที่นั่ง (สมาชิก active + คำเชิญค้าง) เกิน tier.maxMembers หรือยัง
// excludeEmail: กันไม่ให้นับคำเชิญของอีเมลเดียวกันซ้ำตอน re-invite
export async function checkSeatLimit(shopId, excludeEmail = null) {
  const { data: shop, error: shopError } = await supabaseAdmin
    .from("shops")
    .select("subscription_plan, shop_name")
    .eq("shop_id", shopId)
    .single();
  if (shopError) throw shopError;

  const tier = getTierConfig(shop.subscription_plan);

  if (isUnlimited(tier.maxMembers)) {
    return { ok: true, shop, tier };
  }

  let inviteQuery = supabaseAdmin
    .from("shop_invites")
    .select("invite_id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .is("accepted_at", null);
  if (excludeEmail) inviteQuery = inviteQuery.neq("email", excludeEmail);

  const [{ count: activeCount }, { count: pendingCount }] = await Promise.all([
    supabaseAdmin
      .from("shop_members")
      .select("member_id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("status", "active"),
    inviteQuery,
  ]);

  const total = (activeCount || 0) + (pendingCount || 0);
  if (total >= tier.maxMembers) {
    return {
      ok: false,
      error: `จำนวนสมาชิก/คำเชิญค้างถึงขีดจำกัดของแพ็กเกจ ${tier.label} แล้ว (สูงสุด ${tier.maxMembers} คน) — อัปเกรดแพ็กเกจเพื่อเพิ่มคนได้`,
    };
  }

  return { ok: true, shop, tier };
}
