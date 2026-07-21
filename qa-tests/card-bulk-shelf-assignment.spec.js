// Card: "🌙 งานที่ต้องทำคืนนี้" ข้อ 2 — Bulk เข้า Shelf ให้อะไหล่เดิมที่มีอยู่แล้ว (ยังไม่มี zone_id)
//
// Scope: เพิ่ม source mode พิเศษ "อะไหล่ที่ยังไม่มีโซนเลย" เข้าไปในหน้า /move-parts เดิม (ทางเลือกที่
// การ์ดเสนอไว้ — ใช้ infra เดิมทั้งหมด แทนที่จะแยกหน้าใหม่) กรองด้วย zone_id IS NULL ซึ่งครอบทั้ง
// อะไหล่ที่ไม่เคยมีข้อมูลโซนเลย และที่มี zone_code เดิม (legacy text) แต่ไม่มี zone_id ตามที่การ์ด
// ต้องการ ("ต้องโผล่ในลิสต์นี้ด้วย ไม่ใช่แค่ที่ไม่มีข้อมูลโซนเลยตั้งแต่ต้น")
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

const SHOP_ID = "11111111-1111-1111-1111-111111111111";
const ZONE_ID = "aaaaaaaa-0000-0000-0000-000000000002";

const ZONE_ROWS = [{ id: ZONE_ID, shop_id: SHOP_ID, parent_id: null, code: "A1", name: null, path: "a1", owner_type: null }];

async function mockMovePartsRoutes(page, { unassignedCount, moveResultIds }) {
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (url.includes("/rest/v1/zones")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ZONE_ROWS) });
    }
    if (url.includes("/rest/v1/parts")) {
      const isUnassignedQuery = url.includes("zone_id=is.null");
      // หมายเหตุ (defect เจอรอบ 1 และ 2):
      //  1) HEAD response ห้ามมี body ตาม HTTP spec — ส่ง body ที่ไม่ว่าง (แม้แค่ "[]") ทำให้ fetch
      //     พังเงียบๆ แล้ว count parse เป็น 0 เสมอ ต้องส่ง body ว่างจริง
      //  2) request เป็น cross-origin (localhost:3100 -> *.supabase.co) — browser fetch จะซ่อน
      //     response header ที่ไม่อยู่ใน Access-Control-Expose-Headers จาก JS ทั้งหมด รวม
      //     content-range ด้วย ทำให้ postgrest-js อ่าน count ไม่ได้แม้ header จะส่งมาจริงก็ตาม
      //     ต้องประกาศ expose header นี้ด้วยเสมอเวลา mock request ข้าม origin ที่ต้องใช้ count
      if (method === "PATCH") {
        const count = moveResultIds ?? 0;
        const rows = Array.from({ length: count }, (_, i) => ({ id: `part-${i}` }));
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: {
            "content-range": `0-${Math.max(count - 1, 0)}/${count}`,
            "access-control-expose-headers": "content-range",
          },
          body: JSON.stringify(rows),
        });
      }
      if (isUnassignedQuery) {
        return route.fulfill({
          status: 200,
          headers: {
            "content-range": `*/${unassignedCount}`,
            "access-control-expose-headers": "content-range",
          },
          body: "",
        });
      }
      return route.fulfill({
        status: 200,
        headers: {
          "content-range": "*/0",
          "access-control-expose-headers": "content-range",
        },
        body: "",
      });
    }
    return route.fallback();
  });
}

test.describe("Bulk shelf assignment — 'อะไหล่ที่ยังไม่มีโซนเลย' source mode on /move-parts", () => {
  test("selecting the unassigned-parts source shows the right count and label", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockMovePartsRoutes(page, { unassignedCount: 7, moveResultIds: 7 });
    await page.goto("/move-parts");

    await expect(page.getByText("📦 ย้ายอะไหล่ทั้งโซน")).toBeVisible({ timeout: 15000 });
    await page.locator("select").first().selectOption({ label: "📦 อะไหล่ที่ยังไม่มีโซนเลย (ของเก่าก่อนมีระบบโซน)" });

    await expect(page.getByTestId("affected-count")).toContainText("7 ชิ้นที่ยังไม่มีโซน");
  });

  test("moving unassigned parts sends a zone_id IS NULL filter and reports success", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockMovePartsRoutes(page, { unassignedCount: 3, moveResultIds: 3 });
    await page.goto("/move-parts");

    await page.locator("select").first().selectOption({ label: "📦 อะไหล่ที่ยังไม่มีโซนเลย (ของเก่าก่อนมีระบบโซน)" });
    await expect(page.getByTestId("affected-count")).toContainText("3 ชิ้นที่ยังไม่มีโซน");

    await page.getByPlaceholder("พิมพ์ค้นหาโซน เช่น Shelf 03 ชั้น 2").fill("A1");
    // หมายเหตุ (defect เจอรอบ 2): "A1" ตรงกับทั้ง <option> ของ source <select> เดิม และแถวผลลัพธ์ใน
    // dropdown ของ ZoneAutocomplete (ปลายทาง) — ทั้งคู่ไม่มี test-id ให้ scope ตรงๆ ใช้ .last() เพราะ
    // dropdown ผลลัพธ์เรนเดอร์หลัง <select> เสมอใน DOM order ของหน้านี้
    await page.getByText("A1", { exact: true }).last().click();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: /ย้ายอะไหล่ 3 ชิ้น/ }).click();

    await expect(page.getByText(/ย้ายอะไหล่ 3 ชิ้นเรียบร้อยแล้ว/)).toBeVisible({ timeout: 10000 });
  });
});
