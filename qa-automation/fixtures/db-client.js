// ------------------------------------------------------------
// สร้าง Supabase client ที่ sign in แล้ว โดยใช้ publishable/anon key เดียวกับที่
// แอปจริงใช้ฝั่ง client (lib/supabaseClient.js) — สำหรับเทสต์ RLS โดยตรง
// ข้าม UI ทั้งหมด เพื่อพิสูจน์ว่า "ความปลอดภัยอยู่ที่ DB policy จริง" ไม่ใช่แค่ UI ซ่อนปุ่ม
// ------------------------------------------------------------
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl, supabasePublishableKey } from "./test-data.js";

const STAFF_EMAIL_DOMAIN = "staff.internal.partsinventory.app";

function freshClient() {
  // ต้อง persistSession:false + client ใหม่ทุกครั้ง กัน session ปนกันข้าม role ในเทสต์เดียวกัน
  return createClient(supabaseUrl, supabasePublishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** login ด้วย email+password (สำหรับ owner/manager) คืน client ที่ sign in แล้ว */
export async function signInEmail(email, password) {
  const client = freshClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signInEmail(${email}) ล้มเหลว: ${error.message}`);
  return { client, userId: data.user.id };
}

/** login ด้วย username+PIN (สำหรับ supervisor/technician/assistant) — mirror ของ lib/staffAuth.js */
export async function signInStaff(username, pin) {
  const email = `${username.toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;
  return signInEmail(email, pin);
}

// ------------------------------------------------------------
// Service-role client — ใช้เฉพาะสำหรับ "หา id ที่ต้องใช้" (shop_id/member_id) หรือ
// "ตรวจยืนยันผลลัพธ์หลังบ้าน" เท่านั้น ห้ามใช้แทนการทดสอบ RLS จริง (นั่นคือหน้าที่ของ
// freshClient()/signInEmail()/signInStaff() ด้านบนซึ่งใช้ publishable key เหมือนแอปจริง)
// ------------------------------------------------------------
import "dotenv/config";

let _adminClient = null;
export function adminClient() {
  if (!_adminClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("ต้องตั้ง SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ใน .env");
    _adminClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  }
  return _adminClient;
}

export async function getShopIdByName(shopName) {
  const { data, error } = await adminClient()
    .from("shops")
    .select("shop_id")
    .eq("shop_name", shopName)
    .single();
  if (error) throw new Error(`หา shop "${shopName}" ไม่เจอ: ${error.message}`);
  return data.shop_id;
}

export async function getMemberIdByUsername(shopId, username) {
  const { data, error } = await adminClient()
    .from("shop_members")
    .select("member_id")
    .eq("shop_id", shopId)
    .eq("login_username", username)
    .single();
  if (error) throw new Error(`หา member username=${username} ใน shop ${shopId} ไม่เจอ: ${error.message}`);
  return data.member_id;
}

/** ใช้ตอน afterAll เพื่อคืนค่า role/status ของ member กลับเป็นเดิม (กัน suite อื่นพัง) */
export async function setMemberRoleStatus(memberId, role, status) {
  const { error } = await adminClient()
    .from("shop_members")
    .update({ role, status })
    .eq("member_id", memberId);
  if (error) throw error;
}

/** หา user_id (auth.users.id) จาก login_username — ต่างจาก getMemberIdByUsername ที่คืน
 *  member_id (PK ของ shop_members เอง) — ใช้ user_id ตอนต้องอ้าง assigned_to/changed_by ฯลฯ
 *  ที่อ้างอิง auth.users(id) ตรงๆ ไม่ใช่ shop_members(member_id) */
export async function getUserIdByUsername(shopId, username) {
  const { data, error } = await adminClient()
    .from("shop_members")
    .select("user_id")
    .eq("shop_id", shopId)
    .eq("login_username", username)
    .single();
  if (error) throw new Error(`หา user_id ของ username=${username} ใน shop ${shopId} ไม่เจอ: ${error.message}`);
  return data.user_id;
}
