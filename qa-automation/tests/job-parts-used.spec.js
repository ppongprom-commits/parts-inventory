// การ์ด "เบิกอะไหล่จาก generic stock (quantity > 1) ไปใช้กับงาน — job_parts_used"
// (Notion page 3a4f39f45649813e9d39f9c612eb8c6b) — 24 ก.ค. 2026
// UI: app/jobs/[id]/page.js ส่วน "🔧 เบิกอะไหล่จากสต็อกมาใช้กับงานนี้"
// DB: db/job_parts_used_migration.sql (ตาราง job_parts_used + RLS + reuse deduct_part_stock RPC)
import { test, expect } from "@playwright/test";
import { loginWithEmail, loginWithStaffPin, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { adminClient, getShopIdByName, signInStaff } from "../fixtures/db-client.js";
import { accounts, currentShopName } from "../fixtures/test-data.js";

let mainShopId;
let foreignShopId; // "อู่คนอื่น" ตาม pattern เดียวกับ db-rls.spec.js (TC-206) — ใช้เช็ค cross-tenant
const partIds = [];
const jobIds = [];

test.beforeAll(async () => {
  mainShopId = await getShopIdByName(currentShopName);
  foreignShopId = await getShopIdByName("QA Platform-Admin Owner Shop (auto)");
});

test.afterAll(async () => {
  // ลบ job_parts_used ก่อน (FK อ้าง jobs/parts) แล้วค่อยลบ parts/jobs
  if (partIds.length) await adminClient().from("job_parts_used").delete().in("part_id", partIds);
  for (const id of partIds) await adminClient().from("parts").delete().eq("id", id);
  for (const id of jobIds) await adminClient().from("jobs").delete().eq("job_id", id);
});

async function createPart(shopId, overrides = {}) {
  const { data, error } = await adminClient()
    .from("parts")
    .insert({
      shop_id: shopId,
      part_name: `QA-JOBPARTSUSED-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      item_type: "salvage",
      quantity: 5,
      price: 100,
      is_active: true,
      ...overrides,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  partIds.push(data.id);
  return data.id;
}

async function createJob(shopId) {
  const { data, error } = await adminClient()
    .from("jobs")
    .insert({ shop_id: shopId, customer_name: "QA JobPartsUsed", status: "received" })
    .select("job_id")
    .single();
  expect(error).toBeNull();
  jobIds.push(data.job_id);
  return data.job_id;
}

test("JOBPARTSUSED-001 เบิกจาก generic stock ทั้งหมด -> quantity ลดถูกต้อง, log job_parts_used ถูกต้อง (cost_at_time = allocated_cost), ของหมดแล้วไม่โผล่ในผลค้นหาสต็อกอีก", async ({ page }) => {
  const partId = await createPart(mainShopId, { quantity: 5, price: 100, allocated_cost: 80 });
  const jobId = await createJob(mainShopId);

  const { data: partBefore } = await adminClient().from("parts").select("part_name").eq("id", partId).single();

  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto(`/jobs/${jobId}`);

  await expect(page.getByTestId("job-parts-used-section")).toBeVisible();
  await page.getByTestId("withdraw-part-search-input").fill(partBefore.part_name);
  await expect(page.getByTestId("withdraw-part-search-results")).toBeVisible({ timeout: 8000 });
  await page.getByTestId("withdraw-part-search-results").getByText(partBefore.part_name, { exact: false }).click();

  await page.getByTestId("withdraw-quantity-input").fill("5"); // เบิกหมดสต็อก
  await page.getByTestId("withdraw-part-submit-button").click();

  await expect(page.locator(".msg.success", { hasText: "ไปใช้กับงานนี้แล้ว" })).toBeVisible({ timeout: 8000 });

  const { data: partAfter } = await adminClient().from("parts").select("quantity").eq("id", partId).single();
  expect(Number(partAfter.quantity)).toBe(0);

  const { data: logRows } = await adminClient()
    .from("job_parts_used")
    .select("job_id, part_id, quantity_used, cost_at_time, used_by")
    .eq("job_id", jobId)
    .eq("part_id", partId);
  expect(logRows.length).toBe(1);
  expect(logRows[0].quantity_used).toBe(5);
  expect(Number(logRows[0].cost_at_time)).toBe(80); // ต้อง snapshot allocated_cost ไม่ใช่ price
  expect(logRows[0].used_by).toBeTruthy();

  // ของหมดสต็อกแล้ว (quantity 0) เหมือนขายหมด -> ไม่ต้องรู้ zone อีกต่อไป, ไม่โผล่ในผลค้นหาสต็อกอีก
  await page.reload();
  await page.getByTestId("withdraw-part-search-input").fill(partBefore.part_name);
  await expect(page.getByTestId("withdraw-part-search-results")).toHaveCount(0);
});

test("JOBPARTSUSED-002 เบิกเกินสต็อกที่มี -> ถูกปฏิเสธพร้อม error ชัดเจน ไม่มี partial state (quantity ไม่เปลี่ยน, ไม่มี log ถูกสร้าง)", async ({ page }) => {
  const partId = await createPart(mainShopId, { quantity: 2, price: 100 });
  const jobId = await createJob(mainShopId);

  const { data: partBefore } = await adminClient().from("parts").select("part_name").eq("id", partId).single();

  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto(`/jobs/${jobId}`);

  await page.getByTestId("withdraw-part-search-input").fill(partBefore.part_name);
  await expect(page.getByTestId("withdraw-part-search-results")).toBeVisible({ timeout: 8000 });
  await page.getByTestId("withdraw-part-search-results").getByText(partBefore.part_name, { exact: false }).click();

  await page.getByTestId("withdraw-quantity-input").fill("999");
  await page.getByTestId("withdraw-part-submit-button").click();

  await expect(page.locator(".msg.error", { hasText: "สต็อกไม่พอ" })).toBeVisible({ timeout: 8000 });

  const { data: partAfter } = await adminClient().from("parts").select("quantity").eq("id", partId).single();
  expect(Number(partAfter.quantity)).toBe(2); // ไม่เปลี่ยน

  const { data: logRows } = await adminClient().from("job_parts_used").select("id").eq("job_id", jobId).eq("part_id", partId);
  expect(logRows).toEqual([]); // ไม่มี log ถูกสร้างขึ้นเลย
});

test("JOBPARTSUSED-003 field_scanner: ส่วน 'เบิกอะไหล่จากสต็อกมาใช้กับงานนี้' ไม่โผล่เลย เพราะเข้าหน้า /jobs/[id] ไม่ได้ตั้งแต่ต้น (ตาม RequireAuth allowedRoles จริง)", async ({ page }) => {
  const jobId = await createJob(mainShopId);

  await loginWithStaffPin(page, accounts.fieldScanner.username, accounts.fieldScanner.pin);
  await expectLoginSucceeded(page);
  await page.goto(`/jobs/${jobId}`);

  await expect(page.locator(".msg.error", { hasText: "ไม่มีสิทธิ์เข้าหน้านี้" })).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId("job-parts-used-section")).toHaveCount(0);
});

test("JOBPARTSUSED-004 RLS ปฏิเสธ field_scanner insert job_parts_used ตรงๆ แม้ยิงข้าม UI ทั้งหมด (field_scanner ห้ามเบิก/ขายของตามการ์ดเดิม)", async () => {
  const partId = await createPart(mainShopId, { quantity: 5 });
  const jobId = await createJob(mainShopId);

  const { client: fsClient } = await signInStaff(accounts.fieldScanner.username, accounts.fieldScanner.pin);
  const { error } = await fsClient
    .from("job_parts_used")
    .insert({ job_id: jobId, part_id: partId, quantity_used: 1, cost_at_time: 100 });

  expect(error, "field_scanner ต้องเบิกอะไหล่ไปใช้กับงานไม่ได้เด็ดขาดตามการ์ด").not.toBeNull();

  const { data: partAfter } = await adminClient().from("parts").select("quantity").eq("id", partId).single();
  expect(Number(partAfter.quantity)).toBe(5); // insert ถูกปฏิเสธ ไม่ควรมีใครไปตัดสต็อกสำเร็จ (ไม่ได้เรียก RPC ผ่าน client ตรงๆ)

  const { data: rows } = await fsClient.from("job_parts_used").select("id").eq("job_id", jobId);
  expect(rows).toEqual([]); // select ก็ไม่เห็นแม้แถวเดียว (กรองแบบเงียบๆ ไม่ throw)
});

test("JOBPARTSUSED-005 multi-tenant: technician ของอู่หลัก เบิก/อ่าน job_parts_used ของ job ที่เป็นของอู่อื่นไม่ได้", async () => {
  const foreignPartId = await createPart(foreignShopId, { quantity: 5 });
  const foreignJobId = await createJob(foreignShopId);

  const { client } = await signInStaff(accounts.technician.username, accounts.technician.pin);

  const { error: insertError } = await client
    .from("job_parts_used")
    .insert({ job_id: foreignJobId, part_id: foreignPartId, quantity_used: 1, cost_at_time: 100 });
  expect(insertError, "technician ของอู่หลักต้องเบิกอะไหล่ของ job อู่อื่นไม่ได้").not.toBeNull();

  const { data: selectData, error: selectError } = await client
    .from("job_parts_used")
    .select("id")
    .eq("job_id", foreignJobId);
  expect(selectError).toBeNull();
  expect(selectData).toEqual([]);

  const { data: foreignPartAfter } = await adminClient().from("parts").select("quantity").eq("id", foreignPartId).single();
  expect(Number(foreignPartAfter.quantity)).toBe(5); // ไม่มีการตัดสต็อกข้ามอู่เกิดขึ้น
});
