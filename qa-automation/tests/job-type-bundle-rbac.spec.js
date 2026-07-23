// ------------------------------------------------------------
// การ์ด "Job Type Bundle Template" — RBAC/RLS coverage
// ------------------------------------------------------------
// ก่อนหน้านี้ (23 ก.ค. 2569) ฟีเจอร์นี้มี RLS policy จริงใน DB แล้ว (ตรงกับตารางสิทธิ์ที่
// ตกลงกันไว้ในการ์ด: owner/manager/admin manage, ทุก shop member รวม technician view ได้)
// แต่ qa-automation/tests/ ไม่มีไฟล์ test ให้เลยแม้แต่ไฟล์เดียว — ไฟล์นี้ปิด gap นั้น
//
// ทดสอบทั้ง 2 ระดับตามธรรมเนียมของ suite นี้ (ดู role-change-live.spec.js, TC-207):
// - DB-level: sign in ด้วย publishable key จริงแบบเดียวกับแอป แล้ว insert/update/delete ตรงๆ
//   ผ่าน RLS โดยไม่ผ่าน UI เลย เพื่อพิสูจน์ว่าความปลอดภัยอยู่ที่ DB policy ไม่ใช่แค่ UI ซ่อนปุ่ม
// - Page-level: เข้าหน้า /admin/job-type-bundles ตรงๆ ตรวจ RequireAuth allowedRoles
//
// role "admin" (7th role) ยังไม่มี account fixture ใน fixtures/test-data.js เลย (เพิ่งเพิ่ม
// เข้าระบบพร้อมฟีเจอร์นี้) — สร้าง auth user ชั่วคราวเฉพาะไฟล์นี้ใน beforeAll/ลบใน afterAll
// แทนที่จะไป "ยืม" ยกระดับ role ของ accounts.assistant/supervisor ชั่วคราว เพราะ suite นี้เปิด
// fullyParallel + workers=5 แล้ว (22 ก.ค. 2569) — ไฟล์อื่นจำนวนมาก (job-creation-rbac.spec.js,
// db-rls.spec.js, rbac.spec.js ฯลฯ) พึ่งพาว่า accounts.assistant คงเป็น role='assistant' ตลอด
// การรัน ถ้าไปเปลี่ยน role ของ account ที่ใช้ร่วมกันจะทำให้ไฟล์อื่นสุ่ม fail (race condition
// ข้ามไฟล์ที่รันพร้อมกันจริง) — ต้องใช้ account แยกเฉพาะเสมอสำหรับ role ใหม่ที่ยังไม่มี fixture

import { test, expect } from "@playwright/test";
import { loginWithEmail, loginWithStaffPin, expectLoginSucceeded, expectRoleForbidden } from "../fixtures/auth-helpers.js";
import { signInEmail, signInStaff, adminClient, getShopIdByName } from "../fixtures/db-client.js";
import { accounts, currentShopName } from "../fixtures/test-data.js";

const ADMIN_TEST_EMAIL = "qa-bundle-admin@staff.internal.partsinventory.app";
const ADMIN_TEST_PASSWORD = "QaBundleAdmin!2026";

let mainShopId;
let adminUserId;
let adminMemberId;
const createdTemplateIds = []; // เก็บไว้ลบทีเดียวตอน afterAll (job_type_bundle_items/variants มี on delete cascade)

test.beforeAll(async () => {
  mainShopId = await getShopIdByName(currentShopName);

  // สร้าง (หรือ reuse ถ้ามีจากรอบก่อนที่ afterAll เคลียร์ไม่ทัน) auth user สำหรับทดสอบ role=admin โดยเฉพาะ
  const { data: created, error: createErr } = await adminClient().auth.admin.createUser({
    email: ADMIN_TEST_EMAIL,
    password: ADMIN_TEST_PASSWORD,
    email_confirm: true,
  });
  if (createErr) {
    const { data: list } = await adminClient().auth.admin.listUsers({ page: 1, perPage: 500 });
    const existing = list.users.find((u) => u.email === ADMIN_TEST_EMAIL);
    if (!existing) throw new Error(`สร้าง ${ADMIN_TEST_EMAIL} ไม่สำเร็จ และหาไม่เจอใน listUsers: ${createErr.message}`);
    await adminClient().auth.admin.updateUserById(existing.id, { password: ADMIN_TEST_PASSWORD });
    adminUserId = existing.id;
  } else {
    adminUserId = created.user.id;
  }

  // ผูกเข้า shop เดียวกับ worker นี้ ด้วย role='admin' (upsert กันชนถ้ามีแถวค้างจากรอบก่อน)
  const { data: memberRow, error: memberErr } = await adminClient()
    .from("shop_members")
    .upsert(
      { shop_id: mainShopId, user_id: adminUserId, role: "admin", status: "active", login_username: null },
      { onConflict: "shop_id,user_id" }
    )
    .select("member_id")
    .single();
  if (memberErr) throw memberErr;
  adminMemberId = memberRow.member_id;
});

