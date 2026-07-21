// Card: "บันทึกวิธีชำระเงินแยกทุกช่องทาง (payment_method)"
//
// ขอบเขตรอบนี้: เพิ่มคอลัมน์ + ใช้จริงเฉพาะฟอร์มขายทีละชิ้นที่มีอยู่แล้ว (/edit/[id]) — ไม่แตะ
// cart-based selling flow / part_sale_documents (ยังไม่เริ่มทั้งคู่) ตามที่อธิบายไว้ใน
// db/payment_method_migration.sql — คอลัมน์เดียวกันนี้ cart flow ใช้ต่อได้เลยตอนเริ่มทำจริง
//
// ✅ ตัดสินใจ: บังคับเลือกวิธีชำระเงินทุกครั้ง ไม่ default เงียบๆ (ตรงกับ test scenario ในการ์ด)
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

const SHOP_ID = "11111111-1111-1111-1111-111111111111";
const PART_ID = "eeeeeeee-0000-0000-0000-000000000001";

function partRow() {
  return {
    id: PART_ID,
    shop_id: SHOP_ID,
    part_name: "ไฟเลี้ยว",
    item_type: "salvage",
    quantity: "5",
    price: 300,
    zone_id: null,
    zone_code: null,
    photo_urls: [],
    photo_url: null,
  };
}

async function mockEditRoutes(page, { sales = [], insertCapture = null }) {
  await page.route("**/*.supabase.co/**", async (route) => {
    const req = route.request();
    const url = req.url();
    const method = req.method();

    if (url.includes("/rest/v1/parts") && url.includes(`id=eq.${PART_ID}`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(partRow()) });
    }
    if (url.includes("/rest/v1/rpc/deduct_part_stock")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "4" });
    }
    if (url.includes("/rest/v1/part_sales")) {
      if (method === "POST") {
        const body = req.postDataJSON();
        if (insertCapture) insertCapture.push(body);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify([body]) });
      }
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sales) });
    }
    if (url.includes("/rest/v1/zones") || url.includes("/rest/v1/rpc/get_part_audit_history")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return route.fallback();
  });
}

test.describe("payment_method on the existing single-item sell form (/edit/[id])", () => {
  test("submitting without a payment method is blocked client-side (no insert fired)", async ({ page }) => {
    const insertCapture = [];
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockEditRoutes(page, { insertCapture });
    await page.goto(`/edit/${PART_ID}`);

    await expect(page.getByText("💰 ขายอะไหล่ชิ้นนี้")).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder("สูงสุด 5").fill("1");
    await page.getByPlaceholder("เช่น 300").fill("300");
    await page.getByRole("button", { name: "✓ บันทึกการขาย" }).click();

    await expect(page.getByText("กรุณาเลือกวิธีชำระเงิน")).toBeVisible();
    expect(insertCapture.length).toBe(0);
  });

  test("selecting a payment method includes it in the part_sales insert", async ({ page }) => {
    const insertCapture = [];
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockEditRoutes(page, { insertCapture });
    await page.goto(`/edit/${PART_ID}`);

    await expect(page.getByText("💰 ขายอะไหล่ชิ้นนี้")).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder("สูงสุด 5").fill("1");
    await page.getByPlaceholder("เช่น 300").fill("300");
    await page.getByLabel("วิธีชำระเงิน").selectOption("bank_transfer");
    await page.getByRole("button", { name: "✓ บันทึกการขาย" }).click();

    await expect.poll(() => insertCapture.length).toBeGreaterThan(0);
    expect(insertCapture[0]).toMatchObject({ payment_method: "bank_transfer" });
    await expect(page.getByText("บันทึกการขายสำเร็จ")).toBeVisible();
  });

  test("sale history shows the payment method label, and 'ไม่ระบุ' for old null rows", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockEditRoutes(page, {
      sales: [
        { sale_id: 1, part_id: PART_ID, quantity_sold: 2, sale_price: 300, sold_to: null, payment_method: "cash", sold_at: "2026-07-20T10:00:00Z" },
        { sale_id: 2, part_id: PART_ID, quantity_sold: 1, sale_price: 300, sold_to: null, payment_method: null, sold_at: "2026-07-19T10:00:00Z" },
      ],
    });
    await page.goto(`/edit/${PART_ID}`);

    await expect(page.getByText("ประวัติการขาย")).toBeVisible({ timeout: 15000 });
    // หมายเหตุ (defect เจอรอบ 1): "เงินสด" ก็เป็นหนึ่งใน <option> ของ select วิธีชำระเงินในฟอร์มขาย
    // ด้านบนด้วย — ต้อง scope ไปที่บรรทัดประวัติการขายจริง (มีข้อความ "ชิ้น ×" ประกอบ) ไม่ใช่แค่หา
    // คำว่า "เงินสด" เฉยๆ ทั่วทั้งหน้า
    await expect(page.getByText(/ชิ้น × 300 บาท \(เงินสด\)/)).toBeVisible();
    await expect(page.getByText(/ไม่ระบุวิธีชำระ/)).toBeVisible();
  });
});
