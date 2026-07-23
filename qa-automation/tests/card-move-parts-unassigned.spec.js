// การ์ด "🌙 งานที่ต้องทำคืนนี้" ข้อ 2 — bulk เข้า shelf ให้อะไหล่เก่าที่ไม่มี zone_id เลย
// คืนวันที่ 21 ก.ค. 2026 — app/move-parts/page.js เพิ่ม source mode พิเศษ UNASSIGNED_SENTINEL
import { test, expect } from "@playwright/test";
import { loginWithEmail, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { selectZoneAutocomplete } from "../fixtures/zone-helpers.js";
import { adminClient, getShopIdByName } from "../fixtures/db-client.js";
import { accounts, currentShopName } from "../fixtures/test-data.js";

let mainShopId;
let destZoneId;
const destZoneCode = `QA-DEST-${Date.now()}`;
const partIds = [];

test.beforeAll(async () => {
  mainShopId = await getShopIdByName(currentShopName);

  const { data: zoneRow, error: zoneErr } = await adminClient()
    .from("zones")
    .insert({ shop_id: mainShopId, code: destZoneCode, name: "QA move-parts dest" })
    .select("id")
    .single();
  expect(zoneErr).toBeNull();
  destZoneId = zoneRow.id;

  // 2 ชิ้นที่ไม่มีโซนเลย (zone_id ไม่ตั้งค่า = NULL ตาม default)
  for (let i = 0; i < 2; i++) {
    const { data, error } = await adminClient()
      .from("parts")
      .insert({ shop_id: mainShopId, part_name: `QA-UNASSIGNED-${Date.now()}-${i}`, item_type: "salvage" })
      .select("id")
      .single();
    expect(error).toBeNull();
    partIds.push(data.id);
  }
});

test.afterAll(async () => {
  for (const id of partIds) await adminClient().from("parts").delete().eq("id", id);
  if (destZoneId) await adminClient().from("zones").delete().eq("id", destZoneId);
});

test("MOVEPARTS-001 เลือกโหมด 'อะไหล่ที่ยังไม่มีโซนเลย' นับจำนวนตรงกับที่ query DB จริงด้วย zone_id IS NULL", async ({ page }) => {
  const { count: expectedCount } = await adminClient()
    .from("parts")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", mainShopId)
    .eq("is_active", true)
    .is("zone_id", null);

  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto("/move-parts");

  // ใช้ getByLabel แทน getByRole("combobox").first() — ตอนนี้ owner ที่เป็นสมาชิกหลายร้าน
  // (multi-shop) จะมี <select> "🏢 กำลังดูอู่" สำหรับสลับร้านโผล่ใน sidebar (components/AppShell.js)
  // มาก่อน select โซนต้นทางในเนื้อหน้าเสมอ ทำให้ .first() หยิบผิดตัวเป็น combobox สลับร้านแทน
  // (เฉพาะ worker ที่ได้ owner บัญชี multi-shop — ของ worker อื่นผ่านเพราะมีแค่ select เดียว)
  await page.getByLabel(/โซนต้นทาง/).selectOption("__unassigned__");
  await expect(page.getByTestId("affected-count")).toContainText(`พบอะไหล่ ${expectedCount} ชิ้นที่ยังไม่มีโซน`, {
    timeout: 8000,
  });
});

test("MOVEPARTS-002 ย้ายทั้งหมดสำเร็จ — ของทั้ง 2 ชิ้นที่สร้างไว้ได้ zone_id ใหม่ตรงปลายทาง", async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto("/move-parts");

  await page.getByLabel(/โซนต้นทาง/).selectOption("__unassigned__");
  await expect(page.getByTestId("affected-count")).toBeVisible({ timeout: 8000 });

  // ZoneAutocomplete แสดง breadcrumb = code chain ล้วนๆ (ไม่ต่อชื่อ) ต่างจาก option text ของ
  // <select> โซนต้นทางด้านบนที่ต่อ " — ชื่อ" เพิ่ม — โซนนี้เป็น top-level (ไม่มี parent) breadcrumb
  // เลยเท่ากับ code เฉยๆ
  await selectZoneAutocomplete(page, destZoneCode, destZoneCode);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: /ย้ายอะไหล่ \d+ ชิ้น/ }).click();
  await expect(page.locator(".msg.success", { hasText: "เรียบร้อยแล้ว" })).toBeVisible({ timeout: 10_000 });

  for (const id of partIds) {
    const { data } = await adminClient().from("parts").select("zone_id").eq("id", id).single();
    expect(data.zone_id).toBe(destZoneId);
  }
});
