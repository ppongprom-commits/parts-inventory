/**
 * Admin Action Approval — default config (maker-checker)
 * ------------------------------------------------------------
 * การ์ด "Admin Role (7th role) — Maker-Checker Approval Config" (23 ก.ค. 2026 — ตัดสินใจแล้ว)
 *
 * Simplify principle (สำคัญที่สุด): ร้านที่ไม่มีแถวใน admin_action_approval_config เลย ต้อง
 * ทำงานเหมือนใช้ตาราง default นี้ตรงๆ — ไม่บังคับตั้งค่าก่อนใช้ ไม่มี DB row ที่ต้องมีเพื่อให้
 * ระบบทำงานถูกต้อง getApprovalRequirement() คือจุดเดียวที่อ่านทั้ง override และ default นี้
 */

export const ACTION_TYPE_LABELS = {
  edit_part_cost: "แก้ไขราคาทุนอะไหล่",
  edit_part_general: "แก้ไขข้อมูลอะไหล่ทั่วไป",
  edit_part_price: "แก้ไขราคาขายอะไหล่",
  reprint_document: "พิมพ์เอกสารซ้ำ",
  void_document: "ยกเลิกเอกสาร",
  issue_credit_note: "ออกใบลดหนี้",
  import_customers: "นำเข้าข้อมูลลูกค้า",
  edit_customer_contact: "แก้ไขข้อมูลติดต่อลูกค้า",
  edit_customer_credit_terms: "แก้ไขเงื่อนไขเครดิตลูกค้า",
  review_duplicate_photo: "ตรวจสอบรูปซ้ำ (ยกเลิกแจ้งเตือน)",
  confirm_duplicate_delete: "ยืนยันลบของซ้ำ",
  resolve_discrepancy_writeoff: "ปิดรายการผลต่างด้วยการตัดบัญชี",
  view_reports: "ดูรายงาน",
  export_csv: "Export CSV",
};

// ตารางค่าเริ่มต้น (ล็อกแล้ว ไม่ต้อง review เพิ่ม — การ์ด 23 ก.ค. 2026)
export const DEFAULT_ADMIN_APPROVAL_CONFIG = {
  edit_part_cost: { requires_approval: true, approver_role: "manager" },
  edit_part_general: { requires_approval: false, approver_role: null },
  edit_part_price: { requires_approval: false, approver_role: null },
  reprint_document: { requires_approval: false, approver_role: null },
  void_document: { requires_approval: true, approver_role: "manager" },
  issue_credit_note: { requires_approval: true, approver_role: "manager" },
  import_customers: { requires_approval: true, approver_role: "manager" },
  edit_customer_contact: { requires_approval: false, approver_role: null },
  edit_customer_credit_terms: { requires_approval: true, approver_role: "manager" },
  review_duplicate_photo: { requires_approval: false, approver_role: null },
  confirm_duplicate_delete: { requires_approval: true, approver_role: "manager" },
  resolve_discrepancy_writeoff: { requires_approval: true, approver_role: "manager" },
  view_reports: { requires_approval: false, approver_role: null },
  export_csv: { requires_approval: false, approver_role: null },
};

/**
 * @param {string} actionType
 * @param {Array<{action_type: string, requires_approval: boolean, approver_role: string|null, approver_user_id: string|null}>} overrides
 *   แถวจาก admin_action_approval_config ของร้านนั้น (ถ้ามี) — ไม่ส่งมา/ไม่มีแถว = ใช้ default ล้วนๆ
 * @returns {{ requiresApproval: boolean, approverRole: string|null, approverUserId: string|null }}
 */
export function getApprovalRequirement(actionType, overrides = []) {
  const override = overrides.find((o) => o.action_type === actionType);
  if (override) {
    return {
      requiresApproval: !!override.requires_approval,
      approverRole: override.approver_role ?? null,
      approverUserId: override.approver_user_id ?? null,
    };
  }

  const def = DEFAULT_ADMIN_APPROVAL_CONFIG[actionType];
  return {
    requiresApproval: !!def?.requires_approval,
    approverRole: def?.approver_role ?? null,
    approverUserId: null,
  };
}
