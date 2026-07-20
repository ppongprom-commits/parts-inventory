"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthProvider";
import RequireAuth from "../../components/RequireAuth";
import ZoneAutocomplete from "../../components/ZoneAutocomplete";
import { getDescendantIds, formatBreadcrumb, getSortedZoneList } from "../../lib/zoneHelpers";

function MovePartsPageContent() {
  const searchParams = useSearchParams();
  const { currentShopId } = useAuth();

  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);

  // ต้นทาง — เลือกได้ทุกระดับ (ทั้ง Area หรือ Rack/Level เจาะจงก็ได้) ผ่าน dropdown ธรรมดา
  const [sourceZoneId, setSourceZoneId] = useState(searchParams.get("from") || "");
  // ปลายทาง — ต้องเป็น leaf เสมอ (จุดที่อะไหล่อยู่จริงได้) ใช้ตัวค้นหาเดียวกับหน้า add/edit
  const [destZoneId, setDestZoneId] = useState(null);

  const [affectedCount, setAffectedCount] = useState(null);
  const [countLoading, setCountLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (currentShopId) fetchZones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShopId]);

  useEffect(() => {
    if (sourceZoneId) countAffected();
    else setAffectedCount(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceZoneId, zones.length]);

  async function fetchZones() {
    const { data } = await supabase
      .from("zones")
      .select("*")
      .eq("shop_id", currentShopId)
      .order("code", { ascending: true });
    setZones(data || []);
    setLoading(false);
  }

  async function countAffected() {
    setCountLoading(true);
    const descendantIds = getDescendantIds(zones, sourceZoneId);
    const { count } = await supabase
      .from("parts")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", currentShopId)
      .eq("is_active", true)
      .in("zone_id", descendantIds);
    setAffectedCount(count ?? 0);
    setCountLoading(false);
  }

  async function handleMove() {
    if (!sourceZoneId || !destZoneId) return;

    const confirmed = window.confirm(
      `ย้ายอะไหล่ ${affectedCount} ชิ้น จาก "${formatBreadcrumb(zones, sourceZoneId)}" ไปที่ "${formatBreadcrumb(
        zones,
        destZoneId
      )}" ใช่ไหม?`
    );
    if (!confirmed) return;

    setMoving(true);
    setMsg(null);

    const descendantIds = getDescendantIds(zones, sourceZoneId);
    const { error, count } = await supabase
      .from("parts")
      .update({ zone_id: destZoneId })
      .eq("shop_id", currentShopId)
      .in("zone_id", descendantIds)
      .select("id", { count: "exact" });

    if (error) {
      setMsg({ type: "error", text: "ย้ายไม่สำเร็จ: " + error.message });
    } else {
      setMsg({ type: "success", text: `ย้ายอะไหล่ ${count ?? affectedCount} ชิ้นเรียบร้อยแล้ว ✅` });
      setAffectedCount(0);
    }
    setMoving(false);
  }

  if (loading) {
    return (
      <div className="container">
        <div className="empty">กำลังโหลด...</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>📦 ย้ายอะไหล่ทั้งโซน</h1>
        <Link href="/admin/zones" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>

      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        ย้ายอะไหล่ทั้งหมดจากโซนต้นทาง (รวมโซนย่อยข้างในทุกชั้น) ไปยังโซนปลายทางในทีเดียว —
        ใช้ตอนจัดของใหม่ทั้งชั้น/ทั้งแร็ค ไม่ต้องแก้ทีละชิ้น
      </div>

      {msg && <div className={`msg ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

      <label>
        โซนต้นทาง (ย้ายทุกอย่างข้างในออกทั้งหมด — เลือกทั้ง Area หรือเจาะจงถึง Rack/Level ก็ได้)
        <select value={sourceZoneId} onChange={(e) => setSourceZoneId(e.target.value)}>
          <option value="">— เลือกโซนต้นทาง —</option>
          {getSortedZoneList(zones).map((z) => (
            <option key={z.id} value={z.id}>
              {formatBreadcrumb(zones, z.id)}
              {z.name ? ` — ${z.name}` : ""}
            </option>
          ))}
        </select>
      </label>

      {sourceZoneId && (
        <div style={{ fontSize: 13, marginBottom: 16 }}>
          {countLoading ? "กำลังนับ..." : `พบอะไหล่ ${affectedCount} ชิ้นในโซนนี้ (รวมโซนย่อย)`}
        </div>
      )}

      <div style={{ marginBottom: 16, display: "flex", flexDirection: "column", gap: 6 }}>
        <div>โซนปลายทาง</div>
        <ZoneAutocomplete zones={zones} value={destZoneId} onChange={setDestZoneId} />
      </div>

      <button
        type="button"
        onClick={handleMove}
        disabled={!sourceZoneId || !destZoneId || moving || affectedCount === 0}
      >
        {moving ? "กำลังย้าย..." : `ย้ายอะไหล่ ${affectedCount ?? ""} ชิ้น`}
      </button>
    </div>
  );
}

export default function MovePartsPage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager", "supervisor", "technician", "assistant"]}>
      <Suspense fallback={<div className="container">กำลังโหลด...</div>}>
        <MovePartsPageContent />
      </Suspense>
    </RequireAuth>
  );
}
