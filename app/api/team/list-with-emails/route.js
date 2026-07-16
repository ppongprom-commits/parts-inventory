import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdminClient";
import { verifyCaller } from "../../../../lib/teamAuth";

export async function POST(request) {
  try {
    const authResult = await verifyCaller(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { userId } = authResult;

    const body = await request.json();
    const shopId = body.shop_id;
    if (!shopId) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
    }

    // ตรวจสิทธิ์: ต้องเป็นสมาชิก active ของอู่นี้เท่านั้น (ทุกบทบาทดูรายชื่อได้ แค่แก้ไม่ได้)
    const { data: callerMembership } = await supabaseAdmin
      .from("shop_members")
      .select("member_id")
      .eq("shop_id", shopId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (!callerMembership) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์ดูรายชื่อทีมของอู่นี้" }, { status: 403 });
    }

    const { data: members, error } = await supabaseAdmin
      .from("shop_members")
      .select("member_id, role, status, login_username, contact_name, user_id")
      .eq("shop_id", shopId)
      .neq("status", "removed") // ซ่อนคนที่ถูกลบออกจากรายการนี้ (ข้อมูลยังอยู่ครบ)
      .order("member_id");

    if (error) throw error;

    // ดึงอีเมลของแต่ละคนจาก auth.users มาผูกเพิ่ม (ต้องใช้ admin API ทีละคน)
    const withEmails = await Promise.all(
      (members || []).map(async (m) => {
        const { data: userData } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
        return { ...m, email: userData?.user?.email || null };
      })
    );

    return NextResponse.json({ data: withEmails });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
