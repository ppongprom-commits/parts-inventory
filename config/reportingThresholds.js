/**
 * Reporting thresholds — tunable business constants for reports (Stock Summary Report, etc.)
 * ------------------------------------------------------------
 * แยกจาก config/subscriptionTiers.js เพราะค่าพวกนี้ไม่ผูกกับ tier ใดๆ (ใช้เหมือนกันทุก tier ที่
 * เข้าถึงรายงาน) — ตาม convention เดียวกับ GLOBAL_SESSION_CONFIG ใน subscriptionTiers.js
 * (ค่าคงที่ทางธุรกิจที่ไม่อยากกระจายไปเขียนซ้ำหลายจุดในโค้ด)
 */

export const REPORTING_THRESHOLDS = {
  // ค่าเริ่มต้นชั่วคราว 90 วัน — ยังไม่มีเลขที่ตัดสินใจจริงจากคุณอั้ม ปรับได้ทีหลังถ้าต้องการ
  // (อ้างอิง: Notion card รายงานสรุปสต็อก + Salvage cost allocation ทั้งคู่ยังไม่เคาะเลขนี้)
  // ใช้เป็นเกณฑ์ "ค้างสต็อกนาน" ในรายงานสรุปสต็อก ข้อ 4 — นับจาก parts.created_at ที่ยังไม่มี
  // part_sales เลยสักครั้ง เกินจำนวนวันนี้ = ค้าง
  staleStockDays: 90,

  // ค่าเริ่มต้นชั่วคราว 30 วัน — การ์ดเองยังเป็นคำถามเปิด ("all-time / 30 วัน / เลือกได้?")
  // เลือก 30 วันเพราะตรงกับ use case "ตอนนี้อะไรขายดี/ขายช้า" มากกว่า all-time — ทำเป็น query
  // param (?days=) ที่ API รับ override ได้เสมอ ส่วน UI hardcode 30 เป็นค่าเริ่มต้นเฉยๆ ไม่ผูกมัด
  // ไว้ตายตัว เผื่อคุณอั้มอยากทำ "เลือกได้" ในอนาคตไม่ต้องแก้ backend เลย
  topSellersDefaultWindowDays: 30,
};
