import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdminClient";

export async function POST(request) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();

    if (!token) {
      return NextResponse.json({ error: "ไม่พบ token กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
    }

    // ยืนยันตัวตนคนเรียก (ต้อง login อยู่)
    const { data: callerData, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !callerData?.user) {
      return NextResponse.json({ error: "session ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่" }, { status: 401 });
    }

    const body = await request.json();
    const { shop_id, email, password, role } = body;

    if (!shop_id || !email || !password || !role) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ" }, { status: 400 });
    }

    // เช็คว่าคนเรียกเป็น owner/manager ของอู่นี้จริง (ข้าม RLS เพราะใช้ service role
    // จึงต้องเช็คสิทธิ์เองตรงนี้แทน แทนที่ RLS ปกติ)
    const { data: callerMembership } = await supabaseAdmin
      .from("shop_members")
      .select("role")
      .eq("shop_id", shop_id)
      .eq("user_id", callerData.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!callerMembership || !["owner", "manager"].includes(callerMembership.role)) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์สร้างสมาชิกในอู่นี้" }, { status: 403 });
    }

    if (role === "owner") {
      return NextResponse.json({ error: "สร้างสมาชิกระดับเจ้าของแบบนี้ไม่ได้" }, { status: 400 });
    }

    // สร้าง auth user ใหม่ทันที พร้อม email_confirm: true = ข้ามขั้นตอนยืนยันอีเมลไปเลย
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError) throw createError;

    // เพิ่มเข้าทีมทันที เป็น active เลย ไม่ต้องผ่านขั้นตอนคำเชิญ/ยืนยัน
    const { error: memberError } = await supabaseAdmin.from("shop_members").insert({
      shop_id,
      user_id: newUser.user.id,
      role,
      status: "active",
      invited_by: callerData.user.id,
    });

    if (memberError) throw memberError;

    return NextResponse.json({ data: { user_id: newUser.user.id, email } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
