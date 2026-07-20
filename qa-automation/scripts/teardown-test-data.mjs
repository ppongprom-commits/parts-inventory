#!/usr/bin/env node
// ------------------------------------------------------------
// ลบ test data ที่ setup-test-data.mjs สร้างไว้ทั้งหมด
// รันหลังจบรอบทดสอบทุกครั้ง โดยเฉพาะแถวใน platform_admins ที่ต้องลบก่อนเสมอ
//
// ⚠️ ลำดับสำคัญ: shops.owner_user_id เป็น FK -> auth.users(id) แบบไม่มี
// ON DELETE CASCADE (ดู db/fresh_project_full_schema.sql) ดังนั้นต้องลบ
// แถวใน shops ที่อ้างอิง user นั้นก่อน ไม่งั้น auth.admin.deleteUser จะ fail
// ด้วย foreign key violation — จึงลบ shops (by name) ก่อนเสมอ แล้วค่อยลบ
// shop_members/platform_admins/auth user ทีหลัง
// ------------------------------------------------------------
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_EMAILS = [
  process.env.TEST_OWNER_EMAIL,
  process.env.TEST_MANAGER_EMAIL,
  process.env.TEST_OWNER_PLATFORMADMIN_EMAIL,
  process.env.TEST_DISABLED_OWNER_EMAIL,
  process.env.TEST_NEWUSER_EMAIL,
  process.env.TEST_CONCURRENT1_EMAIL,
  process.env.TEST_CONCURRENT2_EMAIL,
  process.env.TEST_CONCURRENT3_EMAIL,
  process.env.TEST_CONCURRENT4_EMAIL,
].filter(Boolean);

const STAFF_USERNAMES = [
  process.env.TEST_SUPERVISOR_USERNAME,
  process.env.TEST_TECHNICIAN_USERNAME,
  process.env.TEST_ASSISTANT_USERNAME,
].filter(Boolean);

const STAFF_EMAIL_DOMAIN = "staff.internal.partsinventory.app";
const STAFF_EMAILS = STAFF_USERNAMES.map((u) => `${u.toLowerCase()}@${STAFF_EMAIL_DOMAIN}`);

async function findUserByEmail(email) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;
  return data.users.find((u) => u.email === email);
}

async function deleteUserEverywhere(email) {
  const user = await findUserByEmail(email);
  if (!user) {
    console.log(`  (ไม่พบ ${email} — ข้าม)`);
    return;
  }

  // 1) ลบออกจาก platform_admins ก่อนเสมอ (สำคัญที่สุด — ห้ามตกค้าง)
  await supabaseAdmin.from("platform_admins").delete().eq("user_id", user.id);

  // 2) ลบ shop_members ที่ผูกกับ user นี้
  await supabaseAdmin.from("shop_members").delete().eq("user_id", user.id);

  // 2.5) ลบ user_sessions ที่ผูกกับ user นี้ (TC-302) — user_sessions.user_id ก็ไม่มี
  //      ON DELETE CASCADE เหมือนกัน (ดู db/fresh_project_full_schema.sql) ต้องลบก่อนเสมอ
  await supabaseAdmin.from("user_sessions").delete().eq("user_id", user.id);

  // 3) ลบ auth user (ต้องรันหลังจากลบ shops ที่ owner_user_id ชี้มาที่ user นี้แล้วเท่านั้น
  //    ดู deleteTestShops() ที่ต้องเรียกก่อนฟังก์ชันนี้ใน main())
  const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (delErr) {
    console.warn(
      `  ⚠️  ลบ auth user ${email} ไม่สำเร็จ: ${delErr.message}\n` +
        `      ถ้าเป็น foreign key violation แปลว่ายังมี shop ที่ owner_user_id ชี้มาที่ user นี้อยู่ ` +
        `— เช็คว่า deleteTestShops() รันไปก่อนหน้านี้จริงหรือเปล่า`
    );
  } else {
    console.log(`  🗑️  ลบ ${email} เรียบร้อย`);
  }
}

const TEST_SHOP_NAMES = [
  "QA Test Shop (auto)",
  "QA Test Shop B (multi-shop, auto)",
  "QA Platform-Admin Owner Shop (auto)",
  "QA Disabled Shop (auto)",
  "QA Concurrent-Session Shop (auto)",
];

/** ต้องลบก่อนลบ auth user เสมอ เพราะ shops.owner_user_id ไม่มี ON DELETE CASCADE */
async function deleteTestShops() {
  for (const shopName of TEST_SHOP_NAMES) {
    const { error } = await supabaseAdmin.from("shops").delete().eq("shop_name", shopName);
    if (!error) console.log(`  🗑️  ลบ shop "${shopName}" เรียบร้อย (ถ้ามีอยู่)`);
    else console.warn(`  ⚠️  ลบ shop "${shopName}" ไม่สำเร็จ: ${error.message}`);
  }
}

async function main() {
  console.log("== Teardown test data: parts-inventory staging ==\n");

  console.log("[0/2] ลบ visibility_groups ทดสอบ (ถ้ามี — ห่อ try/catch เพราะตารางอาจไม่มีจริง)");
  try {
    await supabaseAdmin.from("visibility_groups").delete().eq("name", "QA Test Group A");
    console.log("  🗑️  ลบ 'QA Test Group A' เรียบร้อย (ถ้ามีอยู่)");
  } catch (err) {
    console.warn(`  ⚠️  ข้ามการลบ visibility_groups: ${err.message}`);
  }

  console.log("\n[1/2] ลบ shops ก่อน (กัน FK violation ตอนลบ auth user)");
  await deleteTestShops();

  console.log("\n[2/2] ลบ auth users (พร้อม shop_members/platform_admins ที่เหลือ)");
  for (const email of [...TEST_EMAILS, ...STAFF_EMAILS]) {
    await deleteUserEverywhere(email);
  }

  console.log("\n✅ Teardown เสร็จสมบูรณ์");
}

main().catch((err) => {
  console.error("\n❌ Teardown ล้มเหลว:", err.message);
  process.exit(1);
});
