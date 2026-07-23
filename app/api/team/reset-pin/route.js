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
      return NextResponse.json({ error: "PIN/รหัสผ่านต้องเป็นตัวอักษรหรือตัวเลข ยาว 6-20 ตัว" }, { status: 400 });
    }

    // หาสมาชิกเป้าหมาย (ใช้ได้ทั้งบัญชี username+PIN และบัญชีอีเมล — updateUserById
    // ตั้งรหัสผ่านได้เหมือนกันไม่ว่าจะ login ด้วยวิธีไหน)
    const { data: targetMember, error: targetError } = await supabaseAdmin
      .from("shop_members")
      .select("shop_id, user_id, login_username, role")
      .eq("member_id", memberId)
      .single();
    if (targetError) throw targetError;

    // อนุญาต 2 กรณี: (1) เจ้าของบัญชีเปลี่ยนรหัส/PIN ตัวเอง หรือ (2) owner/manager เปลี่ยนให้คนอื่น
    const isSelfService = targetMember.user_id === userId;

    if (!isSelfService) {
      // กันไว้ก่อน: manager ต้องรีเซ็ตรหัสผ่านของ owner แทนไม่ได้ (ป้องกัน manager ล็อก owner ออกจากอู่ตัวเอง)
      // เจ้าของต้องรีเซ็ตรหัสผ่านตัวเอง (self-service) เท่านั้น
      if (targetMember.role === "owner") {
        return NextResponse.json(
          { error: "ไม่สามารถรีเซ็ตรหัสผ่านของเจ้าของอู่แทนได้ — เจ้าของต้องรีเซ็ตด้วยตัวเองเท่านั้น" },
          { status: 403 }
        );
      }

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
