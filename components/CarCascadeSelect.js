"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabaseClient";

/**
 * เลือกรถแบบไล่ลำดับ: ยี่ห้อ → รุ่น → ปี (generation) → รุ่นย่อย (trim ถ้ามี)
 * ทุกตัวเลือกดึงจากฐานข้อมูลจริงเท่านั้น — ไม่มีช่องให้พิมพ์เองเลย
 * เพื่อกันข้อมูลเพี้ยน/มั่ว (เคยเจอปัญหา generation_code ผิดเพราะให้พิมพ์เองมาก่อน)
 *
 * Props:
 *  - onSelect(item | null) — item = { brand_name, model_name, generation_id,
 *      generation_code, year_range_display, vehicle_type, trim_id, trim_name }
 *  - initialGenerationId, initialTrimId — ใช้ตอนแก้ไขอะไหล่เดิม (prefill ให้ตรงของเดิม)
 *
 * ใช้ handler แบบ imperative (ไม่ใช้ useEffect ไล่ตาม state) เพื่อไม่ให้ชนกับ
 * การ prefill ตอนโหลดข้อมูลเดิมมาแก้ไข
 */
export default function CarCascadeSelect({ onSelect, initialGenerationId, initialTrimId }) {
  const [brands, setBrands] = useState([]);
  const [models, setModels] = useState([]);
  const [generations, setGenerations] = useState([]);
  const [trims, setTrims] = useState([]);

  const [brandId, setBrandId] = useState("");
  const [modelId, setModelId] = useState("");
  const [generationId, setGenerationId] = useState("");
  const [trimId, setTrimId] = useState("");

  const [loadingBrands, setLoadingBrands] = useState(true);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingGenerations, setLoadingGenerations] = useState(false);
  const [loadingTrims, setLoadingTrims] = useState(false);
  const hydratingRef = useRef(!!initialGenerationId);

  function emit(gen, trim) {
    if (!gen) {
      onSelect(null);
      return;
    }
    onSelect({
      brand_name: gen.brand_name,
      model_name: gen.model_name,
      generation_id: gen.generation_id,
      generation_code: gen.generation_code,
      year_range_display: gen.year_range_display,
      vehicle_type: gen.vehicle_type,
      trim_id: trim ? trim.trim_id : null,
      trim_name: trim ? trim.trim_name : null,
    });
  }

  // โหลดยี่ห้อทั้งหมดตอน mount + ถ้ามี initialGenerationId ให้ prefill ทุกระดับให้ตรงของเดิม
  useEffect(() => {
    let active = true;
    (async () => {
      setLoadingBrands(true);
      const { data: brandsData } = await supabase
        .from("brands")
        .select("brand_id, brand_name")
        .order("brand_name");
      if (!active) return;
      setBrands(brandsData || []);
      setLoadingBrands(false);

      if (!initialGenerationId) {
        hydratingRef.current = false;
        return;
      }

      const { data: gen } = await supabase
        .from("model_generations_display")
        .select("*")
        .eq("generation_id", initialGenerationId)
        .maybeSingle();

      if (!active || !gen) {
        hydratingRef.current = false;
        return;
      }

      const [{ data: modelsData }, { data: gensData }, { data: trimsData }] = await Promise.all([
        supabase.from("models").select("model_id, model_name").eq("brand_id", gen.brand_id).order("model_name"),
        supabase
          .from("model_generations_display")
          .select("*")
          .eq("model_id", gen.model_id)
          .order("year_start", { ascending: false }),
        supabase
          .from("model_trims")
          .select("trim_id, trim_name, powertrain_type")
          .eq("generation_id", initialGenerationId)
          .order("trim_name"),
      ]);

      if (!active) return;

      setModels(modelsData || []);
      setGenerations(gensData || []);
      setTrims(trimsData || []);
      setBrandId(String(gen.brand_id));
      setModelId(String(gen.model_id));
      setGenerationId(String(initialGenerationId));

      const trim = (trimsData || []).find((t) => String(t.trim_id) === String(initialTrimId));
      if (trim) setTrimId(String(trim.trim_id));

      emit(gen, trim);
      hydratingRef.current = false;
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleBrandChange(newBrandId) {
    setBrandId(newBrandId);
    setModelId("");
    setGenerationId("");
    setTrimId("");
    setModels([]);
    setGenerations([]);
    setTrims([]);
    emit(null);

    if (!newBrandId) return;

    setLoadingModels(true);
    const { data } = await supabase
      .from("models")
      .select("model_id, model_name")
      .eq("brand_id", newBrandId)
      .order("model_name");
    setModels(data || []);
    setLoadingModels(false);
  }

  async function handleModelChange(newModelId) {
    setModelId(newModelId);
    setGenerationId("");
    setTrimId("");
    setGenerations([]);
    setTrims([]);
    emit(null);

    if (!newModelId) return;

    setLoadingGenerations(true);
    const { data } = await supabase
      .from("model_generations_display")
      .select("*")
      .eq("model_id", newModelId)
      .order("year_start", { ascending: false });
    setGenerations(data || []);
    setLoadingGenerations(false);

    // ถ้ามีปีเดียว เลือกให้อัตโนมัติเลย ไม่ต้องให้กดซ้ำ
    if ((data || []).length === 1) {
      await handleGenerationChange(String(data[0].generation_id), data);
    }
  }

  async function handleGenerationChange(newGenerationId, generationsListOverride) {
    const list = generationsListOverride || generations;
    setGenerationId(newGenerationId);
    setTrimId("");
    setTrims([]);

    const gen = list.find((g) => String(g.generation_id) === String(newGenerationId));
    emit(gen || null);

    if (!newGenerationId) return;

    setLoadingTrims(true);
    const { data } = await supabase
      .from("model_trims")
      .select("trim_id, trim_name, powertrain_type")
      .eq("generation_id", newGenerationId)
      .order("trim_name");
    setTrims(data || []);
    setLoadingTrims(false);
  }

  function handleTrimChange(newTrimId) {
    setTrimId(newTrimId);
    const gen = generations.find((g) => String(g.generation_id) === String(generationId));
    const trim = trims.find((t) => String(t.trim_id) === String(newTrimId));
    emit(gen || null, trim);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <select
          value={brandId}
          onChange={(e) => handleBrandChange(e.target.value)}
          disabled={loadingBrands}
          style={{ flex: "1 1 160px" }}
        >
          <option value="">{loadingBrands ? "กำลังโหลดยี่ห้อ..." : "— เลือกยี่ห้อ —"}</option>
          {brands.map((b) => (
            <option key={b.brand_id} value={b.brand_id}>
              {b.brand_name}
            </option>
          ))}
        </select>

        <select
          value={modelId}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={!brandId || loadingModels}
          style={{ flex: "1 1 160px" }}
        >
          <option value="">
            {!brandId ? "เลือกยี่ห้อก่อน" : loadingModels ? "กำลังโหลดรุ่น..." : "— เลือกรุ่น —"}
          </option>
          {models.map((m) => (
            <option key={m.model_id} value={m.model_id}>
              {m.model_name}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <select
          value={generationId}
          onChange={(e) => handleGenerationChange(e.target.value)}
          disabled={!modelId || loadingGenerations || generations.length <= 1}
          style={{ flex: "1 1 200px" }}
        >
          <option value="">
            {!modelId
              ? "เลือกรุ่นก่อน"
              : loadingGenerations
              ? "กำลังโหลดปี..."
              : generations.length === 0
              ? "ไม่พบข้อมูลปีของรุ่นนี้"
              : "— เลือกช่วงปี —"}
          </option>
          {generations.map((g) => (
            <option key={g.generation_id} value={g.generation_id}>
              {g.generation_code} ({g.year_range_display})
            </option>
          ))}
        </select>

        {trims.length > 0 && (
          <select
            value={trimId}
            onChange={(e) => handleTrimChange(e.target.value)}
            disabled={loadingTrims}
            style={{ flex: "1 1 200px" }}
          >
            <option value="">
              {loadingTrims ? "กำลังโหลดรุ่นย่อย..." : "— รุ่นย่อย (ไม่บังคับ) —"}
            </option>
            {trims.map((t) => (
              <option key={t.trim_id} value={t.trim_id}>
                {t.trim_name}
                {t.powertrain_type ? ` [${t.powertrain_type}]` : ""}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
