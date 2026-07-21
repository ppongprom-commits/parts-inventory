// ------------------------------------------------------------
// ระบบ login แบบ username + PIN สำหรับพนักงาน (หัวหน้างาน/ช่าง/ผู้ช่วยช่าง)
// แทนที่จะให้พนักงานสมัคร/ยืนยันอีเมลเอง เจ้าของ/ผู้จัดการเป็นคนสร้าง
// บัญชีให้โดยตรงผ่าน Supabase Admin API (email_confirm: true) โดยใช้
// อีเมล "ปลอม" ที่สร้างจาก username แบบ deterministic เบื้องหลัง
// พนักงานไม่ต้องเห็น ไม่ต้องรู้จักอีเมลนี้เลย ใช้แค่ username+PIN login
// ------------------------------------------------------------

// เปลี่ยน domain นี้เป็นโดเมนของจริงที่คุณคุมได้ก็ได้ (ไม่จำเป็นต้อง
// รับอีเมลจริง แค่ต้องมีรูปแบบอีเมลที่ถูกต้องให้ Supabase ยอมรับ)
export const STAFF_EMAIL_DOMAIN = "staff.internal.partsinventory.app";

export const STAFF_ROLES = ["supervisor", "technician", "assistant", "field_scanner"];
export const EMAIL_INVITE_ROLES = ["manager"];

// username: a-z, 0-9, จุด/ขีดล่าง ได้ ยาว 3-20 ตัว (เก็บเป็นตัวพิมพ์เล็กเสมอ)
const USERNAME_PATTERN = /^[a-z0-9._]{3,20}$/;
// PIN/รหัสผ่านพนักงาน: ตัวอักษร+ตัวเลขผสมได้ตามสะดวก ยาว 4-20 ตัว
// (แนะนำ default เป็นตัวเลข 6 หลักเพื่อให้จำ/พิมพ์ง่ายบนมือถือ แต่ไม่บังคับ
//  ว่าต้องเป็นตัวเลขล้วน — ใครอยากใส่ตัวอักษรปนก็ได้เพื่อความสะดวก)
const PIN_PATTERN = /^[A-Za-z0-9]{4,20}$/;

export function normalizeUsername(raw) {
  return (raw || "").trim().toLowerCase();
}

export function isValidUsername(raw) {
  return USERNAME_PATTERN.test(normalizeUsername(raw));
}

export function isValidPin(raw) {
  return PIN_PATTERN.test((raw || "").trim());
}

export function usernameToStaffEmail(username) {
  return `${normalizeUsername(username)}@${STAFF_EMAIL_DOMAIN}`;
}
