/**
 * Accounting Module — config กลาง
 * ------------------------------------------------------------
 * การ์ด "Accounting Module — ผังบัญชี + journal entries + intercompany" (scoped-down first pass,
 * 24 ก.ค. 2026)
 *
 * VAT_RATE: อัตราภาษีมูลค่าเพิ่มมาตรฐานประเทศไทย 7% — ค่าเดียวกับที่ app/jobs/[id]/page.js ใช้อยู่
 * แล้ว (vatAmount = subtotal * 0.07) แต่ก่อนหน้านี้ hardcode กระจายอยู่ในไฟล์นั้นไฟล์เดียว ไม่มี
 * config constant กลาง — ไฟล์นี้เป็น named constant กลางตัวแรกของค่านี้ในระบบ
 *
 * ⚠️ ค่านี้ "ซ้ำ" อยู่ใน db/accounting_module_migration.sql (fn_vat_rate() SQL function) ด้วย
 * เพราะ trigger ฝั่ง DB (fn_post_sale_journal_entry_body) ต้องคำนวณ VAT ตอน insert/update
 * part_sales โดยไม่พึ่งพา round-trip เรียก JS ฝั่งแอป — แก้ค่านี้ต้องไปแก้ SQL function ให้ตรงกัน
 * ด้วยเสมอ (pattern เดียวกับ stockValueCap ที่ config/fieldVisibility.js อธิบายไว้)
 *
 * ACCOUNTING_MODULE_FEATURE_KEY: ผูกกับ config/subscriptionTiers.js SUBSCRIPTION_TIERS[tier].features
 * — tier ที่ไม่มี key นี้ (หรือไม่มี "all") = ไม่มีสิทธิ์เปิดโมดูลบัญชี (ปัจจุบัน: pro, enterprise)
 */

export const VAT_RATE = 0.07;

export const ACCOUNTING_MODULE_FEATURE_KEY = "accounting_module";

export function hasAccountingModuleFeature(tierConfig) {
  const features = tierConfig?.features || [];
  return features.includes(ACCOUNTING_MODULE_FEATURE_KEY) || features.includes("all");
}

// ผังบัญชีมาตรฐาน (7 หลัก) — mirror ของ fn_seed_default_chart_of_accounts() ใน
// db/accounting_module_migration.sql เอาไว้ใช้แสดงผล client-side (เช่น label ประกอบ dropdown ใน
// อนาคต) — SQL function คือ source of truth จริงตอน seed ข้อมูล ไฟล์นี้เป็นแค่ label reference
export const DEFAULT_CHART_OF_ACCOUNTS = [
  { code: "1010100", name: "เงินสด", type: "asset" },
  { code: "1010200", name: "เงินฝากธนาคาร", type: "asset" },
  { code: "1020100", name: "ลูกหนี้การค้า", type: "asset" },
  { code: "1030100", name: "สินค้าคงเหลือ-อะไหล่", type: "asset" },
  { code: "2010100", name: "เจ้าหนี้ผู้ฝากขาย", type: "liability" },
  { code: "2050100", name: "ภาษีขายรอนำส่ง (VAT Output)", type: "liability" },
  { code: "4060100", name: "รายได้จากการขายอะไหล่", type: "revenue" },
  { code: "4070100", name: "รายได้ค่าคอมมิชชั่น (ฝากขาย)", type: "revenue" },
  { code: "5080100", name: "ต้นทุนขายอะไหล่ (COGS)", type: "expense" },
];