test.afterAll(async () => {
  for (const id of createdTemplateIds) {
    await adminClient().from("job_type_bundle_templates").delete().eq("template_id", id);
  }
  if (adminMemberId) await adminClient().from("shop_members").delete().eq("member_id", adminMemberId);
  if (adminUserId) await adminClient().auth.admin.deleteUser(adminUserId);
});

test.describe("BUNDLE-RBAC — DB level (RLS โดยตรง ข้าม UI)", () => {
  test("BUNDLE-RBAC-01 owner สร้าง/แก้ไข/ลบเซตได้ครบ (positive control)", async () => {
    const { client } = await signInEmail(accounts.owner.email, accounts.owner.password);
    const jobTypeName = `QA-BUNDLE-RBAC-owner-${Date.now()}`;

    const { data: inserted, error: insertError } = await client
      .from("job_type_bundle_templates")
      .insert({ shop_id: mainShopId, job_type_name: jobTypeName })
      .select("template_id")
      .single();
    expect(insertError).toBeNull();
    createdTemplateIds.push(inserted.template_id);

    const { error: updateError } = await client
      .from("job_type_bundle_templates")
      .update({ job_type_name: `${jobTypeName}-updated` })
      .eq("template_id", inserted.template_id);
    expect(updateError).toBeNull();

    const { error: deleteError } = await client
      .from("job_type_bundle_templates")
      .delete()
      .eq("template_id", inserted.template_id);
    expect(deleteError).toBeNull();
    createdTemplateIds.splice(createdTemplateIds.indexOf(inserted.template_id), 1); // ลบสำเร็จแล้ว ไม่ต้องเก็บไว้ cleanup ซ้ำ
  });

  test("BUNDLE-RBAC-02 manager สร้างเซตได้ (ตรงตาม policy owner/manager/admin)", async () => {
    const { client } = await signInEmail(accounts.manager.email, accounts.manager.password);
    const { data: inserted, error } = await client
      .from("job_type_bundle_templates")
      .insert({ shop_id: mainShopId, job_type_name: `QA-BUNDLE-RBAC-manager-${Date.now()}` })
      .select("template_id")
      .single();
    expect(error).toBeNull();
    createdTemplateIds.push(inserted.template_id);
  });

  test("BUNDLE-RBAC-03 admin (7th role) สร้างเซตได้ (role ใหม่ล่าสุดที่เพิ่มเข้า policy)", async () => {
    const { client } = await signInEmail(ADMIN_TEST_EMAIL, ADMIN_TEST_PASSWORD);
    const { data: inserted, error } = await client
      .from("job_type_bundle_templates")
      .insert({ shop_id: mainShopId, job_type_name: `QA-BUNDLE-RBAC-admin-${Date.now()}` })
      .select("template_id")
      .single();
    expect(error, "role=admin ควรสร้างเซตได้ตาม RLS policy 'owner/manager/admin can manage'").toBeNull();
    createdTemplateIds.push(inserted.template_id);
  });

  test("BUNDLE-RBAC-04 technician สร้างเซตตรงๆ ผ่าน RLS ไม่ได้ (ต้อง error, ไม่ใช่แค่ UI ซ่อนปุ่ม)", async () => {
    const { client } = await signInStaff(accounts.technician.username, accounts.technician.pin);
    const { data, error } = await client
      .from("job_type_bundle_templates")
      .insert({ shop_id: mainShopId, job_type_name: `QA-BUNDLE-RBAC-technician-should-fail-${Date.now()}` })
      .select("template_id")
      .single();
    expect(error, "technician ไม่อยู่ใน policy 'manage' ควรถูก RLS ปฏิเสธ").not.toBeNull();
    if (data?.template_id) createdTemplateIds.push(data.template_id); // กันหลุดถ้าเผลอผ่านจริง จะได้ cleanup ทัน
  });

  test("BUNDLE-RBAC-05 supervisor สร้างเซตตรงๆ ผ่าน RLS ไม่ได้เช่นกัน", async () => {
    const { client } = await signInStaff(accounts.supervisor.username, accounts.supervisor.pin);
    const { data, error } = await client
      .from("job_type_bundle_templates")
      .insert({ shop_id: mainShopId, job_type_name: `QA-BUNDLE-RBAC-supervisor-should-fail-${Date.now()}` })
      .select("template_id")
      .single();
    expect(error, "supervisor ไม่อยู่ใน policy 'manage' ควรถูก RLS ปฏิเสธ").not.toBeNull();
    if (data?.template_id) createdTemplateIds.push(data.template_id);
  });

  test("BUNDLE-RBAC-06 assistant สร้างเซตตรงๆ ผ่าน RLS ไม่ได้เช่นกัน", async () => {
    const { client } = await signInStaff(accounts.assistant.username, accounts.assistant.pin);
    const { data, error } = await client
      .from("job_type_bundle_templates")
      .insert({ shop_id: mainShopId, job_type_name: `QA-BUNDLE-RBAC-assistant-should-fail-${Date.now()}` })
      .select("template_id")
      .single();
    expect(error, "assistant ไม่อยู่ใน policy 'manage' ควรถูก RLS ปฏิเสธ").not.toBeNull();
    if (data?.template_id) createdTemplateIds.push(data.template_id);
  });

  test("BUNDLE-RBAC-07 technician SELECT (view) เซตที่มีอยู่ได้ปกติ (ไม่ได้ถูกบล็อกทั้งหมด แค่แก้ไขไม่ได้)", async () => {
    const { client: ownerClient } = await signInEmail(accounts.owner.email, accounts.owner.password);
    const jobTypeName = `QA-BUNDLE-RBAC-view-${Date.now()}`;
    const { data: inserted, error: insertError } = await ownerClient
      .from("job_type_bundle_templates")
      .insert({ shop_id: mainShopId, job_type_name: jobTypeName })
      .select("template_id")
      .single();
    expect(insertError).toBeNull();
    createdTemplateIds.push(inserted.template_id);

    const { client: technicianClient } = await signInStaff(accounts.technician.username, accounts.technician.pin);
    const { data: seen, error: viewError } = await technicianClient
      .from("job_type_bundle_templates")
      .select("template_id, job_type_name")
      .eq("template_id", inserted.template_id);
    expect(viewError).toBeNull();
    expect(seen, "technician ควรเห็นเซตนี้ได้ (policy view ครอบคลุมทุก shop role รวม technician)").toHaveLength(1);
  });
});

