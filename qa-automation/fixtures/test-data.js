// โหลด credential ของ test account ทั้งหมดจาก .env
// ตรงกับ Test Data Matrix ในไฟล์ test_cases_login_rbac_parts_inventory.xlsx
import "dotenv/config";

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.warn(`[test-data] ⚠️  ยังไม่ได้ตั้งค่า ${name} ใน .env — test ที่ใช้ค่านี้จะ fail`);
  }
  return v;
}

export const supabaseUrl = required("SUPABASE_URL");
export const supabasePublishableKey = required("SUPABASE_PUBLISHABLE_KEY");

export const accounts = {
  owner: {
    email: required("TEST_OWNER_EMAIL"),
    password: required("TEST_OWNER_PASSWORD"),
    role: "owner",
  },
  manager: {
    email: required("TEST_MANAGER_EMAIL"),
    password: required("TEST_MANAGER_PASSWORD"),
    role: "manager",
  },
  supervisor: {
    username: required("TEST_SUPERVISOR_USERNAME"),
    pin: required("TEST_SUPERVISOR_PIN"),
    role: "supervisor",
  },
  technician: {
    username: required("TEST_TECHNICIAN_USERNAME"),
    pin: required("TEST_TECHNICIAN_PIN"),
    role: "technician",
  },
  assistant: {
    username: required("TEST_ASSISTANT_USERNAME"),
    pin: required("TEST_ASSISTANT_PIN"),
    role: "assistant",
  },
  ownerPlatformAdmin: {
    email: required("TEST_OWNER_PLATFORMADMIN_EMAIL"),
    password: required("TEST_OWNER_PLATFORMADMIN_PASSWORD"),
    role: "owner",
  },
  disabledOwner: {
    email: required("TEST_DISABLED_OWNER_EMAIL"),
    password: required("TEST_DISABLED_OWNER_PASSWORD"),
    role: "owner",
  },
  newUser: {
    email: required("TEST_NEWUSER_EMAIL"),
    password: required("TEST_NEWUSER_PASSWORD"),
    role: null,
  },
  // การ์ด "Field Scanner Role" (คืนวันที่ 21 ก.ค. 2026) — username+PIN เหมือน staff ทั่วไป
  fieldScanner: {
    username: required("TEST_FIELDSCANNER_USERNAME"),
    pin: required("TEST_FIELDSCANNER_PIN"),
    role: "field_scanner",
  },
  // shop_members.expires_at ถูก setup-test-data.mjs ตั้งเป็น "เมื่อวาน" เสมอ (คำนวณสดตอน setup)
  // ใช้ยืนยันว่า login ไม่ผ่านพร้อมข้อความ "บัญชีชั่วคราวนี้หมดอายุแล้ว" (ดู expected ใน
  // fixtures/auth-helpers.js -> expectExpiredAccountScreen)
  fieldScannerExpired: {
    username: required("TEST_FIELDSCANNER_EXPIRED_USERNAME"),
    pin: required("TEST_FIELDSCANNER_EXPIRED_PIN"),
    role: "field_scanner",
  },
};

// TC-302: 4 บัญชีแยกในอู่เฉพาะที่ตั้ง plan='trial' (maxConcurrentSessions=3)
// เพื่อทดสอบว่าคนที่ 4 ที่ login พร้อมกันโดนบล็อกจริงไหม
export const concurrentAccounts = [1, 2, 3, 4].map((n) => ({
  email: required(`TEST_CONCURRENT${n}_EMAIL`),
  password: required(`TEST_CONCURRENT${n}_PASSWORD`),
}));

// หน้าที่ตาม RequireAuth allowedRoles จริงในโค้ด (branch: staging)
export const pageAccess = {
  adminOnly: ["/admin/options", "/admin/zones", "/admin/reports", "/admin/trash"],
  allShopRoles: ["/jobs", "/jobs/new", "/add", "/admin/groups"],
  // คืนวันที่ 21 ก.ค. 2026 — หน้าใหม่ที่จำกัด role เพิ่มเติมจาก allShopRoles เดิม
  ownerManagerOnly: ["/admin/import-customers"], // import CSV ลูกค้า — owner/manager เท่านั้น
  // เฉพาะ /add, /edit/[id] เท่านั้นที่ field_scanner เข้าได้ (ตรวจจาก allowedRoles จริงในโค้ด) —
  // /salvage-vehicles, /move-part/[id], /move-parts **ไม่รวม** field_scanner (ตรวจแล้วในโค้ดจริง)
  allShopRolesPlusFieldScanner: ["/add", "/edit"],
};

export const allowedRoles = {
  adminOnly: ["owner", "manager"],
  allShopRoles: ["owner", "manager", "supervisor", "technician", "assistant"],
  ownerManagerOnly: ["owner", "manager"],
  allShopRolesPlusFieldScanner: ["owner", "manager", "supervisor", "technician", "assistant", "field_scanner"],
  // salvage-vehicles/new จำกัดกว่าเพื่อน (ไม่รวม assistant) — ดู app/salvage-vehicles/new/page.js
  salvageIntake: ["owner", "manager", "supervisor", "technician"],
};
