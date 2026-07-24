// การ์ด "Salvage vehicle cost allocation — edge cases to design for"
// (page 3a1f39f456498194a822f5d39f7bf608)
//
// ขอบเขตไฟล์นี้ — เฉพาะ edge cases 1, 2, 3, 5 (edge case 4 ยัง deferred อยู่ รอ Accounting Module):
//   EC1 — write-off เป็น generic action บนตัว part (verify ว่าใช้ได้กับ part ที่ไม่เกี่ยวกับ salvage
//         เลยด้วย ไม่ใช่แค่ salvage — ตามมติการ์ดที่ต้องให้ "โอนอะไหล่ข้ามสาขา" reuse ได้)
//   EC2 — เจอของมีค่าที่ไม่ได้ประเมินไว้ตอนแรก -> estimated_value=null, allocated_cost=0, ไม่กระทบ
//         อะไหล่ชิ้นอื่นในคันเดียวกันเลย
//   EC3 — work order ถอด/ทำความสะอาด -> labor_cost รวมเข้าฐานคำนวณ (purchase_price + labor_cost)
//         ก่อนปันสัดส่วน, ปิดงาน -> labor_cost เปลี่ยนจาก provisional เป็น final โดยไม่ recalculate
//         อะไหล่ที่คำนวณ allocated_cost ไปแล้วก่อนหน้าย้อนหลัง
//   EC5 — ขายได้มากกว่าประมาณการ -> ไม่มี recalculation เกิดขึ้น (regression test กันแก้ "ให้ฉลาดขึ้น")
//
// ไม่รวมในไฟล์นี้ (ดู db/salvage_vehicle_cost_allocation_migration.sql/salvage_vehicle_intake_migration.sql
// และ qa-automation/tests/card-salvage-vehicle-intake.spec.js สำหรับ core intake/allocation flow เดิม):
// core "Σ allocated_cost = purchase_price" invariant พื้นฐาน (ไม่มี labor_cost/edge cases) — มีอยู่แล้ว
// โดยปริยายจาก test เดิม ไม่ทำซ้ำที่นี่

import { test, expect } from "@playwright/test";
import { loginWithEmail, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { adminClient, getShopIdByName } from "../fixtures/db-client.js";
import { accounts, currentShopName } from "../fixtures/test-data.js";

let mainShopId;
const vehicleIds = [];
const partIds = [];
const workOrderIds = [];

test.beforeAll(async () => {
  mainShopId = await getShopIdByName(currentShopName);
});

test.afterAll(async () => {
  for (const id of workOrderIds) await adminClient().from("salvage_vehicle_work_orders").delete().eq("work_order_id", id);
  for (const id of partIds) await adminClient().from("parts").delete().eq("id", id);
  for (const id of vehicleIds) await adminClient().from("salvage_vehicles").delete().eq("vehicle_id", id);
});

test("EC1 write-off เป็น generic action ใช้ได้กับอะไหล่ปกติที่ไม่เกี่ยวกับ salvage เลย", async ({ page }) => {
  // สร้าง part ปกติ (ไม่ผูก salvage_vehicle_id เลย) — ยืนยันว่า write-off ไม่ได้ผูกกับ salvage
  // อย่างเดียว (มติการ์ด 19 ก.ค. 2026 — ต้องเป็น generic action ให้ "โอนอะไหล่ข้ามสาขา" reuse ได้)
  const marker = `QA-EC1-WRITEOFF-${Date.now()}`;
  const { data: part, error } = await adminClient()
    .from("parts")
    .insert({
      shop_id: mainShopId,
      part_name: marker,
      item_type: "salvage",
      status: "available",
      is_active: true,
      quantity: 1,
    })
    .select("id")
    .single();
  expect(error).toBeNull();
  partIds.push(part.id);

  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto(`/edit/${part.id}`);
  await expect(page.getByRole("button", { name: /ตัดเป็นค่าเสียหาย/ })).toBeVisible({ timeout: 8000 });

  page.once("dialog", (dialog) => dialog.accept("ทดสอบ QA — ใช้ไม่ได้แล้ว"));
  await page.getByRole("button", { name: /ตัดเป็นค่าเสียหาย/ }).click();

  await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });

  const { data: after } = await adminClient()
    .from("parts")
    .select("is_active, write_off_reason, written_off_at, written_off_by, salvage_vehicle_id")
    .eq("id", part.id)
    .single();
  expect(after.is_active).toBe(false);
  expect(after.write_off_reason).toContain("ใช้ไม่ได้แล้ว");
  expect(after.written_off_at).not.toBeNull();
  // ยืนยันว่า part นี้ไม่เกี่ยวกับ salvage เลย (generic action จริง ไม่ใช่แค่ path พิเศษของ salvage)
  expect(after.salvage_vehicle_id).toBeNull();
});

