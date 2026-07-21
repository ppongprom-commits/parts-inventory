// Card: "Salvage Vehicle Intake + Disassembly (core feature)"
//
// ขอบเขตรอบนี้: เฉพาะ "Intake" ตามที่อธิบายไว้ใน db/salvage_vehicle_intake_migration.sql — สร้าง
// entity salvage_vehicles, หน้ารับซากรถ (/salvage-vehicles/new), หน้ารายการ+รายละเอียด, ผูก
// parts.salvage_vehicle_id ผ่าน /add?salvage_vehicle_id=X (pattern เดียวกับ job_id ที่มีอยู่แล้ว)
//
// ❌ ไม่ครอบ: cost allocation logic (rounding rule ยังไม่ตัดสินใจในการ์ด), sold_whole/เศษเหล็ก flow,
// auto-transition เป็น disassembling (เกิดจาก DB trigger — ไม่ได้พิสูจน์ในเทส UI-mocked พวกนี้ verify
// แยกด้วย SQL จริงบน staging แทนตามที่บันทึกไว้ใน commit)
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

const SHOP_ID = "11111111-1111-1111-1111-111111111111";
const VEHICLE_ID = "42";

function vehicleRow(overrides = {}) {
  return {
    vehicle_id: Number(VEHICLE_ID),
    shop_id: SHOP_ID,
    chassis_number: "ABC123",
    license_plate: null,
    purchase_price: 50000,
    purchase_date: "2026-07-01",
    purchase_source: "ประมูล",
    zone_id: null,
    status: "in_stock",
    estimated_total_value: 40000,
    value_groups: [
      { label: "ตัวถัง", estimated_value: 20000 },
      { label: "เครื่อง/เกียร์", estimated_value: 10000 },
      { label: "กระจก/ไฟ", estimated_value: 5000 },
      { label: "เบ็ดเตล็ด", estimated_value: 5000 },
    ],
    photo_urls: [],
    notes: null,
    ...overrides,
  };
}

test.describe("Salvage vehicle intake form (/salvage-vehicles/new)", () => {
  test("requires all 4 default groups labeled with a positive total before it submits", async ({ page }) => {
    const insertCapture = [];
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await page.route("**/*.supabase.co/**", async (route) => {
      const req = route.request();
      const url = req.url();
      if (url.includes("/rest/v1/zones")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      if (url.includes("/rest/v1/salvage_vehicles") && req.method() === "POST") {
        const body = req.postDataJSON();
        insertCapture.push(body);
        return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ vehicle_id: Number(VEHICLE_ID) }) });
      }
      return route.fallback();
    });
    await page.goto("/salvage-vehicles/new");

    await expect(page.getByText("🚗 รับซากรถเข้าระบบ")).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder("").first(); // no-op guard for lint; real fill below

    // กรอกราคาซื้ออย่างเดียว ไม่กรอกกลุ่มมูลค่าเลย — ต้อง block (total = 0)
    await page.locator('input[type="number"]').first().fill("50000");
    await page.getByRole("button", { name: "บันทึกซากรถ" }).click();
    await expect(page.getByText("กรุณาประเมินมูลค่ารวมอย่างน้อย 1 บาท")).toBeVisible();
    expect(insertCapture.length).toBe(0);

    // กรอกมูลค่าประเมินให้ครบ 4 กลุ่ม (label เริ่มมีอยู่แล้วจาก default) แล้วลองใหม่
    for (let i = 0; i < 4; i++) {
      await page.getByTestId(`value-group-${i}`).locator('input[type="number"]').fill("1000");
    }
    await page.getByRole("button", { name: "บันทึกซากรถ" }).click();

    await expect.poll(() => insertCapture.length).toBeGreaterThan(0);
    expect(insertCapture[0]).toMatchObject({ estimated_total_value: 4000, purchase_price: 50000 });
    expect(insertCapture[0].value_groups).toHaveLength(4);
  });

  test("cannot remove a group below 4, can add up to 6", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await page.route("**/*.supabase.co/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/rest/v1/zones")) return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return route.fallback();
    });
    await page.goto("/salvage-vehicles/new");

    await expect(page.getByText("🚗 รับซากรถเข้าระบบ")).toBeVisible({ timeout: 15000 });
    // เริ่มที่ 4 กลุ่ม — ต้องไม่มีปุ่ม "ลบ" เลย (กันเหลือน้อยกว่า 4)
    await expect(page.getByRole("button", { name: "ลบ" })).toHaveCount(0);

    await page.getByRole("button", { name: "+ เพิ่มกลุ่ม" }).click();
    await page.getByRole("button", { name: "+ เพิ่มกลุ่ม" }).click();
    // ตอนนี้ 6 กลุ่ม — ปุ่ม "+ เพิ่มกลุ่ม" ต้องหายไป (เกิน 6 ไม่ได้)
    await expect(page.getByRole("button", { name: "+ เพิ่มกลุ่ม" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "ลบ" })).toHaveCount(6);
  });
});

test.describe("Salvage vehicle detail + disassemble link", () => {
  async function mockDetailRoutes(page, vehicle, parts = []) {
    await page.route("**/*.supabase.co/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/rest/v1/salvage_vehicles") && url.includes(`vehicle_id=eq.${VEHICLE_ID}`)) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(vehicle) });
      }
      if (url.includes("/rest/v1/parts") && url.includes("salvage_vehicle_id=eq.")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(parts) });
      }
      return route.fallback();
    });
  }

  test("shows the 'ถอดอะไหล่จากคันนี้' button for an in_stock vehicle, links to /add with the id", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockDetailRoutes(page, vehicleRow());
    await page.goto(`/salvage-vehicles/${VEHICLE_ID}`);

    await expect(page.getByTestId("vehicle-status")).toContainText("ยังไม่ถอด", { timeout: 15000 });
    await expect(page.getByTestId("disassemble-button")).toBeVisible();
    // ไม่มีอะไหล่เลย -> ยังไม่โชว์ปุ่ม "ถอดหมดแล้ว/ปิดคัน" (ต้องมีอย่างน้อย 1 ชิ้นก่อน)
    await expect(page.getByTestId("mark-fully-disassembled")).toHaveCount(0);
  });

  test("fully_disassembled or sold_whole vehicles hide the disassemble button", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await mockDetailRoutes(page, vehicleRow({ status: "fully_disassembled" }), [
      { id: "p1", part_name: "กันชนหน้า", price: 500, status: "in_stock" },
    ]);
    await page.goto(`/salvage-vehicles/${VEHICLE_ID}`);

    await expect(page.getByTestId("vehicle-status")).toContainText("ถอดหมดแล้ว", { timeout: 15000 });
    await expect(page.getByTestId("disassemble-button")).toHaveCount(0);
  });

  test("/add shows the salvage-vehicle banner when linked via query param", async ({ page }) => {
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await page.route("**/*.supabase.co/**", async (route) => {
      const url = route.request().url();
      if (url.includes("/rest/v1/zones")) return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return route.fallback();
    });
    await page.goto(`/add?salvage_vehicle_id=${VEHICLE_ID}`);

    await expect(page.getByTestId("salvage-vehicle-banner")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("salvage-vehicle-banner")).toContainText(VEHICLE_ID);
  });
});
