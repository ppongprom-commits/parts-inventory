import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdminClient";

async function verifyPlatformAdmin(request) {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace("Bearer ", "").trim();

  if (!token) return { error: "ไม่พบ token กรุณาเข้าสู่ระบบใหม่", status: 401 };

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return { error: "session ไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่", status: 401 };
  }

  const { data: adminRow } = await supabaseAdmin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!adminRow) return { error: "บัญชีนี้ไม่มีสิทธิ์เข้าหน้า Platform Admin", status: 403 };

  return { userId: userData.user.id };
}

export async function GET(request, { params }) {
  try {
    const { shopId } = await params;
    const authResult = await verifyPlatformAdmin(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { data: members, error } = await supabaseAdmin
      .from("shop_members")
      .select("member_id, role, status, user_id, created_at")
      .eq("shop_id", shopId)
      .order("created_at", { ascending: true });

    if (error) throw error;

    const enriched = await Promise.all(
      (members || []).map(async (m) => {
        let email = null;
        try {
          const { data: userData } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
          email = userData?.user?.email || null;
        } catch {
          email = null;
        }
        return { ...m, email };
      })
    );

    return NextResponse.json({ data: enriched });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
