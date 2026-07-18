import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdminClient";
import { verifyPlatformAdmin } from "../../../../../../lib/platformAdmin";

// Platform admin เพิ่มตัวเองเป็นสมาชิก "สนับสนุน" ของอู่นี้แบบเปิดเผย
// (โผล่ในหน้า /admin/team ของอู่นั้นด้วย ไม่ใช่การแอบดูข้อมูลแบบซ่อนเร้น)
// ใช้ตอนต้องเข้าไปดู/จำลองปัญหาที่ลูกค้าแจ้งมา
export async function POST(request, { params }) {
  try {
    const authResult = await verifyPlatformAdmin(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const shopId = Number(params.shopId);
    if (!shopId) {
      return NextResponse.json({ error: "shopId ไม่ถูกต้อง" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("shop_members")
      .upsert(
        {
          shop_id: shopId,
          user_id: authResult.userId,
          role: "manager",
          status: "active",
          invited_by: authResult.userId,
          contact_name: "Platform Support",
        },
        { onConflict: "shop_id,user_id" }
      )
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
