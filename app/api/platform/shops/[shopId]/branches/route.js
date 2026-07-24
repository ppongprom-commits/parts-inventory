import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdminClient";
import { requirePlatformRole } from "../../../../../../lib/platformAdmin";

// การ์ด "Platform-controlled shop features" (24 ก.ค. 2026) — ดูรายชื่อสาขาของร้านใดก็ได้จากแผง
// /platform-admin โดยไม่ต้อง join-as-support เข้าไปก่อน (ต่างจาก GET /api/branches เดิมที่ยัง
// scope ตาม shop_members ของผู้เรียกเอง — endpoint นี้แยกต่างหาก ไม่ merge กัน)
//
// View-only สำหรับทั้ง 3 role รวม analyst ด้วย (ตาม convention ของโปรเจกต์นี้ที่ analyst
// เห็นได้ทุกอย่าง แค่แก้ไข/สร้างไม่ได้ — ดู VIEW_ROLES ใน app/api/platform/shops/route.js)
const VIEW_ROLES = ["super_admin", "support", "analyst"];

export async function GET(request, { params }) {
  try {
    const authResult = await requirePlatformRole(request, VIEW_ROLES);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const shopId = Number(params.shopId);
    if (!shopId) {
      return NextResponse.json({ error: "shopId ไม่ถูกต้อง" }, { status: 400 });
    }

    const { data: branches, error } = await supabaseAdmin
      .from("branches")
      .select("branch_id, branch_code, branch_name, is_default, is_active, is_read_only, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data: branches || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