test("EC2 เจอของมีค่าที่ไม่ได้ประเมินไว้ตอนแรก -> allocated_cost=0 และไม่กระทบอะไหล่ชิ้นอื่นในคันเดียวกัน", async ({ page }) => {
  const { data: vehicle, error } = await adminClient()
    .from("salvage_vehicles")
    .insert({
      shop_id: mainShopId,
      purchase_price: 20000,
      estimated_total_value: 20000,
      value_groups: [{ label: "QA-EC2", estimated_value: 20000 }],
    })
    .select("vehicle_id")
    .single();
  expect(error).toBeNull();
  vehicleIds.push(vehicle.vehicle_id);

  // ชิ้นที่ประเมินไว้ตามปกติก่อน — ใช้เป็น baseline ยืนยันว่าไม่ถูกกระทบทีหลัง
  const { data: knownPart } = await adminClient()
    .from("parts")
    .insert({
      shop_id: mainShopId,
      part_name: `QA-EC2-KNOWN-${Date.now()}`,
      salvage_vehicle_id: vehicle.vehicle_id,
      estimated_value: 20000,
      status: "available",
      is_active: true,
      quantity: 1,
      item_type: "salvage",
    })
    .select("id, allocated_cost")
    .single();
  partIds.push(knownPart.id);
  expect(Number(knownPart.allocated_cost)).toBe(20000); // ratio 20000/20000 * purchase_price(20000)

  // เพิ่มของแถมผ่านหน้า /add จริง — เว้นว่างช่องมูลค่าประเมิน (ตามที่ UI รองรับอยู่แล้ว)
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto(`/add?salvage_vehicle_id=${vehicle.vehicle_id}`);

  const bonusMarker = `QA-EC2-BONUS-${Date.now()}`;
  await page.getByLabel("ชื่อชิ้นส่วน *").fill(bonusMarker);
  await expect(page.getByTestId("estimated-value-input")).toHaveValue("");
  await page.getByRole("button", { name: /บันทึก/ }).click();
  await expect(page.locator(".msg.success")).toBeVisible({ timeout: 10_000 });

  const { data: bonusPart } = await adminClient()
    .from("parts")
    .select("id, estimated_value, allocated_cost, salvage_vehicle_id")
    .eq("shop_id", mainShopId)
    .eq("part_name", bonusMarker)
    .single();
  partIds.push(bonusPart.id);

  expect(bonusPart.salvage_vehicle_id).toBe(vehicle.vehicle_id);
  expect(bonusPart.estimated_value).toBeNull();
  expect(Number(bonusPart.allocated_cost)).toBe(0);

  // ชิ้นที่ประเมินไว้ก่อนหน้าต้องไม่ถูกกระทบ (ไม่มี recalculation ของคันทั้งคัน)
  const { data: knownAfter } = await adminClient()
    .from("parts")
    .select("allocated_cost")
    .eq("id", knownPart.id)
    .single();
  expect(Number(knownAfter.allocated_cost)).toBe(20000);
});

