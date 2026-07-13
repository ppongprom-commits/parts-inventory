"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const CONDITIONS = ["ใหม่", "มือสอง-ดี", "มือสอง-ซ่อม"];
const SOURCE_TYPES = ["รถชน", "ประกัน total loss", "น้ำท่วม"];

export default function AddPartPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    part_name: "",
    car_brand: "",
    car_model: "",
    condition: CONDITIONS[0],
    zone_code: "",
    source_type: SOURCE_TYPES[0],
    price: "",
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // { type: 'success'|'error', text }

  function handleChange(e) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoFile(file);
      setPreview(URL.createObjectURL(file));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    try {
      let photo_url = null;

      if (photoFile) {
        const fileExt = photoFile.name.split(".").pop();
        const fileName = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("part-photos")
          .upload(fileName, photoFile);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from("part-photos")
          .getPublicUrl(fileName);

        photo_url = publicUrlData.publicUrl;
      }

      const { error: insertError } = await supabase.from("parts").insert({
        part_name: form.part_name,
        car_brand: form.car_brand || null,
        car_model: form.car_model || null,
        condition: form.condition,
        zone_code: form.zone_code || null,
        source_type: form.source_type,
        price: form.price ? Number(form.price) : null,
        photo_url,
        status: "available",
      });

      if (insertError) throw insertError;

      setMsg({ type: "success", text: "บันทึกอะไหล่เรียบร้อยแล้ว ✅" });
      setForm({
        part_name: "",
        car_brand: "",
        car_model: "",
        condition: CONDITIONS[0],
        zone_code: "",
        source_type: SOURCE_TYPES[0],
        price: "",
      });
      setPhotoFile(null);
      setPreview(null);

      setTimeout(() => {
        router.push("/");
      }, 800);
    } catch (err) {
      setMsg({ type: "error", text: "บันทึกไม่สำเร็จ: " + err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="container">
      <div className="header">
        <h1>+ เพิ่มอะไหล่ใหม่</h1>
        <Link href="/" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>

      {msg && <div className={`msg ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

      <form onSubmit={handleSubmit}>
        <label>
          ถ่ายรูปอะไหล่
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhotoChange}
          />
        </label>

        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt="preview"
            style={{ width: 140, height: 140, objectFit: "cover", borderRadius: 8 }}
          />
        )}

        <label>
          ชื่อชิ้นส่วน *
          <input
            type="text"
            name="part_name"
            value={form.part_name}
            onChange={handleChange}
            placeholder="เช่น ประตูขวา, กันชนหน้า"
            required
          />
        </label>

        <label>
          ยี่ห้อรถ
          <input
            type="text"
            name="car_brand"
            value={form.car_brand}
            onChange={handleChange}
            placeholder="เช่น Nissan"
          />
        </label>

        <label>
          รุ่นรถ
          <input
            type="text"
            name="car_model"
            value={form.car_model}
            onChange={handleChange}
            placeholder="เช่น March"
          />
        </label>

        <label>
          สภาพ
          <select name="condition" value={form.condition} onChange={handleChange}>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label>
          ที่มา
          <select name="source_type" value={form.source_type} onChange={handleChange}>
            {SOURCE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label>
          โซนจัดเก็บ
          <input
            type="text"
            name="zone_code"
            value={form.zone_code}
            onChange={handleChange}
            placeholder="เช่น JP-A1"
          />
        </label>

        <label>
          ราคา (บาท)
          <input
            type="number"
            name="price"
            value={form.price}
            onChange={handleChange}
            placeholder="ไม่บังคับ"
          />
        </label>

        <button type="submit" disabled={saving}>
          {saving ? "กำลังบันทึก..." : "บันทึกอะไหล่"}
        </button>
      </form>
    </div>
  );
}
