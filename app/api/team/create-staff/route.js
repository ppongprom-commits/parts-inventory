import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdminClient";
import { verifyCaller, verifyShopManager, checkSeatLimit } from "../../../../lib/teamAuth";
import {
  STAFF_ROLES,
  isValidUsername,
  isValidPin,
  normalizeUsername,
  usernameToStaffEmail,
} from "../../../../lib/staffAuth";

export async function POST(request) {
  try {
    const authResult = await verifyCaller(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { userId } = authResult;

    const body = await request.json();
    const shopId = body.shop_id;
    const role = body.role;
    const username = normalizeUsername(body.username);
    const pin = (body.pin || "").trim();
    const contactName = (body.contact_name || "").trim();
    const contactPhone = (body.contact_phone || "").trim();

    if (!shopId || !role || !username || !pin || !contactName || !contactPhone) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
    }
    if (!STAFF_ROLES.includes(role)) {
      return NextResponse.json(
        { error: "บทบาทนี้ต้องเชิญผ่านอีเมล ไม่ใช่ username+PIN" },
        { status: 400 }
      );
    }
    if (!isValidUsername(username)) {
      return NextResponse.json(
        { error: "username ต้องเป็นตัวอักษรเล็ก/ตัวเลข/จุด/ขีดล่าง ยาว 3-20 ตัว" },
        { status: 400 }
      );
    }
    if (!isValidPin(pin)) {
      return NextResponse.json({ error: "PIN/รหัสผ่านต้องเป็นตัวอักษรหรือตัวเลข ยาว 4-20 ตัว" }, { status: 400 });
    }

    // 1) ตรวจสิทธิ์: owner/manager ของอู่นี้เท่านั้น
    const managerCheck = await verifyShopManager(shopId, userId);
    if (managerCheck.error) {
      return NextResponse.json({ error: managerCheck.error }, { status: managerCheck.status });
    }

    // 2) ตรวจ tier limit
    const seatCheck = await checkSeatLimit(shopId);
    if (!seatCheck.ok) {
      return NextResponse.json({ error: seatCheck.error }, { status: 400 });
    }

    // 3) ตรวจ username ซ้ำ (unique ทั้งระบบ)
    const { data: existingUsername } = await supabaseAdmin
      .from("shop_members")
      .select("member_id")
      .eq("login_username", username)
      .maybeSingle();
    if (existingUsername) {
      return NextResponse.json({ error: "username นี้มีคนใช้แล้ว ลองชื่ออื่น" }, { status: 400 });
    }

    // 4) สร้างบัญชีจริงใน auth.users ด้วยอีเมลปลอม + email_confirm: true
    //    (ข้ามขั้นตอนยืนยันอีเมลไปเลย เพราะเจ้าของเป็นคน "ยืนยัน" แทนตั้งแต่สร้าง)
    const staffEmail = usernameToStaffEmail(username);
    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: staffEmail,
      password: pin,
      email_confirm: true,
      user_metadata: { login_username: username, is_staff_account: true, full_name: contactName },
    });
    if (createError) {
      throw new Error(
        createError.message?.includes("already been registered")
          ? "username นี้ถูกใช้สร้างบัญชีไปแล้ว (ระบบภายใน) ลองชื่ออื่น"
          : createError.message
      );
    }

    // 5) สร้าง shop_members ผูกอู่ทันที (ไม่ต้องมีขั้นตอน invite/accept)
    const { data: member, error: memberError } = await supabaseAdmin
      .from("shop_members")
      .insert({
        shop_id: shopId,
        user_id: createdUser.user.id,
        role,
        status: "active",
        invited_by: userId,
        contact_name: contactName,
        contact_phone: contactPhone,
        login_username: username,
      })
      .select()
      .single();

    if (memberError) {
      // rollback: ถ้าสร้าง shop_members ไม่สำเร็จ ลบ auth user ทิ้งกันเป็น orphan account
      await supabaseAdmin.auth.admin.deleteUser(createdUser.user.id);
      throw memberError;
    }

    return NextResponse.json({ data: member });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
