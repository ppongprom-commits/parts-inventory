import { test, expect } from "@playwright/test";
import { loginWithEmail, expectLoginSucceeded } from "../fixtures/auth-helpers.js";
import { adminClient, getShopIdByName } from "../fixtures/db-client.js";
import { concurrentAccounts } from "../fixtures/test-data.js";

// TC-302a/b ใช้ shop เดียวกัน ("QA Concurrent-Session Shop (auto)") ที่ตั้งใจ share
// กันข้าม test ในไฟล์นี้ — ถ้ารันแบบ fullyParallel (workers>1) 2 test นี้อาจถูกส่งไปคนละ
// worker แล้วรันพร้อมกันจริง ทำให้ session count ของ shop เดียวกันชนกันเอง (เจอจริง
// 22 ก.ค. 2026 ตอนเปิด parallel ครั้งแรก — TC-302b คาดหวัง 2 session แต่ได้ 3 เพราะ
// TC-302a ที่รันพร้อมกันดันเพิ่ม session เข้ามาแทรก) บังคับ serial เฉพาะไฟล์นี้กันไว้เลย
// ไม่ต้องพึ่งว่า Playwright จะจัดคิวให้บังเอิญไม่ชนกัน
test.describe.configure({ mode: "serial" });

// ------------------------------------------------------------
// TC-302: lib/sessionTracking.js + lib/AuthProvider.js
// ต้องใช้ browser context จริง (ไม่ใช่ direct API) เพราะ registerSession() ถูกเรียกจาก
// useEffect ฝั่ง client หลัง login สำเร็จเท่านั้น ไม่มี server-side trigger ใดๆ
//
// ใช้ shop เฉพาะ "QA Concurrent-Session Shop (auto)" ที่ตั้ง plan='trial' ไว้ตั้งใจ
// (maxConcurrentSessions: 3, maxMembers: 3 — ดู config/subscriptionTiers.js)
// ------------------------------------------------------------

let concurrentShopId;

test.beforeAll(async () => {
  concurrentShopId = await getShopIdByName("QA Concurrent-Session Shop (auto)");
  // เคลียร์ user_sessions ของ shop นี้ให้ว่างก่อนเริ่ม กันผลตกค้างจากรอบก่อน
  await adminClient().from("user_sessions").delete().eq("shop_id", concurrentShopId);
});

test("TC-302a คนที่ 4 (distinct user) login พร้อมกันในอู่ที่ tier=trial (cap=3) ต้องโดน force sign-out ทันที", async ({
  browser,
}) => {
  const contexts = [];
  try {
    // login 3 คนแรก — ทั้งหมดต้องสำเร็จปกติ ไม่มีใครโดนเตะ
    for (let i = 0; i < 3; i++) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await loginWithEmail(page, concurrentAccounts[i].email, concurrentAccounts[i].password);
      await expectLoginSucceeded(page);
      contexts.push(ctx);
    }

    // ยืนยันด้วย service role ว่ามี user_sessions ครบ 3 แถวสำหรับ shop นี้แล้ว
    const { data: before } = await adminClient()
      .from("user_sessions")
      .select("session_id, user_id")
      .eq("shop_id", concurrentShopId);
    expect(before?.length).toBe(3);

    // คนที่ 4 (distinct user คนใหม่) login เข้าอู่เดียวกัน -> ต้องโดน signOut อัตโนมัติ
    // (ดู lib/AuthProvider.js: ถ้า registerSession().ok===false จะเรียก supabase.auth.signOut()
    // ทันทีแล้ว RequireAuth เห็น session===null จึง redirect กลับ /login)
    const ctx4 = await browser.newContext();
    const page4 = await ctx4.newPage();
    await loginWithEmail(page4, concurrentAccounts[3].email, concurrentAccounts[3].password);
    await expect(page4).toHaveURL(/\/login/, { timeout: 10000 });
    contexts.push(ctx4);

    // ยืนยันว่าคนที่ 4 ไม่ถูกนับเข้า user_sessions เลย (ยังคงมีแค่ 3 แถวเท่าเดิม)
    const { data: after } = await adminClient()
      .from("user_sessions")
      .select("session_id")
      .eq("shop_id", concurrentShopId);
    expect(after?.length).toBe(3);

    // ⚠️ ข้อสังเกตสำคัญ: sessionError (ข้อความ "อู่นี้มีคนใช้งานพร้อมกันเต็มแล้ว...")
    // ถูก set ไว้ใน AuthProvider context จริง แต่ "ไม่มีที่ไหนใน UI render sessionError เลย"
    // (grep แล้วทั้ง codebase มีแค่จุด setSessionError/state เฉยๆ ไม่มี component ไหน .sessionError)
    // ผู้ใช้คนที่ 4 จะแค่เห็นหน้า /login โผล่มาเฉยๆ โดยไม่รู้เหตุผลเลยว่าทำไม login "สำเร็จ"
    // (กรอก email/password ถูก ไม่มี error message ตอนกรอกฟอร์มด้วยซ้ำ) แต่ดันเด้งกลับมาที่เดิม
    // แนะนำทีม dev ให้ render sessionError เป็น toast/banner บนหน้า /login ตอน redirect กลับมา
  } finally {
    for (const ctx of contexts) await ctx.close();
  }
});

