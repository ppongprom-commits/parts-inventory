// Card: "Import ข้อมูลลูกค้าเดิม — migrate จากระบบ/ไฟล์เก่าเข้า Parts Inventory"
//
// Unit test of the REAL lib/csvImport.js (plain Node, no network) — covers the card's own
// unit test scenarios: parse ไฟล์ถูกต้อง, encoding/format แปลกๆ ไม่ crash, quoted fields ที่มี
// comma/newline/quote ข้างใน
//
// Run: node qa-tests/unit/card-import-customers-csv-parser.unit.mjs
import { parseCsvRows, parseCsvWithHeader, isPlausiblePhone } from "../../lib/csvImport.js";

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

// 1. Basic parse
const basic = parseCsvWithHeader("name,phone\nสมชาย,0812345678\nสมหญิง,0898765432");
check("basic parse: 2 headers", basic.headers.length === 2 && basic.headers[0] === "name");
check("basic parse: 2 rows", basic.rows.length === 2);
check("basic parse: row values correct", basic.rows[0].name === "สมชาย" && basic.rows[0].phone === "0812345678");

// 2. Quoted field with a comma inside
const quotedComma = parseCsvWithHeader('name,address\n"สมชาย, ใจดี","123 หมู่ 4, ตำบล A"');
check("quoted field with comma preserved", quotedComma.rows[0].name === "สมชาย, ใจดี");
check("second quoted field with comma preserved", quotedComma.rows[0].address === "123 หมู่ 4, ตำบล A");

// 3. Doubled quotes inside a quoted field (RFC 4180 escaping)
const doubledQuote = parseCsvWithHeader('name\n"เดอะ ""มือทอง"" ช็อป"');
check('doubled quote ("") becomes a single quote', doubledQuote.rows[0].name === 'เดอะ "มือทอง" ช็อป');

// 4. Field with an embedded newline (quoted)
const embeddedNewline = parseCsvWithHeader('name,notes\nลูกค้า A,"บรรทัดแรก\nบรรทัดสอง"');
check("quoted field with embedded newline stays as one field", embeddedNewline.rows.length === 1);
check("embedded newline preserved in value", embeddedNewline.rows[0].notes === "บรรทัดแรก\nบรรทัดสอง");

// 5. BOM prefix (files this system itself exports have one) doesn't break parsing
const withBom = parseCsvWithHeader("﻿name,phone\nA,0811111111");
check("BOM prefix is stripped, doesn't leak into first header", withBom.headers[0] === "name");

// 6. Trailing blank lines are dropped, not treated as empty rows
const trailingBlank = parseCsvWithHeader("name,phone\nA,0811111111\n\n\n");
check("trailing blank lines don't become phantom rows", trailingBlank.rows.length === 1);

// 7. Missing trailing column -> empty string, not undefined/crash
const raggedRow = parseCsvWithHeader("name,phone,address\nA,0811111111");
check("missing trailing column becomes empty string", raggedRow.rows[0].address === "");

// 8. Empty file doesn't crash
const empty = parseCsvWithHeader("");
check("empty input -> no headers, no rows, no throw", empty.headers.length === 0 && empty.rows.length === 0);

// 9. Phone validation helper
check("valid Thai mobile accepted", isPlausiblePhone("0812345678") === true);
check("valid Thai mobile with dashes accepted", isPlausiblePhone("081-234-5678") === true);
check("letters mixed in rejected", isPlausiblePhone("081abc5678") === false);
check("too short rejected", isPlausiblePhone("0812345") === false);
check("empty/undefined rejected, not thrown", isPlausiblePhone("") === false && isPlausiblePhone(undefined) === false);

console.log(`\n${passed} check(s) passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
