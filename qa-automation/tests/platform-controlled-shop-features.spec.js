// การ์ด "Platform-controlled shop features" (24 ก.ค. 2026)
//
// 3 อย่างที่เดิม owner/manager กดเองได้จาก /admin ย้ายมาเป็น platform-admin only:
//   1. shops.force_zone_scan_confirmation ("บังคับสแกน QR ยืนยันตำแหน่ง")
//   2. shops.branches_feature_enabled (เกตใหม่ก่อนสร้างสาขาที่ 2 ขึ้นไปได้ — AND กับ tier limit เดิม)
//   3. shops.accounting_module_enabled ("โมดูลบัญชี")
//
// ครอบคลุม (ตาม convention ของโปรเจกต์นี้ "เช็คทั้ง UI-hiding layer และ API/RPC-enforcement layer
// เสมอ" — ไฟล์นี้เน้น API/RPC-enforcement layer เป็นหลัก เพราะ UI-hiding layer (ปุ่ม toggle
// disabled/read-only ตาม role, ซ่อนการ์ด "จัดการสาขา" ที่ /admin) ตรวจแล้วด้วยมือผ่าน browser จริง
// ระหว่างพัฒนา — ดู README/SOP สำหรับหมายเหตุ):
//   - shop owner/manager เรียก RPC ตรงๆ (set_accounting_module_enabled, platform_set_shop_feature)
//     หรือ UPDATE shops คอลัมน์พวกนี้ตรงๆ แบบเก่า -> ถูกปฏิเสธทั้งหมด
//   - non-platform-admin เรียก /api/platform/shops/[shopId]/features และ /accounting-module -> 403
//   - analyst: 403 บน mutation ทั้งหมด, 200 บน GET /api/platform/shops/[shopId]/branches
//   - support: สร้าง/เปลี่ยนชื่อสาขาได้ (เมื่อ branches_feature_enabled=true) แต่ 403 บน
//     /features และ /accounting-module
//   - super_admin: ทำได้ทุกอย่าง รวมถึง toggle branches_feature_enabled เอง
//   - AND-gate: branches_feature_enabled=false -> 400 (ไม่ใช่ 403/500); ติด tier maxBranches แม้
//     flag เปิดอยู่ก็ยังถูกบล็อก (ทั้ง 2 เงื่อนไขต้องผ่านพร้อมกัน)
//
// หมายเหตุสำคัญเรื่อง test account (24 ก.ค. 2026 — พบระหว่างพัฒนาไฟล์นี้จริง): staging Supabase
// project นี้มีช่วง auth.admin.createUser()/deleteUser() (endpoint /admin/users ของ GoTrue) ล้มเหลว
// เป็นพักๆ ด้วย error "invalid JWT ... unrecognized JWT kid <nil> for algorithm ES256" — ยืนยันจาก
// Supabase auth service logs ว่าเกิดกับ traffic จากที่อื่น (referer อื่นที่ไม่ใช่ test นี้) ด้วย
// เป็นปัญหาโครงสร้างพื้นฐานระดับ project (JWT signing key/JWKS) ไม่เกี่ยวกับโค้ดการ์ดนี้เลย —
// ไฟล์นี้จึง **หลีกเลี่ยงการสร้าง auth user ใหม่ทั้งหมด** (ไม่เรียก auth.admin.createUser/deleteUser
// เลยสักครั้ง) โดยยืม account ที่มีอยู่แล้วในระบบมาใช้แทน (sign in ด้วย anon key ธรรมดาผ่าน
// signInEmail() ซึ่งไม่ผ่าน endpoint ที่มีปัญหานี้เลย):
//   - shop owner persona   -> accounts.owner (มีอยู่แล้ว ไม่ใช่ platform admin)
//   - super_admin persona  -> accounts.ownerPlatformAdmin (มีอยู่แล้ว ยืนยัน role='super_admin' จริง)
//   - support persona      -> accounts.manager (มีอยู่แล้ว) + grant platform_admins.role='support'
//     ชั่วคราว (insert เฉพาะแถวใน platform_admins ไม่แตะ auth.users/shop_members เดิมของเขาเลย)
//   - analyst persona      -> accounts.disabledOwner (มีอยู่แล้ว) + grant role='analyst' ชั่วคราว
// afterAll ลบแถว platform_admins ที่ grant ชั่วคราวทิ้งเท่านั้น (ไม่ลบ auth user ใดๆ ทั้งสิ้น —
// ไม่จำเป็นต้องเรียก endpoint ที่มีปัญหาเลยทั้งไฟล์)
import { test, expect } from "@playwright/test";
import { adminClient, signInEmail } from "../fixtures/db-client.js";
import { accounts } from "../fixtures/test-data.js";

