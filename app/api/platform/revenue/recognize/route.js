import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdminClient";
import { requirePlatformRole } from "../../../../../lib/platformAdmin";

// การ์ด "Platform Revenue Module" — recognize_due_platform_revenue() รันอัตโนมัติทุกวัน 01:00 ผ่าน
// pg_cron อยู่แล้ว (db/platform_revenue_migration.sql) route นี้แค่เปิดให้กดเรียกเองได้ทันทีเวลาไหน
// ก็ได้ (idempotent เต็มรูป — เรียกซ้ำไม่มีผลเสีย) สำหรับ Super Admin ที่อยากเห็นผลทันทีไม่ต้องรอ cron
const RECORD_REVENUE_ROLES = ["super_admin"];

export async function POST(request) {
  try {
    const authResult = await requirePlatformRole(request, RECORD_REVENUE_ROLES);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { data: recognizedCount, error } = await supabaseAdmin.rpc("recognize_due_platform_revenue");
    if (error) throw error;

    return NextResponse.json({ data: { recognizedCount } });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
