/**
 * Field Visibility Whitelist กลาง (role × field group)
 * ------------------------------------------------------------
 * การ์ด "Field Visibility Whitelist กลาง (role × field group) — ตัดสินใจครั้งเดียว ใช้ 4 การ์ด"
 * (Export CSV, Custom Report Builder, API พื้นฐาน, Field Scanner Role)
 *
 * กติกาบังคับใช้ (จากการ์ด):
 * 1. API/server เป็น source of truth — field ต้องห้ามต้องไม่ถูกส่งออกจาก server เลย ไม่ใช่ส่งมา
 *    แล้วซ่อนที่ client (บทเรียนตรงจาก TC-205b)
 * 2. ทุกช่องทาง (UI, CSV export, Report, API) อ้าง matrix เดียวกัน — ห้ามกำหนดแยกรายฟีเจอร์
 * 3. Matrix นี้เป็น default เท่านั้น — Owner ปรับ override ต่อร้านได้ (เก็บใน
 *    shop_field_visibility_overrides, ดู db/field_visibility_overrides_migration.sql)
 * 4. Floor rules — ห้าม configure สูงกว่านี้ไม่ว่าเจ้าของร้านจะตั้งยังไง (ดู FLOOR_RULES ด้านล่าง)
 *
 * ขอบเขตที่ implement จริงคืนนี้: matrix + override infra ครบ, wired เข้า Export CSV (parts)
 * เท่านั้น เพราะเป็นการ์ดเดียวใน 4 การ์ดที่มีโค้ดจริงอยู่แล้วให้ต่อ — Custom Report Builder และ
 * API พื้นฐาน ยังไม่มีโค้ดเลย (การ์ดยัง Not started ทั้งคู่) ไม่มีอะไรให้ wire; Field Scanner Role
 * ที่ซ่อนราคาจาก technician/assistant ใช้ config/rolePermissions.js (view_price) อยู่แล้วซึ่งตรง
 * กับ matrix นี้อยู่แล้วพอดี (ไม่ได้ migrate มาใช้ config นี้แทนคืนนี้ เพื่อจำกัด blast radius กับ
 * โค้ดที่มี regression test ครอบอยู่เยอะ — ทั้งสองจุดควรให้ผลตรงกันเพราะ matrix เดียวกัน)
 */

// field group key -> ป้ายอธิบาย (ไว้ใช้ตอนสร้างหน้า /admin/settings สำหรับ override ในอนาคต)
export const FIELD_GROUP_LABELS = {
  sale_price: "ราคาขาย",
  cost_price: "ราคาทุน / allocated_cost",
  customer_name: "ชื่อลูกค้า",
  customer_phone: "เบอร์โทรลูกค้า",
  license_plate: "ทะเบียนรถ",
  sales_reports: "ยอดขาย/กำไร/รายงาน",
  export_csv_parts: "Export CSV — parts",
  export_csv_jobs: "Export CSV — jobs",
  manage_api_keys: "จัดการ API key",
};