test("EC3 work order labor_cost รวมเข้าฐานคำนวณก่อนปันสัดส่วน + ปิดงานไม่ recalc อะไหล่เก่า", async ({ page }) => {
  // ตัวอย่างตัวเลขจากขอบเขตงาน: purchase_price 100,000 + labor_cost 5,000 = 105,000
  const { data: vehicle, error } = await adminClient()
    .from("salvage_vehicles")
    .insert({
      shop_id: mainShopId,
      purchase_price: 100000,
      estimated_total_value: 100000,
      value_groups: [{ label: "QA-EC3", estimated_value: 100000 }],
    })
    .select("vehicle_id")
    .single();
  expect(error).toBeNull();
  vehicleIds.push(vehicle.vehicle_id);

  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto(`/salvage-vehicles/${vehicle.vehicle_id}`);

  // สร้างใบงานถอด/ทำความสะอาด: 5 ชม. x 1,000 บาท/ชม. = 5,000 บาท (provisional)
  await page.getByTestId("toggle-work-order-form").click();
  await page.getByTestId("wo-scope-input").fill("ทดสอบ QA — ถอดเครื่อง+เกียร์");
  await page.getByTestId("wo-estimated-duration-input").fill("5");
  await page.getByTestId("wo-labor-rate-input").fill("1000");
  await page.getByTestId("wo-submit-button").click();
  await expect(page.locator(".msg.success")).toBeVisible({ timeout: 10_000 });

  // labor_cost provisional ต้องขึ้น 5,000 ทันทีที่หน้ารายละเอียดรถ (sync ผ่าน trigger อัตโนมัติ)
  await expect(page.getByTestId("vehicle-labor-cost")).toContainText("5,000", { timeout: 8000 });

  const { data: vehicleAfterWo } = await adminClient()
    .from("salvage_vehicles")
    .select("labor_cost")
    .eq("vehicle_id", vehicle.vehicle_id)
    .single();
  expect(Number(vehicleAfterWo.labor_cost)).toBe(5000);

  const { data: wo } = await adminClient()
    .from("salvage_vehicle_work_orders")
    .select("work_order_id, labor_cost, status")
    .eq("vehicle_id", vehicle.vehicle_id)
    .single();
  workOrderIds.push(wo.work_order_id);
  expect(Number(wo.labor_cost)).toBe(5000);
  expect(wo.status).toBe("open");

  // เพิ่ม 2 ชิ้นระหว่างที่ work order ยังเปิดอยู่ (provisional labor_cost=5,000) — ฐาน = 105,000
  const { data: partA } = await adminClient()
    .from("parts")
    .insert({
      shop_id: mainShopId,
      part_name: `QA-EC3-A-${Date.now()}`,
      salvage_vehicle_id: vehicle.vehicle_id,
      estimated_value: 60000,
      status: "available",
      is_active: true,
      quantity: 1,
      item_type: "salvage",
    })
    .select("id, allocated_cost")
    .single();
  partIds.push(partA.id);

  const { data: partB } = await adminClient()
    .from("parts")
    .insert({
      shop_id: mainShopId,
      part_name: `QA-EC3-B-${Date.now()}`,
      salvage_vehicle_id: vehicle.vehicle_id,
      estimated_value: 40000,
      status: "available",
      is_active: true,
      quantity: 1,
      item_type: "salvage",
    })
    .select("id, allocated_cost")
    .single();
  partIds.push(partB.id);

  // (100,000 + 5,000) x 0.6 = 63,000 ; (100,000 + 5,000) x 0.4 = 42,000 ; รวม = 105,000 เป๊ะ
  expect(Number(partA.allocated_cost)).toBe(63000);
  expect(Number(partB.allocated_cost)).toBe(42000);
  expect(Number(partA.allocated_cost) + Number(partB.allocated_cost)).toBe(105000);

  // ปิดใบงาน — labor_cost เปลี่ยนจาก provisional (5,000) เป็น final (เวลาจริงที่ผ่านไปจริง ~ วินาที
  // เดียว ปัดเป็นทศนิยมน้อยมาก) ผ่านปุ่มปิดใบงานที่หน้ารายละเอียดรถ — ต้องดัก dialog (window.confirm)
  // ไว้ก่อนคลิกเสมอ ไม่งั้น Playwright จะ auto-dismiss ทำให้ handleCloseWorkOrder ไม่ทำงาน
  page.once("dialog", (d) => d.accept());
  await page.getByTestId(`close-work-order-${wo.work_order_id}`).click();
  await expect(page.locator(".msg.success", { hasText: "ปิดใบงาน" })).toBeVisible({ timeout: 10_000 });

  const { data: woAfter } = await adminClient()
    .from("salvage_vehicle_work_orders")
    .select("status, labor_cost, actual_end")
    .eq("work_order_id", wo.work_order_id)
    .single();
  expect(woAfter.status).toBe("closed");
  expect(woAfter.actual_end).not.toBeNull();
  // final labor_cost ต้องน้อยกว่า provisional มาก (ปิดเกือบทันทีหลังสร้าง ใช้เวลาจริงแค่ไม่กี่วินาที)
  expect(Number(woAfter.labor_cost)).toBeLessThan(5000);

  // ชิ้นที่คำนวณ allocated_cost ไปแล้วก่อนหน้า (A, B) ต้อง "ไม่" ถูก recalculate ย้อนหลังเด็ดขาด —
  // นี่คือ invariant หลักของ edge case 3 (สอดคล้องกับกฎ freeze เดิม)
  const { data: partAAfter } = await adminClient().from("parts").select("allocated_cost").eq("id", partA.id).single();
  const { data: partBAfter } = await adminClient().from("parts").select("allocated_cost").eq("id", partB.id).single();
  expect(Number(partAAfter.allocated_cost)).toBe(63000);
  expect(Number(partBAfter.allocated_cost)).toBe(42000);

  // ชิ้นใหม่ที่เพิ่มหลังปิดงาน ต้องใช้ labor_cost ค่า final (ต่ำกว่าเดิมมาก) ไม่ใช่ provisional เดิม
  const { data: vehicleFinal } = await adminClient()
    .from("salvage_vehicles")
    .select("labor_cost")
    .eq("vehicle_id", vehicle.vehicle_id)
    .single();
  expect(Number(vehicleFinal.labor_cost)).toBe(Number(woAfter.labor_cost));

  const { data: partC } = await adminClient()
    .from("parts")
    .insert({
      shop_id: mainShopId,
      part_name: `QA-EC3-C-${Date.now()}`,
      salvage_vehicle_id: vehicle.vehicle_id,
      estimated_value: 20000,
      status: "available",
      is_active: true,
      quantity: 1,
      item_type: "salvage",
    })
    .select("id, allocated_cost")
    .single();
  partIds.push(partC.id);
  const expectedPartCAllocated = (100000 + Number(woAfter.labor_cost)) * (20000 / 100000);
  // toBeCloseTo (ไม่ใช่ toBe) กัน floating point rounding ต่างกันเล็กน้อยระหว่าง JS กับ Postgres
  // numeric round() — แก่นที่ต้องทดสอบจริงคือ "ใช้ labor_cost ค่า final ล่าสุด" ไม่ใช่ provisional เดิม
  expect(Number(partC.allocated_cost)).toBeCloseTo(expectedPartCAllocated, 1);
});

