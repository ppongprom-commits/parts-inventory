#!/usr/bin/env node
// ------------------------------------------------------------
// Agent runner: รัน Playwright suite ทั้งหมด -> parse ผล -> สรุปเป็น
// QA report ภาษาไทย จัดกลุ่มตาม priority -> เขียนเป็นทั้ง markdown และ
// stdout ให้ Claude Code (หรือ CI) อ่านแล้วตัดสินใจขั้นต่อไปได้เอง
//
// วิธีรัน:
//   npm run agent:run              -- รันทุก test
//   npm run agent:run -- --grep rbac   -- รันเฉพาะบางไฟล์/บาง describe block
//
// Exit code: 0 = ไม่มี Critical fail, 1 = มี Critical fail อย่างน้อย 1 ตัว
// (ตั้งใจแยกจาก exit code ของ playwright เอง เพื่อให้ agent ตัดสินใจ "หยุด vs ไปต่อ" ได้ตรงประเด็น)
// ------------------------------------------------------------
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { priorityOf, tcIdOf, PRIORITY_ORDER } from "./priority-map.js";

const extraArgs = process.argv.slice(2);
const RESULTS_JSON = "test-results/results.json";
const REPORT_MD = "test-results/agent-report.md";

console.log("== Agent: กำลังรัน Playwright suite กับ", process.env.STAGING_BASE_URL || "(ยังไม่ตั้ง STAGING_BASE_URL)", "==\n");

mkdirSync("test-results", { recursive: true });

const run = spawnSync(
  "npx",
  ["playwright", "test", ...extraArgs],
  { stdio: "inherit", env: process.env }
);

if (!existsSync(RESULTS_JSON)) {
  console.error(`❌ ไม่พบ ${RESULTS_JSON} — playwright อาจ crash ก่อนเขียน report กรุณาดู log ด้านบน`);
  process.exit(run.status || 1);
}

const raw = JSON.parse(readFileSync(RESULTS_JSON, "utf-8"));

// Playwright JSON reporter structure: suites[].suites[].specs[].tests[].results[]
const flatTests = [];
function walk(suite, fileName) {
  for (const spec of suite.specs || []) {
    for (const t of spec.tests || []) {
      const result = t.results?.[t.results.length - 1]; // ผลลัพธ์ล่าสุด (หลัง retry ถ้ามี)
      flatTests.push({
        title: spec.title,
        file: fileName,
        status: result?.status || "unknown",
        durationMs: result?.duration || 0,
        error: result?.error?.message || null,
        retries: t.results?.length ? t.results.length - 1 : 0,
      });
    }
  }
  for (const child of suite.suites || []) {
    walk(child, fileName);
  }
}
for (const fileSuite of raw.suites || []) {
  walk(fileSuite, fileSuite.title);
}

const summary = { Critical: [], High: [], Medium: [], Low: [], Unmapped: [] };
let passed = 0, failed = 0, skipped = 0, flaky = 0;

for (const t of flatTests) {
  const prio = priorityOf(t.title);
  summary[prio].push(t);
  if (t.status === "passed") passed += t.retries > 0 ? (flaky++, 1) : 1;
  else if (t.status === "failed" || t.status === "timedOut") failed++;
  else if (t.status === "skipped") skipped++;
}

const total = flatTests.length;
const criticalFails = summary.Critical.filter((t) => t.status !== "passed");
const highFails = summary.High.filter((t) => t.status !== "passed");

let md = `# QA Automation Report — parts-inventory (staging)\n\n`;
md += `วันที่รัน: ${new Date().toISOString()}\n\n`;
md += `**สรุป:** ${passed}/${total} ผ่าน, ${failed} ไม่ผ่าน, ${skipped} ข้าม${flaky ? `, ${flaky} flaky (ผ่านหลัง retry)` : ""}\n\n`;

if (criticalFails.length > 0) {
  md += `## 🔴 CRITICAL — ต้องแก้ก่อน deploy/ปล่อยฟีเจอร์ (${criticalFails.length} รายการ)\n\n`;
  for (const t of criticalFails) {
    md += `- **${tcIdOf(t.title) || "?"}** ${t.title} — \`${t.status}\`\n`;
    if (t.error) md += `  - ${t.error.split("\n")[0]}\n`;
  }
  md += "\n";
} else {
  md += `## ✅ ไม่มี Critical test ล้มเหลว\n\n`;
}

if (highFails.length > 0) {
  md += `## 🟠 HIGH — ควรแก้ก่อน release ถัดไป (${highFails.length} รายการ)\n\n`;
  for (const t of highFails) {
    md += `- **${tcIdOf(t.title) || "?"}** ${t.title} — \`${t.status}\`\n`;
    if (t.error) md += `  - ${t.error.split("\n")[0]}\n`;
  }
  md += "\n";
}

md += `## รายละเอียดตาม Priority\n\n`;
for (const prio of PRIORITY_ORDER) {
  const list = summary[prio];
  if (list.length === 0) continue;
  const passCount = list.filter((t) => t.status === "passed").length;
  md += `- **${prio}**: ${passCount}/${list.length} ผ่าน\n`;
}

md += `\n## คำแนะนำสำหรับ agent/ผู้ดูแล\n\n`;
if (criticalFails.length > 0) {
  md += `- ⛔ พบ Critical fail — **หยุด และแจ้งทีม dev ทันที** ก่อนดำเนินการอื่นต่อ (เช่น ก่อน merge/deploy)\n`;
  md += `- แนะนำให้รันเฉพาะเทสต์ที่ fail ซ้ำอีกครั้งด้วย \`npx playwright test --grep "${criticalFails
    .map((t) => tcIdOf(t.title))
    .filter(Boolean)
    .join("|")}"\` เพื่อยืนยันว่าไม่ใช่ flaky ก่อนสรุปเป็นบั๊กจริง\n`;
} else if (highFails.length > 0) {
  md += `- ⚠️ ไม่มี Critical fail แต่มี High fail — พิจารณาแก้ก่อน release แต่ไม่ต้อง block ทันที\n`;
} else {
  md += `- ✅ ผ่านทุกระดับความสำคัญหลัก ปลอดภัยที่จะไปต่อ\n`;
}

writeFileSync(REPORT_MD, md);
console.log("\n" + md);
console.log(`\n📄 บันทึกรายงานเต็มไว้ที่: ${path.resolve(REPORT_MD)}`);
console.log(`📄 HTML report: npx playwright show-report test-results/html-report`);

process.exit(criticalFails.length > 0 ? 1 : 0);
