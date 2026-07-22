"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthProvider";
import RequireAuth from "../../../components/RequireAuth";

const STATUS_LABELS = {
  in_stock: "ยังไม่ถอด",
  disassembling: "กำลังถอด",
  fully_disassembled: "ถอดหมดแล้ว",
  sold_whole: "ขายทั้งคัน",
};

function SalvageVehicleDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const { id } = params;
  const { currentShopId, currentRole } = useAuth();

  const [vehicle, setVehicle] = useState(null);
  const [parts, setParts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (currentShopId && id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShopId, id]);

  async function load() {
    setLoading(true);
    const [{ data: v }, { data: p }] = await Promise.all([
      supabase.from("salvage_vehicles").select("*").eq("vehicle_id", id).eq("shop_id", currentShopId).single(),
      supabase.from("parts").select("id, part_name, price, status").eq("salvage_vehicle_id", id),
    ]);
    setVehicle(v || null);
    setParts(p || []);
    setLoading(false);
  }

  async function handleMarkFullyDisassembled() {
    setMsg(null);
    const { error } = await supabase
      .from("salvage_vehicles")
      .update({ status: "fully_disassembled" })
      .eq("vehicle_id", id)
      .eq("shop_id", currentShopId);
    if (error) {
      setMsg({ type: "error", text: "อัปเดตไม่สำเร็จ: " + error.message });
    } else {
      load();
    }
  }

  // การ์ด "Salvage vehicle cost allocation" — ขายซากที่เหลือเป็นเศษเหล็ก (สร้าง part สังเคราะห์รับ
  // allocated_cost ส่วนที่เหลือทั้งหมด แล้วปิดคันเป็น fully_disassembled อัตโนมัติ) ผ่าน RPC
  // sell_salvage_vehicle_scrap (เช็คสิทธิ์ owner/manager/supervisor จาก auth.uid() ภายในตัวมันเอง —
  // ดู db/salvage_vehicle_cost_allocation_migration.sql)
  async function handleSellScrap() {
    if (!confirm("ยืนยันขายซากที่เหลือเป็นเศษเหล็ก? การกระทำนี้จะปิดคันนี้ทันที (ทำอีกครั้งไม่ได้)")) {
      return;
    }
    setMsg(null);
    const { error } = await supabase.rpc("sell_salvage_vehicle_scrap", { p_vehicle_id: Number(id) });
    if (error) {
      setMsg({ type: "error", text: "ขายซากที่เหลือไม่สำเร็จ: " + error.message });
    } else {
      setMsg({ type: "success", text: "ขายซากที่เหลือสำเร็จ — สร้างรายการอะไหล่เศษเหล็กแล้ว" });
      load();
    }
  }

  // เพิ่ม/ถอดอะไหล่จากคัน — ทุก role ที่เพิ่มอะไหล่ได้ปกติ (matrix การ์ด: "ทุก role ที่เพิ่มอะไหล่ได้
  // ปกติ รวม Technician/Assistant/Field Scanner") — หน้านี้จำกัดที่ RequireAuth ไว้แค่ 5 role อยู่แล้ว
  // (ไม่รวม field_scanner ตอนนี้ เพราะ field_scanner ยังไม่มีสิทธิ์เข้าหน้านี้โดยตรง — คนละการ์ด)
  const canExtract = ["owner", "manager", "supervisor", "technician"].includes(currentRole);
  // ปิดคัน/sold_whole/ขายเศษเหล็ก — Owner/Manager/Supervisor เท่านั้นตาม RBAC matrix ที่ตัดสินใจแล้ว
  // ในการ์ด (ต่างจาก canExtract เดิมที่รวม technician ด้วย — แก้ไข 22 ก.ค. 2026 ให้ตรงกับมติจริง)
  const canClose = ["owner", "manager", "supervisor"].includes(currentRole);

  if (loading) {
    return (
      <div className="container">
        <div className="empty">กำลังโหลด...</div>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="container">
        <div className="empty">ไม่พบซากรถนี้</div>
        <Link href="/salvage-vehicles" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>🚗 {vehicle.chassis_number || vehicle.license_plate || `ซากรถ #${vehicle.vehicle_id}`}</h1>
        <Link href="/salvage-vehicles" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>

      {msg && <div className={`msg ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

      <div className="card" style={{ cursor: "default", flexDirection: "column", alignItems: "stretch", marginBottom: 16 }}>
        <div className="card-body">
          <div>สถานะ: <strong data-testid="vehicle-status">{STATUS_LABELS[vehicle.status] || vehicle.status}</strong></div>
          <div>ราคาซื้อ: {vehicle.purchase_price ? Number(vehicle.purchase_price).toLocaleString() : "-"} บาท</div>
          <div>มูลค่าประเมินรวม: {vehicle.estimated_total_value ? Number(vehicle.estimated_total_value).toLocaleString() : "-"} บาท</div>
          {vehicle.value_groups?.length > 0 && (
            <ul style={{ fontSize: 13, marginTop: 6 }}>
              {vehicle.value_groups.map((g, i) => (
                <li key={i}>
                  {g.label}: {Number(g.estimated_value).toLocaleString()} บาท
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {vehicle.status !== "fully_disassembled" && vehicle.status !== "sold_whole" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {canExtract && (
            <button type="button" onClick={() => router.push(`/add?salvage_vehicle_id=${vehicle.vehicle_id}`)} data-testid="disassemble-button">
              ➡️ ถอดอะไหล่จากคันนี้
            </button>
          )}
          {canClose && parts.length > 0 && (
            <button type="button" className="secondary" onClick={handleMarkFullyDisassembled} data-testid="mark-fully-disassembled">
              ✅ ถอดหมดแล้ว/ปิดคัน
            </button>
          )}
          {canClose && (
            <button type="button" className="secondary" onClick={handleSellScrap} data-testid="sell-scrap-button">
              🗑️ ขายซากที่เหลือ (เศษเหล็ก)
            </button>
          )}
        </div>
      )}

      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>อะไหล่ที่ถอดแล้ว ({parts.length})</div>
      {parts.length === 0 && <div className="empty">ยังไม่มีอะไหล่ที่ถอดจากคันนี้</div>}
      {parts.map((p) => (
        <Link href={`/edit/${p.id}`} className="card" key={p.id} style={{ textDecoration: "none", color: "inherit" }}>
          <div className="card-body">
            <div className="card-title">{p.part_name}</div>
            <div className="card-sub">{p.status}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}

export default function SalvageVehicleDetailPage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager", "supervisor", "technician", "assistant"]}>
      <SalvageVehicleDetailPageContent />
    </RequireAuth>
  );
}
