import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdminClient";
import { requirePlatformRole } from "../../../../../../lib/platformAdmin";

// Platform admin เพิ่มตัวเองเป็นสมาชิก "สนับสนุน" ของอู่นี้แบบเปิดเผย
// (โผล่ในหน้า /admin/team ของอู่นั้นด้วย ไม่ใช่การแอบดูข้อมูลแบบซ่อนเร้น)
// ใช้ตอนต้องเข้าไปดู/จำลองปัญหาที่ลูกค้าแจ้งมา
//
// Permission matrix (การ์ด Platform admin role tiers): Super Admin + Support เท่านั้น
// Analyst ห้าม join-as-support (read-only เต็มรูปแบบ)
export async function POST(request, { params }) {
  try {
    const authResult = await requirePlatformRole(request, ["super_admin", "support"]);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const shopId = Number(params.shopId);
    if (!shopId) {
      return NextResponse.json({ error: "shopId ไม่ถูกต้อง" }, { status: 400 });
    }

    // เขียนผ่าน RPC เดียว (mutation + audit log ในทรานแซคชันเดียวกัน — ถ้าเขียน log ไม่สำเร็จ
    // การ join-as-support จะ rollback ไปด้วยทั้งหมด)
    const { data, error } = await supabaseAdmin.rpc("platform_join_as_support", {
      p_admin_user_id: authResult.userId,
      p_admin_role: authResult.role,
      p_shop_id: shopId,
    });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
