#!/usr/bin/env node
// ------------------------------------------------------------
// สร้าง test data ทั้งหมดตาม Test Data Matrix ลง Supabase STAGING
// ใช้ service_role key เท่านั้น — ต้องรันกับ staging project เท่านั้น ห้ามใช้กับ production
//
// Schema จริง (ตรวจสอบจาก db/multi_tenant_schema_design.sql, db/auth_multi_tenant_schema.sql):
//   shops:        PK = shop_id, owner_user_id (uuid, NOT NULL), subscription_status, subscription_plan
//   shop_members: PK = member_id, shop_id, user_id, role, status ('active'|'invited'|'disabled')
//   platform_admins: PK = user_id
//
// หมายเหตุสำคัญ: isDisabledAccount ใน lib/AuthProvider.js คำนวณจาก
//   "มีแถวใน shop_members อยู่จริง (allRows.length > 0) แต่ไม่มีแถวไหน status='active' เลย"
// ดังนั้นการจำลอง disabled account ทำได้ตรงๆ ด้วยการตั้ง shop_members.status = 'disabled'
// ไม่ต้องไปยุ่งกับ shops.subscription_status เลย
//
// วิธีรัน:
//   cp .env.example .env   (แล้วกรอกค่าจริง)
//   npm run setup:data
// ------------------------------------------------------------
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STAFF_EMAIL_DOMAIN = "staff.internal.partsinventory.app"; // ต้องตรงกับ lib/staffAuth.js

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ ต้องตั้งค่า SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env ก่อน");
  process.exit(1);
}
if (SUPABASE_URL.includes("/rest/") || SUPABASE_URL.endsWith("/")) {
  console.error(
    `❌ SUPABASE_URL ห้ามมี path ต่อท้าย (เช่น /rest/v1) หรือ trailing slash — ตอนนี้ค่าคือ: ${SUPABASE_URL}\n` +
      `   ต้องเป็นแค่ https://<project-ref>.supabase.co เท่านั้น (supabase-js จะเติม path เองภายใน)`
  );
  process.exit(1);
}
if (!/staging|dev|test/i.test(SUPABASE_URL)) {
  console.warn(
    "⚠️  SUPABASE_URL ที่ตั้งไว้ไม่มีคำว่า staging/dev/test ใน URL — ตรวจสอบให้แน่ใจว่านี่คือ STAGING project จริงๆ ก่อนไปต่อ"
  );
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function usernameToStaffEmail(username) {
  return `${username.toLowerCase()}@${STAFF_EMAIL_DOMAIN}`;
}

async function upsertAuthUser({ email, password }) {
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!createErr) {
    console.log(`  ✅ สร้าง auth user ใหม่: ${email}`);
    return created.user;
  }

  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw listErr;

  const existing = list.users.find((u) => u.email === email);
  if (!existing) {
    throw new Error(`สร้าง ${email} ไม่สำเร็จ และหาไม่เจอใน listUsers: ${createErr.message}`);
  }

  await supabaseAdmin.auth.admin.updateUserById(existing.id, { password });
  console.log(`  ♻️  ${email} มีอยู่แล้ว — sync password ให้ตรงกับ .env`);
  return existing;
}

/** shops.owner_user_id เป็น NOT NULL ต้องมี user จริงก่อนถึงจะสร้าง shop ได้
 *  subscription_plan ตั้งเป็น 'enterprise' (maxMembers: null = unlimited) เพราะ
 *  shop นี้ต้องรองรับสมาชิกทดสอบหลายคน (owner+manager+3 staff = 5 คนแล้ว) ซึ่งเกิน
 *  cap ของ plan 'trial' (maxMembers: 3) ที่เป็นค่า default — ถ้าปล่อยเป็น trial
 *  test การสร้าง staff เพิ่ม (TC-401/403) จะ fail เพราะชนเพดานที่นั่ง ไม่ใช่บั๊กจริง
 *  ดู config/subscriptionTiers.js -> SUBSCRIPTION_TIERS, checkSeatLimit() ใน lib/teamAuth.js
 */