test("TC-302b user เดิม login เครื่องที่ 3 (เกิน maxDevicesPerUser=2) ไม่ถูกบล็อก แค่ evict session เก่าสุดแบบเงียบๆ (ไม่ signOut ใคร)", async ({
  browser,
}) => {
  const targetUser = concurrentAccounts[0];
  // เคลียร์ user_sessions ของ user นี้ก่อน (กัน state ค้างจาก TC-302a หรือรอบก่อนหน้า)
  const { data: existingUser } = await adminClient().auth.admin.listUsers({ page: 1, perPage: 200 });
  const authUser = existingUser.users.find((u) => u.email === targetUser.email);
  await adminClient().from("user_sessions").delete().eq("user_id", authUser.id);

  const contexts = [];
  try {
    // login "อุปกรณ์" ที่ 1 และ 2 — ต้องผ่านทั้งคู่ตามปกติ (maxDevicesPerUser=2)
    for (let i = 0; i < 2; i++) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await loginWithEmail(page, targetUser.email, targetUser.password);
      await expectLoginSucceeded(page);
      contexts.push({ ctx, page });
      await page.waitForTimeout(500); // กัน last_seen_at ชนกันเป๊ะจนเรียงลำดับผิด
    }

    const { data: after2 } = await adminClient()
      .from("user_sessions")
      .select("session_id")
      .eq("user_id", authUser.id);
    expect(after2?.length).toBe(2);
    const oldestSessionId = after2
      .map((r) => r.session_id)
      .sort((a, b) => a - b)[0]; // เก่าสุด = id เลขน้อยสุด (insert ก่อน)

    // login "อุปกรณ์" ที่ 3 — คาดว่า "ไม่ถูกบล็อก" (ต่างจาก TC-302a ที่บล็อกที่ shop-level)
    const ctx3 = await browser.newContext();
    const page3 = await ctx3.newPage();
    await loginWithEmail(page3, targetUser.email, targetUser.password);
    await expectLoginSucceeded(page3); // คาดว่าผ่าน ไม่ redirect กลับ /login
    contexts.push({ ctx: ctx3, page: page3 });

    // ยืนยันว่า "จำนวนแถว" ยังคงเป็น 2 (ตัดของเก่าสุดทิ้งไปแล้ว ไม่ใช่เพิ่มเป็น 3)
    const { data: after3 } = await adminClient()
      .from("user_sessions")
      .select("session_id")
      .eq("user_id", authUser.id);
    expect(after3?.length).toBe(2);
    const remainingIds = after3.map((r) => r.session_id);
    expect(remainingIds).not.toContain(oldestSessionId); // แถวเก่าสุดถูกลบไปแล้วจริง

    // ⚠️ ข้อสังเกตสำคัญที่ 2: การ "evict" นี้แค่ลบแถวใน user_sessions (bookkeeping table)
    // ไม่ได้เรียก supabase.auth.signOut() ให้อุปกรณ์ตัวที่ 1 (เก่าสุด) เลย — โทเค็น auth ของ
    // อุปกรณ์ 1 ยังคง valid ตามปกติทุกประการ ลอง reload หน้าเดิมเพื่อพิสูจน์ว่ามันยังใช้งานได้จริง
    // แปลว่า maxDevicesPerUser ในทางปฏิบัติ "นับจำนวน" ได้ แต่ "ไม่ได้บังคับเตะอุปกรณ์เกินจำนวนออกจริง"
    await contexts[0].page.reload();
    await expect(contexts[0].page).not.toHaveURL(/\/login/, { timeout: 5000 });
  } finally {
    for (const { ctx } of contexts) await ctx.close();
  }
});
