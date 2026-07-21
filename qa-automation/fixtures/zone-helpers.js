// ------------------------------------------------------------
// Helper สำหรับ components/ZoneAutocomplete.js — custom search-select ไม่ใช่ <select> ธรรมดา
// ใช้ร่วมกันในหลาย spec (move-parts, move-part, add/edit ที่มีช่องเลือกโซน)
// ------------------------------------------------------------
import { expect } from "@playwright/test";

/**
 * พิมพ์ค้นหาแล้วคลิกเลือกโซนจาก dropdown ของ ZoneAutocomplete — breadcrumbQuery ควรเป็น
 * ข้อความที่ match ผลลัพธ์แค่รายการเดียว (เช่น code ของโซนที่เพิ่งสร้างสำหรับเทสต์นี้โดยเฉพาะ
 * ตั้งชื่อให้ไม่ซ้ำใครด้วย timestamp) ไม่งั้น getByText(exact:true) จะหาไม่เจอ/กำกวม
 */
export async function selectZoneAutocomplete(page, breadcrumbQuery, exactBreadcrumbText) {
  const input = page.getByPlaceholder(/พิมพ์ค้นหาโซน/);
  await input.fill(breadcrumbQuery);
  await page.getByText(exactBreadcrumbText, { exact: true }).click();
}
