// Card: "Accounting Module — ผังบัญชี + journal entries + intercompany" (Priority: High, XL)
//
// Scope this run: ONLY the decided "Informal Report" sub-scope (รายงานอย่างง่าย ไม่ต้องเปิด module
// บัญชี) applied to the existing /admin/reports page — แยกตามวิธีชำระเงิน (payment_method), ตามที่
// การ์ดตัดสินใจไว้ (19 ก.ค. 2026). The full module itself (chart of accounts, journal entries,
// intercompany, consolidation) is XL, needs a real accountant consulted on VAT timing (มาตรา 78/3,
// explicitly flagged in the card as an external dependency), and depends on the still-undecided
// "Salvage cost allocation" card for allocated_cost (needed for gross-profit-per-item, which this
// run does NOT add — the report has no cost data to compute margin from yet). None of that XL
// scope is attempted tonight.
//
// Bug found and fixed while touching this page: the sales query never filtered by
// part_sales.item_status, so items marked 'not_found' during Cart-based selling flow's pick step
// (stock already restored, never actually delivered) were still counted as revenue. Fixed with
// .neq("item_status", "not_found").
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

const SHOP_ID = "11111111-1111-1111-1111-111111111111";

function saleRow(overrides = {}) {
  return {
    sale_id: 1,
    quantity_sold: 1,
    sale_price: 500,
    sold_to: null,
    sold_at: "2026-07-21T10:00:00Z",
    payment_method: "cash",
    item_status: "completed",
    part_id: "part-1",
    parts: { part_name: "โช้คอัพ" },
    ...overrides,
  };
}

async function mockReportsRoutes(page, { sales, capturedUrls = null }) {
  await page.route("**/*.supabase.co/**", async (route) => {
    const url = route.request().url();
    if (capturedUrls && url.includes("/rest/v1/part_sales")) capturedUrls.push(url);
    if (url.includes("/rest/v1/part_sales")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sales) });
    }
    if (url.includes("/rest/v1/job_documents")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return route.fallback();
  });
}

test.describe("Sales report (/admin/reports) — Informal Report scope", () => {
  test("breaks down part sales revenue by payment method", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockReportsRoutes(page, {
      sales: [
        saleRow({ sale_id: 1, payment_method: "cash", sale_price: 500, quantity_sold: 1 }),
        saleRow({ sale_id: 2, payment_method: "bank_transfer", sale_price: 950, quantity_sold: 1 }),
        saleRow({ sale_id: 3, payment_method: "cash", sale_price: 300, quantity_sold: 1 }),
      ],
    });

    await page.goto("/admin/reports");
    await expect(page.getByText("ยอดขายอะไหล่ แยกตามวิธีชำระเงิน")).toBeVisible({ timeout: 15000 });

    // เงินสด: 500 + 300 = 800 (ยอดรวมต่อ method เฉพาะในการ์ดสรุป ไม่ใช่ยอดต่อรายการ — สโคปด้วย
    // การ์ดที่มีป้าย "เงินสด" กำกับอยู่ กันชนกับ "1 ชิ้น × 500 บาท" ที่โผล่ในรายการด้านล่างด้วย)
    const cashCard = page.locator(".card", { hasText: "เงินสด" });
    await expect(cashCard.getByText("800 บาท")).toBeVisible();
    // โอนเงิน: 950
    const transferCard = page.locator(".card", { hasText: "โอนเงิน" });
    await expect(transferCard.getByText("950 บาท")).toBeVisible();
  });

  test("old rows with payment_method=null show as 'ไม่ระบุ' instead of crashing", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockReportsRoutes(page, {
      sales: [saleRow({ sale_id: 1, payment_method: null })],
    });

    await page.goto("/admin/reports");
    await expect(page.getByText("ไม่ระบุ")).toBeVisible({ timeout: 15000 });
  });

  test("the query excludes item_status=not_found (bug fix — restored stock shouldn't count as revenue)", async ({
    page,
  }) => {
    const capturedUrls = [];
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockReportsRoutes(page, { sales: [], capturedUrls });

    await page.goto("/admin/reports");
    await expect(page.getByText("📊 รายงานการขาย")).toBeVisible({ timeout: 15000 });

    await expect.poll(() => capturedUrls.length).toBeGreaterThan(0);
    expect(capturedUrls.some((u) => u.includes("item_status=neq.not_found"))).toBe(true);
  });
});
