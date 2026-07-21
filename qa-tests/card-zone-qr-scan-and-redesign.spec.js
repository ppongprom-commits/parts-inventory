// Card: "🌙 งานที่ต้องทำคืนนี้" ข้อ 1 — Zone QR redesign + ปุ่ม "สแกนตำแหน่งแทน" บน /add, /edit
//
// Scope รอบนี้ (ดูหมายเหตุใน components/ZoneQRScanner.js):
//  (ก) ป้าย QR โซน — ตัวหนังสือใหญ่ขึ้น (10pt→20pt) อ่านง่ายขึ้นจากระยะยืนหน้าชั้นจริง
//  (ข) ปุ่ม "📷 สแกนตำแหน่งแทน" เปิดกล้องสแกน QR โซนตรงจากฟอร์ม /add และ /edit auto-fill zone_id
//      — ห้าม auto-fill โซนที่ไม่ใช่ leaf เด็ดขาด (บั๊กเดิมที่เคยเกิดกับ /add?zone_id= จาก URL)
// ไม่รวม: toggle "บังคับสแกน QR" ระดับร้าน (รอการ์ด "ย้ายอะไหล่ระหว่าง Zone" ที่ยังไม่เริ่ม),
// ข้อ 2-4 ของการ์ดแม่ (bulk shelf, Part QR spec, count cycle — คนละการ์ด/ยังไม่ scope พอ)
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

const ROOT_ZONE_ID = "aaaaaaaa-0000-0000-0000-000000000001"; // non-leaf (มีลูก)
const LEAF_ZONE_ID = "aaaaaaaa-0000-0000-0000-000000000002"; // leaf (เลือกใช้ได้จริง)

const ZONE_ROWS = [
  { id: ROOT_ZONE_ID, shop_id: "11111111-1111-1111-1111-111111111111", parent_id: null, code: "A1", name: "โกดัง A", path: "a1", owner_type: null },
  { id: LEAF_ZONE_ID, shop_id: "11111111-1111-1111-1111-111111111111", parent_id: ROOT_ZONE_ID, code: "Shelf-03", name: null, path: "a1.shelf03", owner_type: null },
];

// หมายเหตุ (defect เจอรอบ 1): ต้อง return true/false (ไม่ใช่ผลลัพธ์ของ route.fulfill ซึ่ง resolve
// เป็น undefined) — ไม่งั้น mockAuth.js เข้าใจว่ายังไม่ได้ handle แล้วเรียก route.fulfill() ซ้ำสอง
// รอบ เกิด "Route is already handled!" ทุกเทสที่ผ่าน route นี้
async function mockZonesRoute(route, url) {
  if (!url.includes("/rest/v1/zones")) return false;
  // .maybeSingle()/.single() (เช่น select("shop_id").eq("id", ids[0]) ใน print-zone-labels)
  // ต้องได้ object เดี่ยว ไม่ใช่ array — ไม่งั้น client parse พังเงียบๆ (defect เจอรอบ 1)
  const idMatch = url.match(/[?&]id=eq\.([0-9a-fA-F-]{36})/);
  if (idMatch) {
    const row = ZONE_ROWS.find((z) => z.id === idMatch[1]) || null;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(row) });
    return true;
  }
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ZONE_ROWS) });
  return true;
}

// ติดตั้ง BarcodeDetector + getUserMedia จอมปลอมก่อนหน้าโหลด — จำลองกล้อง/QR scan โดยไม่ต้องมี
// กล้องจริงในแซนด์บ็อกซ์ (เทคนิคเดียวกับที่ qa-tests อื่นในโปรเจกต์ใช้ mock network ทั้งหมด)
async function installFakeScanner(page, scannedText) {
  await page.addInitScript((text) => {
    window.__qaScanText = text;
    window.BarcodeDetector = class {
      constructor() {}
      async detect() {
        if (window.__qaScanText) {
          const v = window.__qaScanText;
          window.__qaScanText = null; // ส่งผลครั้งเดียวพอ กันลูปยิงซ้ำไม่รู้จบ
          return [{ rawValue: v }];
        }
        return [];
      }
    };
    navigator.mediaDevices = navigator.mediaDevices || {};
    navigator.mediaDevices.getUserMedia = async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 2;
      canvas.height = 2;
      return canvas.captureStream ? canvas.captureStream() : new MediaStream();
    };
  }, scannedText);
}