async function ensureTestShop(name, ownerUserId) {
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("shops")
    .select("shop_id")
    .eq("shop_name", name)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing) {
    // sync plan ทุกครั้งเผื่อ shop นี้เคยถูกสร้างไว้ก่อนจะมี fix นี้
    await supabaseAdmin
      .from("shops")
      .update({ subscription_plan: "enterprise", subscription_status: "active" })
      .eq("shop_id", existing.shop_id);
    return existing.shop_id;
  }

  const { data: created, error } = await supabaseAdmin
    .from("shops")
    .insert({
      shop_name: name,
      owner_user_id: ownerUserId,
      subscription_plan: "enterprise",
      subscription_status: "active",
    })
    .select("shop_id")
    .single();
  if (error) throw error;
  console.log(`  ✅ สร้าง shop ใหม่: "${name}" (shop_id=${created.shop_id}, plan=enterprise/unlimited seats)`);
  return created.shop_id;
}

async function upsertShopMember({ userId, shopId, role, status = "active", loginUsername = null }) {
  const { data: existing, error: findErr } = await supabaseAdmin
    .from("shop_members")
    .select("member_id")
    .eq("user_id", userId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing) {
    const { error } = await supabaseAdmin
      .from("shop_members")
      .update({ role, status, login_username: loginUsername })
      .eq("member_id", existing.member_id);
    if (error) throw error;
    console.log(`  ♻️  shop_members อัปเดตแล้ว (role=${role}, status=${status})`);
  } else {
    const { error } = await supabaseAdmin.from("shop_members").insert({
      user_id: userId,
      shop_id: shopId,
      role,
      status,
      login_username: loginUsername,
    });
    if (error) throw error;
    console.log(`  ✅ shop_members สร้างใหม่ (role=${role}, status=${status})`);
  }
}

