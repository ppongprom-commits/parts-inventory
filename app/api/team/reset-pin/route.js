import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdminClient";
import { verifyCaller, verifyShopManager } from "../../../../lib/teamAuth";
import { isValidPin } from "../../../../lib/staffAuth";

export async function POST(request) {
  try {
    const authResult = await verifyCaller(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { userId } = authResult;

    const body = await request.json();
    const memberId = body.member_id;
    const newPin = (body.new_pin || "").trim();

    if (!memberId || !newPin) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ (member_id/new_pin)" }, { status: 400 });
    }
    if (!isValidPin(newPin)) {
      return NextResponse.json({ error: "PIN/รหัสผ่านต้องเป็นตัวอักษรหรือตัวเลข ยาว 4-20 ตัว" }, { status: 400 });
    }

    // หาสมาชิกเป้าหมาย + ตรวจว่าเป็นบัญชี username+PIN จริง (มี login_username)
    const { data: targetMember, error: targetError } = await supabaseAdmin
      .from("shop_members")
      .select("shop_id, user_id, login_username")
      .eq("member_id", memberId)
      .single();
    if (targetError) throw targetError;

    if (!targetMember.login_username) {
      return NextResponse.json(
        { error: "สมาชิกคนนี้ใช้บัญชีอีเมล ไม่ใช่ระบบ username+PIN — รีเซ็ตรหัสผ่านผ่านอีเมลแทน" },
        { status: 400 }
      );
    }

    // อนุญาต 2 กรณี: (1) เจ้าของบัญชีเปลี่ยน PIN ตัวเอง หรือ (2) owner/manager เปลี่ยนให้คนอื่น
    const isSelfService = targetMember.user_id === userId;

    if (!isSelfService) {
      const managerCheck = await verifyShopManager(targetMember.shop_id, userId);
      if (managerCheck.error) {
        return NextResponse.json({ error: managerCheck.error }, { status: managerCheck.status });
      }
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      targetMember.user_id,
      { password: newPin }
    );
    if (updateError) throw updateError;

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
