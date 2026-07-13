import { NextResponse } from "next/server";
import { supabase } from "../../../lib/supabaseClient";

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { mode } = body;

    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || null;

    if (mode === "insert") {
      const {
        model_id,
        generation_code,
        vehicle_type,
        year_start,
        year_start_approx,
        year_end,
        year_end_approx,
        is_current,
        note,
      } = body;

      const { data, error } = await supabase.rpc("insert_model_generation", {
        p_model_id: model_id,
        p_generation_code: generation_code,
        p_vehicle_type: vehicle_type,
        p_year_start: year_start,
        p_year_start_approx: !!year_start_approx,
        p_year_end: year_end,
        p_year_end_approx: !!year_end_approx,
        p_is_current: !!is_current,
        p_note: note,
        p_client_ip: ip,
        p_user_agent: userAgent,
      });

      if (error) throw error;
      return NextResponse.json({ data });
    }

    if (mode === "update") {
      const {
        generation_id,
        generation_code,
        vehicle_type,
        year_start,
        year_start_approx,
        year_end,
        year_end_approx,
        is_current,
        note,
      } = body;

      const { data, error } = await supabase.rpc("update_model_generation", {
        p_generation_id: generation_id,
        p_generation_code: generation_code,
        p_vehicle_type: vehicle_type,
        p_year_start: year_start,
        p_year_start_approx: !!year_start_approx,
        p_year_end: year_end,
        p_year_end_approx: !!year_end_approx,
        p_is_current: !!is_current,
        p_note: note,
        p_client_ip: ip,
        p_user_agent: userAgent,
      });

      if (error) throw error;
      return NextResponse.json({ data });
    }

    if (mode === "get_or_create_brand") {
      const { brand_name } = body;
      const { data, error } = await supabase.rpc("get_or_create_brand", {
        p_brand_name: brand_name,
      });
      if (error) throw error;
      return NextResponse.json({ data });
    }

    if (mode === "get_or_create_model") {
      const { brand_id, model_name } = body;
      const { data, error } = await supabase.rpc("get_or_create_model", {
        p_brand_id: brand_id,
        p_model_name: model_name,
      });
      if (error) throw error;
      return NextResponse.json({ data });
    }

    return NextResponse.json({ error: "ไม่รู้จัก mode ที่ส่งมา" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
