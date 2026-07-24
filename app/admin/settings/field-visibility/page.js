"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../../lib/supabaseClient";
import { useAuth } from "../../../../lib/AuthProvider";
import RequireAuth from "../../../../components/RequireAuth";
import {
  FIELD_GROUP_LABELS,
  DEFAULT_FIELD_VISIBILITY,
  FLOOR_RULES,
  canSeeField,
} from "../../../../config/fieldVisibility";

// การ์ด "Field Visibility Whitelist กลาง (role × field group)" (Priority: Medium)
// หน้านี้ = Owner ปรับ override ต่อร้านได้ต่อ field group ต่อ role — mirror หน้า
// /admin/settings/admin-approvals ทุกประการ (direct supabase upsert, RLS เป็นตัวบังคับสิทธิ์จริง
// ไม่ใช่หน้านี้) — simplify principle เดียวกัน: ไม่มีแถว override = ใช้ default matrix ตรงๆ
// (canSeeField), กดเปลี่ยนที่นี่แค่สร้าง/แก้ override เฉพาะช่องที่ต่างจาก default
//
// Floor rules (FLOOR_RULES ใน config/fieldVisibility.js) render เป็น checkbox ที่ disabled เสมอ
// และล็อกไว้ที่ "ไม่เห็น" เท่านั้น — ปิดไม่ให้กดได้ตั้งแต่ใน UI เลย แต่ยังคงมี defense-in-depth
// อีก 2 ชั้นข้างหลัง: (1) DB trigger fn_enforce_field_visibility_floor ปฏิเสธการเขียนตรงเข้า
// ตารางที่ฝ่า floor แม้ผ่านช่องทางอื่นที่ไม่ใช่หน้านี้ (2) canSeeField() ฝั่ง server เช็ค floor
// ก่อนเช็ค override เสมอไม่ว่า DB จะมีค่าอะไรอยู่ก็ตาม (ข้อ 1 ในการ์ด: server เป็น source of truth)

const ROLES = ["owner", "manager", "supervisor", "technician", "assistant", "field_scanner", "admin"];
const ROLE_LABELS = {
  owner: "เจ้าของ",
  manager: "ผู้จัดการ",
  supervisor: "หัวหน้างาน",
  technician: "ช่าง",
  assistant: "ผู้ช่วยช่าง",
  field_scanner: "Field Scanner",
  admin: "Admin",
};
const FIELD_GROUPS = Object.keys(FIELD_GROUP_LABELS);

function isFloorLocked(role, fieldGroup) {
  return FLOOR_RULES.some(([r, f]) => r === role && f === fieldGroup);
}

function FieldVisibilitySettingsContent() {
  const { currentShopId, user } = useAuth();
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentShopId) return;
    (async () => {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from("shop_field_visibility_overrides")
        .select("role, field_group, allowed")
        .eq("shop_id", currentShopId);
      if (fetchError) setError(fetchError.message);
      setOverrides(data || []);
      setLoading(false);
    })();
  }, [currentShopId]);

  async function handleToggle(role, fieldGroup, nextValue) {
    const key = `${role}:${fieldGroup}`;
    if (isFloorLocked(role, fieldGroup)) return; // กันพลาด — UI ไม่ควรยิงมาถึงตรงนี้อยู่แล้ว
    setSavingKey(key);
    setError(null);

    const { data, error: upsertError } = await supabase
      .from("shop_field_visibility_overrides")
      .upsert(
        {
          shop_id: currentShopId,
          role,
          field_group: fieldGroup,
          allowed: nextValue,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "shop_id,role,field_group" }
      )
      .select("role, field_group, allowed")
      .single();

    if (upsertError) {
      // ชั้นป้องกันจริงอยู่ที่ DB trigger — ถ้า floor rule ถูกฝ่าจากทางอื่น (ไม่ใช่หน้านี้) จะ
      // raise exception กลับมาที่นี่เป็น error message ตรงๆ
      setError(upsertError.message);
    } else {
      setOverrides((prev) => [
        ...prev.filter((o) => !(o.role === role && o.field_group === fieldGroup)),
        data,
      ]);
    }
    setSavingKey(null);
  }

  return (
    <div className="container">
      <div className="header">
        <h1>🔐 Field Visibility — สิทธิ์เห็นข้อมูลตาม role</h1>
        <Link href="/admin" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>

      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        ปรับได้เฉพาะเจ้าของร้าน — ค่าที่ไม่ได้ปรับ = ใช้ค่า default กลางของระบบ ช่องที่ล็อกไว้
        (🔒) ปรับไม่ได้ไม่ว่ากรณีใด เป็นกฎความปลอดภัยขั้นต่ำสุดที่บังคับใช้ทุกร้านเหมือนกันหมด
      </div>

      {error && <div className="msg error" style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className="empty">กำลังโหลด...</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-strong)" }}>
                <th style={{ padding: "8px 6px" }}>Field group</th>
                {ROLES.map((role) => (
                  <th key={role} style={{ padding: "8px 6px", textAlign: "center" }}>
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FIELD_GROUPS.map((fieldGroup) => (
                <tr key={fieldGroup} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "8px 6px" }}>{FIELD_GROUP_LABELS[fieldGroup]}</td>
                  {ROLES.map((role) => {
                    const locked = isFloorLocked(role, fieldGroup);
                    const checked = canSeeField(role, fieldGroup, overrides);
                    const key = `${role}:${fieldGroup}`;
                    return (
                      <td key={role} style={{ padding: "8px 6px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          data-testid={`fv-${role}-${fieldGroup}`}
                          checked={checked}
                          disabled={locked || savingKey === key}
                          title={locked ? "ล็อกไว้ตามกฎความปลอดภัยขั้นต่ำ — ปรับไม่ได้" : undefined}
                          onChange={(e) => handleToggle(role, fieldGroup, e.target.checked)}
                        />
                        {locked && (
                          <span style={{ marginLeft: 4, fontSize: 11, color: "var(--text-muted)" }}>🔒</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function FieldVisibilitySettingsPage() {
  return (
    <RequireAuth allowedRoles={["owner"]}>
      <FieldVisibilitySettingsContent />
    </RequireAuth>
  );
}
