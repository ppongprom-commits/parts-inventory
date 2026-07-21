// Card: "Salvage vehicle cost allocation — edge cases to design for" (Priority: Medium)
//
// Scope this run: ONLY edge case 1 (write-off), as a generic action on any part — see
// db/salvage_write_off_migration.sql header for what's deliberately NOT done (the full
// relative-sales-value allocation engine itself, which needs parts.allocated_cost and is tied to
// the unstarted Accounting Module).
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

const SHOP_ID = "11111111-1111-1111-1111-111111111111";
const PART_ID = "eeeeeeee-0000-0000-0000-000000000002";

function partRow(overrides = {}) {
  return {
    id: PART_ID,
    shop_id: SHOP_ID,
    part_name: "กระจกมองข้าง",
    item_type: "salvage",
    quantity: "2",
    price: 400,
    is_active: true,
    zone_id: null,
    zone_code: null,
    photo_urls: [],
    photo_url: null,
    ...overrides,
  };
}

async function mockEditRoutes(page, { part, updateCapture = null }) {
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (url.includes("/rest/v1/parts") && url.includes(`id=eq.${PART_ID}`)) {
      if (method === "PATCH") {
        const body = req.postDataJSON();
        if (updateCapture) updateCapture.push(body);
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(part) });
    }
    if (url.includes("/rest/v1/zones") || url.includes("/rest/v1/rpc/get_part_audit_history") || url.includes("/rest/v1/part_sales")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return route.fallback();
  });
}

test.describe("Write-off action on /edit/[id]", () => {
  test("providing a reason writes off the part: is_active=false + reason/who/when recorded", async ({ page }) => {
    const updateCapture = [];
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockEditRoutes(page, { part: partRow(), updateCapture });

    page.once("dialog", (dialog) => {
      expect(dialog.type()).toBe("prompt");
      dialog.accept("ของเสียหายระหว่างเก็บในโกดัง");
    });

    await page.goto(`/edit/${PART_ID}`);
    await expect(page.getByRole("button", { name: "📉 ตัดเป็นค่าเสียหาย (Write-off)" })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: "📉 ตัดเป็นค่าเสียหาย (Write-off)" }).click();

    await expect.poll(() => updateCapture.length).toBeGreaterThan(0);
    expect(updateCapture[0]).toMatchObject({
      is_active: false,
      write_off_reason: "ของเสียหายระหว่างเก็บในโกดัง",
    });
    expect(updateCapture[0].written_off_at).toBeTruthy();
  });

  test("canceling the prompt does nothing (no update sent)", async ({ page }) => {
    const updateCapture = [];
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockEditRoutes(page, { part: partRow(), updateCapture });

    page.once("dialog", (dialog) => dialog.dismiss());

    await page.goto(`/edit/${PART_ID}`);
    await expect(page.getByRole("button", { name: "📉 ตัดเป็นค่าเสียหาย (Write-off)" })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: "📉 ตัดเป็นค่าเสียหาย (Write-off)" }).click();

    // ให้เวลา event loop นิดหน่อยเพื่อยืนยันว่าไม่มี network call เกิดขึ้นจริง (ไม่ใช่แค่ยังไม่ทัน)
    await page.waitForTimeout(300);
    expect(updateCapture.length).toBe(0);
  });

  test("an empty reason is blocked client-side (no update sent, error shown)", async ({ page }) => {
    const updateCapture = [];
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockEditRoutes(page, { part: partRow(), updateCapture });

    page.once("dialog", (dialog) => dialog.accept("   ")); // ช่องว่างล้วนๆ

    await page.goto(`/edit/${PART_ID}`);
    await expect(page.getByRole("button", { name: "📉 ตัดเป็นค่าเสียหาย (Write-off)" })).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: "📉 ตัดเป็นค่าเสียหาย (Write-off)" }).click();

    await expect(page.getByText("กรุณาระบุเหตุผลก่อนตัดเป็นค่าเสียหาย")).toBeVisible();
    expect(updateCapture.length).toBe(0);
  });

  test("already written-off parts (is_active=false) don't show the write-off button again", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockEditRoutes(page, { part: partRow({ is_active: false, write_off_reason: "เดิม" }) });

    // ชื่อชิ้นส่วนบนหน้านี้แสดงเป็น value ของ input ไม่ใช่ text node เฉยๆ (ต่างจากหน้า /admin/trash)
    // — เช็ค heading ของหน้าแทนเพื่อยืนยันว่าโหลดเสร็จแล้วก่อนเช็คปุ่ม
    await page.goto(`/edit/${PART_ID}`);
    await expect(page.getByRole("heading", { name: "✏️ แก้ไขอะไหล่" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: "📉 ตัดเป็นค่าเสียหาย (Write-off)" })).toHaveCount(0);
  });
});

test.describe("Trash page (/admin/trash) shows a distinct write-off badge", () => {
  test("a written-off part shows its reason and date, separate from a plain hidden part", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await page.route("**/*.supabase.co/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/rest/v1/parts") && url.includes("is_active=eq.false")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            partRow({
              id: "written-off-1",
              is_active: false,
              write_off_reason: "พังระหว่างขนส่ง",
              written_off_at: "2026-07-20T10:00:00Z",
            }),
            partRow({ id: "plain-hidden-1", part_name: "เบาะหลัง", is_active: false, write_off_reason: null }),
          ]),
        });
      }
      return route.fallback();
    });

    await page.goto("/admin/trash");
    await expect(page.getByTestId("write-off-badge-written-off-1")).toContainText("พังระหว่างขนส่ง", {
      timeout: 15000,
    });
    await expect(page.getByTestId("write-off-badge-plain-hidden-1")).toHaveCount(0);
  });
});
