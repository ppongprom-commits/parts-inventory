// ------------------------------------------------------------
// MCS — "ช่องค้นหารวม" (merged cost-item search box) บนหน้า /jobs/[id]
// อ้างอิง selector/behavior จาก app/jobs/[id]/page.js จริง (ตรวจสอบทั้งไฟล์ก่อนเขียนเทสต์นี้):
//   - handleUnifiedSearch() ยิง 3 ค้นหาพร้อมกันจาก input เดียว: searchBundles / searchConsumables / searchHistory
//   - handleDescriptionChange() เดา category="labor" อัตโนมัติถ้าพิมพ์ขึ้นต้นด้วย "ค่า"
//     (เฉพาะตอนที่ยังไม่เคยกดปุ่มหมวดเอง — _categoryTouched === false)
//   - handleSelectConsumable() ผูกกับสต็อก (auto-fill amount/quantity, โชว์บรรทัด "🔗 ผูกกับสต็อก")
//   - handleSelectHistoryItem() ไม่ auto-fill amount/quantity เลย ตั้งใจเว้นให้กรอกเอง
//   - handleAddCostItem() ถ้ามี selectedConsumablePart จะยิง deduct_part_stock RPC ก่อน insert เสมอ
//     ถ้า RPC error (สต็อกไม่พอ) จะ setMsg error แล้ว "return" ก่อนถึง insert — ไม่มีรายการถูกเพิ่มเลย
//   - handleDeleteCostItem() ถ้ารายการมี part_id จะคืนสต็อกกลับ (เรียก RPC เดิมด้วย quantity ติดลบ)
// ก่อนหน้านี้ฟีเจอร์นี้ยังไม่มี coverage เลย (built this session)
// ------------------------------------------------------------

import { test, expect } from "@playwright/test";
import { loginWithEmail, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { adminClient, getShopIdByName } from "../fixtures/db-client.js";
import { accounts } from "../fixtures/test-data.js";

const DESCRIPTION_PLACEHOLDER =
  "รายละเอียด — พิมพ์ชื่องาน/อะไหล่/รายการที่เคยใช้ ('ค่า...' = ค่าแรงอัตโนมัติ)";

const RUN_ID = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function uniqueName(label) {
  return `QA-MCS-${label}-${RUN_ID}`;
}

let mainShopId;
let mainJobId;
const createdPartIds = [];

test.beforeAll(async () => {
  mainShopId = await getShopIdByName("QA Test Shop (auto)");

  const { data: job, error } = await adminClient()
    .from("jobs")
    .insert({ shop_id: mainShopId, customer_name: `QA merged-search test ${RUN_ID}` })
    .select("job_id")
    .single();
  if (error) throw new Error(`สร้างงานทดสอบไม่สำเร็จ: ${error.message}`);
  mainJobId = job.job_id;
});

test.afterAll(async () => {
  for (const partId of createdPartIds) {
    await adminClient().from("parts").delete().eq("id", partId);
  }
  if (mainJobId) {
    // ลบงาน -> job_cost_items ถูกลบตามด้วย (on delete cascade)
    await adminClient().from("jobs").delete().eq("job_id", mainJobId);
  }
});

/** สร้างอะไหล่ consumable ในสต็อกของอู่ทดสอบ คืน part row ({id, part_name, price, quantity}) */
async function createConsumablePart({ name, quantity, price }) {
  const { data, error } = await adminClient()
    .from("parts")
    .insert({
      shop_id: mainShopId,
      part_name: name,
      item_type: "consumable",
      quantity,
      price,
      is_active: true,
    })
    .select("id, part_name, price, quantity")
    .single();
  if (error) throw new Error(`สร้างอะไหล่ทดสอบไม่สำเร็จ: ${error.message}`);
  createdPartIds.push(data.id);
  return data;
}

async function getPartQuantity(partId) {
  const { data, error } = await adminClient().from("parts").select("quantity").eq("id", partId).single();
  if (error) throw new Error(`อ่านสต็อกอะไหล่ไม่สำเร็จ: ${error.message}`);
  return Number(data.quantity);
}

async function insertHistoryCostItem({ description, category = "other", amount = 500, quantity = 1 }) {
  const { data, error } = await adminClient()
    .from("job_cost_items")
    .insert({ job_id: mainJobId, category, description, amount, quantity, sort_order: 0 })
    .select("item_id")
    .single();
  if (error) throw new Error(`สร้างประวัติรายการทดสอบไม่สำเร็จ: ${error.message}`);
  return data.item_id;
}

async function findCostItemByDescription(description) {
  const { data, error } = await adminClient()
    .from("job_cost_items")
    .select("*")
    .eq("job_id", mainJobId)
    .eq("description", description);
  if (error) throw error;
  return data || [];
}

function categoryButton(page, label) {
  return page.getByRole("button", { name: label, exact: true });
}

async function expectCategoryActive(page, label) {
  await expect(categoryButton(page, label)).toHaveCSS("background-color", "rgb(37, 99, 235)");
}

async function expectCategoryInactive(page, label) {
  await expect(categoryButton(page, label)).not.toHaveCSS("background-color", "rgb(37, 99, 235)");
}

function descriptionInput(page) {
  return page.getByPlaceholder(DESCRIPTION_PLACEHOLDER);
}

function quantityInput(page) {
  return page.getByPlaceholder("จำนวน");
}

function amountInput(page) {
  return page.getByPlaceholder("บาท (รวม)");
}

/** ปุ่ม "+ เพิ่ม" ของฟอร์มรายการค่าใช้จ่าย — หาแบบ sibling ถัดจากช่อง "บาท (รวม)" กันชนกับ
 * ปุ่ม "+ เพิ่ม" ของฟอร์มขั้นตอนการทำงาน (Phase E) ซึ่งอยู่ก่อนหน้าในหน้าเดียวกัน */
function addCostItemButton(page) {
  return amountInput(page).locator("xpath=following-sibling::button[1]");
}

async function gotoJob(page) {
  await page.goto(`/jobs/${mainJobId}`);
  await expect(descriptionInput(page)).toBeVisible({ timeout: 10_000 });
}

test.beforeEach(async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
});

