import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdminClient";
import {
  requirePlatformRole,
  wouldRemoveLastSuperAdmin,
  PLATFORM_ROLES,
} from "../../../../lib/platformAdmin";

// จัดการ platform_admins เอง (เพิ่ม/ลบ/เปลี่ยน role) — Super Admin เท่านั้นตาม permission
// matrix (การ์ด "Platform admin role tiers") ทั้ง GET/POST/PATCH/DELETE
//
// POST/PATCH/DELETE เขียนผ่าน RPC (platform_add_admin / platform_change_admin_role /
// platform_remove_admin) ที่ทำ mutation + insert เข้า platform_audit_log ในทรานแซคชันเดียวกัน
// (การ์ด "Platform admin audit log" ตัดสินใจไว้: log เขียนไม่สำเร็จ = การกระทำหลัก rollback ด้วย)
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

    const { data, error } = await supabaseAdmin.rpc("platform_add_admin", {
      p_actor_user_id: authResult.userId,
      p_target_user_id: targetUser.id,
      p_role: role,
    });
    if (error) throw error;

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

    // เช็คระดับ API ก่อน (เร็ว, ให้ error message ชัดเจน) — ฟังก์ชัน RPC เองก็เช็คซ้ำอีกชั้น
    // (defense in depth กัน race condition)
    if (await wouldRemoveLastSuperAdmin(user_id, role)) {
      return NextResponse.json(
        { error: "ไม่สามารถลดสิทธิ์ Super Admin คนสุดท้ายได้ — ต้องมี Super Admin อย่างน้อย 1 คนเสมอ" },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin.rpc("platform_change_admin_role", {
      p_actor_user_id: authResult.userId,
      p_target_user_id: user_id,
      p_new_role: role,
    });
    if (error) throw error;

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

    const { error } = await supabaseAdmin.rpc("platform_remove_admin", {
      p_actor_user_id: authResult.userId,
      p_target_user_id: userId,
    });
    if (error) throw error;

    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
