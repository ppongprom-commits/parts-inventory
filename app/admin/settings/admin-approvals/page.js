"use client";

import { useEffect, useMemo, useState } from "react";
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
//
// การ์ด "ขายอะไหล่ที่ยังไม่ตีราคา... (Approval Flow แบบ configurable)" (24 ก.ค. 2026) เพิ่ม
// action_type ใหม่ 'sell_unpriced_part' เข้าตารางเดียวกันนี้ (ดู config/adminApprovalDefaults.js +
// db/unpriced_part_sale_approval_migration.sql) — และต้องการ "ผู้อนุมัติ configurable ทั้ง role
// หรือ user เฉพาะเจาะจง" ซึ่งคอลัมน์ approver_user_id มีอยู่แล้วในตารางแต่หน้านี้ (เดิม) ยังไม่มี UI
// ให้เลือกโหมด user เฉพาะ (มีแต่ approver_role) — เพิ่มตัวเลือกโหมดด้านล่างนี้ให้ "ทุก" action_type
// เลย (ไม่ใช่แค่ sell_unpriced_part) เพราะเป็น UI ใช้ร่วมกันตัวเดียว ไม่คุ้มที่จะแยกพิเศษเฉพาะแถวเดียว
const ACTION_TYPES = Object.keys(DEFAULT_ADMIN_APPROVAL_CONFIG);
const APPROVER_ROLE_OPTIONS = ["owner", "manager", "supervisor", "admin"];

function AdminApprovalsPageContent() {
  const { currentShopId, user } = useAuth();
  const [overrides, setOverrides] = useState([]);
  const [members, setMembers] = useState([]); // shop_members ที่เลือกเป็นผู้อนุมัติเฉพาะคนได้
  const [loading, setLoading] = useState(true);
  const [savingType, setSavingType] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!currentShopId) return;
    (async () => {
      setLoading(true);
      const [{ data, error: fetchError }, { data: memberRows, error: memberError }] = await Promise.all([
        supabase
          .from("admin_action_approval_config")
          .select("action_type, requires_approval, approver_role, approver_user_id")
          .eq("shop_id", currentShopId),
        supabase
          .from("shop_members")
          .select("user_id, contact_name, login_username, role")
          .eq("shop_id", currentShopId)
          .eq("status", "active")
          .in("role", ["owner", "manager", "supervisor", "admin"]),
      ]);
      if (fetchError) setError(fetchError.message);
      if (memberError) setError((prev) => prev || memberError.message);
      setOverrides(data || []);
      setMembers(memberRows || []);
      setLoading(false);
    })();
  }, [currentShopId]);

  const memberLabel = useMemo(() => {
    const map = {};
    members.forEach((m) => {
      map[m.user_id] = `${m.contact_name || m.login_username || m.user_id} (${m.role})`;
    });
    return map;
  }, [members]);

  async function handleChange(actionType, field, value) {
    setSavingType(actionType);
    setError(null);

    const current = getApprovalRequirement(actionType, overrides);
    const next = {
      requires_approval: field === "requires_approval" ? value : current.requiresApproval,
      approver_role: field === "approver_role" ? value || null : current.approverRole,
      approver_user_id: field === "approver_user_id" ? value || null : current.approverUserId,
    };
    // เลือกโหมดใดโหมดหนึ่งเท่านั้น (role หรือ user เฉพาะ) — สลับโหมดแล้วเคลียร์อีกฝั่งทิ้ง
    if (field === "approver_mode") {
      if (value === "role") next.approver_user_id = null;
      if (value === "user") next.approver_role = null;
    } else if (field === "approver_role" && value) {
      next.approver_user_id = null;
    } else if (field === "approver_user_id" && value) {
      next.approver_role = null;
    }

    const { data, error: upsertError } = await supabase
      .from("admin_action_approval_config")
      .upsert(
        {
          shop_id: currentShopId,
          action_type: actionType,
          requires_approval: next.requires_approval,
          approver_role: next.approver_role,
          approver_user_id: next.approver_user_id,
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
        <h1>⚙️ ตั้งค่าการขออนุมัติ</h1>
        <Link href="/admin" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>

      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        กำหนดว่างานประเภทไหนต้องรอผู้จัดการ/เจ้าของอนุมัติก่อนถึงจะมีผลจริง (หรือ — สำหรับ
        &quot;ขายอะไหล่ที่ยังไม่ตีราคา&quot; — ก่อนจะนับเข้ารายงาน) — เลือกผู้อนุมัติได้ทั้งแบบ
        ระบุ role (เพื่อความยืดหยุ่น ถ้าคนนั้นลาออก/ไม่อยู่ ร้านจะไม่ติดขัด) หรือระบุ user
        เฉพาะเจาะจง — เจ้าของกดอนุมัติได้เสมอไม่ว่าจะตั้งผู้อนุมัติเป็นใครไว้ก็ตาม
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
              <th style={{ padding: "8px 6px" }}>โหมดผู้อนุมัติ</th>
              <th style={{ padding: "8px 6px" }}>ผู้อนุมัติ</th>
            </tr>
          </thead>
          <tbody>
            {ACTION_TYPES.map((actionType) => {
              const { requiresApproval, approverRole, approverUserId } = getApprovalRequirement(
                actionType,
                overrides
              );
              const mode = approverUserId ? "user" : "role";
              return (
                <tr key={actionType} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "8px 6px" }}>{ACTION_TYPE_LABELS[actionType] || actionType}</td>
                  <td style={{ padding: "8px 6px" }}>
                    <input
                      type="checkbox"
                      data-testid={`requires-approval-${actionType}`}
                      checked={requiresApproval}
                      disabled={savingType === actionType}
                      onChange={(e) => handleChange(actionType, "requires_approval", e.target.checked)}
                    />
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    <select
                      data-testid={`approver-mode-${actionType}`}
                      value={mode}
                      disabled={savingType === actionType || !requiresApproval}
                      onChange={(e) => handleChange(actionType, "approver_mode", e.target.value)}
                    >
                      <option value="role">ตาม role</option>
                      <option value="user">ระบุคนเฉพาะเจาะจง</option>
                    </select>
                  </td>
                  <td style={{ padding: "8px 6px" }}>
                    {mode === "user" ? (
                      <select
                        data-testid={`approver-user-${actionType}`}
                        value={approverUserId || ""}
                        disabled={savingType === actionType || !requiresApproval}
                        onChange={(e) => handleChange(actionType, "approver_user_id", e.target.value)}
                      >
                        <option value="">— ไม่ระบุ (เจ้าของอนุมัติได้เสมอ) —</option>
                        {members.map((m) => (
                          <option key={m.user_id} value={m.user_id}>
                            {memberLabel[m.user_id]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        data-testid={`approver-role-${actionType}`}
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
                    )}
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
