// Card: "Field Visibility Whitelist กลาง (role × field group) — ตัดสินใจครั้งเดียว ใช้ 4 การ์ด"
// (Priority: Medium, In progress)
//
// Unit test of the REAL config/fieldVisibility.js (imported directly, plain Node — no
// Playwright/network needed, mirrors the pattern of card-export-csv.unit.mjs).
//
// Run: node qa-tests/unit/card-field-visibility-whitelist.unit.mjs
import { canSeeField, DEFAULT_FIELD_VISIBILITY, FLOOR_RULES } from "../../config/fieldVisibility.js";

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed++;
    console.log("  ok -", name);
  } else {
    failed++;
    console.log("  FAIL -", name);
  }
}

// 1. Default matrix, no overrides — matches the card's decided table
check("owner sees sale_price by default", canSeeField("owner", "sale_price") === true);
check("technician does NOT see sale_price by default", canSeeField("technician", "sale_price") === false);
check("technician DOES see customer_phone (decided 19 ก.ค.)", canSeeField("technician", "customer_phone") === true);
check("assistant DOES see customer_name (decided 19 ก.ค.)", canSeeField("assistant", "customer_name") === true);
check("field_scanner sees license_plate (not customer PII, decided)", canSeeField("field_scanner", "license_plate") === true);
check(
  "supervisor sees export_csv_parts by default (decided)",
  canSeeField("supervisor", "export_csv_parts") === true
);
check(
  "assistant does NOT see export_csv_parts by default",
  canSeeField("assistant", "export_csv_parts") === false
);

// 2. Floor rules — cannot be overridden to true no matter what
check(
  "floor: field_scanner never sees customer_name even with an override trying to allow it",
  canSeeField("field_scanner", "customer_name", [{ role: "field_scanner", field_group: "customer_name", allowed: true }]) === false
);
check(
  "floor: field_scanner never sees customer_phone even with an override trying to allow it",
  canSeeField("field_scanner", "customer_phone", [{ role: "field_scanner", field_group: "customer_phone", allowed: true }]) === false
);
check(
  "floor: technician never manages API keys even with an override trying to allow it",
  canSeeField("technician", "manage_api_keys", [{ role: "technician", field_group: "manage_api_keys", allowed: true }]) === false
);
check("floor: manager CAN manage API keys (not floor-locked, per decision)", canSeeField("manager", "manage_api_keys") === true);

// 3. Legitimate overrides (not floor-locked) DO apply
check(
  "a legitimate override (supervisor cost_price -> false) is respected",
  canSeeField("supervisor", "cost_price", [{ role: "supervisor", field_group: "cost_price", allowed: false }]) === false
);
check(
  "an override for a DIFFERENT role doesn't leak onto this role",
  canSeeField("owner", "cost_price", [{ role: "supervisor", field_group: "cost_price", allowed: false }]) === true
);
check(
  "an override for a DIFFERENT field group doesn't leak onto this field group",
  canSeeField("supervisor", "sale_price", [{ role: "supervisor", field_group: "cost_price", allowed: false }]) === true
);

// 4. Structural sanity: every FLOOR_RULES entry actually corresponds to a false default (a floor
// that "locks" an already-true default would be a contradiction in the config itself)
check(
  "every floor rule locks a role/field_group that defaults to false (no contradiction in config)",
  FLOOR_RULES.every(([role, group]) => DEFAULT_FIELD_VISIBILITY[role]?.[group] === false)
);

// 5. Unknown role / unknown field group -> false (safe default, never crashes)
check("unknown role returns false, not a crash", canSeeField("nonexistent_role", "sale_price") === false);
check("unknown field group returns false, not a crash", canSeeField("owner", "nonexistent_group") === false);

console.log(`\n${passed} check(s) passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