test.describe("MCS-001 — เดาหมวดอัตโนมัติจากคำขึ้นต้น 'ค่า'", () => {
  test("พิมพ์ 'ค่าแรงล้างแอร์' (ขึ้นต้นด้วย 'ค่า') -> หมวด 'ค่าแรง' ต้อง active อัตโนมัติ", async ({ page }) => {
    await gotoJob(page);
    await descriptionInput(page).fill("ค่าแรงล้างแอร์");

    await expectCategoryActive(page, "ค่าแรง");
    await expectCategoryInactive(page, "ค่าอะไหล่");
    await expectCategoryInactive(page, "อื่นๆ");
  });

  test("พิมพ์ข้อความที่ไม่ขึ้นต้นด้วย 'ค่า' -> หมวดต้องยังเป็นค่าเริ่มต้น 'ค่าอะไหล่'", async ({ page }) => {
    await gotoJob(page);
    await descriptionInput(page).fill("เปลี่ยนยางหน้า");

    await expectCategoryActive(page, "ค่าอะไหล่");
    await expectCategoryInactive(page, "ค่าแรง");
    await expectCategoryInactive(page, "อื่นๆ");
  });
});

test.describe("MCS-002 — ค้นหาจากสต็อก (consumable) แล้วเลือก + เพิ่มรายการ -> ตัดสต็อกจริง", () => {
  test("เลือกอะไหล่จากผลค้นหา '📦 สต็อก' -> auto-fill + ผูกสต็อก + เพิ่มแล้วตัดสต็อกผ่าน deduct_part_stock RPC", async ({
    page,
  }) => {
    const part = await createConsumablePart({ name: uniqueName("StockAdd"), quantity: 5, price: 100 });
    const searchTerm = part.part_name.slice(0, 14);

    await gotoJob(page);
    await descriptionInput(page).fill(searchTerm);

    await expect(page.getByText("📦 สต็อก", { exact: true })).toBeVisible({ timeout: 10_000 });
    const resultButton = page.getByRole("button", { name: new RegExp(escapeRegExp(part.part_name)) });
    await expect(resultButton).toBeVisible();
    await resultButton.click();

    // เลือกแล้ว dropdown ต้องปิดทั้งหมด (clearSearchState ปิดทั้ง 3 แหล่งพร้อมกัน)
    await expect(page.getByText("📦 สต็อก", { exact: true })).toHaveCount(0);

    await expect(descriptionInput(page)).toHaveValue(part.part_name);
    await expect(amountInput(page)).toHaveValue("100");
    await expect(quantityInput(page)).toHaveValue("1");
    await expect(page.getByText("🔗 ผูกกับสต็อก", { exact: false })).toBeVisible();
    await expect(page.getByText(part.part_name, { exact: false }).last()).toBeVisible();

    await addCostItemButton(page).click();

    await expect(
      page.locator(".card", { hasText: part.part_name }).first()
    ).toBeVisible({ timeout: 10_000 });

    const rows = await findCostItemByDescription(part.part_name);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(100);
    expect(rows[0].part_id).toBe(part.id);

    const newQuantity = await getPartQuantity(part.id);
    expect(newQuantity).toBe(4); // 5 - 1 (default quantity used)
  });
});

