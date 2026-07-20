import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabaseAdminClient";
import { verifyCaller } from "../../../../lib/teamAuth";
import { toCsv } from "../../../../lib/csvExport";
import { formatBreadcrumb } from "../../../../lib/zoneHelpers";
import { getTierConfig } from "../../../../config/subscriptionTiers";

// Export CSV (Starter+) — การ์ด "Export CSV (Starter+)"
//
// ขอบเขตของ route นี้ (ทำเฉพาะ Parts ก่อน — Jobs/Sales CSV เก็บไว้ทำรอบหน้า):
// - "Jobs" CSV และ "Sales" CSV ในการ์ดต้องพึ่งฟีเจอร์ที่ยังไม่มีจริงในระบบตอนนี้ (payment_method,
//   cart-based selling flow ที่การ์ด Sales section อ้างถึงโดยตรง, และ Field Visibility
//   Whitelist สำหรับ customer_name/phone ที่มีเครื่องหมาย * ในการ์ด) — เดาทำเองคืนนี้เสี่ยงเกินไป
//   ทำ Parts CSV ให้ครบตาม spec ที่ทำได้จริงกับ schema ปัจจุบันก่อน
//
// ✅ ตัดสินใจแล้วในการ์ด ที่ทำตามในไฟล์นี้:
// - Format: UTF-8 with BOM (lib/csvExport.js)
// - Tier gate: Trial ไม่ได้ (Starter ขึ้นไป) — เช็ค 403 ที่นี่ (ชั้นที่ 2 คู่กับ UI ที่ซ่อนปุ่ม)
// - สิทธิ์: Owner/Manager/Supervisor เท่านั้น (Technician/Assistant ไม่ได้) — 403 ถ้าไม่ผ่าน
const ALLOWED_ROLES = ["owner", "manager", "supervisor"];

const COLUMNS = [
  { key: "part_id", header: "part_id" },
  { key: "part_name", header: "part_name" },
  { key: "part_number", header: "part_number" },
  { key: "car_brand", header: "car_brand" },
  { key: "car_model", header: "car_model" },
  { key: "generation_code", header: "generation_code" },
  { key: "trim_name", header: "trim_name" },
  { key: "condition", header: "condition" },
  { key: "source_type", header: "source_type" },
  { key: "status", header: "status" },
  { key: "zone_path", header: "zone" },
  { key: "owner_type", header: "owner_type" },
  { key: "quantity", header: "quantity" },
  { key: "price", header: "price" },
  { key: "created_at", header: "created_at" },
];

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

    if (!callerMember || !ALLOWED_ROLES.includes(callerMember.role)) {
      return NextResponse.json(
        { error: "เฉพาะเจ้าของ/ผู้จัดการ/หัวหน้างานเท่านั้นที่ export ได้" },
        { status: 403 }
      );
    }

    const { data: shop } = await supabaseAdmin
      .from("shops")
      .select("subscription_plan")
      .eq("shop_id", shopId)
      .maybeSingle();

    const tier = getTierConfig(shop?.subscription_plan);
    if (shop?.subscription_plan === "trial") {
      return NextResponse.json(
        { error: `Export CSV ใช้ได้ตั้งแต่แพ็กเกจ Starter ขึ้นไป (ตอนนี้: ${tier.label})` },
        { status: 403 }
      );
    }

    const { data: parts, error: partsError } = await supabaseAdmin
      .from("parts")
      .select(
        "id, part_name, part_number, car_brand, car_model, generation_id, trim_id, condition, source_type, status, zone_id, quantity, price, created_at"
      )
      .eq("shop_id", shopId)
      .order("created_at", { ascending: false });
    if (partsError) throw partsError;

    const [{ data: zones }, { data: generations }, { data: trims }] = await Promise.all([
      supabaseAdmin.from("zones").select("id, parent_id, code, owner_type").eq("shop_id", shopId),
      supabaseAdmin.from("model_generations").select("generation_id, generation_code"),
      supabaseAdmin.from("model_trims").select("trim_id, trim_name"),
    ]);

    const zoneList = zones || [];
    const zoneById = Object.fromEntries(zoneList.map((z) => [z.id, z]));
    const generationCodeById = Object.fromEntries((generations || []).map((g) => [g.generation_id, g.generation_code]));
    const trimNameById = Object.fromEntries((trims || []).map((t) => [t.trim_id, t.trim_name]));

    const rows = (parts || []).map((p) => {
      const zone = p.zone_id ? zoneById[p.zone_id] : null;
      return {
        part_id: p.id,
        part_name: p.part_name,
        part_number: p.part_number,
        car_brand: p.car_brand,
        car_model: p.car_model,
        generation_code: p.generation_id ? generationCodeById[p.generation_id] : null,
        trim_name: p.trim_id ? trimNameById[p.trim_id] : null,
        condition: p.condition,
        source_type: p.source_type,
        status: p.status,
        zone_path: p.zone_id ? formatBreadcrumb(zoneList, p.zone_id) : null,
        owner_type: zone?.owner_type ?? null,
        quantity: p.quantity,
        price: p.price,
        created_at: p.created_at,
      };
    });

    const csv = toCsv(rows, COLUMNS);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="parts-export-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
