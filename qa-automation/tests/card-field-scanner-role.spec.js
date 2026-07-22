// การ์ด "Field Scanner Role + temp account auto-expiry" — คืนวันที่ 21 ก.ค. 2026
// role ใหม่: กรอก/แก้ไขข้อมูลอะไหล่ได้เต็มที่ แต่ขายไม่ได้เด็ดขาด ห้ามดูข้อมูลลูกค้า
// บัญชีชั่วคราว (shop_members.expires_at) ที่หมดอายุแล้วต้องถูกปฏิเสธตอน login
import { test, expect } from "@playwright/test";
import {
  loginWithStaffPin,
  loginWithEmail,
  expectLoginSucceeded,
  expectExpiredAccountScreen,
} from "../fixtures/auth-helpers.js";
import { adminClient, getShopIdByName, signInStaff } from "../fixtures/db-client.js";
import { accounts, currentShopName } from "../fixtures/test-data.js";

let mainShopId;

test.beforeAll(async () => {
  mainShopId = await getShopIdByName(currentShopName);
});

test("FIELDSCAN-001 login สำเร็จ + เข้า /add ได้ + เพิ่มอะไหล่ได้จริง", async ({ page }) => {
  await loginWithStaffPin(page, accounts.fieldScanner.username, accounts.fieldScanner.pin);
  await expectLoginSucceeded(page);
  await page.goto("/add");
  await expect(page.getByLabel("ชื่อชิ้นส่วน *")).toBeVisible();
});

test("FIELDSCAN-002 หน้า /edit/[id] ไม่มีส่วน 'ขายอะไหล่ชิ้นนี้' โชว์ให้ field_scanner เลย", async ({ page }) => {
  const { data: part, error } = await adminClient()
    .from("parts")
    .insert({ shop_id: mainShopId, part_name: `QA-FIELDSCAN-${Date.now()}`, quantity: 3, price: 100, item_type: "salvage" })
    .select("id")
    .single();
  expect(error).toBeNull();

  await loginWithStaffPin(page, accounts.fieldScanner.username, accounts.fieldScanner.pin);
  await expectLoginSucceeded(page);
  await page.goto(`/edit/${part.id}`);

  await expect(page.getByText("💰 ขายอะไหล่ชิ้นนี้")).toHaveCount(0);
  // แต่ยังแก้ไขข้อมูลอะไหล่ปกติได้ (ฟอร์มหลักต้องอยู่)
  await expect(page.getByLabel("ราคา (บาท)")).toBeVisible();

  await adminClient().from("parts").delete().eq("id", part.id);
});

test("FIELDSCAN-003 RLS ปฏิเสธ field_scanner insert part_sales ตรงๆ แม้ยิงข้าม UI ทั้งหมด", async () => {
  const { data: part } = await adminClient()
    .from("parts")
    .insert({ shop_id: mainShopId, part_name: `QA-FIELDSCAN-RLS-${Date.now()}`, quantity: 3, price: 100, item_type: "salvage" })
    .select("id")
    .single();

  const { client: fsClient } = await signInStaff(accounts.fieldScanner.username, accounts.fieldScanner.pin);
  const { error } = await fsClient
    .from("part_sales")
    .insert({ part_id: part.id, shop_id: mainShopId, quantity_sold: 1, sale_price: 100, payment_method: "cash" });

  expect(error, "field_scanner ต้องขายไม่ได้เด็ดขาดตามการ์ด").not.toBeNull();

  await adminClient().from("parts").delete().eq("id", part.id);
});

test("FIELDSCAN-004 RLS ปิดกั้น field_scanner จากตาราง customers ทั้งหมด (ไม่เห็นแม้แถวเดียว)", async () => {
  const { client: fsClient } = await signInStaff(accounts.fieldScanner.username, accounts.fieldScanner.pin);
  const { data, error } = await fsClient.from("customers").select("customer_id").eq("shop_id", mainShopId).limit(5);
  expect(error).toBeNull(); // RLS กรองแบบเงียบๆ ไม่ throw
  expect(data).toEqual([]);
});

test("FIELDSCAN-005 บัญชีที่ expires_at ผ่านไปแล้ว login ไม่ผ่าน เห็นหน้า 'บัญชีชั่วคราวนี้หมดอายุแล้ว'", async ({ page }) => {
  await loginWithStaffPin(page, accounts.fieldScannerExpired.username, accounts.fieldScannerExpired.pin);
  await expectExpiredAccountScreen(page);
});

test("FIELDSCAN-006 /admin/team: เลือก role field_scanner โชว์ช่องวันหมดอายุ, สร้างสำเร็จแล้ว expires_at บันทึกถูกต้อง", async ({ page }) => {
  await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
  await expectLoginSucceeded(page);
  await page.goto("/admin/team");

  // หน้านี้มี 2 ฟอร์มที่ label "บทบาท" ซ้ำกัน (ฟอร์มสร้าง username+PIN กับฟอร์มเชิญด้วยอีเมล) —
  // ต้อง scope selector อยู่ในฟอร์มที่ถูกต้องเสมอ ไม่งั้น getByLabel ชนกันแบบ strict-mode violation
  const staffForm = page.locator("form").filter({ has: page.getByRole("button", { name: "+ สร้างบัญชีพนักงาน" }) });

  const username = `qafs${Date.now()}`.slice(0, 20);
  await staffForm.getByLabel(/^Username/).fill(username);
  await staffForm.getByLabel("บทบาท").selectOption("field_scanner");
  await expect(page.getByTestId("field-scanner-expiry-field")).toBeVisible();

  // PIN ถูกสุ่มมาให้แล้ว (generateRandomPin ตอน mount) ไม่ต้องแตะ — กรอกแค่ที่เหลือ
  await staffForm.getByLabel("ชื่อ-นามสกุล").fill("QA Field Scanner");
  await staffForm.getByLabel("เบอร์โทร").fill("0812223333");
  const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // +30 วัน
  await page.getByTestId("field-scanner-expiry-field").locator('input[type="date"]').fill(expiryDate);

  await staffForm.getByRole("button", { name: "+ สร้างบัญชีพนักงาน" }).click();
  await expect(page.locator(".msg.success", { hasText: "สร้างบัญชีพนักงานสำเร็จ" })).toBeVisible({ timeout: 10_000 });

  const { data: member } = await adminClient()
    .from("shop_members")
    .select("member_id, role, expires_at")
    .eq("shop_id", mainShopId)
    .eq("login_username", username)
    .single();
  expect(member.role).toBe("field_scanner");
  expect(member.expires_at).not.toBeNull();
  expect(member.expires_at.slice(0, 10)).toBe(expiryDate);

  // ล้างข้อมูลที่สร้างผ่าน UI ทันที (auth user + shop_members)
  const { data: userRow } = await adminClient().auth.admin.listUsers({ page: 1, perPage: 200 });
  const staffUser = userRow.users.find((u) => u.user_metadata?.login_username === username);
  await adminClient().from("shop_members").delete().eq("member_id", member.member_id);
  if (staffUser) await adminClient().auth.admin.deleteUser(staffUser.id);
});
