"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthProvider";
import RequireAuth from "../../../components/RequireAuth";
import { parseCsvWithHeader, isPlausiblePhone } from "../../../lib/csvImport";
import { getApprovalRequirement } from "../../../config/adminApprovalDefaults";

// การ์ด "Import ข้อมูลลูกค้าเดิม — migrate จากระบบ/ไฟล์เก่าเข้า Parts Inventory"
// ขอบเขต/ตัดสินใจที่การ์ดทิ้งไว้เป็น gap — ดูเหตุผลเต็มใน db/import_customers_migration.sql:
//  - Duplicate: match ด้วยเบอร์โทรเท่านั้น, เจอซ้ำกับที่มีอยู่แล้ว -> skip (ไม่ merge/ไม่ทับ)
//  - บังคับกรอกอย่างน้อย ชื่อ หรือ เบอร์โทร อย่างใดอย่างหนึ่ง
//  - สิทธิ์: owner/manager เท่านั้น (จำกัดเพิ่มจาก RLS เดิมของ customers ที่กว้างกว่านี้)
//
// การ์ด "Admin Role (7th role)": item (3) "จัดการข้อมูลลูกค้า (import/แก้ไข)" — Admin เข้าร่วม
// Owner/Manager สำหรับหน้านี้ (ตอบ RBAC ที่ค้างไว้ในการ์ด Import เดิม) + import_customers เป็น
// action_type ที่ requires_approval=true โดย default (bulk operation กระทบข้อมูลจำนวนมาก) —
// ถ้า config ของร้านต้องขออนุมัติ จะสร้าง pending_admin_actions แทนการ insert ตรง แล้วให้ผู้อนุมัติ
// กดอนุมัติจากคิว "รออนุมัติ" (ดู app/admin/settings/admin-approvals/page.js)
const TARGET_FIELDS = [
  { key: "name", label: "ชื่อลูกค้า" },
  { key: "phone", label: "เบอร์โทร" },
  { key: "address", label: "ที่อยู่" },
  { key: "", label: "— ไม่นำเข้าคอลัมน์นี้ —" },
];

