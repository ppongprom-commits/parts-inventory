import { NextResponse } from "next/server";
import { supabaseAdmin } from "../../../../../lib/supabaseAdminClient";
import { requirePlatformRole } from "../../../../../lib/platformAdmin";

// การ์ด "Platform Revenue Module" — journal ระดับรายตัว อ่อนไหวกว่า dashboard สรุป
// ตัดสินใจกับผู้ใช้แล้ว (23 ก.ค. 2026): Analyst เห็นเต็มเหมือน Super Admin — Support เห็นแค่
// dashboard (ขอบเขตงานเดิมของ Support คือ operational join-as-support ไม่ใช่ตรวจสอบการเงิน)
const JOURNAL_DETAIL_ROLES = ["super_admin", "analyst"];
const PAGE_SIZE = 50;

export async function GET(request) {
  try {
    const authResult = await requirePlatformRole(request, JOURNAL_DETAIL_ROLES);
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { searchParams } = new URL(request.url);
    const offset = Number(searchParams.get("offset") || 0);

    const {
      data: entries,
      error: entriesError,
      count,
    } = await supabaseAdmin
      .from("platform_journal_entries")
      .select("entry_id, entry_date, description, source_type, created_by, created_at", { count: "exact" })
      .order("entry_date", { ascending: false })
      .order("entry_id", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (entriesError) throw entriesError;

    const entryIds = (entries || []).map((e) => e.entry_id);
    const { data: lines, error: linesError } = await supabaseAdmin
      .from("platform_journal_entry_lines")
      .select("entry_id, account_code, debit, credit, shop_id")
      .in("entry_id", entryIds.length ? entryIds : [-1]);
    if (linesError) throw linesError;

    const linesByEntry = {};
    (lines || []).forEach((l) => {
      if (!linesByEntry[l.entry_id]) linesByEntry[l.entry_id] = [];
      linesByEntry[l.entry_id].push(l);
    });

    const data = (entries || []).map((e) => ({ ...e, lines: linesByEntry[e.entry_id] || [] }));

    return NextResponse.json({ data, total: count ?? 0 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