async function main() {
  console.log("== Setup test data: parts-inventory staging ==\n");

  // ---- owner (สร้าง auth user ก่อน เพราะ shops.owner_user_id ต้องอ้างอิง user ที่มีอยู่จริง) ----
  console.log("[owner]");
  const owner = await upsertAuthUser({
    email: process.env.TEST_OWNER_EMAIL,
    password: process.env.TEST_OWNER_PASSWORD,
  });
  const shopId = await ensureTestShop("QA Test Shop (auto)", owner.id);
  await upsertShopMember({ userId: owner.id, shopId, role: "owner" });

  // ---- manager ----
  console.log("[manager]");
  const manager = await upsertAuthUser({
    email: process.env.TEST_MANAGER_EMAIL,
    password: process.env.TEST_MANAGER_PASSWORD,
  });
  await upsertShopMember({ userId: manager.id, shopId, role: "manager" });

  // ---- supervisor / technician / assistant (synthetic email) ----
  for (const [label, envPrefix, role] of [
    ["supervisor", "SUPERVISOR", "supervisor"],
    ["technician", "TECHNICIAN", "technician"],
    ["assistant", "ASSISTANT", "assistant"],
  ]) {
    console.log(`[${label}]`);
    const username = process.env[`TEST_${envPrefix}_USERNAME`];
    const pin = process.env[`TEST_${envPrefix}_PIN`];
    const staffEmail = usernameToStaffEmail(username);
    const user = await upsertAuthUser({ email: staffEmail, password: pin });
    await upsertShopMember({ userId: user.id, shopId, role, loginUsername: username });
  }

  // ---- owner + platform_admin (แยกอู่ของตัวเองไปเลย กันชนกับ owner หลัก) ----
  console.log("[owner + platform_admin]");
  const ownerPA = await upsertAuthUser({
    email: process.env.TEST_OWNER_PLATFORMADMIN_EMAIL,
    password: process.env.TEST_OWNER_PLATFORMADMIN_PASSWORD,
  });
  const shopIdPaOnly = await ensureTestShop("QA Platform-Admin Owner Shop (auto)", ownerPA.id);
  await upsertShopMember({ userId: ownerPA.id, shopId: shopIdPaOnly, role: "owner" });
  const { error: paErr } = await supabaseAdmin
    .from("platform_admins")
    .upsert({ user_id: ownerPA.id }, { onConflict: "user_id" });
  if (paErr) throw paErr;
  console.log("  ✅ เพิ่มแถวใน platform_admins แล้ว");

  // ---- multi-shop owner (TC-007): owner ของ shop A, manager ของ shop B ----
  console.log("[owner - multi shop]");
  const shopIdB = await ensureTestShop("QA Test Shop B (multi-shop, auto)", owner.id);
  await upsertShopMember({ userId: owner.id, shopId: shopIdB, role: "manager" });
  console.log(`  ✅ owner หลักตอนนี้เป็น owner ที่ shop A (${shopId}) และ manager ที่ shop B (${shopIdB})`);

  // ---- disabled owner (TC-106) ----
  // isDisabledAccount = true เมื่อมีแถวใน shop_members อยู่จริงแต่ไม่มีแถวไหน status='active' เลย
  console.log("[disabled owner]");
  const disabledOwner = await upsertAuthUser({
    email: process.env.TEST_DISABLED_OWNER_EMAIL,
    password: process.env.TEST_DISABLED_OWNER_PASSWORD,
  });
  const disabledShopId = await ensureTestShop("QA Disabled Shop (auto)", disabledOwner.id);
  await upsertShopMember({
    userId: disabledOwner.id,
    shopId: disabledShopId,
    role: "owner",
    status: "disabled", // <-- นี่คือ key จริง ไม่ใช่ shops.subscription_status
  });
  console.log("  ✅ ตั้ง shop_members.status='disabled' แล้ว -> isDisabledAccount จะเป็น true ตอน login");

  // ---- new user, no membership at all (TC-107) ----
  console.log("[new user - no membership]");
  await upsertAuthUser({
    email: process.env.TEST_NEWUSER_EMAIL,
    password: process.env.TEST_NEWUSER_PASSWORD,
  });
  console.log("  ✅ สร้าง auth user แล้ว ไม่ insert shop_members ใดๆ (ตั้งใจเว้นว่างไว้)");

  // ---- concurrent-session test shop (TC-302) ----
  // ต้องแยก shop ต่างหากจาก QA Test Shop หลัก เพราะ shop หลักตั้งเป็น 'enterprise'
  // (maxConcurrentSessions: null = unlimited) ซึ่งจะทำให้ทดสอบเพดานไม่ได้เลย
  // shop นี้ปล่อยเป็น default 'trial' ตั้งใจ -> maxConcurrentSessions = 3, maxMembers = 3
  console.log("[concurrent-session test shop]");
  const concurrentUsers = [];
  for (let i = 0; i < 4; i++) {
    const envN = i + 1;
    const u = await upsertAuthUser({
      email: process.env[`TEST_CONCURRENT${envN}_EMAIL`],
      password: process.env[`TEST_CONCURRENT${envN}_PASSWORD`],
    });
    concurrentUsers.push(u);
  }
  // คนแรกเป็น owner (ต้องมี auth user ก่อนถึงสร้าง shop ได้ตาม owner_user_id NOT NULL)
  const { data: existingConcShop } = await supabaseAdmin
    .from("shops")
    .select("shop_id")
    .eq("shop_name", "QA Concurrent-Session Shop (auto)")
    .maybeSingle();

  let concurrentShopId;
  if (existingConcShop) {
    concurrentShopId = existingConcShop.shop_id;
    // อย่า sync plan เป็น enterprise ที่นี่ — shop นี้ต้องเป็น trial ตั้งใจ
  } else {
    const { data: createdConcShop, error: concShopErr } = await supabaseAdmin
      .from("shops")
      .insert({
        shop_name: "QA Concurrent-Session Shop (auto)",
        owner_user_id: concurrentUsers[0].id,
        subscription_plan: "trial",
        subscription_status: "trialing",
      })
      .select("shop_id")
      .single();
    if (concShopErr) throw concShopErr;
    concurrentShopId = createdConcShop.shop_id;
  }
  console.log(`  ✅ shop_id=${concurrentShopId} (plan=trial, maxConcurrentSessions=3)`);

  const concurrentRoles = ["owner", "manager", "supervisor", "technician"];
  for (let i = 0; i < concurrentUsers.length; i++) {
    await upsertShopMember({
      userId: concurrentUsers[i].id,
      shopId: concurrentShopId,
      role: concurrentRoles[i],
    });
  }
  console.log(
    "  ✅ ตั้ง 4 คนเป็นสมาชิก shop นี้แล้ว (คนที่ 4 ใช้ยืนยันว่าโดนบล็อกตอนคนที่ 3 login พร้อมกันอยู่แล้ว)"
  );

  console.log("\n✅ Setup test data เสร็จสมบูรณ์");
  console.log(
    `\nสรุป shop_id ที่ใช้:\n  Shop A (หลัก): ${shopId}\n  Shop B (multi-shop): ${shopIdB}\n  Platform-admin owner shop: ${shopIdPaOnly}\n  Disabled shop: ${disabledShopId}\n  Concurrent-session shop: ${concurrentShopId}`
  );

  // ---- visibility group สำหรับเทสต์ job creation (JOB-201/204/205/801) ----
  // ⚠️ ห่อด้วย try/catch เพราะ db/visibility_groups_and_workflow_schema.sql (ไฟล์ที่ README
  // ของโปรเจกต์บอกว่าต้องรัน) หายไปจาก repo จริง — เราไม่มีทางยืนยัน 100% จาก repo อย่างเดียวว่า
  // ตาราง visibility_groups/visibility_group_members มีอยู่จริงใน staging หรือเปล่า
  // ถ้า query fail เพราะตารางไม่มีจริง ให้ setup ที่เหลือเดินต่อได้ปกติ แค่ print คำเตือนไว้
  console.log("\n[visibility group สำหรับ job-creation tests]");
  try {
    const { data: existingGroup } = await supabaseAdmin
      .from("visibility_groups")
      .select("group_id")
      .eq("shop_id", shopId)
      .eq("name", "QA Test Group A")
      .maybeSingle();

    let groupId = existingGroup?.group_id;
    if (!groupId) {
      const { data: createdGroup, error: groupErr } = await supabaseAdmin
        .from("visibility_groups")
        .insert({ shop_id: shopId, name: "QA Test Group A" })
        .select("group_id")
        .single();
      if (groupErr) throw groupErr;
      groupId = createdGroup.group_id;
    }
    console.log(`  ✅ visibility_groups group_id=${groupId} ("QA Test Group A")`);

    // เพิ่ม supervisor เป็นสมาชิกกลุ่มนี้ (ใช้ทดสอบว่ากลุ่มกรองสิทธิ์เห็นงานถูกคนไหม)
    const { data: supervisorUser } = await supabaseAdmin
      .from("shop_members")
      .select("user_id")
      .eq("shop_id", shopId)
      .eq("login_username", process.env.TEST_SUPERVISOR_USERNAME)
      .maybeSingle();

    if (supervisorUser) {
      await supabaseAdmin
        .from("visibility_group_members")
        .upsert(
          { group_id: groupId, user_id: supervisorUser.user_id },
          { onConflict: "group_id,user_id" }
        );
      console.log("  ✅ เพิ่ม supervisor เป็นสมาชิกกลุ่มนี้แล้ว");
    }
  } catch (err) {
    console.warn(
      "  ⚠️  สร้าง visibility_groups ไม่สำเร็จ (อาจเป็นเพราะตารางนี้ไม่มีอยู่จริงใน staging —\n" +
        "      ดู README หัวข้อ 'บั๊ก/ช่องว่างที่เจอ' เรื่อง db/visibility_groups_and_workflow_schema.sql ที่หายไป):\n" +
        `      ${err.message}\n` +
        "      -> tests/job-creation-schema-preflight.spec.js จะ fail ให้เห็นชัดเจนตอนรัน suite"
    );
  }
}

main().catch((err) => {
  console.error("\n❌ Setup ล้มเหลว:", err.message);
  process.exit(1);
});
