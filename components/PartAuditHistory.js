"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

// การ์ด "ขยาย audit_log ให้ครอบทั้งระบบ" — ตัดสินใจไว้ 19 ก.ค. 2026 (คุยตอนออกแบบ Field Scanner
// Role): "ต้องมี UI ในเฟสแรก — หน้า edit part ต้องแสดงประวัติการแก้ไขของ part นั้นๆ (ใครแก้ field
// ไหน เมื่อไหร่)" — คอมโพเนนต์นี้เรียก RPC get_part_audit_history (security definer, เช็คสิทธิ์
// เป็นสมาชิกร้านเจ้าของ part เอง) แทนการ query audit_log ตรงๆ เพราะ RLS ของ audit_log จำกัดไว้
// เฉพาะ owner/manager เท่านั้น (กัน cross-tenant leak) แต่ technician/assistant ที่แก้ part ได้
// ก็ควรเห็นประวัติของ "part ที่ตัวเองกำลังดูอยู่" ได้เหมือนกัน — RPC นี้เป็นช่องเปิดที่แคบกว่า

const FIELD_LABELS = {
  part_name: "ชื่ออะไหล่",
  price: "ราคาขาย",
  cost_price: "ราคาต้นทุน",
  quantity: "จำนวน",
  status: "สถานะ",
  zone_id: "โซนจัดเก็บ",
  zone_code: "รหัสโซน (เดิม)",
  condition: "สภาพ",
  notes: "หมายเหตุ",
  item_type: "ประเภท",
};

function diffFields(oldData, newData) {
  if (!oldData || !newData) return [];
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const changed = [];
  keys.forEach((k) => {
    // ตัด field ที่เปลี่ยนทุกครั้งอยู่แล้วออก ไม่งั้น diff รกไปด้วยของที่ไม่มีความหมายกับผู้ใช้งาน
    if (k === "updated_at" || k === "created_at") return;
    const a = oldData[k];
    const b = newData[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      changed.push({ field: k, from: a, to: b });
    }
  });
  return changed;
}

function formatValue(v) {
  if (v === null || v === undefined || v === "") return "-";
  if (Array.isArray(v)) return v.length ? `${v.length} รายการ` : "-";
  return String(v);
}

export default function PartAuditHistory({ partId, shopId }) {
  const [entries, setEntries] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!partId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partId]);

  async function load() {
    setLoading(true);
    setError(null);
    const [historyRes, membersRes] = await Promise.all([
      supabase.rpc("get_part_audit_history", { p_part_id: partId }),
      shopId
        ? supabase.from("shop_members").select("user_id, contact_name, login_username").eq("shop_id", shopId)
        : Promise.resolve({ data: [] }),
    ]);
    if (historyRes.error) {
      setError(historyRes.error.message);
      setEntries([]);
    } else {
      setEntries(historyRes.data || []);
    }
    setMembers(membersRes.data || []);
    setLoading(false);
  }

  function actorLabel(userId) {
    if (!userId) return "ไม่ทราบผู้แก้ไข";
    const m = members.find((mm) => mm.user_id === userId);
    return m?.contact_name || m?.login_username || `ผู้ใช้ #${userId.slice(0, 8)}`;
  }

  if (loading || error || entries.length === 0) return null;

  return (
    <div style={{ marginTop: 8, marginBottom: 8 }}>
      <button
        type="button"
        className="secondary"
        data-testid="part-history-toggle"
        onClick={() => setOpen((o) => !o)}
        style={{ fontSize: 12 }}
      >
        🕘 ประวัติการแก้ไข ({entries.length}) {open ? "▲" : "▼"}
      </button>
      {open && (
        <div data-testid="part-history-list" style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8, fontSize: 12 }}>
          {entries.map((e) => {
            const changes = e.action === "UPDATE" ? diffFields(e.old_data, e.new_data) : [];
            return (
              <div key={e.audit_id} style={{ padding: 8, border: "1px solid var(--border-strong)", borderRadius: 6 }}>
                <div style={{ fontWeight: 600 }}>
                  {e.action === "INSERT" ? "➕ สร้างรายการ" : e.action === "DELETE" ? "🗑️ ลบรายการ" : "✏️ แก้ไข"} โดย{" "}
                  {actorLabel(e.changed_by_user_id)}
                </div>
                <div style={{ color: "var(--text-muted)" }}>{new Date(e.changed_at).toLocaleString("th-TH")}</div>
                {changes.length > 0 && (
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {changes.map((c) => (
                      <li key={c.field}>
                        {FIELD_LABELS[c.field] || c.field}: {formatValue(c.from)} → {formatValue(c.to)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
