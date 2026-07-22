import { test, expect } from "@playwright/test";
import { loginWithEmail, loginWithStaffPin, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { getAccessToken, captureTeamPageData, findMemberByUsername } from "../fixtures/api-helpers.js";
import { adminClient } from "../fixtures/db-client.js";
import { accounts } from "../fixtures/test-data.js";

// selector อ้างอิงจาก app/admin/team/page.js (ฟอร์ม "สร้างบัญชีพนักงาน (Username + PIN)")
async function fillCreateStaffForm(page, { username, pin, contactName, contactPhone, role }) {
  await page.getByLabel(/^Username/).fill(username);
  // ช่อง PIN เปลี่ยนจาก <label> เป็น <div> แล้ว (แก้ bare-label a11y bug ไปก่อนหน้านี้ —
  // เดิม label ห่อทั้ง input+ปุ่ม "สุ่มใหม่" พร้อมกันทำให้ accessible name พัง เลยเปลี่ยนเป็น div)
  // selector ตรงนี้ต้องตามให้ทันด้วย ไม่งั้น locator("label",...) จะหา element ไม่เจอเลย
  const pinRow = page.locator("div", { hasText: /^PIN/ }).first();
  await pinRow.locator("input").fill(pin);
  await page.getByLabel("ชื่อ-นามสกุล").fill(contactName);
  await page.getByLabel("เบอร์โทร").fill(contactPhone);
  if (role) {
    await page.getByLabel("บทบาท").selectOption(role);
  }
  await page.getByRole("button", { name: /สร้างบัญชีพนักงาน/ }).click();
}

test.describe("Account Provisioning — /admin/team (lib/staffAuth.js STAFF_ROLES)", () => {
  // TC-401
  test("TC-401 owner สร้างบัญชีพนักงานใหม่สำเร็จ ผ่าน username+PIN", async ({ page }) => {
    await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
    await expectLoginSucceeded(page);
    await page.goto("/admin/team");

    const uniqueUsername = `qa_prov_${Date.now()}`.slice(0, 20);
    await fillCreateStaffForm(page, {
      username: uniqueUsername,
      pin: "998877",
      contactName: "QA Provisioning Test",
      contactPhone: "0800000000",
      role: "assistant",
    });

    await expect(page.locator(".msg.success", { hasText: "สร้างบัญชีพนักงานสำเร็จ" })).toBeVisible({
      timeout: 8000,
    });
    // ต้องแสดง credential กลับมาให้เห็น username/PIN ที่เพิ่งสร้าง (จะไม่แสดงซ้ำอีกครั้ง)
    await expect(page.getByText(uniqueUsername)).toBeVisible();

    // ยืนยันของจริง: username ใหม่นี้ login ผ่าน /staff-login ได้ทันที
    await page.goto("/staff-login");
    await loginWithStaffPin(page, uniqueUsername, "998877");
    await expectLoginSucceeded(page);

    // หมายเหตุ: test นี้สร้าง staff account ใหม่ทุกครั้งที่รัน (username มี timestamp กันชนกัน)
    // ควรมี cleanup job แยกต่างหากลบ user ที่ username ขึ้นต้นด้วย qa_prov_ เป็นระยะ
  });

  // TC-402
  test("TC-402 สร้าง staff ด้วย username ที่ซ้ำกับที่มีอยู่แล้ว ต้อง reject", async ({ page }) => {
    await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
    await expectLoginSucceeded(page);
    await page.goto("/admin/team");

    // ใช้ username ของ technician ที่ setup-test-data.mjs สร้างไว้แล้ว เพื่อ guarantee ว่าซ้ำแน่นอน
    await fillCreateStaffForm(page, {
      username: accounts.technician.username,
      pin: "123456",
      contactName: "Duplicate Test",
      contactPhone: "0811111111",
      role: "technician",
    });

    // ข้อความ error ตรงจาก app/api/team/create-staff/route.js
    await expect(
      page.locator(".msg.error", { hasText: "username นี้มีคนใช้แล้ว ลองชื่ออื่น" })
    ).toBeVisible({ timeout: 8000 });
  });

  // TC-403 — แก้ไขจากสมมติฐานเดิม: ตรวจสอบจาก lib/teamAuth.js verifyShopManager() แล้วพบว่า
  // manager มีสิทธิ์สร้าง staff ได้เหมือน owner ทุกประการ (ไม่ใช่ owner เท่านั้นตามที่ตั้งคำถามไว้ก่อนหน้า)
  test("TC-403 manager (ไม่ใช่ owner) สร้างบัญชีพนักงานได้สำเร็จเช่นกัน", async ({ page }) => {
    await loginWithEmail(page, accounts.manager.email, accounts.manager.password);
    await expectLoginSucceeded(page);
    await page.goto("/admin/team");

    const uniqueUsername = `qa_prov_mgr_${Date.now()}`.slice(0, 20);
    await fillCreateStaffForm(page, {
      username: uniqueUsername,
      pin: "445566",
      contactName: "QA Manager-created Staff",
      contactPhone: "0822222222",
      role: "technician",
    });

    await expect(page.locator(".msg.success", { hasText: "สร้างบัญชีพนักงานสำเร็จ" })).toBeVisible({
      timeout: 8000,
    });
  });

  // TC-404 — ไม่มี UI ปุ่ม reset PIN ใน /admin/team ตอนที่ตรวจสอบโค้ด (route มีอยู่แต่ยังไม่ได้ผูก UI)
  // จึงเทสต์ผ่าน API ตรง โดยใช้ token จริงจาก session ที่ login ผ่าน UI
  test("TC-404 owner reset PIN ของ technician ผ่าน API สำเร็จ แล้ว PIN เก่าใช้ไม่ได้อีก", async ({
    page,
    request,
    baseURL,
  }) => {
    await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
    await expectLoginSucceeded(page);

    const { members } = await captureTeamPageData(page);
    const technicianMember = findMemberByUsername(members, accounts.technician.username);
    expect(technicianMember, "ต้องเจอ technician ใน team list ก่อน (setup-test-data.mjs ต้องรันมาแล้ว)").toBeTruthy();

    const token = await getAccessToken(page);
    expect(token).toBeTruthy();

    const NEW_PIN = "778899";
    const res = await request.post(`${baseURL}/api/team/reset-pin`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { member_id: technicianMember.member_id, new_pin: NEW_PIN },
    });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.data?.ok).toBe(true);

    // PIN เก่าต้อง login ไม่ได้อีก
    const staffPage = await page.context().newPage();
    await loginWithStaffPin(staffPage, accounts.technician.username, accounts.technician.pin);
    await expect(staffPage).toHaveURL(/\/staff-login/);

    // PIN ใหม่ต้อง login ได้
    await loginWithStaffPin(staffPage, accounts.technician.username, NEW_PIN);
    await expectLoginSucceeded(staffPage);

    // สำคัญ: test นี้เปลี่ยน PIN จริงของ technician บน worker นี้ — ถ้าไม่ restore กลับ
    // test อื่นที่ใช้ accounts.technician.pin (ค่าคงที่จาก .env) บน worker เดียวกันจะ
    // login ไม่ผ่านทันที (เจอจริง 22 ก.ค. 2026 ตอนเปิด parallel ครั้งแรก — JOB-205 ที่
    // สุ่มไปอยู่ worker เดียวกับ TC-404 ล้มเหลวด้วย "Invalid login credentials")
    // ต้อง restore ผ่าน service-role โดยตรง ไม่ผ่าน API เพราะ token เดิม (owner) ยังใช้ได้
    // อยู่แล้วก็จริง แต่ทำผ่าน adminClient() ตรงๆ ชัวร์กว่าและไม่ผูกกับ auth flow ซ้ำ
    await adminClient().auth.admin.updateUserById(technicianMember.user_id, {
      password: accounts.technician.pin,
    });
  });
});
