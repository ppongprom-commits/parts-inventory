// ------------------------------------------------------------
// Playwright globalSetup — รันครั้งเดียวก่อนเริ่ม test session ทั้งหมด
// (เพิ่ม 22 ก.ค. 2026 — safety net หลังเจอปัญหา password ของ synthetic-email
// account (username+PIN) หลุดจาก .env เองโดยไม่ทราบสาเหตุแน่ชัด 2 ครั้งในวันเดียว)
//
// Sync encrypted_password ของทุกบัญชี username+PIN (supervisor/technician/assistant/
// field_scanner) ทุก shop (worker 1-5 + tier 5 shop) ให้ตรงกับค่าใน .env เสมอ ก่อนเริ่ม
// test จริง — ถ้าเกิด drift อีกในอนาคต test จะ "self-heal" เองโดยอัตโนมัติ ไม่ต้องรอ
// แก้มือทีละบัญชีแบบที่ผ่านมา
//
// ไม่แตะ owner/manager (email+password ปกติ) เพราะยังไม่เคยเจอ drift ฝั่งนั้นเลย
// จำกัดเฉพาะ synthetic-email account ที่เจอปัญหาจริงเท่านั้น กันงานเกินจำเป็น
// ------------------------------------------------------------
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const STAFF_EMAIL_DOMAIN = "staff.internal.partsinventory.app";
const toStaffEmail = (u) => `${u.toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;

async function globalSetup() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.warn("[global-setup] ⚠️ ไม่มี SUPABASE_URL/SERVICE_ROLE_KEY — ข้าม password sync");
    return;
  }

  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  // รวบรวม (username, pin) ของทุก worker shop (1-5) — ไม่รวม tier shop staff เพราะยังไม่ join
  // shop ใดๆ (ไม่มี pin ใช้งานจริงจนกว่า test จะ invite เข้าเอง)
  const pairs = [];
  for (let s = 1; s <= 5; s++) {
    const suffix = s === 1 ? "" : `_S${s}`;
    for (const role of ["SUPERVISOR", "TECHNICIAN", "ASSISTANT", "FIELDSCANNER"]) {
      const username = process.env[`TEST_${role}_USERNAME${suffix}`];
      const pin = process.env[`TEST_${role}_PIN${suffix}`];
      if (username && pin) pairs.push({ username, pin });
    }
  }

  let synced = 0;
  let errors = 0;

  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
  if (listErr) {
    console.warn(`[global-setup] ⚠️ listUsers ล้มเหลว: ${listErr.message} — ข้าม password sync ทั้งหมด`);
    return;
  }

  for (const { username, pin } of pairs) {
    const email = toStaffEmail(username);
    const user = list.users.find((u) => u.email === email);
    if (!user) continue; // ยังไม่ได้ setup ไว้ ข้ามไป (ไม่ error ทั้ง session เพราะเรื่องนี้)

    const { error: updErr } = await admin.auth.admin.updateUserById(user.id, { password: pin });
    if (updErr) {
      console.warn(`[global-setup] ⚠️ sync password ${email} ล้มเหลว: ${updErr.message}`);
      errors++;
    } else {
      synced++;
    }
  }

  console.log(`[global-setup] ✅ sync password ${synced}/${pairs.length} บัญชี username+PIN เรียบร้อย${errors ? ` (${errors} error)` : ""}`);
}

export default globalSetup;
