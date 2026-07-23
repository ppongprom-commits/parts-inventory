import { supabase } from "./supabaseClient";
import { GLOBAL_SESSION_CONFIG, getTierConfig } from "../config/subscriptionTiers";

/**
 * เรียกครั้งเดียวหลัง login + เลือก shop สำเร็จ
 * คืนค่า { ok: true, sessionId } หรือ { ok: false, reason }
 */
export async function registerSession(userId, shopId, subscriptionPlan) {
  const tier = getTierConfig(subscriptionPlan);

  // 0) เก็บกวาด session ที่ "ตายจริง" ทิ้งก่อนนับอะไรทั้งสิ้น
  // เหตุผล: releaseSession() พึ่งพา event beforeunload ซึ่งไม่ fire เสมอ (ปิดแอปเบราว์เซอร์บนมือถือ,
  // เน็ตหลุด, force-quit, บางเบราว์เซอร์ตอนปิดแท็บ) แถวที่ค้างแบบนี้จะไปกิน slot ของ
  // concurrent session limit อย่างผิด ๆ ทั้งที่ไม่มีใครใช้งานจริงแล้ว จึงต้องเคลียร์ด้วย
  // last_seen_at staleness ทุกครั้งก่อนนับ (แทนที่จะพึ่ง release ฝั่ง client อย่างเดียว)
  const staleBeforeIso = new Date(
    Date.now() - GLOBAL_SESSION_CONFIG.sessionStaleAfterMinutes * 60 * 1000
  ).toISOString();
  await supabase.from("user_sessions").delete().lt("last_seen_at", staleBeforeIso);

  // 1) เช็คจำนวนเครื่องที่ user คนนี้ login อยู่ (ทุก shop รวมกัน) — แถวที่เหลือหลังขั้นตอน 0
  //    คือ session ที่ยัง active จริงเท่านั้น
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
  //    หลังขั้นตอน 0 แล้ว แถวที่เหลือคือ session ที่ยัง active จริงเท่านั้น ไม่ใช่ session ผี
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

// เดิม eviction (ลบแถวใน user_sessions ตอนล้น limit) เป็นแค่ bookkeeping — เครื่องที่ถูกเขี่ย
// ยังใช้ JWT เดิมทำ request ต่อได้จนกว่า token หมดอายุเอง ไม่ได้ตัดสิทธิ์ทันทีจริง ตอนนี้ heartbeat
// เช็คว่าแถว session ของตัวเองยังอยู่ไหมทุกครั้งที่ยิง (ทุก 60 วิ) ถ้าแถวหายไป (ถูก evict จากเครื่อง
// อื่นที่ login ชนกัน) คืนค่า false ให้ AuthProvider signOut ทันทีในรอบถัดไป
// คืนค่า true ถ้า session แถวนี้ยังอยู่จริง, false ถ้าแถวหายไปแล้ว (ถูก evict)
export async function heartbeatSession(sessionId) {
  if (!sessionId) return true;
  const { data, error } = await supabase
    .from("user_sessions")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .select("session_id");
  if (error) return true; // เน็ตหลุดชั่วคราว/error อื่นๆ ไม่ถือว่าโดน evict (กันตัดสิทธิ์ผิดตัว)
  return (data || []).length > 0;
}

export async function releaseSession(sessionId) {
  if (!sessionId) return;
  await supabase.from("user_sessions").delete().eq("session_id", sessionId);
}
