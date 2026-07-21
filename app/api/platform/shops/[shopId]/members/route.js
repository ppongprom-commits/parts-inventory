import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdminClient";
import { requirePlatformRole } from "../../../../../../lib/platformAdmin";

// GET (ดูสมาชิกของอู่) — ทั้ง 3 role เห็นเหมือนกันหมด
const VIEW_ROLES = ["super_admin", "support", "analyst"];

export async function GET(request, { params }) {
  try {
    const { shopId } = await params;
    const authResult = await requirePlatformRole(request, VIEW_ROLES);
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
