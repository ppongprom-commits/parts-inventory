// การ์ด "Salvage Vehicle Intake + Disassembly (core feature)" — คืนวันที่ 21 ก.ค. 2026
// ขอบเขต: เฉพาะ "Intake" — app/salvage-vehicles/{page,new/page,[id]/page}.js
// ไม่รวม cost allocation logic (ยังไม่ตัดสินใจในการ์ด — ดู db/salvage_vehicle_intake_migration.sql)
import { test, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loginWithEmail, loginWithStaffPin, expectLoginSucceeded, expectRoleForbidden } from "../fixtures/auth-helpers.js";
import { adminClient, getShopIdByName } from "../fixtures/db-client.js";
import { accounts } from "../fixtures/test-data.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TINY_PNG = path.join(__dirname, "..", "fixtures", "test-assets", "tiny.png");

let mainShopId;
const vehicleIds = [];
const partIds = [];

test.beforeAll(async () => {
  mainShopId = await getShopIdByName("QA Test Shop (auto)");
});

test.afterAll(async () => {
  for (const id of partIds) await adminClient().from("parts").delete().eq("id", id);
  for (const id of vehicleIds) await adminClient().from("salvage_vehicles").delete().eq("vehicle_id", id);
});

test("SALVAGE-001 สร้างซากรถใหม่ด้วย 4 กลุ่มมูลค่าเริ่มต้น -> status เริ่มที่ in_stock", async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto("/salvage-vehicles/new");

  await page.getByLabel("ราคาซื้อทั้งคัน (บาท)").fill("50000");
  for (let i = 0; i < 4; i++) {
    await page.getByTestId(`value-group-${i}`).locator('input[type="number"]').fill("10000");
  }
  await expect(page.getByTestId("estimated-total")).toContainText("40,000");

  await page.getByRole("button", { name: "บันทึกซากรถ" }).click();
  await expect(page).toHaveURL(/\/salvage-vehicles\/\d+/, { timeout: 10_000 });

  const vehicleId = Number(page.url().match(/\/salvage-vehicles\/(\d+)/)[1]);
  vehicleIds.push(vehicleId);

  const { data } = await adminClient()
    .from("salvage_vehicles")
    .select("status, estimated_total_value, value_groups")
    .eq("vehicle_id", vehicleId)
    .single();
  expect(data.status).toBe("in_stock");
  expect(Number(data.estimated_total_value)).toBe(40000);
  expect(data.value_groups.length).toBe(4);
});

test("SALVAGE-002 บังคับประเมินมูลค่ารวม > 0 — ปล่อยทุกกลุ่มเป็น 0 ต้อง error ไม่บันทึก", async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto("/salvage-vehicles/new");

  await page.getByLabel("ราคาซื้อทั้งคัน (บาท)").fill("10000");
  // ไม่กรอกมูลค่าประเมินกลุ่มไหนเลย (ปล่อยว่าง = 0 ทั้งหมด)
  await page.getByRole("button", { name: "บันทึกซากรถ" }).click();

  await expect(page.locator(".msg.error", { hasText: "กรุณาประเมินมูลค่ารวมอย่างน้อย 1 บาท" })).toBeVisible({
    timeout: 8000,
  });
  await expect(page).toHaveURL(/\/salvage-vehicles\/new/);
});

test("SALVAGE-003 ปุ่มลบกลุ่มถูก disable เมื่อเหลือ 4 กลุ่ม (บังคับขั้นต่ำตามการ์ด) และเพิ่มได้สูงสุด 6", async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto("/salvage-vehicles/new");

  // เริ่มต้นมี 4 กลุ่ม — ต้องไม่มีปุ่ม "ลบ" ให้กดเลยสักกลุ่ม (removeGroup กัน length<=4 ไว้ที่ state
  // ก็จริง แต่ UI เองก็ไม่ render ปุ่มลบเลยถ้า groups.length ไม่ > 4)
  await expect(page.getByTestId("value-group-0").getByRole("button", { name: "ลบ" })).toHaveCount(0);

  await page.getByRole("button", { name: "+ เพิ่มกลุ่ม" }).click();
  await page.getByRole("button", { name: "+ เพิ่มกลุ่ม" }).click();
  await expect(page.getByTestId("value-group-5")).toBeVisible();
  // ครบ 6 กลุ่มแล้ว ปุ่ม "+ เพิ่มกลุ่ม" ต้องหายไป (groups.length < 6 เท่านั้นถึงโชว์)
  await expect(page.getByRole("button", { name: "+ เพิ่มกลุ่ม" })).toHaveCount(0);
});

test("SALVAGE-004 หน้ารายการ /salvage-vehicles แสดงซากรถที่สร้างไว้พร้อมสถานะถูกต้อง", async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto("/salvage-vehicles");
  await expect(page.getByText("ยังไม่ถอด")).toBeVisible({ timeout: 8000 });
});

test("SALVAGE-005 assistant เข้า /salvage-vehicles/new ไม่ได้ (ไม่อยู่ใน allowedRoles)", async ({ page }) => {
  await loginWithStaffPin(page, accounts.assistant.username, accounts.assistant.pin);
  await expectLoginSucceeded(page);
  await page.goto("/salvage-vehicles/new");
  await expectRoleForbidden(page, "assistant");
});

test("SALVAGE-006 ถอดชิ้นแรกผ่าน /add?salvage_vehicle_id=X -> status auto-transition เป็น disassembling", async ({ page }) => {
  const { data: vehicle, error } = await adminClient()
    .from("salvage_vehicles")
    .insert({
      shop_id: mainShopId,
      purchase_price: 20000,
      estimated_total_value: 20000,
      value_groups: [{ label: "QA", estimated_value: 20000 }],
    })
    .select("vehicle_id")
    .single();
  expect(error).toBeNull();
  vehicleIds.push(vehicle.vehicle_id);

  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto(`/add?salvage_vehicle_id=${vehicle.vehicle_id}`);

  const marker = `QA-SALVAGE-PART-${Date.now()}`;
  await page.getByLabel("ชื่อชิ้นส่วน *").fill(marker);
  await page.locator('input[type="file"][multiple]').setInputFiles([TINY_PNG]);
  await expect(page.locator(".photo-thumb")).toHaveCount(1, { timeout: 8000 });

  await page.getByRole("button", { name: /บันทึก/ }).click();
  await expect(page.locator(".msg.success")).toBeVisible({ timeout: 10_000 });

  const { data: part } = await adminClient()
    .from("parts")
    .select("id, salvage_vehicle_id")
    .eq("shop_id", mainShopId)
    .eq("part_name", marker)
    .single();
  expect(part.salvage_vehicle_id).toBe(vehicle.vehicle_id);
  partIds.push(part.id);

  const { data: vehicleAfter } = await adminClient()
    .from("salvage_vehicles")
    .select("status")
    .eq("vehicle_id", vehicle.vehicle_id)
    .single();
  expect(vehicleAfter.status).toBe("disassembling");
});
