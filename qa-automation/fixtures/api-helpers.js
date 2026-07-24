// ------------------------------------------------------------
// Helper สำหรับเทสต์ที่ต้องยิง API ตรง (ไม่ผ่าน UI) เช่น TC-205, TC-404
// ต้องดึง Supabase access token จาก session ที่ login ผ่าน UI ไว้แล้ว
// เพราะ API routes พวกนี้เช็คจาก Authorization: Bearer header ไม่ใช่ cookie
// ------------------------------------------------------------

/**
 * ดึง access_token ของ session ปัจจุบันจาก cookie ของ Supabase client
 *
 * การ์ด "middleware.js — defense-in-depth route protection" (24 ก.ค. 2026) — lib/supabaseClient.js
 * เปลี่ยนจาก createClient (@supabase/supabase-js เดิม, เก็บ session ใน localStorage) มาเป็น
 * createBrowserClient (@supabase/ssr, เก็บ session ใน **cookie** แทน) เพื่อให้ middleware
 * (รันฝั่ง edge, อ่านได้แค่ cookie ไม่มีสิทธิ์เข้าถึง localStorage ของ browser) เห็น session ได้ —
 * helper นี้เลยต้องอ่านจาก cookie ไม่ใช่ localStorage อีกต่อไป (ยืนยัน empirically กับ staging จริง
 * แล้วว่า localStorage ไม่มี key sb-* หลงเหลืออยู่เลยหลังเปลี่ยน)
 *
 * รูปแบบ cookie: ชื่อ `sb-<project-ref>-auth-token` ค่าเป็น "base64-" + base64(JSON stringify
 * ของ session object ทั้งก้อน มี .access_token อยู่ข้างใน) ถ้า session ใหญ่เกิน chunk limit ของ
 * @supabase/ssr จะถูกแบ่งเป็นหลาย cookie ชื่อ ...auth-token.0, .1, ... เรียงต่อกันตามลำดับก่อน
 * decode — เผื่อไว้ให้ครบแม้ session ปกติของแอปนี้ (~2.5KB) จะยังไม่เกิน threshold นั้นก็ตาม
 */
export async function getAccessToken(page) {
  const cookies = await page.context().cookies();
  const authCookies = cookies
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => {
      const ai = Number(a.name.split(".")[1] ?? -1);
      const bi = Number(b.name.split(".")[1] ?? -1);
      return ai - bi;
    });

  if (authCookies.length === 0) return null;

  let raw = authCookies.map((c) => decodeURIComponent(c.value)).join("");
  if (raw.startsWith("base64-")) {
    raw = Buffer.from(raw.slice("base64-".length), "base64").toString("utf-8");
  }

  try {
    const parsed = JSON.parse(raw);
    return parsed?.access_token || parsed?.currentSession?.access_token || null;
  } catch {
    return null;
  }
}

/** ดึง session_id ปัจจุบัน (การ์ด "Concurrent session eviction ไม่ invalidate JWT จริง") จาก
 *  sessionStorage — ดู lib/sessionTracking.js getStoredSessionId()/SESSION_ID_HEADER สำหรับ
 *  ที่มา ค่านี้แนบไปกับทุก API call ที่ผ่าน lib/teamAuth.js verifyCaller() เป็น header x-session-id
 *  เพื่อให้ server เช็คได้ว่าแถวใน user_sessions ของ session นี้ยังอยู่จริงไหมก่อนเชื่อ JWT */
export async function getStoredSessionId(page) {
  return await page.evaluate(() => window.sessionStorage.getItem("pi_session_id"));
}

/**
 * เข้า /admin/team แล้วดัก request ที่แอปยิงไป /api/team/list-with-emails เอง
 * เพื่อดึง shop_id (ไม่ต้อง hardcode) และรายชื่อสมาชิกทั้งหมดของอู่นั้น
 * คืนค่า { shopId, members } — members คือ array จาก response.data
 */
export async function captureTeamPageData(page) {
  const responsePromise = page.waitForResponse(
    (res) => res.url().includes("/api/team/list-with-emails") && res.request().method() === "POST"
  );
  await page.goto("/admin/team");
  const response = await responsePromise;

  const requestBody = JSON.parse(response.request().postData() || "{}");
  const json = await response.json();

  return {
    shopId: requestBody.shop_id,
    members: json.data || [],
  };
}

export function findMemberByUsername(members, username) {
  return members.find((m) => m.login_username === username);
}
