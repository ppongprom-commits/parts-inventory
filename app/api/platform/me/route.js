import { NextResponse } from "next/server";
import { requirePlatformRole, PLATFORM_ROLES } from "../../../../lib/platformAdmin";

// การ์ด "Platform-controlled shop features" (24 ก.ค. 2026) — app/platform-admin/page.js ต้องรู้
// role ของตัวเอง (ไม่ใช่แค่ของอู่ที่กำลังดู) เพื่อ render ปุ่ม toggle feature/accounting module
// เป็น read-only สำหรับ support/analyst (ปุ่มพวกนี้ต้อง super_admin เท่านั้นถึงกดได้จริง — ดู
// requirePlatformRole()) ก่อนหน้านี้หน้านี้ไม่เคยมีที่ดึง role ของตัวเองเลย (ทุก route อื่นที่มีอยู่
// เดิม เช่น GET /api/platform/admins จำกัดแค่ super_admin เรียกได้ ใช้ไม่ได้กับ role อื่น) —
// endpoint นี้เปิดให้ทั้ง 3 role เรียกดู "role ของตัวเอง" ได้เสมอ (read-only ข้อมูลของตัวเองล้วนๆ
// ไม่มีความเสี่ยงด้าน privilege escalation)
export async function GET(request) {
  try {
    const authResult = await requirePlatformRole(request, PLATFORM_ROLES);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    return NextResponse.json({ data: { role: authResult.role } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
