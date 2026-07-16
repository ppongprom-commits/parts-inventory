import { supabase } from "./supabaseClient";
import { GLOBAL_SESSION_CONFIG, getTierConfig } from "../config/subscriptionTiers";

/**
 * เรียกครั้งเดียวหลัง login + เลือก shop สำเร็จ
 * คืนค่า { ok: true, sessionId } หรือ { ok: false, reason }
 */
export async function registerSession(userId, shopId, subscriptionPlan) {
  const tier = getTierConfig(subscriptionPlan);

  // 1) เช็คจำนวนเครื่องที่ user คนนี้ login อยู่ (ทุก shop รวมกัน)
  const { data: myDeviceSessions } = await supabase
    .from("user_sessions")
    .select("session_id, last_seen_at")
    .eq("user_id", userId)
    .order("last_seen_at", { ascending: true });

  if (myDeviceSessions && myDeviceSessions.length >= GLOBAL_SESSION_CONFIG.maxDevicesPerUser) {
    // ลบ session เก่าสุดออกก่อน (force logout เครื่องเก่าอัตโนมัติ)
    const toRemove = myDeviceSessions.slice(
      0,
      myDeviceSessions.length - GLOBAL_SESSION_CONFIG.maxDevicesPerUser + 1
    );
    await supabase
      .from("user_sessions")
      .delete()
      .in("session_id", toRemove.map((s) => s.session_id));
  }

  // 2) เช็คจำนวนคน (distinct user) ที่ login พร้อมกันทั้งอู่ (ไม่นับ user นี้ที่กำลังจะเข้าเอง)
  if (tier.maxConcurrentSessions !== null && tier.maxConcurrentSessions !== undefined) {
    const { data: shopSessions } = await supabase
      .from("user_sessions")
      .select("user_id")
      .eq("shop_id", shopId);

    const distinctUsers = new Set((shopSessions || []).map((s) => s.user_id));
    distinctUsers.delete(userId); // ตัวเองไม่นับซ้ำ (ถ้าเคยมี session อยู่แล้วจาก step 1)

    if (distinctUsers.size >= tier.maxConcurrentSessions) {
      return {
        ok: false,
        reason: `อู่นี้มีคนใช้งานพร้อมกันเต็มแล้ว (${distinctUsers.size}/${tier.maxConcurrentSessions} ตาม tier ${tier.label}) กรุณาลองใหม่อีกครั้ง หรืออัปเกรดแพ็กเกจ`,
      };
    }
  }

  // 3) บันทึก session ใหม่
  const deviceLabel =
    typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : "unknown device";

  const { data: inserted, error } = await supabase
    .from("user_sessions")
    .insert({ user_id: userId, shop_id: shopId, device_label: deviceLabel })
    .select()
    .single();

  if (error) return { ok: false, reason: error.message };

  return { ok: true, sessionId: inserted.session_id };
}

export async function heartbeatSession(sessionId) {
  if (!sessionId) return;
  await supabase
    .from("user_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("session_id", sessionId);
}

export async function releaseSession(sessionId) {
  if (!sessionId) return;
  await supabase.from("user_sessions").delete().eq("session_id", sessionId);
}
