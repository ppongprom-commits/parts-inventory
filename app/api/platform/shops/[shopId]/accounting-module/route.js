import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdminClient";
import { requirePlatformRole } from "../../../../../../lib/platformAdmin";

// การ์ด "Platform-controlled shop features" (24 ก.ค. 2026) — เปิด/ปิดโมดูลบัญชีย้ายมาเป็น
// super_admin เท่านั้น (เดิม owner/manager กดเองผ่าน AccountingModuleSettingsCard ใน
// app/admin/page.js เรียก supabase.rpc("set_accounting_module_enabled") ตรงๆ จาก browser)
//
// side effect เดิมทั้งหมด (seed ผังบัญชีมาตรฐาน + backfill journal entries ของงวดปัจจุบัน) ยังอยู่
// ใน RPC set_accounting_module_enabled() เหมือนเดิมทุกประการ — route นี้แค่เปลี่ยนเส้นทางการเรียก
// จาก client (anon key) มาเป็น server (service role) + auth check เป็น super_admin เท่านั้น
const MANAGE_ROLES = ["super_admin"];

export async function POST(request, { params }) {
  try {
    const authResult = await requirePlatformRole(request, MANAGE_ROLES);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const shopId = Number(params.shopId);
    if (!shopId) {
      return NextResponse.json({ error: "shopId ไม่ถูกต้อง" }, { status: 400 });
    }

    const body = await request.json();
    const { enabled } = body;
    if (typeof enabled !== "boolean") {
      return NextResponse.json({ error: "enabled ต้องเป็น true/false" }, { status: 400 });
    }

    // คืนจำนวนรายการที่ backfill เข้า journal (ถ้าเป็นการเปิดครั้งแรก) ให้ UI แสดงข้อความเดียวกับ
    // ที่การ์ดเดิม (AccountingModuleSettingsCard) เคยแสดงตอน owner/manager กดเปิดเอง
    const { data: backfilledCount, error } = await supabaseAdmin.rpc("set_accounting_module_enabled", {
      p_actor_user_id: authResult.userId,
      p_shop_id: shopId,
      p_enabled: enabled,
    });

    if (error) throw error;

    return NextResponse.json({ data: { enabled, backfilled_count: backfilledCount } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
