import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../../lib/supabaseAdminClient";
import { verifyPlatformAdmin } from "../../../../../../lib/platformAdmin";

export async function GET(request, { params }) {
  try {
    const authResult = await verifyPlatformAdmin(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const shopId = params.shopId;

    const { data: members, error } = await supabaseAdmin
      .from("shop_members")
      .select("member_id, role, status, user_id, created_at, contact_name, contact_phone")
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