function ImportCustomersPageContent() {
  const { currentShopId, user } = useAuth();
  const fileInputRef = useRef(null);

  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({}); // { csvHeader: targetFieldKey }
  const [parseError, setParseError] = useState(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setResult(null);
    setFileName(file.name);

    try {
      const text = await file.text();
      const { headers: parsedHeaders, rows } = parseCsvWithHeader(text);
      if (parsedHeaders.length === 0) {
        setParseError("อ่านไฟล์นี้ไม่ได้ — ไม่พบหัวตาราง (แถวแรก) เลย ตรวจว่าเป็นไฟล์ CSV จริงไหม");
        return;
      }
      setHeaders(parsedHeaders);
      setRawRows(rows);

      // เดา mapping อัตโนมัติแบบหยาบๆ จากชื่อคอลัมน์ทั่วไป ช่วยลดงานผู้ใช้ (ยังแก้ทีหลังได้เสมอ)
      const guessed = {};
      parsedHeaders.forEach((h) => {
        const lower = h.toLowerCase();
        if (lower.includes("name") || h.includes("ชื่อ")) guessed[h] = "name";
        else if (lower.includes("phone") || lower.includes("tel") || h.includes("เบอร์") || h.includes("โทร")) guessed[h] = "phone";
        else if (lower.includes("address") || h.includes("ที่อยู่")) guessed[h] = "address";
        else guessed[h] = "";
      });
      setMapping(guessed);
    } catch (err) {
      setParseError("อ่านไฟล์ไม่สำเร็จ: " + err.message);
    } finally {
      e.target.value = "";
    }
  }

  function updateMapping(header, targetKey) {
    setMapping((m) => ({ ...m, [header]: targetKey }));
  }

  // แปลง raw rows -> mapped rows พร้อม validate ต่อแถว (ไม่ทำให้ทั้งไฟล์ import ไม่ได้ ตามการ์ด)
  function buildMappedRows() {
    const seenPhonesInFile = new Set();
    return rawRows.map((raw, index) => {
      const mapped = { name: "", phone: "", address: "" };
      Object.entries(mapping).forEach(([header, targetKey]) => {
        if (targetKey) mapped[targetKey] = raw[header] || "";
      });

      const errors = [];
      if (!mapped.name.trim() && !mapped.phone.trim()) {
        errors.push("ไม่มีทั้งชื่อและเบอร์โทร — ต้องมีอย่างน้อย 1 อย่าง");
      }
      if (mapped.phone.trim() && !isPlausiblePhone(mapped.phone)) {
        errors.push("เบอร์โทรรูปแบบไม่ถูกต้อง");
      }
      let duplicateInFile = false;
      if (mapped.phone.trim() && isPlausiblePhone(mapped.phone)) {
        if (seenPhonesInFile.has(mapped.phone.trim())) {
          duplicateInFile = true;
          errors.push("เบอร์โทรซ้ำกับแถวก่อนหน้าในไฟล์เดียวกัน");
        }
        seenPhonesInFile.add(mapped.phone.trim());
      }

      return { index, ...mapped, errors, duplicateInFile };
    });
  }

  const mappedRows = headers.length > 0 ? buildMappedRows() : [];
  const validRows = mappedRows.filter((r) => r.errors.length === 0);
  const invalidRows = mappedRows.filter((r) => r.errors.length > 0);
  const hasAnyMapping = Object.values(mapping).some((v) => v === "name" || v === "phone");

  async function handleConfirmImport() {
    setImporting(true);
    setResult(null);

    // เช็ค duplicate กับลูกค้าที่มีอยู่แล้วในร้าน (match ด้วยเบอร์โทรเท่านั้น) — ✅ ตัดสินใจ: skip
    // ไม่ merge/ไม่ทับ (ดูเหตุผลใน db/import_customers_migration.sql)
    const phonesToCheck = validRows.map((r) => r.phone.trim()).filter(Boolean);
    let existingPhones = new Set();
    if (phonesToCheck.length > 0) {
      const { data: existing } = await supabase
        .from("customers")
        .select("phone")
        .eq("shop_id", currentShopId)
        .in("phone", phonesToCheck);
      existingPhones = new Set((existing || []).map((c) => c.phone));
    }

    const toInsert = [];
    const skippedExisting = [];
    for (const r of validRows) {
      if (r.phone.trim() && existingPhones.has(r.phone.trim())) {
        skippedExisting.push(r);
      } else {
        toInsert.push({
          shop_id: currentShopId,
          name: r.name.trim() || null,
          phone: r.phone.trim() || null,
          address: r.address.trim() || null,
        });
      }
    }

    // การ์ด "Admin Role" — import_customers ขออนุมัติตาม config ของร้าน (default: ต้องขออนุมัติ,
    // ผู้อนุมัติ default = manager, Owner กด approve ได้เสมอเป็น fallback) — ไม่มีแถว override ของ
    // ร้าน = ใช้ default table ตรงๆ ไม่บังคับตั้งค่าก่อนใช้ (getApprovalRequirement จัดการให้)
    let insertedCount = 0;
    let insertError = null;
    let pendingApprovalId = null;
    if (toInsert.length > 0) {
      const { data: overrides } = await supabase
        .from("admin_action_approval_config")
        .select("action_type, requires_approval, approver_role, approver_user_id")
        .eq("shop_id", currentShopId);

      const requirement = getApprovalRequirement("import_customers", overrides || []);

      if (requirement.requiresApproval) {
        const { data: pending, error: pendingError } = await supabase
          .from("pending_admin_actions")
          .insert({
            shop_id: currentShopId,
            action_type: "import_customers",
            performed_by: user.id,
            payload: { rows: toInsert },
          })
          .select("id")
          .single();
        if (pendingError) {
          insertError = pendingError.message;
        } else {
          pendingApprovalId = pending.id;
        }
      } else {
        const { data, error } = await supabase.from("customers").insert(toInsert).select("customer_id");
        if (error) {
          insertError = error.message;
        } else {
          insertedCount = data?.length || 0;
        }
      }
    }

    setResult({
      totalRows: mappedRows.length,
      inserted: insertedCount,
      skippedInvalid: invalidRows.length,
      skippedExisting: skippedExisting.length,
      pendingApprovalId,
      error: insertError,
    });
    setImporting(false);
  }

  return (
    <div className="container">
      <div className="header">
        <h1>📥 นำเข้าข้อมูลลูกค้าเดิม</h1>
        <Link href="/admin" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>

      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        นำเข้ารายชื่อลูกค้าจากไฟล์ CSV (เช่น export จาก Excel/Google Sheets) — ต้องมีอย่างน้อย
        คอลัมน์ชื่อ หรือ เบอร์โทร อย่างใดอย่างหนึ่ง ลูกค้าที่เบอร์โทรตรงกับที่มีอยู่แล้วในระบบจะถูก
        ข้าม (ไม่ทับข้อมูลเดิม)
      </div>

      <button type="button" onClick={() => fileInputRef.current?.click()}>
        📄 เลือกไฟล์ CSV
      </button>
      <input ref={fileInputRef} type="file" accept=".csv,text/csv" hidden onChange={handleFileChange} />

      {fileName && <div style={{ fontSize: 13, marginTop: 8 }}>ไฟล์: {fileName}</div>}
      {parseError && <div className="msg error" style={{ marginTop: 12 }}>{parseError}</div>}

      {headers.length > 0 && (
        <>
          <div style={{ marginTop: 20, fontWeight: 700 }}>จับคู่คอลัมน์</div>
          {headers.map((h) => (
            <div key={h} style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }} data-testid={`mapping-row-${h}`}>
              <div style={{ flex: 1, fontSize: 13 }}>{h}</div>
              <select value={mapping[h] || ""} onChange={(e) => updateMapping(h, e.target.value)} style={{ flex: 1 }}>
                {TARGET_FIELDS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          ))}

          {!hasAnyMapping && (
            <div className="msg error" style={{ marginTop: 12 }}>
              ต้อง map อย่างน้อย 1 คอลัมน์เป็น &quot;ชื่อลูกค้า&quot; หรือ &quot;เบอร์โทร&quot; ก่อนถึงจะนำเข้าได้
            </div>
          )}

          <div style={{ marginTop: 20, fontWeight: 700 }} data-testid="preview-summary">
            พรีวิว: ทั้งหมด {mappedRows.length} แถว — ผ่านการตรวจสอบ {validRows.length} แถว,
            มีปัญหา {invalidRows.length} แถว
          </div>

          {invalidRows.length > 0 && (
            <div style={{ fontSize: 12, color: "var(--danger-text)", marginTop: 8 }} data-testid="invalid-rows-list">
              {invalidRows.slice(0, 10).map((r) => (
                <div key={r.index}>
                  แถวที่ {r.index + 2}: {r.errors.join(", ")}
                </div>
              ))}
              {invalidRows.length > 10 && <div>...และอีก {invalidRows.length - 10} แถว</div>}
            </div>
          )}

          {result ? (
            <div className={`msg ${result.error ? "error" : "success"}`} style={{ marginTop: 16 }} data-testid="import-result">
              {result.error ? (
                `นำเข้าไม่สำเร็จ: ${result.error}`
              ) : result.pendingApprovalId ? (
                <>
                  ส่งขออนุมัตินำเข้า {result.totalRows - result.skippedInvalid - result.skippedExisting} รายชื่อแล้ว —
                  รอผู้จัดการ/เจ้าของอนุมัติก่อนจึงจะนำเข้าจริง (ข้าม {result.skippedInvalid} แถวข้อมูลไม่ครบ/ผิดรูปแบบ,
                  ข้าม {result.skippedExisting} แถวเบอร์โทรซ้ำ)
                </>
              ) : (
                <>
                  นำเข้าสำเร็จ {result.inserted} รายชื่อ — ข้าม {result.skippedInvalid} แถว (ข้อมูลไม่ครบ/ผิดรูปแบบ),
                  ข้าม {result.skippedExisting} แถว (เบอร์โทรซ้ำกับลูกค้าที่มีอยู่แล้ว) จากทั้งหมด {result.totalRows} แถว
                </>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={handleConfirmImport}
              disabled={!hasAnyMapping || validRows.length === 0 || importing}
              style={{ marginTop: 16 }}
            >
              {importing ? "กำลังนำเข้า..." : `ยืนยันนำเข้า ${validRows.length} รายชื่อ`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

export default function ImportCustomersPage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager", "admin"]}>
      <ImportCustomersPageContent />
    </RequireAuth>
  );
}