test("EC5 ขายอะไหล่ได้มากกว่ามูลค่าประเมิน -> ไม่มี recalculation เกิดขึ้น (regression)", async () => {
  const { data: vehicle, error } = await adminClient()
    .from("salvage_vehicles")
    .insert({
      shop_id: mainShopId,
      purchase_price: 50000,
      estimated_total_value: 50000,
      value_groups: [{ label: "QA-EC5", estimated_value: 50000 }],
    })
    .select("vehicle_id")
    .single();
  expect(error).toBeNull();
  vehicleIds.push(vehicle.vehicle_id);

  const { data: partA } = await adminClient()
    .from("parts")
    .insert({
      shop_id: mainShopId,
      part_name: `QA-EC5-A-${Date.now()}`,
      salvage_vehicle_id: vehicle.vehicle_id,
      estimated_value: 30000,
      status: "available",
      is_active: true,
      quantity: 1,
      item_type: "salvage",
    })
    .select("id, allocated_cost")
    .single();
  partIds.push(partA.id);

  const { data: partB } = await adminClient()
    .from("parts")
    .insert({
      shop_id: mainShopId,
      part_name: `QA-EC5-B-${Date.now()}`,
      salvage_vehicle_id: vehicle.vehicle_id,
      estimated_value: 20000,
      status: "available",
      is_active: true,
      quantity: 1,
      item_type: "salvage",
    })
    .select("id, allocated_cost")
    .single();
  partIds.push(partB.id);

  expect(Number(partA.allocated_cost)).toBe(30000);
  expect(Number(partB.allocated_cost)).toBe(20000);

  // ขาย partA ได้ 500,000 บาท (สูงกว่าประมาณการทั้งคันหลายเท่า) — คำถามหลักของการ์ด: ไม่ต้อง
  // recalculate อะไรเลย allocated_cost ยังคงเดิมเป๊ะ กำไรของชิ้นนี้แค่สูงกว่าคาดเฉยๆ
  const { error: sellError } = await adminClient()
    .from("parts")
    .update({ status: "sold", price: 500000 })
    .eq("id", partA.id);
  expect(sellError).toBeNull();

  const { data: partAAfterSale } = await adminClient()
    .from("parts")
    .select("allocated_cost, price, status")
    .eq("id", partA.id)
    .single();
  const { data: partBAfterSale } = await adminClient()
    .from("parts")
    .select("allocated_cost")
    .eq("id", partB.id)
    .single();

  expect(partAAfterSale.status).toBe("sold");
  expect(Number(partAAfterSale.price)).toBe(500000);
  // allocated_cost ของชิ้นที่ขายเอง ต้องไม่เปลี่ยนแม้ราคาขายจริงต่างจากประมาณการมาก
  expect(Number(partAAfterSale.allocated_cost)).toBe(30000);
  // ชิ้นอื่นในคันเดียวกันต้องไม่ถูกกระทบเลย (ไม่มี recalculation ของคันทั้งคันเกิดขึ้น)
  expect(Number(partBAfterSale.allocated_cost)).toBe(20000);
});
