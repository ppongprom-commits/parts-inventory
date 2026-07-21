// Card: "Cart-based selling flow — สร้างตะกร้าก่อนขาย" (Priority: Highest, L)
//
// ทำพร้อมกันเป็นชุดเดียวตามการ์ด — cart + payment_method (reuse คอลัมน์เดิม) + ระบบเอกสาร/ใบเสร็จ
// แบบย่อ (receipt เท่านั้น, ออกตอน Confirm Pick). ดู db/cart_based_selling_flow_migration.sql
// หัวไฟล์สำหรับ scope เต็ม + สิ่งที่ตั้งใจไม่ทำรอบนี้ (tax invoice, pack/ship เต็มรูป, branch transfer)
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

const SHOP_ID = "11111111-1111-1111-1111-111111111111";
const PART_A = "cccccccc-0000-0000-0000-00000000000a";
const PART_B = "cccccccc-0000-0000-0000-00000000000b";
const ORDER_ID = 555;

function partsRow(overrides = {}) {
  return [
    { id: PART_A, part_name: "โช้คอัพหน้า", quantity: 5, price: 800 },
    { id: PART_B, part_name: "โช้คอัพหลัง", quantity: 3, price: 600 },
  ].map((p) => ({ ...p, ...(overrides[p.id] || {}) }));
}

async function mockCheckoutRoutes(page, { parts, deductFails = {}, capture = {} }) {
  capture.orderInsert = capture.orderInsert || [];
  capture.saleInserts = capture.saleInserts || [];
  capture.partUpdates = capture.partUpdates || [];
  capture.documentInserts = capture.documentInserts || [];
  capture.orderUpdates = capture.orderUpdates || [];

  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (url.includes("/rest/v1/parts") && method === "GET" && url.includes("id=in.")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(parts) });
    }
    if (url.includes("/rest/v1/parts") && method === "PATCH") {
      capture.partUpdates.push(req.postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (url.includes("/rest/v1/sale_orders") && method === "POST") {
      capture.orderInsert.push(req.postDataJSON());
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ order_id: ORDER_ID, shop_id: SHOP_ID, status: "pending_pick" }),
      });
    }
    if (url.includes("/rest/v1/sale_orders") && method === "PATCH") {
      capture.orderUpdates.push(req.postDataJSON());
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (url.includes("/rest/v1/rpc/deduct_part_stock")) {
      const body = req.postDataJSON();
      if (deductFails[body.p_part_id]) {
        return route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({ message: deductFails[body.p_part_id] }),
        });
      }
      const part = parts.find((p) => p.id === body.p_part_id);
      const remaining = (part?.quantity ?? 0) - body.p_quantity;
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(remaining) });
    }
    if (url.includes("/rest/v1/rpc/generate_doc_number")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify("2607-000001") });
    }
    if (url.includes("/rest/v1/part_sales") && method === "POST") {
      capture.saleInserts.push(req.postDataJSON());
      return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    }
    if (url.includes("/rest/v1/part_sales") && method === "PATCH") {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    if (url.includes("/rest/v1/part_sale_documents") && method === "POST") {
      capture.documentInserts.push(req.postDataJSON());
      return route.fulfill({ status: 201, contentType: "application/json", body: "[]" });
    }
    return route.fallback();
  });
}

test.describe("Cart selection mode on / (parts list)", () => {
  test("owner sees the '🛒 เลือกขาย' button; field_scanner does not", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await page.route("**/*.supabase.co/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/rest/v1/parts")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      if (url.includes("/rest/v1/zones") || url.includes("/rest/v1/options")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      return route.fallback();
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /เลือกขาย/ })).toBeVisible({ timeout: 15000 });
  });

  test("field_scanner does NOT see the '🛒 เลือกขาย' button (cannot sell)", async ({ page }) => {
    await installMockAuth(page, { role: "field_scanner", shopId: SHOP_ID });
    await page.route("**/*.supabase.co/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/rest/v1/parts") || url.includes("/rest/v1/zones") || url.includes("/rest/v1/options")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      return route.fallback();
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /เลือกพิมพ์ QR/ })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /เลือกขาย/ })).toHaveCount(0);
  });
});

