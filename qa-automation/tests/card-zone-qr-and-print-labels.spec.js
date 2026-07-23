// การ์ด "🌙 งานที่ต้องทำคืนนี้" ข้อ 1 — Zone QR redesign + Part QR label spec (40x60mm)
// คืนวันที่ 21 ก.ค. 2026 — app/print-zone-labels, app/print-labels, components/ZoneQRScanner.js
//
// ⚠️ ขอบเขตที่ตั้งใจไม่ทดสอบ: การสแกน QR จริงผ่านกล้อง (BarcodeDetector + getUserMedia) ต้องมี
// กล้องจริง/fake video device ซึ่ง Playwright config ของโปรเจกต์นี้ไม่ได้ตั้ง
// --use-fake-device-for-media-stream ไว้ (ดู qa-tests/card-android-camera-recovery.spec.js ในชุด
// mock ที่ sandbox nightly ก็เลือกจะ mock ทั้งหมดด้วยเหตุผลเดียวกัน) — ทดสอบแค่ว่าปุ่ม/UI ที่ควร
// โผล่มาโผล่จริง ไม่ทดสอบ behavior หลังกล้องเปิดสำเร็จ
import { test, expect } from "@playwright/test";
import { loginWithEmail, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { adminClient, getShopIdByName } from "../fixtures/db-client.js";
import { accounts, currentShopName } from "../fixtures/test-data.js";

let mainShopId;
let zoneId;
let partId;
const zoneCode = `QA-LABEL-${Date.now()}`;

test.beforeAll(async () => {
  mainShopId = await getShopIdByName(currentShopName);
  const { data: zone } = await adminClient()
    .from("zones")
    .insert({ shop_id: mainShopId, code: zoneCode, name: "QA label zone" })
    .select("id")
    .single();
  zoneId = zone.id;

  const { data: part } = await adminClient()
    .from("parts")
    .insert({ shop_id: mainShopId, part_name: `QA-LABEL-PART-${Date.now()}`, zone_id: zoneId, item_type: "salvage" })
    .select("id")
    .single();
  partId = part.id;
});

test.afterAll(async () => {
  if (partId) await adminClient().from("parts").delete().eq("id", partId);
  if (zoneId) await adminClient().from("zones").delete().eq("id", zoneId);
});

test("LABEL-001 /print-zone-labels ใช้ @page size 40mm 60mm และแสดง breadcrumb โซนจริง (ไม่ใช่ zone_code เดิม)", async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  // หน้านี้ต้องมี query param ?ids=<zone id,...> เสมอ (ดู app/print-zone-labels/page.js: ids.length
  // === 0 -> ไม่ fetch อะไรเลย, "ไม่พบโซนที่เลือก") — จุดเข้าจริงคือปุ่ม "พิมพ์" ใน app/admin/zones/page.js
  // และ components/ZoneTreeNode.js ที่ต่อ ids มาให้เสมอ ไม่เคย goto เปล่า ๆ
  await page.goto(`/print-zone-labels?ids=${zoneId}`);
  // <style jsx global> เฉพาะหน้านี้ inject เข้า DOM หลัง hydration เสร็จ (ไม่ใช่ตอน goto() resolve
  // เลย) — รอให้เนื้อหน้าจริง (breadcrumb โซน) โผล่มาก่อน ถึงจะมั่นใจว่า stylesheet มาครบแล้ว
  // โซนนี้เป็น top-level (ไม่มี parent) breadcrumb เลยเท่ากับ zone code เฉยๆ — ข้อความ zoneCode
  // เลยไปโผล่ซ้ำ 3 จุด (title + breadcrumb ปกติ + breadcrumb ย่อฉบับพิมพ์) ต้อง .first() กัน
  // strict-mode violation
  await expect(page.getByText(zoneCode).first()).toBeVisible({ timeout: 8000 });

  // app/globals.css เองก็มี @media print ของตัวเอง (แค่ app-shell/app-main padding — บรรทัด 650)
  // ซึ่งโหลดมาก่อน <style jsx> เฉพาะหน้านี้เสมอ — ถ้า return ตัวแรกที่เจอเลยจะได้ก้อนนั้นแทน
  // (ไม่มี "40mm"/"60mm") ต้องรวบรวม cssText ของทุก @media print rule ที่เจอทั้งหมดก่อนค่อยเช็ค
  const printCss = await page.evaluate(() => {
    let combined = "";
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.media?.mediaText === "print") combined += rule.cssText;
        }
      } catch {
        // cross-origin stylesheet — ข้าม
      }
    }
    return combined;
  });
  expect(printCss).toContain("40mm");
  expect(printCss).toContain("60mm");
});

test("LABEL-002 /print-labels (ป้ายอะไหล่) ใช้ขนาดกระดาษเดียวกัน 40x60mm", async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto("/print-labels");
  // <style jsx global> เฉพาะหน้านี้ inject เข้า DOM หลัง hydration เสร็จ (ไม่ใช่ตอน goto() resolve
  // เลย) — รอให้เนื้อหน้าจริงโหลดเสร็จก่อน (ผ่านพ้น "กำลังโหลด...") ถึงจะมั่นใจว่า stylesheet มาครบแล้ว
  await page.waitForSelector(".label-grid", { state: "attached", timeout: 8000 });

  // app/globals.css เองก็มี @media print ของตัวเอง (แค่ app-shell/app-main padding — บรรทัด 650)
  // ซึ่งโหลดมาก่อน <style jsx> เฉพาะหน้านี้เสมอ — ถ้า return ตัวแรกที่เจอเลยจะได้ก้อนนั้นแทน
  // (ไม่มี "40mm"/"60mm") ต้องรวบรวม cssText ของทุก @media print rule ที่เจอทั้งหมดก่อนค่อยเช็ค
  const printCss = await page.evaluate(() => {
    let combined = "";
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.media?.mediaText === "print") combined += rule.cssText;
        }
      } catch {
        // cross-origin stylesheet — ข้าม
      }
    }
    return combined;
  });
  expect(printCss).toContain("40mm");
  expect(printCss).toContain("60mm");
});

test("LABEL-003 หน้า /add มีปุ่ม '📷 สแกนตำแหน่งแทน' (ทางเลือกเสริมข้างช่องพิมพ์ค้นหาโซน)", async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto("/add");
  await expect(page.getByTestId("zone-scan-button")).toBeVisible();
  await expect(page.getByTestId("zone-scan-button")).toContainText("สแกนตำแหน่งแทน");
});

test("LABEL-004 หน้า /edit/[id] มีปุ่ม '📷 สแกนตำแหน่งแทน' เหมือนกัน", async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto(`/edit/${partId}`);
  await expect(page.getByTestId("zone-scan-button")).toBeVisible();
});