const RUN_ID = Date.now();

async function tokenAndUserIdFor(email, password) {
  const { client, userId } = await signInEmail(email, password);
  const {
    data: { session },
  } = await client.auth.getSession();
  return { token: session.access_token, userId };
}

async function grantPlatformRole(userId, role) {
  const { error } = await adminClient().from("platform_admins").upsert({ user_id: userId, role }, { onConflict: "user_id" });
  if (error) throw error;
}

async function revokePlatformRole(userId) {
  await adminClient().from("platform_admins").delete().eq("user_id", userId);
}

test.describe.configure({ mode: "serial" }); // หลาย test ในไฟล์นี้แชร์ shop/branch state เดียวกัน ต้องรันเรียงลำดับ

test.describe("Platform-controlled shop features", () => {
  let shopId;
  let defaultBranchId;
  let ownerUserId, ownerToken;
  let superAdminToken;
  let supportUserId, supportToken;
  let analystUserId, analystToken;

  test.beforeAll(async () => {
    const owner = await tokenAndUserIdFor(accounts.owner.email, accounts.owner.password);
    ownerUserId = owner.userId;
    ownerToken = owner.token;

    const superAdmin = await tokenAndUserIdFor(accounts.ownerPlatformAdmin.email, accounts.ownerPlatformAdmin.password);
    superAdminToken = superAdmin.token;
    // ยืนยันว่า account นี้เป็น super_admin จริง (ไม่ใช่แค่ assumption) ก่อนใช้ทั้งไฟล์
    const { data: paRow } = await adminClient().from("platform_admins").select("role").eq("user_id", superAdmin.userId).single();
    expect(paRow.role).toBe("super_admin");

    const support = await tokenAndUserIdFor(accounts.manager.email, accounts.manager.password);
    supportUserId = support.userId;
    await grantPlatformRole(supportUserId, "support");
    supportToken = (await tokenAndUserIdFor(accounts.manager.email, accounts.manager.password)).token;

    const analyst = await tokenAndUserIdFor(accounts.disabledOwner.email, accounts.disabledOwner.password);
    analystUserId = analyst.userId;
    await grantPlatformRole(analystUserId, "analyst");
    analystToken = (await tokenAndUserIdFor(accounts.disabledOwner.email, accounts.disabledOwner.password)).token;

    // Pro tier (maxBranches=2) — พอสำหรับพิสูจน์ทั้ง "สร้างสาขาที่ 2 ได้" และ "สาขาที่ 3 โดน tier
    // limit บล็อก แม้ branches_feature_enabled=true" (AND-gate) ในไฟล์เดียว
    const { data: shop, error: shopErr } = await adminClient()
      .from("shops")
      .insert({
        shop_name: `QA PlatformFeatures ${RUN_ID}`,
        owner_user_id: ownerUserId,
        subscription_plan: "pro",
        subscription_status: "active",
        branches_feature_enabled: false, // เริ่มที่ false เสมอ (default ของฟีเจอร์ใหม่)
      })
      .select("shop_id")
      .single();
    expect(shopErr).toBeNull();
    shopId = shop.shop_id;

    const { data: branch, error: branchErr } = await adminClient()
      .from("branches")
      .insert({ shop_id: shopId, branch_code: "00000", branch_name: "สาขาหลัก", is_default: true })
      .select("branch_id")
      .single();
    expect(branchErr).toBeNull();
    defaultBranchId = branch.branch_id;

    // accounts.owner เป็นเจ้าของร้านอื่นอยู่แล้ว (multi-shop support — ดู pattern เดียวกับ TC-007
    // ใน setup-test-data.mjs) เพิ่มแถวใหม่อีกร้าน (ร้านทดสอบของไฟล์นี้) ไม่กระทบร้านเดิมของเขาเลย
    await adminClient()
      .from("shop_members")
      .insert({ shop_id: shopId, user_id: ownerUserId, role: "owner", status: "active", branch_id: defaultBranchId });
  });

  test.afterAll(async () => {
    await revokePlatformRole(supportUserId);
    await revokePlatformRole(analystUserId);
    if (shopId) {
      await adminClient().from("shop_members").delete().eq("shop_id", shopId);
      await adminClient().from("branches").delete().eq("shop_id", shopId);
      await adminClient().from("shops").delete().eq("shop_id", shopId);
    }
  });

  // ------------------------------------------------------------
  // ชั้น RPC/DB — shop owner (ไม่มีแถวใน platform_admins เลย) เรียกตรงๆ ต้องถูกปฏิเสธเสมอ
  // ------------------------------------------------------------
  test("shop owner เรียก RPC set_accounting_module_enabled ตรงๆ ถูกปฏิเสธ (revoke จาก authenticated แล้ว)", async () => {
    const { client } = await signInEmail(accounts.owner.email, accounts.owner.password);
    const { error } = await client.rpc("set_accounting_module_enabled", {
      p_actor_user_id: ownerUserId,
      p_shop_id: shopId,
      p_enabled: true,
    });
    expect(error).not.toBeNull();

    const { data: check } = await adminClient().from("shops").select("accounting_module_enabled").eq("shop_id", shopId).single();
    expect(check.accounting_module_enabled).toBe(false);
  });

  test("shop owner เรียก RPC platform_set_shop_feature ตรงๆ ถูกปฏิเสธ (revoke จาก authenticated แล้ว)", async () => {
    const { client } = await signInEmail(accounts.owner.email, accounts.owner.password);
    const { error } = await client.rpc("platform_set_shop_feature", {
      p_actor_user_id: ownerUserId,
      p_shop_id: shopId,
      p_feature: "force_zone_scan_confirmation",
      p_enabled: true,
    });
    expect(error).not.toBeNull();
  });

  test("shop owner UPDATE shops.force_zone_scan_confirmation ตรงๆ แบบเก่ายังคงล้มเหลว (ไม่เคยมี column-level UPDATE grant)", async () => {
    const { client } = await signInEmail(accounts.owner.email, accounts.owner.password);
    const { error } = await client.from("shops").update({ force_zone_scan_confirmation: true }).eq("shop_id", shopId);
    expect(error).not.toBeNull();

    const { data: check } = await adminClient().from("shops").select("force_zone_scan_confirmation").eq("shop_id", shopId).single();
    expect(check.force_zone_scan_confirmation).toBe(false);
  });

  // ------------------------------------------------------------
  // ชั้น API — non-platform-admin (shop owner ธรรมดา) โดน 403 ทุก endpoint ใหม่
  // ------------------------------------------------------------
  test("non-platform-admin (shop owner) เรียก PATCH /api/platform/shops/[shopId]/features ได้ 403", async ({ request, baseURL }) => {
    const res = await request.patch(`${baseURL}/api/platform/shops/${shopId}/features`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: { feature: "force_zone_scan_confirmation", enabled: true },
    });
    expect(res.status()).toBe(403);
  });

  test("non-platform-admin (shop owner) เรียก POST /api/platform/shops/[shopId]/accounting-module ได้ 403", async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}/api/platform/shops/${shopId}/accounting-module`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: { enabled: true },
    });
    expect(res.status()).toBe(403);
  });

  test("non-platform-admin (shop owner) เรียก POST /api/branches ได้ 403 (จัดการสาขาย้ายไป platform-admin หมดแล้ว)", async ({
    request,
    baseURL,
  }) => {
    const res = await request.post(`${baseURL}/api/branches`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
      data: { shop_id: shopId, branch_name: `should-not-create-${RUN_ID}` },
    });
    expect(res.status()).toBe(403);
  });

  test("GET /api/branches (branch switcher เดิม) ยังทำงานปกติสำหรับ shop owner — ไม่ถูกแตะต้อง", async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/api/branches?shop_id=${shopId}`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.branches.some((b) => b.branch_id === defaultBranchId)).toBe(true);
  });

  // ------------------------------------------------------------
  // analyst — read-only ทุกจุด: 403 บน mutation, 200 บน branches GET
  // ------------------------------------------------------------
  test("analyst โดน 403 เมื่อ PATCH /features", async ({ request, baseURL }) => {
    const res = await request.patch(`${baseURL}/api/platform/shops/${shopId}/features`, {
      headers: { Authorization: `Bearer ${analystToken}` },
      data: { feature: "branches_feature_enabled", enabled: true },
    });
    expect(res.status()).toBe(403);
  });

  test("analyst โดน 403 เมื่อ POST /accounting-module", async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}/api/platform/shops/${shopId}/accounting-module`, {
      headers: { Authorization: `Bearer ${analystToken}` },
      data: { enabled: true },
    });
    expect(res.status()).toBe(403);
  });

  test("analyst โดน 403 เมื่อ POST /api/branches (สร้างสาขา)", async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}/api/branches`, {
      headers: { Authorization: `Bearer ${analystToken}` },
      data: { shop_id: shopId, branch_name: `should-not-create-analyst-${RUN_ID}` },
    });
    expect(res.status()).toBe(403);
  });

  test("analyst เห็น GET /api/platform/shops/[shopId]/branches ได้ (200, read-only)", async ({ request, baseURL }) => {
    const res = await request.get(`${baseURL}/api/platform/shops/${shopId}/branches`, {
      headers: { Authorization: `Bearer ${analystToken}` },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.some((b) => b.branch_id === defaultBranchId)).toBe(true);
  });

  // ------------------------------------------------------------
  // AND-gate: branches_feature_enabled=false -> 400 ชัดเจน (ไม่ใช่ 403/500) แม้ platform admin
  // ที่มี role ถูกต้อง (support) พยายามสร้างสาขาที่ 2
  // ------------------------------------------------------------
  test("support พยายามสร้างสาขาที่ 2 ตอน branches_feature_enabled=false ได้ 400 (ไม่ใช่ 403/500) พร้อมข้อความชัดเจน", async ({
    request,
    baseURL,
  }) => {
    const res = await request.post(`${baseURL}/api/branches`, {
      headers: { Authorization: `Bearer ${supportToken}` },
      data: { shop_id: shopId, branch_name: `should-not-create-${RUN_ID}` },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("ฟีเจอร์สาขา");
  });

  // ------------------------------------------------------------
  // support: 403 บน billing-adjacent endpoints (/features, /accounting-module) — งาน routine
  // (branch CRUD) ทำได้ แต่ entitlement flags ทำไม่ได้ (permission matrix ของการ์ดนี้)
  // ------------------------------------------------------------
  test("support โดน 403 เมื่อ PATCH /features (ไม่ใช่ billing role)", async ({ request, baseURL }) => {
    const res = await request.patch(`${baseURL}/api/platform/shops/${shopId}/features`, {
      headers: { Authorization: `Bearer ${supportToken}` },
      data: { feature: "branches_feature_enabled", enabled: true },
    });
    expect(res.status()).toBe(403);
  });

  test("support โดน 403 เมื่อ POST /accounting-module (ไม่ใช่ billing role)", async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}/api/platform/shops/${shopId}/accounting-module`, {
      headers: { Authorization: `Bearer ${supportToken}` },
      data: { enabled: true },
    });
    expect(res.status()).toBe(403);
  });

  // ------------------------------------------------------------
  // super_admin: เปิด branches_feature_enabled เอง (ผ่าน /features) แล้ว support สร้าง/เปลี่ยน
  // ชื่อสาขาได้จริง — ทั้งสองบทบาททำงานร่วมกันตาม permission matrix
  // ------------------------------------------------------------
  let secondBranchId;

  test("super_admin เปิด branches_feature_enabled ผ่าน /api/platform/shops/[shopId]/features สำเร็จ (200) และ DB อัปเดตจริง", async ({
    request,
    baseURL,
  }) => {
    const res = await request.patch(`${baseURL}/api/platform/shops/${shopId}/features`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
      data: { feature: "branches_feature_enabled", enabled: true },
    });
    expect(res.status()).toBe(200);

    const { data: shopRow } = await adminClient().from("shops").select("branches_feature_enabled").eq("shop_id", shopId).single();
    expect(shopRow.branches_feature_enabled).toBe(true);

    const { data: auditRow } = await adminClient()
      .from("platform_audit_log")
      .select("action, new_data")
      .eq("target_shop_id", shopId)
      .eq("action", "set_feature")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(auditRow.new_data.feature).toBe("branches_feature_enabled");
    expect(auditRow.new_data.enabled).toBe(true);
  });

  test("support สร้างสาขาที่ 2 ได้สำเร็จ (200) ตอนนี้ branches_feature_enabled=true แล้ว", async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}/api/branches`, {
      headers: { Authorization: `Bearer ${supportToken}` },
      data: { shop_id: shopId, branch_name: `QA-PCF-Branch2-${RUN_ID}` },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    secondBranchId = json.data.branch_id;
    expect(secondBranchId).toBeTruthy();
  });

  test("support เปลี่ยนชื่อสาขาได้สำเร็จ (PATCH /api/branches/[id])", async ({ request, baseURL }) => {
    expect(secondBranchId).toBeTruthy();
    const res = await request.patch(`${baseURL}/api/branches/${secondBranchId}`, {
      headers: { Authorization: `Bearer ${supportToken}` },
      data: { branch_name: `QA-PCF-Branch2-Renamed-${RUN_ID}` },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data.branch_name).toBe(`QA-PCF-Branch2-Renamed-${RUN_ID}`);
  });

  // ------------------------------------------------------------
  // AND-gate ส่วนที่ 2: branches_feature_enabled=true อยู่แล้ว แต่ tier limit (Pro=2) ยังบล็อก
  // สาขาที่ 3 อยู่ดี — พิสูจน์ว่า 2 เงื่อนไขเป็นอิสระต่อกัน (ไม่ใช่ OR)
  // ------------------------------------------------------------
  test("super_admin พยายามสร้างสาขาที่ 3 (เกิน tier limit ของ Pro=2) ถูกบล็อกด้วย 400 แม้ branches_feature_enabled=true", async ({
    request,
    baseURL,
  }) => {
    const res = await request.post(`${baseURL}/api/branches`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
      data: { shop_id: shopId, branch_name: `QA-PCF-Branch3-ShouldFail-${RUN_ID}` },
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("ขีดจำกัด");

    const { count } = await adminClient().from("branches").select("branch_id", { count: "exact", head: true }).eq("shop_id", shopId);
    expect(count).toBe(2); // ยังคงมีแค่ 2 สาขา (หลัก + ที่ support สร้าง) ไม่ใช่ 3
  });

  // ------------------------------------------------------------
  // super_admin: เปิดโมดูลบัญชีได้ (Pro tier ผ่าน tier gate ของ RPC เอง) — ตรวจ response shape
  // คืน backfilled_count ให้ UI แสดงข้อความ "backfill X รายการ" แบบเดียวกับการ์ดเดิม
  // ------------------------------------------------------------
  test("super_admin เปิดโมดูลบัญชีผ่าน /api/platform/shops/[shopId]/accounting-module สำเร็จ (200) คืน backfilled_count", async ({
    request,
    baseURL,
  }) => {
    const res = await request.post(`${baseURL}/api/platform/shops/${shopId}/accounting-module`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
      data: { enabled: true },
    });
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveProperty("backfilled_count");
    expect(typeof json.data.backfilled_count).toBe("number");

    const { data: shopRow } = await adminClient().from("shops").select("accounting_module_enabled").eq("shop_id", shopId).single();
    expect(shopRow.accounting_module_enabled).toBe(true);
  });

  test("super_admin ปิดโมดูลบัญชีกลับได้เช่นกัน (200)", async ({ request, baseURL }) => {
    const res = await request.post(`${baseURL}/api/platform/shops/${shopId}/accounting-module`, {
      headers: { Authorization: `Bearer ${superAdminToken}` },
      data: { enabled: false },
    });
    expect(res.status()).toBe(200);

    const { data: shopRow } = await adminClient().from("shops").select("accounting_module_enabled").eq("shop_id", shopId).single();
    expect(shopRow.accounting_module_enabled).toBe(false);
  });
});
