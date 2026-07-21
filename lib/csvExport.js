// Export CSV (Starter+) — การ์ด "Export CSV (Starter+)"
//
// ตัดสินใจแล้ว (การ์ด): UTF-8 with BOM (กันตัวอักษรไทยเพี้ยนตอนเปิดด้วย Excel), escape ตาม
// RFC 4180, ค่า null/undefined -> cell ว่าง (ไม่ใช่ข้อความ "null")

const BOM = "﻿";

// escape ค่าเดียวตาม RFC 4180: ถ้ามี comma, double quote, หรือ newline (\n หรือ \r) ต้องครอบด้วย
// double quote และ double quote ที่อยู่ข้างในต้อง escape เป็น double quote คู่ ("")
function escapeCsvValue(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * แปลง array ของ object เป็น CSV string (พร้อม UTF-8 BOM นำหน้า)
 * @param {Array<object>} rows
 * @param {Array<{key: string, header: string}>} columns - ลำดับคอลัมน์ + หัวตาราง
 */
export function toCsv(rows, columns) {
  const headerLine = columns.map((c) => escapeCsvValue(c.header)).join(",");
  const dataLines = rows.map((row) =>
    columns.map((c) => escapeCsvValue(row[c.key])).join(",")
  );
  return BOM + [headerLine, ...dataLines].join("\r\n");
}
