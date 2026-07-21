// Card: "ขยาย audit_log ให้ครอบทั้งระบบ + ใส่ changed_by_user_id จริง"
//
// Scope รอบนี้: ขยาย coverage จาก model_generations/model_trims เดิม ไปที่ตาราง parts
// (เพิ่ม/แก้/ลบ — ครอบการขายที่แก้ quantity ผ่าน RPC ด้วย เพราะ trigger จับระดับตาราง) +
// UI แสดงประวัติการแก้ไขที่หน้า edit part (ตัดสินใจไว้ในการ์ด Field Scanner 19 ก.ค. 2026)
//
// ⚠️ Schema drift ที่พบระหว่างทำ: staging มี audit_log.record_uuid/shop_id, RLS policy ที่ scope
// ตาม shop ถูกต้องอยู่แล้ว (ไม่ใช่ "Allow public read" แบบเก่าที่ยังค้างอยู่ในไฟล์ git บางไฟล์),
// และ trigger trg_audit_parts เวอร์ชันหนึ่งอยู่แล้วจากเซสชันก่อนหน้า (ไม่เคย commit) — export
// กลับทั้งหมดใน db/audit_log_parts_coverage_migration.sql
//
// เทสชุดนี้ครอบ UI (PartAuditHistory component) ผ่าน network mock — ไม่ได้พิสูจน์ DB trigger/RPC
// จริง (ทำไม่ได้ในแซนด์บ็อกซ์นี้ที่ไม่มี network ออก *.supabase.co)
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

const PART_ID = "19bec889-3f7b-49ee-8c4e-7953df0e2bce";
const SHOP_ID = "11111111-1111-1111-1111-111111111111";

function partRow(overrides = {}) {
  return {
    id: PART_ID,
    shop_id: SHOP_ID,
    name: "กันชนหน้า",
    zone_id: null,
    zone_code: null,
    is_active: true,
    photo_urls: [],
    photo_url: null,
    ...overrides,
  };
}

async function mockEditPageRoutes(page, { historyRows }) {
  await page.route("**/*.supabase.co/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/rest/v1/parts") && url.includes(`id=eq.${PART_ID}`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(partRow()) });
    }
    if (url.includes("/rest/v1/rpc/get_part_audit_history")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(historyRows) });
    }
    if (url.includes("/rest/v1/zones")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    return route.fallback();
  });
}

test.describe("Part edit history (audit_log coverage for parts)", () => {
  test("shows a toggle with entry count, and expands to show INSERT + UPDATE with field diffs", async ({ page }) => {
    const historyRows = [
      {
        audit_id: 2,
        action: "UPDATE",
        old_data: { part_name: "กันชนหน้าเก่า", price: 500, updated_at: "2026-07-20T10:00:00Z" },
        new_data: { part_name: "กันชนหน้า", price: 800, updated_at: "2026-07-20T11:00:00Z" },
        changed_by_user_id: "a11d07c6-0c2e-49b6-ba64-85a3d6f7cee5",
        changed_at: "2026-07-20T11:00:00Z",
      },
      {
        audit_id: 1,
        action: "INSERT",
        old_data: null,
        new_data: { part_name: "กันชนหน้าเก่า", price: 500 },
        changed_by_user_id: "a11d07c6-0c2e-49b6-ba64-85a3d6f7cee5",
        changed_at: "2026-07-20T09:00:00Z",
      },
    ];
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockEditPageRoutes(page, { historyRows });
    await page.goto(`/edit/${PART_ID}`);

    const toggle = page.getByTestId("part-history-toggle");
    await expect(toggle).toBeVisible({ timeout: 15000 });
    await expect(toggle).toContainText("2");
    await expect(page.getByTestId("part-history-list")).toHaveCount(0);

    await toggle.click();
    const list = page.getByTestId("part-history-list");
    await expect(list).toBeVisible();
    await expect(list).toContainText("สร้างรายการ");
    await expect(list).toContainText("แก้ไข");
    // updated_at ไม่ควรโผล่ใน diff (ตัดออกโดยตั้งใจ — เปลี่ยนทุกครั้งอยู่แล้ว ไม่มีความหมายกับผู้ใช้)
    await expect(list).not.toContainText("updated_at");
    // ราคา 500 -> 800 ต้องเห็นค่าที่เปลี่ยนจริง
    await expect(list).toContainText("500");
    await expect(list).toContainText("800");
  });

  test("no history entries -> component renders nothing", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockEditPageRoutes(page, { historyRows: [] });
    await page.goto(`/edit/${PART_ID}`);

    await expect(page.getByText("✏️ แก้ไขอะไหล่")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("part-history-toggle")).toHaveCount(0);
  });
});
