/**
 * ตั้งรหัสผ่านใหม่ให้บัญชี owner บน production (beta) โดยตรง ผ่าน Supabase Admin API
 * — ใช้แทน recovery link ที่แอปยังไม่มีหน้ารองรับ (ไม่มีฟอร์ม "ตั้งรหัสผ่านใหม่" ให้กรอก)
 *
 * ปลอดภัย: ใช้ logic เดียวกับที่ app/api/team/reset-pin/route.js ใช้จริงอยู่แล้ว
 * (supabaseAdmin.auth.admin.updateUserById) ไม่ได้ไปแก้ตาราง auth.users ตรงๆ ด้วย SQL
 *
 * ใช้งาน:
 *   node scripts/reset-owner-password.mjs <email> <รหัสผ่านใหม่>
 *
 * ตัวอย่าง:
 *   node scripts/reset-owner-password.mjs ppongprom@gmail.com "รหัสผ่านใหม่ที่ปลอดภัย123"
 *
 * ต้องมี .env.local (ของโปรเจกต์ beta/production) ที่มีค่า:
 *   NEXT_PUBLIC_SUPABASE_URL             (ต้องชี้ไป project beta ktfnnmxrochfcjzifjlw)
 *   SUPABASE_SERVICE_ROLE_KEY            (ของ beta — ไม่ใช่ตัวที่ถูก revoke ของ staging)
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("❌ ไม่พบไฟล์ .env.local ที่ project root");
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, "utf-8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  });
}

loadEnvLocal();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env.local");
  process.exit(1);
}

const [, , email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.error("ใช้งาน: node scripts/reset-owner-password.mjs <email> <รหัสผ่านใหม่>");
  process.exit(1);
}
if (newPassword.length < 8) {
  console.error("❌ รหัสผ่านควรยาวอย่างน้อย 8 ตัวอักษร");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function run() {
  console.log(`กำลังค้นหาบัญชี: ${email} ...`);

  // หา user_id จาก email — listUsers ใช้ pagination, ไล่หาแบบง่ายเพราะจำนวน user ไม่เยอะ
  let userFound = null;
  let page = 1;
  while (!userFound) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    userFound = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (userFound || data.users.length < 200) break;
    page++;
  }

  if (!userFound) {
    console.error(`❌ ไม่พบบัญชีอีเมล ${email} ใน project นี้`);
    process.exit(1);
  }

  console.log(`พบบัญชี: ${userFound.id} — กำลังตั้งรหัสผ่านใหม่...`);

  const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userFound.id, {
    password: newPassword,
  });
  if (updateError) throw updateError;

  console.log("✅ ตั้งรหัสผ่านใหม่สำเร็จแล้ว — ลอง login ด้วยรหัสผ่านใหม่ได้เลย");
}

run().catch((err) => {
  console.error("Fatal error:", err.message);
  process.exit(1);
});