test.describe("MCS-003 — แก้ไข description ด้วยมือหลังเลือกสต็อก -> เลิกผูกกับสต็อก", () => {
  test("พิมพ์ต่อหลังเลือกอะไหล่ -> บรรทัด '🔗 ผูกกับสต็อก' หาย และเพิ่มรายการแล้วไม่ตัดสต็อก", async ({ page }) => {
    const part = await createConsumablePart({ name: uniqueName("StockUnlink"), quantity: 5, price: 200 });
    const searchTerm = part.part_name.slice(0, 14);

    await gotoJob(page);
    await descriptionInput(page).fill(searchTerm);

    const resultButton = page.getByRole("button", { name: new RegExp(escapeRegExp(part.part_name)) });
    await expect(resultButton).toBeVisible({ timeout: 10_000 });
    await resultButton.click();
    await expect(page.getByText("🔗 ผูกกับสต็อก", { exact: false })).toBeVisible();

    // จำลองแก้ไขด้วยมือ — พิมพ์เพิ่มต่อท้าย description ที่ auto-fill มา
    await descriptionInput(page).fill(`${part.part_name} (แก้ไขเอง)`);
    await expect(page.getByText("🔗 ผูกกับสต็อก", { exact: false })).toHaveCount(0);

    await addCostItemButton(page).click();

    await expect(
      page.locator(".card", { hasText: `${part.part_name} (แก้ไขเอง)` }).first()
    ).toBeVisible({ timeout: 10_000 });

    const rows = await findCostItemByDescription(`${part.part_name} (แก้ไขเอง)`);
    expect(rows).toHaveLength(1);
    expect(rows[0].part_id).toBeNull(); // ไม่ได้ผูกกับสต็อกแล้ว

    const quantityAfter = await getPartQuantity(part.id);
    expect(quantityAfter).toBe(5); // ไม่ถูกตัดสต็อกเลย
  });
});

test.describe("MCS-004 — ค้นหาจากประวัติ (เคยใช้) -> ไม่ auto-fill ราคา/จำนวน", () => {
  test("เลือกรายการจาก '🕘 เคยใช้' -> เติมแค่ description/category ไม่แตะ amount/quantity", async ({ page }) => {
    const description = uniqueName("HistoryItem");
    await insertHistoryCostItem({ description, category: "other", amount: 999, quantity: 3 });
    const searchTerm = description.slice(0, 14);

    await gotoJob(page); // หน้าใหม่ -> description ว่างอยู่แล้ว ("clear ก่อน" ตามที่ต้องการ)
    await descriptionInput(page).fill(searchTerm);

    await expect(page.getByText("🕘 เคยใช้", { exact: true })).toBeVisible({ timeout: 10_000 });
    const resultButton = page.getByRole("button", { name: new RegExp(escapeRegExp(description)) });
    await expect(resultButton).toBeVisible();
    await resultButton.click();

    await expect(page.getByText("🕘 เคยใช้", { exact: true })).toHaveCount(0);
    await expect(descriptionInput(page)).toHaveValue(description);
    await expectCategoryActive(page, "อื่นๆ"); // category ของประวัติคือ 'other'

    // amount/quantity ต้องไม่ถูกแตะเลย (ยังเป็นค่าเริ่มต้นของฟอร์ม ไม่ใช่ 999/3 จากประวัติ)
    await expect(amountInput(page)).toHaveValue("");
    await expect(quantityInput(page)).toHaveValue("1");
    await expect(page.getByText("🔗 ผูกกับสต็อก", { exact: false })).toHaveCount(0);
  });
});

