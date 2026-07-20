/**
 * แปลงไฟล์ลายเซ็น (signature-*.png) ที่บันทึกไว้ใน Supabase Storage bucket "part-photos"
 * ซึ่งมีพื้นหลังขาวทึบฝังอยู่ (จากตอนที่ SignaturePad.js เคยเติมพื้นขาวให้ ก่อนคอมมิต
 * "Revert opaque white canvas fill") ให้กลายเป็นพื้นหลังโปร่งใสแทน — เพื่อให้แสดงผล
 * สอดคล้องกับลายเซ็นที่เซ็นใหม่หลังการแก้ไข (invert สีเฉพาะ dark mode โดยไม่มีกล่องขาว/ดำ)
 *
 * หลักการแปลง: ไล่ทุกพิกเซล ถ้า R,G,B ทั้ง 3 ช่องสว่างเกิน threshold (ถือว่าเป็นพื้นหลังขาว)
 * ให้ตั้ง alpha = 0 (โปร่งใส) ส่วนพิกเซลหมึกลายเซ็น (เข้ม, ประมาณ #111111) จะไม่โดนแตะ
 * เพราะไม่ผ่าน threshold — ปลอดภัยกับไฟล์ที่โปร่งใสอยู่แล้วด้วย (idempotent):
 * พิกเซลพื้นหลังที่ alpha=0 อยู่แล้วจะไม่ match เงื่อนไขสีขาว (มักเป็น RGB (0,0,0) ตอน alpha=0)
 * เลยไม่ถูกแก้ไขซ้ำ รันสคริปต์นี้ซ้ำกี่ครั้งก็ปลอดภัย
 *
 * ใช้งาน:
 *   node scripts/fix-signature-transparency.mjs              -> dry-run (แสดงรายการ+สถิติ ไม่แก้จริง)
 *   node scripts/fix-signature-transparency.mjs --apply      -> แปลงและอัปโหลดทับของจริง
 *
 * ต้องมี .env.local ที่มีค่า:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (ต้องใช้ตัวนี้ ไม่ใช่ publishable key เพราะต้อง update storage ข้าม RLS)
 *
 * ต้องติดตั้ง sharp ก่อน (มีอยู่แล้วใน node_modules ของโปรเจกต์นี้):
 *   npm install sharp   (ถ้ายังไม่มี)
 */

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// โหลดค่าจาก .env.local เอง (ไม่พึ่ง Next.js runtime เพราะ script นี้รันนอก Next.js)
function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("❌ ไม่พบไฟล์ .env.local ที่ project root");
    process.exit(1);
  }
  const content = fs.readFileSync(envPath, "utf-8");
  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const idx = trimmed.indexOf("=");
    if (idx === -1) return;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  });
}

loadEnvLocal();

const BUCKET = "part-photos";
const WHITE_THRESHOLD = 240; // R,G,B ทั้ง 3 ช่องต้องสว่างเกินค่านี้ถึงจะถือว่าเป็น "พื้นขาว"
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("❌ ต้องมี NEXT_PUBLIC_SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY ใน .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const shouldApply = process.argv.includes("--apply");

async function listSignatureFiles() {
  const allFiles = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list("", {
      limit,
      offset,
      search: "signature-",
    });
    if (error) throw error;
    if (!data || data.length === 0) break;
    allFiles.push(...data.filter((f) => f.name.startsWith("signature-") && f.name.endsWith(".png")));
    if (data.length < limit) break;
    offset += limit;
  }

  return allFiles;
}

/**
 * ไล่พิกเซลทุกจุด แปลงพื้นขาวเป็นโปร่งใส คืนค่า { buffer, newlyConvertedCount, totalPixelCount }
 * newlyConvertedCount นับเฉพาะพิกเซลที่ "สีขาว + alpha เดิมยังไม่ใช่ 0" เท่านั้น
 * (เช็ค alpha เดิมด้วย ไม่ใช่แค่สี RGB — เพราะ PNG ที่โปร่งใสแล้วยังคง RGB=255,255,255 ไว้ได้
 * แม้ alpha=0 แล้ว ถ้าเช็คแค่สีอย่างเดียวจะนับพิกเซลเดิมซ้ำทุกรอบ ทำให้ idempotent check พัง)
 * ถ้า newlyConvertedCount === 0 แปลว่าไฟล์นี้โปร่งใสอยู่แล้วจริงๆ ไม่ต้องอัปโหลดซ้ำ
 */
async function makeTransparent(inputBuffer) {
  const image = sharp(inputBuffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info; // channels = 4 (RGBA) เพราะ ensureAlpha()

  let newlyConvertedCount = 0;
  const totalPixelCount = width * height;

  for (let i = 0; i < data.length; i += channels) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const currentAlpha = data[i + 3];
    if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
      if (currentAlpha !== 0) newlyConvertedCount++;
      data[i + 3] = 0; // alpha = 0
    }
  }

  const outputBuffer = await sharp(data, { raw: { width, height, channels } })
    .png()
    .toBuffer();

  return { buffer: outputBuffer, newlyConvertedCount, totalPixelCount };
}

async function run() {
  console.log(`โหมด: ${shouldApply ? "APPLY (จะอัปโหลดทับของจริง)" : "DRY-RUN (แค่แสดงผล ไม่แก้อะไร)"}`);
  console.log("กำลังดึงรายชื่อไฟล์ signature-*.png จาก Storage...\n");

  const files = await listSignatureFiles();
  console.log(`พบทั้งหมด ${files.length} ไฟล์\n`);

  let convertedCount = 0;
  let alreadyTransparentCount = 0;
  let errorCount = 0;

  for (const file of files) {
    try {
      const { data: downloadData, error: downloadError } = await supabase.storage
        .from(BUCKET)
        .download(file.name);
      if (downloadError) throw downloadError;

      const inputBuffer = Buffer.from(await downloadData.arrayBuffer());
      const { buffer: outputBuffer, newlyConvertedCount, totalPixelCount } = await makeTransparent(
        inputBuffer
      );

      const whiteRatio = ((newlyConvertedCount / totalPixelCount) * 100).toFixed(1);

      if (newlyConvertedCount === 0) {
        alreadyTransparentCount++;
        console.log(`  ⏭  ${file.name} — โปร่งใสอยู่แล้ว ข้าม`);
        continue;
      }

      console.log(`  🎯 ${file.name} — พบพื้นขาว ${whiteRatio}% ของภาพ`);

      if (shouldApply) {
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(file.name, outputBuffer, { contentType: "image/png", upsert: true });
        if (uploadError) throw uploadError;
        console.log(`      ✅ แปลงและอัปโหลดทับแล้ว`);
      }

      convertedCount++;
    } catch (err) {
      errorCount++;
      console.error(`  ❌ ${file.name} — error: ${err.message}`);
    }
  }

  console.log("\n=== สรุป ===");
  console.log(`ทั้งหมด: ${files.length} ไฟล์`);
  console.log(`โปร่งใสอยู่แล้ว (ข้าม): ${alreadyTransparentCount} ไฟล์`);
  console.log(`${shouldApply ? "แปลงแล้ว" : "ควรแปลง (dry-run)"}: ${convertedCount} ไฟล์`);
  if (errorCount > 0) console.log(`Error: ${errorCount} ไฟล์`);

  if (!shouldApply && convertedCount > 0) {
    console.log(`\nรันคำสั่งนี้เพื่อแปลงจริง:\n  node scripts/fix-signature-transparency.mjs --apply`);
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
