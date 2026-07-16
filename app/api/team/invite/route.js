import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdminClient";
import { verifyCaller, verifyShopManager, checkSeatLimit } from "../../../../lib/teamAuth";
import { EMAIL_INVITE_ROLES } from "../../../../lib/staffAuth";

// ส่งคำเชิญใหม่ + ส่งอีเมลเชิญจริงผ่าน Supabase Auth (inviteUserByEmail)
// ⚠️ ใช้ได้เฉพาะบทบาท "manager" เท่านั้น — หัวหน้างาน/ช่าง/ผู้ช่วยช่าง
// ให้ใช้ /api/team/create-staff (ระบบ username+PIN แทน ไม่ต้องมีอีเมล)
export async function POST(request) {
  try {
    const authResult = await verifyCaller(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { userId } = authResult;

    const body = await request.json();
    const shopId = body.shop_id;
    const email = (body.email || "").trim().toLowerCase();
    const role = body.role;

    if (!shopId || !email || !role) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ (shop_id/email/role)" }, { status: 400 });
    }
    if (!EMAIL_INVITE_ROLES.includes(role)) {
      return NextResponse.json(
        { error: "บทบาทนี้ไม่ได้เชิญผ่านอีเมล ใช้ระบบ username+PIN แทน" },
        { status: 400 }
      );
    }

    const managerCheck = await verifyShopManager(shopId, userId);
    if (managerCheck.error) {
      return NextResponse.json({ error: managerCheck.error }, { status: managerCheck.status });
    }

    const seatCheck = await checkSeatLimit(shopId, email);
    if (!seatCheck.ok) {
      return NextResponse.json({ error: seatCheck.error }, { status: 400 });
    }
    const { shop } = seatCheck;

    // บันทึกคำเชิญลง shop_invites (upsert เหมือน RPC create_shop_invite เดิม)
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("shop_invites")
      .upsert(
        { shop_id: shopId, email, role, invited_by: userId, accepted_at: null },
        { onConflict: "shop_id,email" }
      )
      .select()
      .single();
    if (inviteError) throw inviteError;

    // ส่งอีเมลเชิญจริงผ่าน Supabase Auth Admin API
    // ลิงก์ในอีเมลจะพาไปที่ /signup?invite=<invite_id> พร้อม session ที่ login ให้อัตโนมัติ
    const origin = request.headers.get("origin") || process.env.NEXT_PUBLIC_SITE_URL || "";
    const { error: mailError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${origin}/signup?invite=${invite.invite_id}`,
      data: { invited_shop_name: shop.shop_name, invited_role: role },
    });

    if (mailError) {
      // ถ้าเป็นเพราะมี user นี้อยู่แล้วในระบบ (สมัครไว้ก่อนหน้า) inviteUserByEmail จะ error
      // แต่คำเชิญใน shop_invites ยังบันทึกไว้แล้ว -> ให้แจ้งผู้ใช้บอกด้วยตัวเองแทน
      return NextResponse.json({
        data: invite,
        warning:
          "บันทึกคำเชิญไว้แล้ว แต่ส่งอีเมลอัตโนมัติไม่สำเร็จ (" +
          mailError.message +
          ") — อาจเป็นเพราะอีเมลนี้มีบัญชีอยู่แล้ว กรุณาแจ้งผู้ถูกเชิญให้เข้าสู่ระบบแล้วเข้าหน้า /signup เอง",
      });
    }

    return NextResponse.json({ data: invite });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
