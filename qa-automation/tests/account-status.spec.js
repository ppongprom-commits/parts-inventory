import { test } from "@playwright/test";
import {
  loginWithEmail,
  expectDisabledAccountScreen,
  expectRedirectedToSignup,
} from "../fixtures/auth-helpers.js";
import { accounts } from "../fixtures/test-data.js";

test.describe("Account status handling (components/RequireAuth.js)", () => {
  // TC-106
  test("TC-106 บัญชี owner ที่ shop ถูกปิดใช้งาน (isDisabledAccount=true) เห็นหน้าปิดการใช้งาน", async ({
    page,
  }) => {
    await loginWithEmail(
      page,
      accounts.disabledOwner.email,
      accounts.disabledOwner.password
    );
    // login สำเร็จผ่าน auth แต่ RequireAuth ต้อง intercept ก่อนแสดงเนื้อหาจริง
    await expectDisabledAccountScreen(page);
  });

  // TC-107
  test("TC-107 user ใหม่ที่ไม่มี shop_members เลย ถูก redirect ไป /signup", async ({ page }) => {
    await loginWithEmail(page, accounts.newUser.email, accounts.newUser.password);
    await expectRedirectedToSignup(page);
  });
});
