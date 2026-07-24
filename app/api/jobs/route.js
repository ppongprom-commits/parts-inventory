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

    // การ์ด "Multi-branch support" — 1 user อาจมีหลายแถวใน shop_members ของ shop เดียวกันได้แล้ว
    // (คนละสาขา คนละ role) — ดึงทุกแถวแทน .maybeSingle() เดิม (ซึ่งจะ throw ถ้าเจอมากกว่า 1 แถว)
    // แล้วเลือก role สูงสุดไว้ทำ field-visibility masking + ตัดสินใจว่าต้อง scope ตาม branch_id ไหม
    const { data: memberRows } = await supabaseAdmin
      .from("shop_members")
      .select("role, branch_id")
      .eq("shop_id", shopId)
      .eq("user_id", authResult.userId)
      .eq("status", "active");

    if (!memberRows || memberRows.length === 0) {
      return NextResponse.json({ error: "ไม่มีสิทธิ์เข้าถึงอู่นี้" }, { status: 403 });
    }

    const isCrossBranch = memberRows.some((m) => ["owner", "manager"].includes(m.role));
    const callerMember = {
      role: memberRows.find((m) => ["owner", "manager"].includes(m.role))?.role || memberRows[0].role,
    };
    // Judgment call (ไม่ได้ระบุตรงๆ ในการ์ด multi-branch): owner/manager เห็นงานข้ามทุกสาขาของ
    // ร้านตัวเองเสมอ role อื่นเห็นเฉพาะสาขาที่ตัวเองมีแถว shop_members อยู่จริง — เดิม endpoint
    // นี้ (ผ่าน supabaseAdmin, service role) ข้าม RLS โดยตั้งใจ จึงต้องกรอง branch เองตรงนี้ด้วย
    // ไม่งั้นข้อมูลสาขา A จะรั่วไปสาขา B ผ่าน endpoint นี้ทั้งที่ RLS (สำหรับ browser client อื่นๆ)
    // ถูกแก้ให้ปลอดภัยแล้ว
    const branchIds = [...new Set(memberRows.map((m) => m.branch_id).filter((b) => b != null))];

    let jobsQuery = supabaseAdmin
      .from("jobs")
      .select("*")
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (!isCrossBranch && branchIds.length > 0) {
      jobsQuery = jobsQuery.in("branch_id", branchIds);
    }

    const { data: jobs, error: jobsError } = await jobsQuery;
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