// ✅ ตัดสินใจแล้วในการ์ด (19 ก.ค. 2026) — default matrix ต่อ role
// true/false ตรงกับตาราง "default matrix" ในการ์ด — customer_name/customer_phone สำหรับ
// technician/assistant ผูกกับ visibility group เดิม (จัดการที่อื่น ไม่ใช่ field visibility นี้)
// จึงไม่ระบุ default ตายตัวที่นี่ (ปล่อย undefined = "ดูที่ระบบ visibility group แทน")
export const DEFAULT_FIELD_VISIBILITY = {
  owner: {
    sale_price: true,
    cost_price: true,
    customer_name: true,
    customer_phone: true,
    license_plate: true,
    sales_reports: true,
    export_csv_parts: true,
    export_csv_jobs: true,
    manage_api_keys: true,
  },
  manager: {
    sale_price: true,
    cost_price: true,
    customer_name: true,
    customer_phone: true,
    license_plate: true,
    sales_reports: true,
    export_csv_parts: true,
    export_csv_jobs: true,
    manage_api_keys: true,
  },
  supervisor: {
    sale_price: true,
    cost_price: true, // default — ปรับ override ได้
    customer_name: true,
    customer_phone: true,
    license_plate: true,
    sales_reports: true, // default — ปรับ override ได้
    export_csv_parts: true, // ตัดสินใจแล้ว
    export_csv_jobs: true, // default — ปรับ override ได้
    manage_api_keys: false, // 🔒 floor
  },
  technician: {
    sale_price: false,
    cost_price: false,
    customer_name: true, // ✅ ตัดสินใจแล้ว (ผูกกับ visibility group ด้วย แต่ field visibility เองอนุญาต)
    customer_phone: true, // ✅ ตัดสินใจแล้ว
    license_plate: true,
    sales_reports: false,
    export_csv_parts: false,
    export_csv_jobs: false,
    manage_api_keys: false, // 🔒 floor
  },
  assistant: {
    sale_price: false,
    cost_price: false,
    customer_name: true, // ✅ ตัดสินใจแล้ว
    customer_phone: true, // ✅ ตัดสินใจแล้ว
    license_plate: true,
    sales_reports: false,
    export_csv_parts: false,
    export_csv_jobs: false,
    manage_api_keys: false, // 🔒 floor
  },
  field_scanner: {
    sale_price: false,
    cost_price: false,
    customer_name: false, // 🔒 floor
    customer_phone: false, // 🔒 floor
    license_plate: true, // ✅ ตัดสินใจแล้ว (ไม่นับเป็น PII ลูกค้า)
    sales_reports: false,
    export_csv_parts: false,
    export_csv_jobs: false,
    manage_api_keys: false, // 🔒 floor
  },
  // การ์ด "Admin Role (7th role)" (23 ก.ค. 2026 — ตัดสินใจแล้ว): ค่าเดียวกับ supervisor ทุกแถว
  // ยกเว้น manage_api_keys ที่สงวนไว้ owner/manager เท่านั้น (floor rule เดิม ไม่เปลี่ยนตาม tier)
  admin: {
    sale_price: true,
    cost_price: true,
    customer_name: true,
    customer_phone: true,
    license_plate: true,
    sales_reports: true,
    export_csv_parts: true,
    export_csv_jobs: true,
    manage_api_keys: false, // 🔒 floor
  },
};

// ❗ Floor rules — ห้าม override เป็น true ไม่ว่าเจ้าของร้านจะตั้งค่ายังไง (เหตุผลด้านความปลอดภัย,
// ตัดสินใจแล้วในการ์ด) รายการนี้คือ [role, field_group] ที่ล็อกไว้ที่ false เสมอ
export const FLOOR_RULES = [
  ["field_scanner", "customer_name"],
  ["field_scanner", "customer_phone"],
  ["supervisor", "manage_api_keys"],
  ["technician", "manage_api_keys"],
  ["assistant", "manage_api_keys"],
  ["field_scanner", "manage_api_keys"],
  ["admin", "manage_api_keys"],
];

function isFloorLocked(role, fieldGroup) {
  return FLOOR_RULES.some(([r, f]) => r === role && f === fieldGroup);
}

/**
 * เช็คว่า role นี้เห็น field group นี้ได้ไหม
 * @param {string} role
 * @param {string} fieldGroup - key ใน FIELD_GROUP_LABELS
 * @param {Array<{role: string, field_group: string, allowed: boolean}>} overrides - จาก
 *   shop_field_visibility_overrides ของร้านนั้น (ถ้ามี) — ไม่ส่งมา = ใช้ default ล้วนๆ
 * @returns {boolean}
 */
export function canSeeField(role, fieldGroup, overrides = []) {
  // floor เหนือทุกอย่างเสมอ ไม่ว่า override จะตั้งไว้ยังไง
  if (isFloorLocked(role, fieldGroup)) return false;

  const override = overrides.find((o) => o.role === role && o.field_group === fieldGroup);
  if (override) return !!override.allowed;

  return !!DEFAULT_FIELD_VISIBILITY[role]?.[fieldGroup];
}