test.describe("MCS-005 — dropdown รวมแสดงหลายกลุ่มพร้อมกันจากคีย์เดียว", () => {
  test("query เดียวชนทั้งสต็อกและประวัติพร้อมกัน -> เห็นทั้ง '📦 สต็อก' และ '🕘 เคยใช้' พร้อมกันในกล่องเดียว", async ({
    page,
  }) => {
    const sharedPrefix = uniqueName("Multi");
    const part = await createConsumablePart({ name: `${sharedPrefix}-Stock`, quantity: 3, price: 50 });
    const historyDescription = `${sharedPrefix}-History`;
    await insertHistoryCostItem({ description: historyDescription });

    await gotoJob(page);
    await descriptionInput(page).fill(sharedPrefix);

    await expect(page.getByText("📦 สต็อก", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("🕘 เคยใช้", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: new RegExp(escapeRegExp(part.part_name)) })).toBeVisible();
    await expect(
      page.getByRole("button", { name: new RegExp(escapeRegExp(historyDescription)) })
    ).toBeVisible();
  });
});

test.describe("MCS-006 — สต็อกไม่พอต้องกันการเพิ่มรายการ", () => {
  test("ตั้งจำนวนเกินสต็อกที่มี -> ขึ้น error 'ตัดสต็อกไม่สำเร็จ' ไม่มีรายการถูกเพิ่ม และสต็อกไม่เปลี่ยน", async ({
    page,
  }) => {
    const part = await createConsumablePart({ name: uniqueName("InsufficientStock"), quantity: 1, price: 80 });
    const searchTerm = part.part_name.slice(0, 14);

    await gotoJob(page);
    await descriptionInput(page).fill(searchTerm);

    const resultButton = page.getByRole("button", { name: new RegExp(escapeRegExp(part.part_name)) });
    await expect(resultButton).toBeVisible({ timeout: 10_000 });
    await resultButton.click();

    await quantityInput(page).fill("5"); // มีแค่ 1 ในสต็อก แต่ตั้งใจขอ 5
    await addCostItemButton(page).click();

    const errorMsg = page.locator(".msg.error", { hasText: "ตัดสต็อกไม่สำเร็จ" });
    await expect(errorMsg).toBeVisible({ timeout: 10_000 });

    const rows = await findCostItemByDescription(part.part_name);
    expect(rows).toHaveLength(0); // ไม่มีรายการถูกเพิ่มเลย

    const quantityAfter = await getPartQuantity(part.id);
    expect(quantityAfter).toBe(1); // สต็อกไม่ถูกแตะเลย (RPC reject ก่อน insert)
  });
});

test.describe("MCS-007 — ลบรายการที่ผูกสต็อก -> คืนสต็อกกลับ", () => {
  test("ลบรายการค่าใช้จ่ายที่ผูกกับอะไหล่ -> สต็อกของอะไหล่ถูกบวกคืน", async ({ page }) => {
    const part = await createConsumablePart({ name: uniqueName("DeleteRestock"), quantity: 5, price: 60 });
    const searchTerm = part.part_name.slice(0, 14);

    await gotoJob(page);
    await descriptionInput(page).fill(searchTerm);

    const resultButton = page.getByRole("button", { name: new RegExp(escapeRegExp(part.part_name)) });
    await expect(resultButton).toBeVisible({ timeout: 10_000 });
    await resultButton.click();
    await addCostItemButton(page).click();

    const costItemCard = page.locator(".card", { hasText: part.part_name }).first();
    await expect(costItemCard).toBeVisible({ timeout: 10_000 });

    const quantityAfterAdd = await getPartQuantity(part.id);
    expect(quantityAfterAdd).toBe(4); // ตัดไปแล้ว 1

    await costItemCard.getByRole("button", { name: "ลบ" }).click();
    await expect(costItemCard).toHaveCount(0);

    const rowsAfterDelete = await findCostItemByDescription(part.part_name);
    expect(rowsAfterDelete).toHaveLength(0);

    const quantityAfterDelete = await getPartQuantity(part.id);
    expect(quantityAfterDelete).toBe(5); // คืนสต็อกกลับมาครบ
  });
});
