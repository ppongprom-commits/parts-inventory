import { test, expect } from "@playwright/test";
import { loginWithEmail, loginWithStaffPin, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { getAccessToken, captureTeamPageData, findMemberByUsername } from "../fixtures/api-helpers.js";
import { accounts } from "../fixtures/test-data.js";

// TC-205: ตรวจว่า API routes ที่เกี่ยวกับ team management enforce role check ที่ backend จริง
// (ผ่าน lib/teamAuth.js verifyShopManager()) ไม่ใช่แค่ UI ซ่อนปุ่ม/ฟอร์มไว้เฉยๆ
test.describe("RBAC — API level (lib/teamAuth.js verifyShopManager)", () => {
  test("TC-205a technician token เรียก /api/team/create-staff ตรงๆ ต้องโดน 403", async ({
    page,
    request,
    baseURL,
  }) => {
    await loginWithStaffPin(page, accounts.technician.username, accounts.technician.pin);
    await expectLoginSucceeded(page);

    const token = await getAccessToken(page);
    expect(token).toBeTruthy();

    // shop_id ของ technician ไม่รู้ตรงๆ จากหน้านี้ (technician เข้า /admin/team ไม่ได้อยู่แล้ว
    // ตาม RBAC หน้า UI) แต่ API ก็ต้อง reject อยู่ดีไม่ว่า shop_id จะใส่อะไรมา —
    // ใช้ shop_id ปลอม/0 ก็พอสำหรับยืนยันว่า role check มาก่อน seat-limit/shop-lookup check
    const res = await request.post(`${baseURL}/api/team/create-staff`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        shop_id: 0,
        role: "assistant",
        username: `should_not_be_created_${Date.now()}`,
        pin: "111111",
        contact_name: "Should Not Exist",
        contact_phone: "0899999999",
      },
    });

    expect(res.status()).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("ไม่มีสิทธิ์จัดการทีมของอู่นี้");
  });

  test("TC-205b technician token เรียก /api/team/reset-pin ของคนอื่น (ไม่ใช่ตัวเอง) ต้องโดน 403", async ({
    page,
    request,
    baseURL,
  }) => {
    // owner login ก่อนเพื่อหา member_id ของ assistant (เป้าหมายที่ technician จะพยายามรีเซ็ต)
    await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
    await expectLoginSucceeded(page);
    const { members } = await captureTeamPageData(page);
    const assistantMember = findMemberByUsername(members, accounts.assistant.username);
    expect(assistantMember).toBeTruthy();

    // สลับไป login เป็น technician ในหน้าใหม่
    const staffPage = await page.context().newPage();
    await loginWithStaffPin(staffPage, accounts.technician.username, accounts.technician.pin);
    await expectLoginSucceeded(staffPage);
    const technicianToken = await getAccessToken(staffPage);

    const res = await request.post(`${baseURL}/api/team/reset-pin`, {
      headers: { Authorization: `Bearer ${technicianToken}` },
      data: { member_id: assistantMember.member_id, new_pin: "000000" },
    });

    expect(res.status()).toBe(403);
    const json = await res.json();
    expect(json.error).toContain("ไม่มีสิทธิ์จัดการทีมของอู่นี้");
  });

  test("TC-205c ไม่มี token เลย (ไม่ได้ login) เรียก API ตรงๆ ต้องโดน 401", async ({
    request,
    baseURL,
  }) => {
    const res = await request.post(`${baseURL}/api/team/create-staff`, {
      data: {
        shop_id: 0,
        role: "assistant",
        username: "no_auth_test",
        pin: "111111",
        contact_name: "No Auth",
        contact_phone: "0800000001",
      },
    });
    expect(res.status()).toBe(401);
    const json = await res.json();
    expect(json.error).toContain("กรุณาเข้าสู่ระบบใหม่");
  });

  test("TC-205d technician รีเซ็ต PIN ของตัวเอง (self-service) ต้องอนุญาต ไม่ใช่ 403", async ({
    page,
    request,
    baseURL,
  }) => {
    // ยืนยันว่า verifyShopManager ถูก skip ถูกต้องสำหรับ self-service (isSelfService branch
    // ใน app/api/team/reset-pin/route.js) — เป็น "positive" case คู่กับ TC-205b ที่เป็น negative
    await loginWithEmail(page, accounts.owner.email, accounts.owner.password);
    await expectLoginSucceeded(page);
    const { members } = await captureTeamPageData(page);
    const assistantMember = findMemberByUsername(members, accounts.assistant.username);
    expect(assistantMember).toBeTruthy();

    const staffPage = await page.context().newPage();
    await loginWithStaffPin(staffPage, accounts.assistant.username, accounts.assistant.pin);
    await expectLoginSucceeded(staffPage);
    const assistantToken = await getAccessToken(staffPage);

    const res = await request.post(`${baseURL}/api/team/reset-pin`, {
      headers: { Authorization: `Bearer ${assistantToken}` },
      data: { member_id: assistantMember.member_id, new_pin: accounts.assistant.pin }, // ตั้งค่าเดิมกลับ ไม่เปลี่ยนอะไรจริง
    });

    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.data?.ok).toBe(true);
  });
});
