// การ์ด "Import ข้อมูลลูกค้าเดิม — migrate จากระบบ/ไฟล์เก่าเข้า Parts Inventory"
//
// RFC 4180 CSV parser แบบ minimal (ไม่มี parser สำเร็จรูปในโปรเจกต์นี้มาก่อน — lib/csvExport.js
// มีแต่ฝั่ง encode) รองรับ: field ที่ครอบด้วย double quote (มี comma/newline/quote ข้างในได้),
// quote คู่ ("") หมายถึง quote ตัวเดียวในข้อความ, ตัดบรรทัดว่างท้ายไฟล์ทิ้ง

/** parse ข้อความ CSV ทั้งก้อน -> array ของ array ของ string (แต่ละแถว) */
export function parseCsvRows(text) {
  // ตัด BOM ถ้ามี (ไฟล์ export จากระบบนี้เองก็มี BOM — กันตัวอักษรไทยเพี้ยน)
  const clean = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && next === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // แถวสุดท้ายถ้ายังมีอะไรค้างอยู่ (ไฟล์ไม่ได้จบด้วย newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // ตัดแถวว่างเปล่าล้วนๆ ทิ้ง (บรรทัดว่างท้ายไฟล์)
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** parse CSV -> { headers: string[], rows: object[] } โดยแถวแรกเป็น header เสมอ */
export function parseCsvWithHeader(text) {
  const rows = parseCsvRows(text);
  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  const dataRows = rows.slice(1).map((r) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (r[i] ?? "").trim();
    });
    return obj;
  });
  return { headers, rows: dataRows };
}

/** เบอร์โทรไทยแบบหลวมๆ — ตัวเลข 9-10 หลัก เว้นวรรค/ขีดได้ (ไม่ตัดสิน format เข้มงวด
 *  เพราะไฟล์เก่าหลากหลายที่มา — แค่กันขยะชัดๆ เช่น ตัวอักษรปนตัวเลขทั้งดุ้น) */
export function isPlausiblePhone(raw) {
  if (!raw) return false;
  const digits = raw.replace(/[\s-]/g, "");
  return /^0\d{8,9}$/.test(digits);
}