test.describe("/checkout — cart checkout + picking + receipt", () => {
  test("blocks submit client-side when no payment method is chosen (no order created)", async ({ page }) => {
    const capture = {};
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockCheckoutRoutes(page, { parts: partsRow(), capture });

    await page.goto(`/checkout?ids=${PART_A}`);
    await expect(page.getByText("โช้คอัพหน้า")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "✓ ยืนยันการขายทั้งหมด" }).click();

    await expect(page.getByText("กรุณาเลือกวิธีชำระเงิน")).toBeVisible();
    expect(capture.orderInsert.length).toBe(0);
  });

  test("happy path: 2 items sell successfully, walk-in confirm-pick issues a receipt", async ({ page }) => {
    const capture = {};
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockCheckoutRoutes(page, { parts: partsRow(), capture });

    await page.goto(`/checkout?ids=${PART_A},${PART_B}`);
    await expect(page.getByText("โช้คอัพหน้า")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("โช้คอัพหลัง")).toBeVisible();

    await page.getByLabel("วิธีชำระเงิน").selectOption("cash");
    await page.getByRole("button", { name: "✓ ยืนยันการขายทั้งหมด" }).click();

    await expect(page.getByText("ขายสำเร็จ 2/2 ชิ้น")).toBeVisible({ timeout: 10000 });
    expect(capture.saleInserts.length).toBe(2);
    expect(capture.saleInserts.every((s) => s.item_status === "pending_pick" && s.order_id === ORDER_ID)).toBe(true);

    await page
      .getByRole("button", { name: "✓ Confirm Pick เสร็จ — ส่งมอบลูกค้าหน้าร้านทันที (ออกใบเสร็จ)" })
      .click();

    await expect(page.getByText(/เลขที่ใบเสร็จ 2607-000001/)).toBeVisible({ timeout: 10000 });
    expect(capture.documentInserts.length).toBe(1);
    expect(capture.documentInserts[0]).toMatchObject({ order_id: ORDER_ID, doc_type: "receipt" });
    expect(capture.orderUpdates[capture.orderUpdates.length - 1]).toMatchObject({ status: "completed" });
  });

  test("partial failure: item 2's stock got taken by another session — item 1 still succeeds, is not rolled back", async ({
    page,
  }) => {
    const capture = {};
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockCheckoutRoutes(page, {
      parts: partsRow(),
      deductFails: { [PART_B]: "จำนวนในสต็อกไม่พอ (เหลือน้อยกว่าที่จะตัด)" },
      capture,
    });

    await page.goto(`/checkout?ids=${PART_A},${PART_B}`);
    await expect(page.getByText("โช้คอัพหน้า")).toBeVisible({ timeout: 15000 });

    await page.getByLabel("วิธีชำระเงิน").selectOption("cash");
    await page.getByRole("button", { name: "✓ ยืนยันการขายทั้งหมด" }).click();

    await expect(page.getByText("ขายสำเร็จ 1/2 ชิ้น")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/มีบางชิ้นขายไม่สำเร็จ/)).toBeVisible();
    await expect(page.getByText(/จำนวนในสต็อกไม่พอ/)).toBeVisible();
    // only the successful item made it into part_sales — the failed one was never inserted
    expect(capture.saleInserts.length).toBe(1);
    expect(capture.saleInserts[0].part_id).toBe(PART_A);
  });

  test("selling qty greater than remaining stock is blocked client-side before any network call", async ({ page }) => {
    const capture = {};
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockCheckoutRoutes(page, { parts: partsRow(), capture });

    await page.goto(`/checkout?ids=${PART_A}`);
    await expect(page.getByText("โช้คอัพหน้า")).toBeVisible({ timeout: 15000 });

    const qtyInput = page.locator('input[type="number"]').first();
    await qtyInput.fill("999");
    await page.getByLabel("วิธีชำระเงิน").selectOption("cash");
    await page.getByRole("button", { name: "✓ ยืนยันการขายทั้งหมด" }).click();

    await expect(page.getByText(/เหลือในสต็อกแค่ 5 ชิ้น/)).toBeVisible();
    expect(capture.orderInsert.length).toBe(0);
  });

  test("removing an item from the cart on /checkout excludes it from the sell-all submission", async ({ page }) => {
    const capture = {};
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockCheckoutRoutes(page, { parts: partsRow(), capture });

    await page.goto(`/checkout?ids=${PART_A},${PART_B}`);
    await expect(page.getByText("โช้คอัพหลัง")).toBeVisible({ timeout: 15000 });

    await page.getByRole("button", { name: "✕ ลบออกจากตะกร้า" }).nth(1).click();
    await expect(page.getByText("โช้คอัพหลัง")).toHaveCount(0);

    await page.getByLabel("วิธีชำระเงิน").selectOption("cash");
    await page.getByRole("button", { name: "✓ ยืนยันการขายทั้งหมด" }).click();

    await expect(page.getByText("ขายสำเร็จ 1/1 ชิ้น")).toBeVisible({ timeout: 10000 });
    expect(capture.saleInserts.length).toBe(1);
    expect(capture.saleInserts[0].part_id).toBe(PART_A);
  });
});
