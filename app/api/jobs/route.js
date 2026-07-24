import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabaseAdminClient";
import { verifyCaller } from "../../../lib/teamAuth";
import { canSeeField } from "../../../config/fieldVisibility";

// การ์ด "Field Visibility Whitelist กลาง (role × field group)" — retrofit
// เหมือน app/api/jobs/[id]/route.js ทุกประการ แต่เป็น list สำหรับหน้า /jobs (เดิม
// app/jobs/page.js ดึงตรงจาก supabase client, RLS scope แค่ shop_id เท่านั้น ไม่กรองคอลัมน์
// ตาม role) — mask customer_name/customer_phone ตาม canSeeField() ที่ server ก่อนส่งกลับเสมอ
export async function GET(request) {
  try {
    const authResult = await verifyCaller(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { searchParams } = new URL(request.url);
    const shopId = Number(searchParams.get("shop_id"));
    if (!shopId) {
      return NextResponse.json({ error: "ไม่พบ shop_id" }, { status: 400 });
    }

    const { data: callerMember } = await supabaseAdmin
      .from("shop_members")
      .select("role")
      .eq("shop_id", shopId)
      .eq("user_id", authResult.userId)
      .eq("status", "active")
      .maybeSingle();

    if (!callerMember) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงอู่นี้" }, { status: 403 });
    }

    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from("jobs")
      .select("*")
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (jobsError) throw jobsError;

    const { data: overrides } = await supabaseAdmin
      .from("shop_field_visibility_overrides")
      .select("role, field_group, allowed")
      .eq("shop_id", shopId);

    const canSeeCustomerName = canSeeField(callerMember.role, "customer_name", overrides || []);
    const canSeeCustomerPhone = canSeeField(callerMember.role, "customer_phone", overrides || []);

    const maskedJobs = (jobs || []).map((j) => ({
      ...j,
      customer_name: canSeeCustomerName ? j.customer_name : null,
      customer_phone: canSeeCustomerPhone ? j.customer_phone : null,
    }));

    return NextResponse.json({ jobs: maskedJobs });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
