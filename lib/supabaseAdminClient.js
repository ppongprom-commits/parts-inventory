import { createClient } from "@supabase/supabase-js";

/**
 * ⚠️ ใช้ในไฟล์ server-side เท่านั้น (app/api/**\/route.js)
 * ห้าม import ไฟล์นี้ในไฟล์ที่มี "use client" เด็ดขาด — service role key
 * ข้าม Row Level Security ได้ทั้งหมด ถ้าหลุดไปฝั่ง browser จะเสียหายร้ายแรง
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
  console.warn(
    "⚠️ ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY — platform admin API จะใช้งานไม่ได้"
  );
}

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
