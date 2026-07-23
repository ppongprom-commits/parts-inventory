"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../../lib/supabaseClient";
import { useAuth } from "../../../../lib/AuthProvider";
import RequireAuth from "../../../../components/RequireAuth";
import {
  ACTION_TYPE_LABELS,
  DEFAULT_ADMIN_APPROVAL_CONFIG,
  getApprovalRequirement,
} from "../../../../config/adminApprovalDefaults";

// การ์ด "Admin Role (7th role) — Maker-Checker Approval Config" (23 ก.ค. 2026)
// หน้านี้ = ตั้งค่าว่า action_type ไหนต้องขออนุมัติก่อนทำจริง + ใครเป็นผู้อนุมัติ
// Simplify principle: ไม่มีแถว override = ใช้ default table ตรงๆ (getApprovalRequirement) —
// การกดบันทึกที่นี่แค่สร้าง/แก้ override เฉพาะรายการที่ต่างจาก default เท่านั้น
const ACTION_TYPES = Object.keys(DEFAULT_ADMIN_APPROVAL_CONFIG);
const APPROVER_ROLE_OPTIONS = ["owner", "manager", "supervisor", "admin"];

function AdminApprovalsPageContent() {
  const { currentShopId, user } = useAuth();
  const [overrides, setOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentShopId) return;
    (async () => {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from("admin_action_approval_config")
        .select("action_type, requires_approval, approver_role, approver_user_id")
        .eq("shop_id", currentShopId);
      if (fetchError) setError(fetchError.message);
      setOverrides(data || []);
      setLoading(false);
    })();
  }, [currentShopId]);

  async function handleChange(actionType, field, value) {
    setSavingType(actionType);
    setError(null);

    const current = getApprovalRequirement(actionType, overrides);
    const next = {
      requires_approval: field === "requires_approval" ? value : current.requiresApproval,
      approver_role: field === "approver_role" ? value || null : current.approverRole,
    };

    const { data, error: upsertError } = await supabase
      .from("admin_action_approval_config")
      .upsert(
        {
          shop_id: currentShopId,
          action_type: actionType,
          requires_approval: next.requires_approval,
          approver_role: next.approver_role,
          approver_user_id: null,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "shop_id,action_type" }
      )
      .select("action_type, requires_approval, approver_role, approver_user_id")
      .single();

    if (upsertError) {
      setError(upsertError.message);
    } else {
      setOverrides((prev) => [...prev.filter((o) => o.action_type !== actionType), data]);
    }
    setSavingType(null);
  }

  return (
    <div className="container">
      <div className="header">
        <h1>⚙️ ตั้งค่าการขออนุมัติ (Admin)</h1>
        <Link href="/admin" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>

      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        กำหนดว่างานประเภทไหนที่ Admin ทำแล้วต้องรอผู้จัดการ/เจ้าของอนุมัติก่อนถึงจะมีผลจริง —
        ค่าเริ่มต้นด้านล่างตั้งไว้ให้แล้วตามความเสี่ยงของแต่ละงาน ปรับได้ตามต้องการ
        เจ้าของกดอนุมัติได้เสมอไม่ว่าจะตั้งผู้อนุมัติเป็นใครไว้ก็ตาม
      </div>

      {error && <div className="msg error" style={{ marginBottom: 12 }}>{error}</div>}

      {loading ? (
        <div className="empty">กำลังโหลด...</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border-strong)" }}>
              <th style={{ padding: "8px 6px" }}>งาน</th>
              <th style={{ padding: "8px 6px" }}>ต้องขออนุมัติ</th>
              <th style={{ padding: "8px 6px" }}>ผู้อนุมัติ</th>
            </tr>
          </thead>
          <tbody>
            {ACTION_TYPES.map((actionType) => {
              const { requiresApproval, approverRole } = getApprovalRequirement(actionType, overrides);
              return (
                <tr key={actionType} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "8px 6px" }}>{ACTION_TYPE_LABELS[actionType] || actionType}</td>
                  <td style={{ padding: "8px 6px" }}>
                    <input
                      type="checkbox"
                      checked={requiresApproval}
                      disabled={savingType === actionType}
                      onChange={(e) => handleChange(actionType, "requires_approval", e.target.checked)}
                    />
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <select
                      value={approverRole || ""}
                      disabled={savingType === actionType || !requiresApproval}
                      onChange={(e) => handleChange(actionType, "approver_role", e.target.value)}
                    >
                      <option value="">— ไม่ระบุ (เจ้าของอนุมัติได้เสมอ) —</option>
                      {APPROVER_ROLE_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function AdminApprovalsPage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager"]}>
      <AdminApprovalsPageContent />
    </RequireAuth>
  );
}