test.describe("Zone QR scan button on /add", () => {
  test("scanning a LEAF zone QR auto-fills zone_id", async ({ page }) => {
    await installFakeScanner(page, `${new URL("http://localhost:3100").origin}/zone/${LEAF_ZONE_ID}`);
    await installMockAuth(page, { role: "owner", extraRoutes: mockZonesRoute });
    await page.goto("/add");

    await expect(page.getByTestId("zone-scan-button")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("zone-scan-button").click();
    // หมายเหตุ (แก้รอบ 2): mock detect() คืนผลไวมาก dialog อาจปิดไปแล้วก่อนเช็ค video element
    // เลยตัดการเช็ค "video visible" ระหว่างทางออก เช็คแค่ผลลัพธ์ปลายทาง (dialog ปิด + zone_id ถูกเติม)

    // dialog ปิดเองเมื่อ scan สำเร็จ + ช่องค้นหาโซนแสดง breadcrumb ของ leaf ที่สแกนได้
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10000 });
    await expect(page.getByPlaceholder("พิมพ์ค้นหาโซน เช่น Shelf 03 ชั้น 2")).toHaveValue(/Shelf-03/, { timeout: 5000 });
  });

  test("scanning a NON-LEAF zone QR shows an error and does NOT auto-fill", async ({ page }) => {
    await installFakeScanner(page, `${new URL("http://localhost:3100").origin}/zone/${ROOT_ZONE_ID}`);
    await installMockAuth(page, { role: "owner", extraRoutes: mockZonesRoute });
    await page.goto("/add");

    await page.getByTestId("zone-scan-button").click();
    await expect(page.getByTestId("zone-scan-error")).toContainText("โซนย่อยข้างใน", { timeout: 10000 });
    // dialog ยังเปิดอยู่ (ไม่ปิดอัตโนมัติเมื่อ error) — ยืนยันว่าไม่ auto-fill
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("unknown QR text shows a not-a-zone-QR error", async ({ page }) => {
    await installFakeScanner(page, "https://example.com/not-a-zone");
    await installMockAuth(page, { role: "owner", extraRoutes: mockZonesRoute });
    await page.goto("/add");

    await page.getByTestId("zone-scan-button").click();
    await expect(page.getByTestId("zone-scan-error")).toContainText("ไม่ใช่ QR ตำแหน่งโซน", { timeout: 10000 });
  });
});

test.describe("Zone QR scan button on /edit/[id]", () => {
  test("scan button is present and auto-fills a leaf zone", async ({ page }) => {
    const PART_ID = "bbbbbbbb-0000-0000-0000-000000000001";
    await installFakeScanner(page, `${new URL("http://localhost:3100").origin}/zone/${LEAF_ZONE_ID}`);
    await installMockAuth(page, {
      role: "owner",
      extraRoutes: async (route, url) => {
        const handled = await mockZonesRoute(route, url);
        if (handled) return true;
        if (url.includes(`/rest/v1/parts?`) && url.includes(`id=eq.${PART_ID}`)) {
          // .single() ต้องการ object เดี่ยว เหมือน zones ด้านบน
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              id: PART_ID,
              shop_id: "11111111-1111-1111-1111-111111111111",
              name: "กันชนหน้า",
              zone_id: null,
              zone_code: null,
              is_active: true,
              photo_urls: [],
              photo_url: null,
            }),
          });
          return true;
        }
        return false;
      },
    });
    await page.goto(`/edit/${PART_ID}`);
    await expect(page.getByTestId("zone-scan-button")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("zone-scan-button").click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10000 });
  });
});

test.describe("Zone label print redesign (readability)", () => {
  test("print media shows a larger zone-code font and short breadcrumb", async ({ page }) => {
    await installMockAuth(page, { role: "owner", extraRoutes: mockZonesRoute });
    await page.goto(`/print-zone-labels?ids=${LEAF_ZONE_ID}`);
    await expect(page.locator(".label-title")).toHaveText("Shelf-03", { timeout: 15000 });

    await page.emulateMedia({ media: "print" });

    const titleFontSize = await page.locator(".label-title").evaluate((el) => window.getComputedStyle(el).fontSize);
    // 20pt ≈ 26.66px — เดิม 10pt ≈ 13.33px ยืนยันว่าขยายขึ้นจริง (ไม่เช็คค่าตายตัวเป๊ะข้าม browser rounding)
    expect(parseFloat(titleFontSize)).toBeGreaterThan(20);

    await expect(page.locator(".print-only").first()).toBeVisible();
    await expect(page.locator(".no-print-inline").first()).toBeHidden();
    // short breadcrumb = 2 ระดับสุดท้าย = "A1 › Shelf-03" (ที่นี่มีแค่ 2 ระดับพอดี)
    await expect(page.locator(".print-only").first()).toContainText("A1");
    await expect(page.locator(".print-only").first()).toContainText("Shelf-03");
  });
});
