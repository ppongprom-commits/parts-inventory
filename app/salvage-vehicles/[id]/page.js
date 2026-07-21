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

  const canManage = ["owner", "manager", "supervisor", "technician"].includes(currentRole);

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

      {canManage && vehicle.status !== "fully_disassembled" && vehicle.status !== "sold_whole" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          <button type="button" onClick={() => router.push(`/add?salvage_vehicle_id=${vehicle.vehicle_id}`)} data-testid="disassemble-button">
            ➡️ ถอดอะไหล่จากคันนี้
          </button>
          {parts.length > 0 && (
            <button type="button" className="secondary" onClick={handleMarkFullyDisassembled} data-testid="mark-fully-disassembled">
              ✅ ถอดหมดแล้ว/ปิดคัน
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