test.describe("BUNDLE-RBAC — Page level (/admin/job-type-bundles)", () => {
  test("BUNDLE-RBAC-08 technician เข้าหน้า /admin/job-type-bundles ไม่ได้ เห็นข้อความ role forbidden", async ({ page }) => {
    await loginWithStaffPin(page, accounts.technician.username, accounts.technician.pin);
    await expectLoginSucceeded(page);
    await page.goto("/admin/job-type-bundles");
    await expectRoleForbidden(page, "technician");
  });

  test("BUNDLE-RBAC-09 supervisor เข้าหน้า /admin/job-type-bundles ไม่ได้เช่นกัน (ไม่อยู่ใน allowedRoles)", async ({ page }) => {
    await loginWithStaffPin(page, accounts.supervisor.username, accounts.supervisor.pin);
    await expectLoginSucceeded(page);
    await page.goto("/admin/job-type-bundles");
    await expectRoleForbidden(page, "supervisor");
  });

  test("BUNDLE-RBAC-10 owner เข้าหน้า /admin/job-type-bundles ได้ปกติ เห็นปุ่ม '+ สร้างเซตใหม่'", async ({ page }) => {
    await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
    await expectLoginSucceeded(page);
    await page.goto("/admin/job-type-bundles");
    await expect(page.getByRole("button", { name: "+ สร้างเซตใหม่" })).toBeVisible();
  });

  test("BUNDLE-RBAC-11 admin (7th role) เข้าหน้า /admin/job-type-bundles ได้ปกติ", async ({ page }) => {
    await loginWithEmail(page, ADMIN_TEST_EMAIL, ADMIN_TEST_PASSWORD);
    await expectLoginSucceeded(page);
    await page.goto("/admin/job-type-bundles");
    await expect(page.getByRole("button", { name: "+ สร้างเซตใหม่" })).toBeVisible();
  });
});
