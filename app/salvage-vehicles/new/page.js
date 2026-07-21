"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthProvider";
import RequireAuth from "../../../components/RequireAuth";
import CarAutocomplete from "../../../components/CarAutocomplete";
import ZoneAutocomplete from "../../../components/ZoneAutocomplete";
import { resizeImageFile } from "../../../lib/imageResize";
import { uploadPartPhotos } from "../../../lib/storageHelpers";

// การ์ด "Salvage Vehicle Intake + Disassembly (core feature)" — ขอบเขตรอบนี้: หน้ารับซากรถเข้า
// ระบบ (ข้อ 1 ของ flow ในการ์ด) — ถ่ายรูปทั้งคัน + เลือกรถ + ราคาซื้อ/แหล่งที่มา/โซนจอด +
// ประเมินมูลค่ารวมแตกเป็น 4-6 กลุ่ม (บังคับตามการ์ด)
const DEFAULT_GROUP_LABELS = ["ตัวถัง", "เครื่อง/เกียร์", "กระจก/ไฟ", "เบ็ดเตล็ด"];

function NewSalvageVehiclePageContent() {
  const router = useRouter();
  const { currentShopId } = useAuth();
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const [selectedGeneration, setSelectedGeneration] = useState(null);
  const [chassisNumber, setChassisNumber] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchaseSource, setPurchaseSource] = useState("");
  const [zoneId, setZoneId] = useState(null);
  const [notes, setNotes] = useState("");
  const [zones, setZones] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(true);

  const [groups, setGroups] = useState(DEFAULT_GROUP_LABELS.map((label) => ({ label, estimated_value: "" })));
  const [photos, setPhotos] = useState([]);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!currentShopId) return;
    supabase
      .from("zones")
      .select("*")
      .eq("shop_id", currentShopId)
      .order("code", { ascending: true })
      .then(({ data, error }) => {
        if (!error) setZones(data || []);
        setZonesLoading(false);
      });
  }, [currentShopId]);

  const estimatedTotal = groups.reduce((sum, g) => sum + (Number(g.estimated_value) || 0), 0);

  function updateGroup(index, field, value) {
    setGroups((gs) => gs.map((g, i) => (i === index ? { ...g, [field]: value } : g)));
  }

  function addGroup() {
    if (groups.length >= 6) return;
    setGroups((gs) => [...gs, { label: "", estimated_value: "" }]);
  }

  function removeGroup(index) {
    if (groups.length <= 4) return; // บังคับ 4-6 กลุ่มตามการ์ด
    setGroups((gs) => gs.filter((_, i) => i !== index));
  }

  async function handlePhotoChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setProcessingPhoto(true);
    try {
      const resized = await Promise.all(files.map((f) => resizeImageFile(f)));
      setPhotos((p) => [...p, ...resized.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
    } finally {
      setProcessingPhoto(false);
      e.target.value = "";
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg(null);

    if (groups.length < 4 || groups.length > 6) {
      setMsg({ type: "error", text: "ต้องแตกมูลค่าประเมินเป็น 4-6 กลุ่มเท่านั้น" });
      return;
    }
    if (groups.some((g) => !g.label.trim())) {
      setMsg({ type: "error", text: "กรุณาตั้งชื่อทุกกลุ่ม" });
      return;
    }
    if (estimatedTotal <= 0) {
      setMsg({ type: "error", text: "กรุณาประเมินมูลค่ารวมอย่างน้อย 1 บาท (บวกทุกกลุ่มแล้วต้อง > 0)" });
      return;
    }

    setSaving(true);
    try {
      const photoUrls = photos.length > 0 ? await uploadPartPhotos(photos.map((p) => p.file)) : [];

      const { data, error } = await supabase
        .from("salvage_vehicles")
        .insert({
          shop_id: currentShopId,
          generation_id: selectedGeneration?.generation_id || null,
          trim_id: selectedGeneration?.trim_id || null,
          chassis_number: chassisNumber || null,
          license_plate: licensePlate || null,
          purchase_price: purchasePrice ? Number(purchasePrice) : null,
          purchase_date: purchaseDate || null,
          purchase_source: purchaseSource || null,
          zone_id: zoneId || null,
          estimated_total_value: estimatedTotal,
          value_groups: groups.map((g) => ({ label: g.label.trim(), estimated_value: Number(g.estimated_value) || 0 })),
          photo_urls: photoUrls,
          notes: notes || null,
        })
        .select("vehicle_id")
        .single();

      if (error) throw error;
      router.push(`/salvage-vehicles/${data.vehicle_id}`);
    } catch (err) {
      setMsg({ type: "error", text: "บันทึกไม่สำเร็จ: " + err.message });
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <div className="header">
        <h1>🚗 รับซากรถเข้าระบบ</h1>
      </div>

      {msg && <div className={`msg ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

      <form onSubmit={handleSubmit}>
        <label>
          รูปถ่ายทั้งคัน
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={processingPhoto}>
              📷 ถ่ายรูป
            </button>
            <button type="button" className="secondary" onClick={() => galleryInputRef.current?.click()} disabled={processingPhoto}>
              🖼️ เลือกจากคลังภาพ
            </button>
          </div>
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={handlePhotoChange} />
          <input ref={galleryInputRef} type="file" accept="image/*" multiple hidden onChange={handlePhotoChange} />
        </label>

        {photos.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {photos.map((p, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={p.previewUrl} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8 }} />
            ))}
          </div>
        )}

        <div style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 6 }}>
          🔍 ค้นหารถ (ยี่ห้อ/รุ่น) — ไม่บังคับ (ซากหนักอาจระบุรุ่นไม่ได้)
          <CarAutocomplete onSelect={(item) => setSelectedGeneration(item)} />
          {selectedGeneration && (
            <div style={{ fontSize: 12 }}>
              {selectedGeneration.brand_name} {selectedGeneration.model_name} — {selectedGeneration.year_range_display}
            </div>
          )}
        </div>

        <label>
          เลขตัวถัง (ไม่บังคับ)
          <input type="text" value={chassisNumber} onChange={(e) => setChassisNumber(e.target.value)} />
        </label>

        <label>
          ทะเบียนรถ (ไม่บังคับ)
          <input type="text" value={licensePlate} onChange={(e) => setLicensePlate(e.target.value)} />
        </label>

        <label>
          ราคาซื้อทั้งคัน (บาท)
          <input type="number" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} required />
        </label>

        <label>
          วันที่ซื้อ
          <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </label>

        <label>
          แหล่งที่มา
          <input
            type="text"
            value={purchaseSource}
            onChange={(e) => setPurchaseSource(e.target.value)}
            placeholder="เช่น ประมูล, รับซื้อตรง"
          />
        </label>

        <div style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 6 }}>
          โซนจอดรถ
          {!zonesLoading && <ZoneAutocomplete zones={zones} value={zoneId} onChange={setZoneId} />}
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>ประเมินมูลค่ารวม — แตกเป็น 4-6 กลุ่มใหญ่</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
            ใช้เป็นตัวหารตอนปันส่วนต้นทุนให้อะไหล่แต่ละชิ้นทีหลัง (จำเป็นต้องมี — บังคับตามการ์ด)
          </div>
          {groups.map((g, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }} data-testid={`value-group-${i}`}>
              <input
                type="text"
                value={g.label}
                onChange={(e) => updateGroup(i, "label", e.target.value)}
                placeholder="ชื่อกลุ่ม"
                style={{ flex: 2 }}
              />
              <input
                type="number"
                value={g.estimated_value}
                onChange={(e) => updateGroup(i, "estimated_value", e.target.value)}
                placeholder="มูลค่าประเมิน (บาท)"
                style={{ flex: 1 }}
              />
              {groups.length > 4 && (
                <button type="button" className="secondary" onClick={() => removeGroup(i)}>
                  ลบ
                </button>
              )}
            </div>
          ))}
          {groups.length < 6 && (
            <button type="button" className="secondary" onClick={addGroup}>
              + เพิ่มกลุ่ม
            </button>
          )}
          <div style={{ fontSize: 13, marginTop: 8 }} data-testid="estimated-total">
            มูลค่ารวมประเมิน: {estimatedTotal.toLocaleString()} บาท
          </div>
        </div>

        <label>
          หมายเหตุ
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </label>

        <button type="submit" disabled={saving || processingPhoto}>
          {saving ? "กำลังบันทึก..." : "บันทึกซากรถ"}
        </button>
      </form>
    </div>
  );
}

export default function NewSalvageVehiclePage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager", "supervisor", "technician"]}>
      <NewSalvageVehiclePageContent />
    </RequireAuth>
  );
}
