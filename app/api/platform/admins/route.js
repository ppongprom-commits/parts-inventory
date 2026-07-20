import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdminClient";
import {
  requirePlatformRole,
  logPlatformAction,
  wouldRemoveLastSuperAdmin,
  PLATFORM_ROLES,
} from "../../../../lib/platformAdmin";

// จัดการ platform_admins เอง (เพิ่ม/ลบ/เปลี่ยน role) — Super Admin เท่านั้นตาม permission
// matrix (การ์ด "Platform admin role tiers") ทั้ง GET/POST/PATCH/DELETE
const MANAGE_ROLES = ["super_admin"];

export async function GET(request) {
  try {
    const authResult = await requirePlatformRole(request, MANAGE_ROLES);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { data: admins, error } = await supabaseAdmin
      .from("platform_admins")
      .select("user_id, role, note, created_at")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const enriched = await Promise.all(
      (admins || []).map(async (a) => {
        let email = null;
        try {
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(a.user_id);
          email = userData?.user?.email || null;
        } catch {
          email = null;
        }
        return { ...a, email };
      })
    );

    return NextResponse.json({ data: enriched });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// เพิ่ม platform admin คนใหม่ (ต้องมีบัญชี auth.users อยู่แล้ว — ระบุด้วยอีเมล)
export async function POST(request) {
  try {
    const authResult = await requirePlatformRole(request, MANAGE_ROLES);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const email = (body.email || "").trim();
    const role = body.role || "support";

    if (!email) {
      return NextResponse.json({ error: "ไม่พบอีเมล" }, { status: 400 });
    }
    if (!PLATFORM_ROLES.includes(role)) {
      return NextResponse.json({ error: "role ไม่ถูกต้อง" }, { status: 400 });
    }

    const { data: usersPage, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listError) throw listError;
    const targetUser = usersPage.users.find((u) => u.email === email);
    if (!targetUser) {
      return NextResponse.json({ error: `ไม่พบบัญชีอีเมล ${email} ในระบบ` }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from("platform_admins")
      .insert({ user_id: targetUser.id, role })
      .select()
      .single();
    if (error) throw error;

    await logPlatformAction({
      adminUserId: authResult.userId,
      adminRole: authResult.role,
      action: "add_platform_admin",
      targetUserId: targetUser.id,
      newData: data,
    });

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// เปลี่ยน role ของ platform admin คนหนึ่ง — กัน super_admin คนสุดท้าย demote ตัวเอง/ถูก demote
export async function PATCH(request) {
  try {
    const authResult = await requirePlatformRole(request, MANAGE_ROLES);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const { user_id, role } = body;
    if (!user_id || !role) {
      return NextResponse.json({ error: "ข้อมูลไม่ครบ (user_id/role)" }, { status: 400 });
    }
    if (!PLATFORM_ROLES.includes(role)) {
      return NextResponse.json({ error: "role ไม่ถูกต้อง" }, { status: 400 });
    }

    if (await wouldRemoveLastSuperAdmin(user_id, role)) {
      return NextResponse.json(
        { error: "ไม่สามารถลดสิทธิ์ Super Admin คนสุดท้ายได้ — ต้องมี Super Admin อย่างน้อย 1 คนเสมอ" },
        { status: 400 }
      );
    }

    const { data: oldRow } = await supabaseAdmin
      .from("platform_admins")
      .select("role")
      .eq("user_id", user_id)
      .maybeSingle();

    const { data, error } = await supabaseAdmin
      .from("platform_admins")
      .update({ role })
      .eq("user_id", user_id)
      .select()
      .single();
    if (error) throw error;

    await logPlatformAction({
      adminUserId: authResult.userId,
      adminRole: authResult.role,
      action: "change_platform_admin_role",
      targetUserId: user_id,
      oldData: oldRow,
      newData: data,
    });

    return NextResponse.json({ data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ลบ platform admin คนหนึ่ง — กัน super_admin คนสุดท้ายลบตัวเอง/ถูกลบ
export async function DELETE(request) {
  try {
    const authResult = await requirePlatformRole(request, MANAGE_ROLES);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    if (!userId) {
      return NextResponse.json({ error: "ไม่พบ user_id" }, { status: 400 });
    }

    if (await wouldRemoveLastSuperAdmin(userId, "removed")) {
      return NextResponse.json(
        { error: "ไม่สามารถลบ Super Admin คนสุดท้ายได้ — ต้องมี Super Admin อย่างน้อย 1 คนเสมอ" },
        { status: 400 }
      );
    }

    const { data: oldRow } = await supabaseAdmin
      .from("platform_admins")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    const { error } = await supabaseAdmin.from("platform_admins").delete().eq("user_id", userId);
    if (error) throw error;

    await logPlatformAction({
      adminUserId: authResult.userId,
      adminRole: authResult.role,
      action: "remove_platform_admin",
      targetUserId: userId,
      oldData: oldRow,
    });

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
