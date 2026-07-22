// การ์ด "ย้ายอะไหล่ระหว่าง Zone — action ใหม่ พร้อม owner_type override checkbox"
// คืนวันที่ 21 ก.ค. 2026 — app/move-part/[id]/page.js (ย้ายทีละชิ้น) + app/admin/page.js
// (ZoneMoveSettingsCard: toggle "บังคับสแกน QR ยืนยันตำแหน่ง" ระดับร้าน)
import { test, expect } from "@playwright/test";
import { loginWithEmail, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { selectZoneAutocomplete } from "../fixtures/zone-helpers.js";
import { adminClient, getShopIdByName } from "../fixtures/db-client.js";
import { accounts, currentShopName } from "../fixtures/test-data.js";

let mainShopId;
let zoneOwnId, zoneConsignId;
const zoneOwnCode = `QA-OWN-${Date.now()}`;
const zoneConsignCode = `QA-CONSIGN-${Date.now()}`;
const partIds = [];
let originalForceScan;

test.beforeAll(async () => {
  mainShopId = await getShopIdByName(currentShopName);

  const [{ data: zOwn, error: e1 }, { data: zConsign, error: e2 }] = await Promise.all([
    adminClient().from("zones").insert({ shop_id: mainShopId, code: zoneOwnCode, owner_type: "own" }).select("id").single(),
    adminClient().from("zones").insert({ shop_id: mainShopId, code: zoneConsignCode, owner_type: "consignment" }).select("id").single(),
  ]);
  expect(e1).toBeNull();
  expect(e2).toBeNull();
  zoneOwnId = zOwn.id;
  zoneConsignId = zConsign.id;

  const { data: shopRow } = await adminClient()
    .from("shops")
    .select("force_zone_scan_confirmation")
    .eq("shop_id", mainShopId)
    .single();
  originalForceScan = shopRow.force_zone_scan_confirmation;

  // MOVEPART-001/002/003 ทดสอบ flow ที่ต้องใช้ช่องพิมพ์ค้นหาโซน (ZoneAutocomplete) ตรงๆ — ต้องมั่นใจ
  // ว่า force_zone_scan_confirmation เป็น false ก่อนเริ่มเสมอ ไม่ว่ารอบก่อนหน้าจะ restore ไม่สำเร็จ
  // มาหรือเปล่า (MOVEPART-004 เป็น test เดียวที่ตั้งใจ toggle ค่านี้ และ restore เองท้าย test แล้ว)
  if (originalForceScan) {
    await adminClient().from("shops").update({ force_zone_scan_confirmation: false }).eq("shop_id", mainShopId);
  }
});

test.afterAll(async () => {
  for (const id of partIds) await adminClient().from("parts").delete().eq("id", id);
  await adminClient().from("zones").delete().in("id", [zoneOwnId, zoneConsignId]);
  // คืนค่า toggle ระดับร้านกลับเป็นค่าเดิมเสมอ กัน suite อื่น (เช่น /add) โดน force-scan ค้างไว้
  await adminClient().from("shops").update({ force_zone_scan_confirmation: originalForceScan }).eq("shop_id", mainShopId);
});

async function createPart(zoneId) {
  const { data, error } = await adminClient()
    .from("parts")
    .insert({ shop_id: mainShopId, part_name: `QA-MOVEPART-${Date.now()}-${Math.random()}`, item_type: "salvage", zone_id: zoneId })
    .select("id")
    .single();
  expect(error).toBeNull();
  partIds.push(data.id);
  return data.id;
}

test("MOVEPART-001 ย้ายไปโซน owner_type ต่างกัน + ติ๊กยืนยัน -> owner_type_override เก็บค่าประเภทเดิมไว้", async ({ page }) => {
  const partId = await createPart(zoneOwnId);

  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto(`/move-part/${partId}`);

  await selectZoneAutocomplete(page, zoneConsignCode, zoneConsignCode);
  await expect(page.getByTestId("owner-type-override-checkbox")).toBeVisible({ timeout: 8000 });

  await page.getByTestId("owner-type-override-checkbox").locator('input[type="checkbox"]').check();
  await page.getByRole("button", { name: "ยืนยันย้าย" }).click();
  await expect(page.locator(".msg.success", { hasText: "ย้าย Zone เรียบร้อยแล้ว" })).toBeVisible({ timeout: 8000 });

  const { data } = await adminClient().from("parts").select("zone_id, owner_type_override").eq("id", partId).single();
  expect(data.zone_id).toBe(zoneConsignId);
  expect(data.owner_type_override).toBe("own"); // ยังเป็น "ของร้านเอง" เดิม แม้ย้ายเข้าโซนฝากขาย
});

test("MOVEPART-002 ย้ายไปโซน owner_type ต่างกัน แต่ไม่ติ๊กยืนยัน -> รับ owner_type ของโซนใหม่ (override เป็น null)", async ({ page }) => {
  const partId = await createPart(zoneOwnId);

  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto(`/move-part/${partId}`);

  await selectZoneAutocomplete(page, zoneConsignCode, zoneConsignCode);
  await expect(page.getByTestId("owner-type-override-checkbox")).toBeVisible({ timeout: 8000 });
  // ไม่ติ๊ก checkbox เลย
  await page.getByRole("button", { name: "ยืนยันย้าย" }).click();
  await expect(page.locator(".msg.success", { hasText: "ย้าย Zone เรียบร้อยแล้ว" })).toBeVisible({ timeout: 8000 });

  const { data } = await adminClient().from("parts").select("zone_id, owner_type_override").eq("id", partId).single();
  expect(data.zone_id).toBe(zoneConsignId);
  expect(data.owner_type_override).toBeNull();
});

test("MOVEPART-003 ย้ายไปโซน owner_type เดียวกัน -> ไม่มี checkbox ยืนยันโผล่มาเลย", async ({ page }) => {
  const zoneOwn2Code = `${zoneOwnCode}-B`;
  const { data: zoneOwn2 } = await adminClient()
    .from("zones")
    .insert({ shop_id: mainShopId, code: zoneOwn2Code, owner_type: "own" })
    .select("id")
    .single();

  const partId = await createPart(zoneOwnId);

  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto(`/move-part/${partId}`);

  await selectZoneAutocomplete(page, zoneOwn2Code, zoneOwn2Code);
  await expect(page.getByTestId("dest-zone-label")).toBeVisible({ timeout: 8000 });
  await expect(page.getByTestId("owner-type-override-checkbox")).toHaveCount(0);

  await adminClient().from("zones").delete().eq("id", zoneOwn2.id);
});

test("MOVEPART-004 toggle 'บังคับสแกน QR ยืนยันตำแหน่ง' ที่ /admin มีผลจริงกับหน้า /move-part/[id]", async ({ page }) => {
  const partId = await createPart(zoneOwnId);

  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);

  // ไม่ hardcode ว่าเริ่มจากปิด/เปิด (ค่าอาจถูก suite อื่น/คนจริงตั้งไว้ก่อนแล้ว) — อ่านสถานะปัจจุบัน
  // ก่อนเสมอ แล้ว toggle ไปอีกฝั่งหนึ่ง เช็คผล แล้ว toggle กลับที่เดิมก่อนจบ test
  await page.goto("/admin");
  const toggleBtn = page.getByTestId("toggle-force-scan");
  const startedEnabled = (await toggleBtn.innerText()).includes("เปิดอยู่");

  await toggleBtn.click();
  await expect(toggleBtn).toContainText(startedEnabled ? "ปิดอยู่" : "เปิดอยู่", { timeout: 8000 });
  const nowEnabled = !startedEnabled;

  await page.goto(`/move-part/${partId}`);
  if (nowEnabled) {
    await expect(page.getByPlaceholder(/พิมพ์ค้นหาโซน/)).toHaveCount(0);
    await expect(page.getByText("ร้านนี้ตั้งค่าบังคับสแกน QR ยืนยันตำแหน่ง")).toBeVisible();
  } else {
    await expect(page.getByPlaceholder(/พิมพ์ค้นหาโซน/)).toBeVisible();
  }

  // toggle กลับที่เดิมก่อนจบ test เสมอ (afterAll restore อีกชั้นเผื่อ test นี้ throw กลางทาง)
  await page.goto("/admin");
  await page.getByTestId("toggle-force-scan").click();
  await expect(page.getByTestId("toggle-force-scan")).toContainText(startedEnabled ? "เปิดอยู่" : "ปิดอยู่", {
    timeout: 8000,
  });
});
