// การ์ด "บันทึกวิธีชำระเงินแยกทุกช่องทาง (payment_method)" — คืนวันที่ 21 ก.ค. 2026
// app/edit/[id]/page.js: ฟอร์มขายทีละชิ้นที่มีอยู่แล้ว บังคับเลือก payment_method ทุกครั้ง
// (ไม่ default เงียบๆ) — db/payment_method_migration.sql: part_sales.payment_method + check constraint
import { test, expect } from "@playwright/test";
import { loginWithEmail, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { adminClient, getShopIdByName } from "../fixtures/db-client.js";
import { accounts, currentShopName } from "../fixtures/test-data.js";

let mainShopId;
let partId;

test.beforeEach(async () => {
  mainShopId = await getShopIdByName(currentShopName);
  const { data, error } = await adminClient()
    .from("parts")
    .insert({ shop_id: mainShopId, part_name: `QA-PAYMENT-${Date.now()}`, price: 500, quantity: 5, item_type: "salvage" })
    .select("id")
    .single();
  expect(error).toBeNull();
  partId = data.id;
});

test.afterEach(async () => {
  await adminClient().from("part_sales").delete().eq("part_id", partId);
  await adminClient().from("parts").delete().eq("id", partId);
});

test("PAYMENT-001 ขายโดยไม่เลือกวิธีชำระเงิน -> error บังคับเลือก ไม่สร้าง part_sales", async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto(`/edit/${partId}`);

  await page.getByLabel("จำนวนที่ขาย").fill("1");
  await page.getByLabel("ราคาขายจริง (ต่อหน่วย)").fill("500");
  // ไม่แตะช่อง "วิธีชำระเงิน" เลย — ปล่อยเป็น "— เลือก —"
  await page.getByRole("button", { name: "✓ บันทึกการขาย" }).click();

  await expect(page.locator(".msg.error", { hasText: "กรุณาเลือกวิธีชำระเงิน" })).toBeVisible({ timeout: 8000 });

  const { data: sales } = await adminClient().from("part_sales").select("id").eq("part_id", partId);
  expect(sales.length).toBe(0);
});

test("PAYMENT-002 ขายพร้อมเลือกวิธีชำระเงิน -> บันทึกสำเร็จ พร้อม payment_method ถูกต้อง", async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto(`/edit/${partId}`);

  await page.getByLabel("จำนวนที่ขาย").fill("1");
  await page.getByLabel("ราคาขายจริง (ต่อหน่วย)").fill("500");
  await page.getByLabel("วิธีชำระเงิน").selectOption("bank_transfer");
  await page.getByRole("button", { name: "✓ บันทึกการขาย" }).click();

  await expect(page.locator(".msg.success", { hasText: "บันทึกการขายสำเร็จ" })).toBeVisible({ timeout: 8000 });

  const { data: sales } = await adminClient().from("part_sales").select("payment_method").eq("part_id", partId);
  expect(sales.length).toBe(1);
  expect(sales[0].payment_method).toBe("bank_transfer");
});

test("PAYMENT-003 DB check constraint ปฏิเสธ payment_method ที่ไม่อยู่ใน enum แม้ยิงตรงข้าม UI", async () => {
  const { error } = await adminClient()
    .from("part_sales")
    .insert({
      part_id: partId,
      shop_id: mainShopId,
      quantity_sold: 1,
      sale_price: 500,
      payment_method: "crypto", // ไม่อยู่ใน cash/bank_transfer/card/other
    });
  expect(error, "ต้องถูก check constraint ปฏิเสธ").not.toBeNull();
  expect(error.message).toMatch(/payment_method/i);
});
