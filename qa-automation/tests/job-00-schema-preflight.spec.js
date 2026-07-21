import { test, expect } from "@playwright/test";
import { adminClient } from "../fixtures/db-client.js";

// ------------------------------------------------------------
// JOB-802: Pre-flight schema check
//
// db/job_multi_group_migration.sql มีคอมเมนต์บอกว่า "รันหลัง
// visibility_groups_and_workflow_schema.sql" และ README.md ของโปรเจกต์เอง (หัวข้อ
// "Phase E") ก็บอกให้รันไฟล์ชื่อนี้ — แต่ตรวจสอบทั้ง repo แล้วไม่พบไฟล์นี้อยู่จริงเลย
// (น่าจะถูก apply ตรงเข้า staging DB มาก่อน แล้วไฟล์ .sql ไม่เคย commit เข้า git)
//
// เทสต์นี้เช็คว่าตารางที่ /jobs/new และ /admin/groups พึ่งพาอยู่จริงมีอยู่ใน environment
// ที่กำลังทดสอบหรือเปล่า ก่อนที่จะรัน test ไฟล์อื่นๆ ในกลุ่ม job-creation-*
// ถ้า fail ที่นี่ ให้ตรวจสอบ schema จริงบน staging ก่อน ไม่ต้องไปนั่งไล่ debug test อื่นทีละตัว
// ------------------------------------------------------------

const REQUIRED_TABLES = [
  "jobs",
  "customers",
  "job_visibility_groups",
  "visibility_groups",
  "visibility_group_members",
  "job_workflow_steps",
];

test.describe("JOB-802 — Schema pre-flight (ก่อนรัน job-creation-*.spec.js ทั้งหมด)", () => {
  for (const tableName of REQUIRED_TABLES) {
    test(`ตาราง "${tableName}" ต้อง query ได้ (มีอยู่จริงใน environment นี้)`, async () => {
      const { error } = await adminClient().from(tableName).select("*").limit(1);

      if (error) {
        throw new Error(
          `ตาราง "${tableName}" query ไม่ได้: ${error.message}\n` +
            `หมายเหตุ: db/visibility_groups_and_workflow_schema.sql ที่ README.md ของโปรเจกต์อ้างถึง ` +
            `ไม่มีอยู่จริงใน repo (git) — ถ้า error นี้ขึ้น แปลว่า environment ที่ทดสอบอยู่ (${process.env.SUPABASE_URL}) ` +
            `ยังไม่เคย apply migration นี้จริง ต้องขอไฟล์ schema จากทีม dev หรือ pg_dump จาก staging ที่ทำงานได้อยู่แล้วมา apply ก่อน`
        );
      }
      expect(error).toBeNull();
    });
  }
});
