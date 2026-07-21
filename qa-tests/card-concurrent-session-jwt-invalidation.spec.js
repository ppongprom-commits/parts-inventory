// Card: "Concurrent session limit — config ต่อ tier" (Priority: High, ขนาดงาน: S)
//
// การ์ดระบุบั๊กตรงๆ: eviction เดิม (ลบแถวใน user_sessions ตอนล้น limit) เป็นแค่ bookkeeping —
// เครื่องที่ถูกเขี่ยยังใช้ JWT เดิมทำ request ต่อได้จนกว่า token จะหมดอายุเอง ไม่ได้ตัดสิทธิ์ทันที
//
// การ์ดตัดสินใจไว้ว่าจะใช้ "middleware เช็ค user_sessions ทุก request" แต่แอปนี้เป็น client-side
// SPA ล้วน (ทุกหน้าดึงข้อมูลตรงจาก Supabase REST ในเบราว์เซอร์ ไม่ผ่าน Next.js server route) —
// Next.js middleware ดักได้แค่ navigation ข้ามหน้า ดักการยิง REST ตรงจากเบราว์เซอร์ไปที่
// *.supabase.co ไม่ได้เลย ดู lib/sessionTracking.js หัวฟังก์ชัน heartbeatSession สำหรับคำอธิบาย
// เต็มว่าทำไมถึงเลือกวิธี heartbeat-based detection แทน (ทุก 60 วิ ไม่ใช่ instant middleware)
//
// tier config ต่อ tier เอง (maxConcurrentSessions) มีอยู่แล้วจริงใน config/subscriptionTiers.js
// (trial=3, starter=5, founder=8, pro=12, enterprise=unlimited) — ไม่ใช่งานใหม่ที่ต้องทำรอบนี้
//
// หมายเหตุ defect ที่เจอระหว่างเขียนเทสนี้ (3 รอบ):
// รอบ 1: page.clock.install()+fastForward() จำลองเวลาผ่านไป 61 วิ — setInterval ที่สร้างขึ้นหลัง
//   await หลายชั้นใน AuthProvider ไม่ถูก fake clock จับ (raw setInterval เปล่าๆ ทำงานปกติกับ fake
//   clock แต่พอมี async chain ของแอปจริงคั่นกลาง กลับไม่ทำงาน) — เปลี่ยนมาใช้เวลาจริงแทน
// รอบ 2: ใช้เวลาจริงแล้วก็ยังไม่ evict — debug เจอว่า mockAuth.js default ของ POST
//   /rest/v1/user_sessions คืนเป็น "array ของ object" แต่ registerSession() เรียก
//   `.insert(...).select().single()` ซึ่งฝั่ง real Supabase จะได้ object เดี่ยวกลับมา (ไม่ห่อ array)
//   — พอ mock คืน array ผิดรูป `inserted.session_id` เลยเป็น undefined ทำให้ heartbeatSession()
//   คืน true ทันทีจาก guard clause `if (!sessionId) return true` ไม่เคยเช็คอะไรจริงเลย (เป็นปัญหา
//   ของรูปแบบ mock ในเทสนี้เอง ไม่ใช่บั๊กของโค้ดแอป) — แก้โดย override mock ให้คืน object เดี่ยวถูกรูป
// รอบ 3 (ที่ใช้จริงด้านล่าง): แก้ mock แล้วผ่านทั้ง 2 เทส
const { test, expect } = require("@playwright/test");
const { installMockAuth } = require("./_fixtures/mockAuth");

const SHOP_ID = "11111111-1111-1111-1111-111111111111";
const SESSION_ID = "33333333-3333-3333-3333-333333333333";

test.describe("Heartbeat-based eviction detection (fixes silent JWT-still-valid bug)", () => {
  test("when the session row disappears (evicted by another device), the next heartbeat signs the user out with a clear message", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await page.route("**/*.supabase.co/**", async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes("/rest/v1/user_sessions") && method === "POST") {
        // registerSession() ใช้ .insert(...).select().single() — Supabase จริงคืน object เดี่ยว
        // ไม่ห่อ array (ต่างจาก default ของ mockAuth.js ที่คืนเป็น array)
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ session_id: SESSION_ID }),
        });
      }
      // ไม่ต้อง override PATCH เพิ่ม — default ของ mockAuth คืน "[]" ให้ทุก method ที่ไม่ใช่ POST
      // บน /rest/v1/user_sessions อยู่แล้ว ซึ่งตรงกับสถานการณ์ "แถวถูกลบไปแล้ว" (evicted) พอดี
      if (url.includes("/rest/v1/parts") || url.includes("/rest/v1/zones") || url.includes("/rest/v1/options")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      return route.fallback();
    });

    await page.goto("/");
    await expect(page.getByText("บทบาทของคุณ: owner")).toBeVisible({ timeout: 15000 });

    // heartbeat interval = 60 วิจริง — รอเวลาจริงให้ครบ 1 รอบ (ดูหมายเหตุด้านบนว่าทำไมไม่ใช้ fake clock)
    await page.waitForURL(/\/login/, { timeout: 75_000 });
    await expect(page.getByText(/ถูกเข้าใช้งานจากอุปกรณ์อื่นเกินจำนวนที่แพ็กเกจอนุญาต/)).toBeVisible({
      timeout: 10000,
    });
  });

  test("when the session row still exists, the heartbeat does NOT sign the user out", async ({ page }) => {
    test.setTimeout(90_000);
    await installMockAuth(page, { role: "owner", shopId: SHOP_ID });
    await page.route("**/*.supabase.co/**", async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      if (url.includes("/rest/v1/user_sessions") && method === "POST") {
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ session_id: SESSION_ID }),
        });
      }
      if (url.includes("/rest/v1/user_sessions") && method === "PATCH") {
        // แถวยังอยู่จริง — heartbeat สำเร็จ ไม่ถือว่าโดน evict
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([{ session_id: SESSION_ID }]),
        });
      }
      if (url.includes("/rest/v1/parts") || url.includes("/rest/v1/zones") || url.includes("/rest/v1/options")) {
        return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      }
      return route.fallback();
    });

    await page.goto("/");
    await expect(page.getByText("บทบาทของคุณ: owner")).toBeVisible({ timeout: 15000 });

    // รอเวลาจริงเกิน 1 รอบ heartbeat (60 วิ) แล้วยืนยันว่า "ยังไม่ถูกเด้ง" ไม่ใช่แค่ "ยังไม่ทันเด้ง"
    await page.waitForTimeout(65_000);

    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByText("บทบาทของคุณ: owner")).toBeVisible();
  });
});
