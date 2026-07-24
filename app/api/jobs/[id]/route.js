import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdminClient";
import { verifyCaller } from "../../../../lib/teamAuth";
import { canSeeField } from "../../../../config/fieldVisibility";

// การ์ด "Field Visibility Whitelist กลาง (role × field group)" — retrofit
//
// ก่อนหน้านี้ app/jobs/[id]/page.js ดึงข้อมูลงานตรงจาก supabase client (RLS scope แค่ shop_id
// เท่านั้น ไม่เคยกรองคอลัมน์ตาม role เลย) ทำให้ Field Scanner เห็น customer_name/customer_phone
// ได้เต็มๆ ผ่านการเปิดหน้ารายละเอียดงาน — ขัดกับ floor rule ของการ์ดนี้ที่บอกว่า Field Scanner
// เห็นชื่อ/เบอร์โทรลูกค้าไม่ได้เด็ดขาด และขัดกับกติกาข้อ 1 "server เป็น source of truth"
// (บทเรียนตรงจาก TC-205b — ห้ามส่ง field แล้วซ่อนที่ client)
//
// route นี้ = จุดอ่านเดียวสำหรับหน้ารายละเอียดงาน (GET) — ใช้ supabaseAdmin (bypass RLS อ่าน)
// แล้ว mask customer_name/customer_phone เองตรงนี้ตาม canSeeField() ก่อนส่งกลับ ไม่ใช่ปล่อยให้
// client เห็นแล้วซ่อนทีหลัง — เขียน (POST/PUT) ยังผ่าน supabase client + RLS ตามเดิม (ไม่ใช่
// ขอบเขตของการ์ดนี้ ซึ่งพูดถึงแค่ "เห็น" ข้อมูลอะไรได้บ้าง ไม่ใช่แก้ไขได้ไหม)
export async function GET(request, { params }) {
  try {
    const authResult = await verifyCaller(request);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const jobId = params.id;
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

    const { data: job, error: jobError } = await supabaseAdmin
      .from("jobs")
      .select("*")
      .eq("job_id", jobId)
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) {
      return NextResponse.json({ error: "ไม่พบงานนี้" }, { status: 404 });
    }

    const { data: overrides } = await supabaseAdmin
      .from("shop_field_visibility_overrides")
      .select("role, field_group, allowed")
      .eq("shop_id", shopId);

    const canSeeCustomerName = canSeeField(callerMember.role, "customer_name", overrides || []);
    const canSeeCustomerPhone = canSeeField(callerMember.role, "customer_phone", overrides || []);

    const maskedJob = {
      ...job,
      customer_name: canSeeCustomerName ? job.customer_name : null,
      customer_phone: canSeeCustomerPhone ? job.customer_phone : null,
    };

    return NextResponse.json({ job: maskedJob });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
