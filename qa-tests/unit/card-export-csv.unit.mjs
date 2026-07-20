// Card: "Export CSV (Starter+)" (Priority: unset, In progress)
//
// Unit test of the REAL lib/csvExport.js (imported directly, plain Node — no Playwright/
// network needed since this module has zero Supabase dependency, matching its "unit tests"
// scenarios verbatim from the card: BOM prefix, RFC 4180 escaping, null -> empty cell).
//
// Run: node qa-tests/unit/card-export-csv.unit.mjs
import { toCsv } from "../../lib/csvExport.js";

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

const COLUMNS = [
  { key: "part_id", header: "part_id" },
  { key: "part_name", header: "part_name" },
  { key: "notes", header: "notes" },
  { key: "price", header: "price" },
];

// 1. UTF-8 BOM prefix
const csv1 = toCsv([{ part_id: 1, part_name: "ประตูหน้า", notes: null, price: 500 }], COLUMNS);
check("output starts with UTF-8 BOM", csv1.charCodeAt(0) === 0xfeff);

// 2. null -> empty cell, not the string "null"
check("null value becomes empty cell, not 'null' text", csv1.includes(",,500") && !csv1.includes("null"));

// 3. RFC 4180 escaping: comma in value
const csv2 = toCsv([{ part_id: 2, part_name: "กันชนหน้า, มีรอย", notes: "ok", price: 100 }], COLUMNS);
check('value with a comma gets quoted: "กันชนหน้า, มีรอย"', csv2.includes('"กันชนหน้า, มีรอย"'));

// 4. RFC 4180 escaping: double quote in value (doubled per spec)
const csv3 = toCsv([{ part_id: 3, part_name: 'ยาง 15"', notes: "ok", price: 100 }], COLUMNS);
check('embedded double-quote doubled: ยาง 15""', csv3.includes('"ยาง 15"""'));

// 5. RFC 4180 escaping: newline in value
const csv4 = toCsv([{ part_id: 4, part_name: "test", notes: "line1\nline2", price: 100 }], COLUMNS);
check("value with newline gets quoted", csv4.includes('"line1\nline2"'));

// 6. Header row matches column spec exactly
const csv5 = toCsv([], COLUMNS);
const headerLine = csv5.slice(1).split("\r\n")[0]; // slice(1) drops the BOM char
check("header row matches column spec", headerLine === "part_id,part_name,notes,price");

// 7. Row separator is CRLF (\r\n) per RFC 4180
const csv6 = toCsv(
  [
    { part_id: 1, part_name: "A", notes: null, price: 1 },
    { part_id: 2, part_name: "B", notes: null, price: 2 },
  ],
  COLUMNS
);
check("rows are separated by CRLF", csv6.includes("\r\n") && csv6.split("\r\n").length === 3);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
