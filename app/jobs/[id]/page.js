"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import { useAuth } from "../../../lib/AuthProvider";
import RequireAuth from "../../../components/RequireAuth";
import { JOB_STATUSES, JOB_STATUS_STYLE, JOB_SOURCE_TYPES } from "../../../lib/jobStatusLabels";
import CarDamageDiagram from "../../../components/CarDamageDiagram";

const ROLE_LABELS = {
  owner: "เจ้าของ",
  manager: "ผู้จัดการ",
  supervisor: "หัวหน้างาน",
  technician: "ช่าง",
  assistant: "ผู้ช่วยช่าง",
};

const CATEGORY_LABELS = { labor: "ค่าแรง", parts: "ค่าอะไหล่", other: "อื่นๆ" };

const DOC_TYPE_LABELS = {
  receipt: "ใบรับรถ",
  quotation: "ใบเสนอราคา",
  billing: "ใบแจ้งหนี้",
};

function JobDetailPageContent() {
  const params = useParams();
  const router = useRouter();
  const { currentShopId, currentRole, user } = useAuth();
  const jobId = params.id;

  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState(null);
  const [members, setMembers] = useState([]);
  const [costItems, setCostItems] = useState([]);
  const [newCostItem, setNewCostItem] = useState({ category: "parts", description: "", amount: "", quantity: "1" });
  const [consumableQuery, setConsumableQuery] = useState("");
  const [consumableResults, setConsumableResults] = useState([]);
  const [selectedConsumablePart, setSelectedConsumablePart] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [customerShareUrl, setCustomerShareUrl] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingDoc, setCreatingDoc] = useState(null);
  const [msg, setMsg] = useState(null);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const [groups, setGroups] = useState([]);
  const [jobGroupIds, setJobGroupIds] = useState([]);
  const [workflowSteps, setWorkflowSteps] = useState([]);
  const [linkedParts, setLinkedParts] = useState([]);
  const [newStepName, setNewStepName] = useState("");
  const [newStepAssignee, setNewStepAssignee] = useState("");

  useEffect(() => {
    if (currentShopId) {
      fetchJob();
      fetchMembers();
      fetchCostItems();
      fetchDocuments();
      fetchGroups();
      fetchJobGroups();
      fetchWorkflowSteps();
      fetchLinkedParts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentShopId, jobId]);

  async function fetchLinkedParts() {
    const { data } = await supabase
      .from("parts")
      .select("id, part_name, price, status, item_type, quantity")
      .eq("job_id", jobId)
      .eq("item_type", "salvage");

    const parts = data || [];

    if (parts.length > 0) {
      const { data: salesData } = await supabase
        .from("part_sales")
        .select("part_id, quantity_sold, sale_price")
        .in(
          "part_id",
          parts.map((p) => p.id)
        );

      const salesByPart = {};
      (salesData || []).forEach((s) => {
        const key = s.part_id;
        if (!salesByPart[key]) salesByPart[key] = { qty: 0, total: 0 };
        salesByPart[key].qty += Number(s.quantity_sold);
        salesByPart[key].total += Number(s.quantity_sold) * Number(s.sale_price);
      });

      parts.forEach((p) => {
        p.sold_quantity = salesByPart[p.id]?.qty || 0;
        p.sold_total = salesByPart[p.id]?.total || 0;
      });
    }

    setLinkedParts(parts);
  }

  async function fetchGroups() {
    const { data } = await supabase
      .from("visibility_groups")
      .select("group_id, name")
      .eq("shop_id", currentShopId);
    setGroups(data || []);
  }

  async function fetchWorkflowSteps() {
    const { data } = await supabase
      .from("job_workflow_steps")
      .select("*")
      .eq("job_id", jobId)
      .order("step_order", { ascending: true });
    setWorkflowSteps(data || []);
  }

  async function handleAddStep() {
    if (!newStepName.trim()) return;

    const maxOrder = workflowSteps.reduce((max, s) => Math.max(max, s.step_order || 0), 0);
    const { error } = await supabase.from("job_workflow_steps").insert({
      job_id: jobId,
      shop_id: currentShopId,
      step_order: maxOrder + 1,
      step_name: newStepName.trim(),
      assigned_to: newStepAssignee || null,
    });

    if (error) {
      setMsg({ type: "error", text: "เพิ่มขั้นตอนไม่สำเร็จ: " + error.message });
    } else {
      setNewStepName("");
      setNewStepAssignee("");
      fetchWorkflowSteps();
    }
  }

  async function handleStepStatusChange(stepId, newStatus) {
    const { error } = await supabase
      .from("job_workflow_steps")
      .update({ status: newStatus })
      .eq("step_id", stepId);
    if (error) {
      setMsg({ type: "error", text: "อัปเดตสถานะไม่สำเร็จ: " + error.message });
    } else {
      fetchWorkflowSteps();
    }
  }

  async function handleStepAssigneeChange(stepId, userId) {
    await supabase.from("job_workflow_steps").update({ assigned_to: userId || null }).eq("step_id", stepId);
    fetchWorkflowSteps();
  }

  async function handleDeleteStep(stepId) {
    await supabase.from("job_workflow_steps").delete().eq("step_id", stepId);
    fetchWorkflowSteps();
  }

  async function handleMoveStep(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= workflowSteps.length) return;

    const a = workflowSteps[index];
    const b = workflowSteps[targetIndex];

    await Promise.all([
      supabase.from("job_workflow_steps").update({ step_order: b.step_order }).eq("step_id", a.step_id),
      supabase.from("job_workflow_steps").update({ step_order: a.step_order }).eq("step_id", b.step_id),
    ]);
    fetchWorkflowSteps();
  }

  async function fetchJobGroups() {
    const { data } = await supabase
      .from("job_visibility_groups")
      .select("group_id")
      .eq("job_id", jobId);
    setJobGroupIds((data || []).map((r) => r.group_id));
  }

  async function toggleJobGroup(groupId) {
    const isSelected = jobGroupIds.includes(groupId);

    if (isSelected) {
      await supabase.from("job_visibility_groups").delete().eq("job_id", jobId).eq("group_id", groupId);
    } else {
      await supabase.from("job_visibility_groups").insert({ job_id: jobId, group_id: groupId });
    }
    fetchJobGroups();
  }

  function memberLabel(m) {
    return m.contact_name || m.login_username || ROLE_LABELS[m.role] || m.user_id?.slice(0, 8);
  }

  async function fetchCostItems() {
    const { data } = await supabase
      .from("job_cost_items")
      .select("*")
      .eq("job_id", jobId)
      .order("sort_order", { ascending: true });
    setCostItems(data || []);
  }

  async function fetchDocuments() {
    const { data } = await supabase
      .from("job_documents")
      .select("document_id, doc_type, doc_number, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });
    setDocuments(data || []);
  }

  async function searchConsumables(query) {
    setConsumableQuery(query);
    if (!query.trim()) {
      setConsumableResults([]);
      return;
    }
    const { data } = await supabase
      .from("parts")
      .select("id, part_name, price, quantity")
      .eq("shop_id", currentShopId)
      .eq("item_type", "consumable")
      .eq("is_active", true)
      .gt("quantity", 0)
      .ilike("part_name", `%${query.trim()}%`)
      .limit(8);
    setConsumableResults(data || []);
  }

  function handleSelectConsumable(part) {
    setSelectedConsumablePart(part);
    setNewCostItem((f) => ({
      ...f,
      category: "parts",
      description: part.part_name,
      amount: part.price ? String(part.price) : f.amount,
      quantity: "1",
      _categoryTouched: true,
    }));
    setConsumableQuery("");
    setConsumableResults([]);
  }

  // เพิ่มรายการแบบเร็ว — ถ้าพิมพ์ขึ้นต้นด้วย "ค่า" จะเดาเป็นค่าแรงให้อัตโนมัติ
  // (ตามธรรมเนียมที่ใช้กันมา) แต่ยังกดปุ่มเลือกหมวดเองทับได้เสมอ
  function handleDescriptionChange(value) {
    setSelectedConsumablePart(null); // พิมพ์เองแล้วไม่ผูกกับสต็อกอีกต่อไป
    setNewCostItem((f) => {
      const guessedCategory = value.trim().startsWith("ค่า") ? "labor" : f.category;
      return { ...f, description: value, category: f._categoryTouched ? f.category : guessedCategory };
    });
  }

  async function handleAddCostItem() {
    if (!newCostItem.description.trim() || !newCostItem.amount) return;

    const qty = Number(newCostItem.quantity) || 1;
    const maxSort = costItems.reduce((max, c) => Math.max(max, c.sort_order || 0), 0);

    // ถ้าเลือกของจากสต็อกไว้ ตัดสต็อกก่อน (กันเผื่อสต็อกไม่พอ ค่อยเพิ่มรายการ)
    if (selectedConsumablePart) {
      const { error: deductError } = await supabase.rpc("deduct_part_stock", {
        p_part_id: selectedConsumablePart.id,
        p_quantity: qty,
      });
      if (deductError) {
        setMsg({ type: "error", text: "ตัดสต็อกไม่สำเร็จ: " + deductError.message });
        return;
      }
    }

    const { error } = await supabase.from("job_cost_items").insert({
      job_id: jobId,
      category: newCostItem.category,
      description: newCostItem.description.trim(),
      amount: Number(newCostItem.amount),
      quantity: qty,
      part_id: selectedConsumablePart?.id || null,
      sort_order: maxSort + 1,
    });

    if (error) {
      setMsg({ type: "error", text: "เพิ่มรายการไม่สำเร็จ: " + error.message });
    } else {
      setNewCostItem({ category: "parts", description: "", amount: "", quantity: "1", _categoryTouched: false });
      setSelectedConsumablePart(null);
      fetchCostItems();
    }
  }

  async function handleDeleteCostItem(itemId) {
    // ถ้ารายการนี้เคยตัดสต็อกไว้ (ผูก part_id) ให้คืนสต็อกกลับก่อนลบ
    const item = costItems.find((c) => c.item_id === itemId);
    if (item?.part_id) {
      await supabase.rpc("deduct_part_stock", {
        p_part_id: item.part_id,
        p_quantity: -Number(item.quantity || 1), // ค่าติดลบ = บวกกลับคืน
      });
    }
    await supabase.from("job_cost_items").delete().eq("item_id", itemId);
    fetchCostItems();
  }

  async function handleMoveItem(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= costItems.length) return;

    const a = costItems[index];
    const b = costItems[targetIndex];

    await Promise.all([
      supabase.from("job_cost_items").update({ sort_order: b.sort_order }).eq("item_id", a.item_id),
      supabase.from("job_cost_items").update({ sort_order: a.sort_order }).eq("item_id", b.item_id),
    ]);
    fetchCostItems();
  }

  const laborTotal = costItems
    .filter((c) => c.category === "labor")
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const partsTotal = costItems
    .filter((c) => c.category !== "labor")
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  const subtotal = laborTotal + partsTotal;
  const vatAmount = job?.vat_type === "vat7" ? subtotal * 0.07 : 0;
  const grandTotal = subtotal + vatAmount;

  async function handleVatChange(e) {
    const vatType = e.target.value;
    setJob((j) => ({ ...j, vat_type: vatType }));
    await supabase.from("jobs").update({ vat_type: vatType }).eq("job_id", jobId);
  }

  async function handleCreateDocument(docType) {
    setCreatingDoc(docType);
    setMsg(null);

    try {
      const { data: docNumberData, error: docNumberError } = await supabase.rpc("generate_doc_number");
      if (docNumberError) throw docNumberError;

      const { data: shopInfo } = await supabase
        .from("shops")
        .select("shop_name, company_name, address, tax_id, phone")
        .eq("shop_id", currentShopId)
        .single();

      const { data: currentMember } = await supabase
        .from("shop_members")
        .select("contact_name, login_username")
        .eq("shop_id", currentShopId)
        .eq("user_id", user?.id)
        .maybeSingle();
      const receivedByName =
        currentMember?.contact_name || currentMember?.login_username || user?.email || "พนักงาน";

      const snapshot = {
        // ชื่อบริษัทสำหรับพิมพ์บนเอกสาร — ถ้าไม่ได้ตั้งค่าไว้ fallback ไปใช้ชื่ออู่แทน
        shop_name: shopInfo?.company_name || shopInfo?.shop_name || null,
        shop_address: shopInfo?.address || null,
        shop_tax_id: shopInfo?.tax_id || null,
        shop_phone: shopInfo?.phone || null,
        received_by_name: receivedByName,
        customer_name: job.customer_name,
        customer_phone: job.customer_phone,
        customer_address: job.customer_address,
        car_brand: job.car_brand,
        car_model: job.car_model,
        car_year_display: job.car_year_display,
        license_plate: job.license_plate,
        vin: job.vin || null,
        cost_items: costItems.map((c) => ({
          category: c.category,
          description: c.description,
          amount: Number(c.amount),
          quantity: Number(c.quantity) || 1,
        })),
        labor_total: laborTotal,
        parts_total: partsTotal,
        subtotal,
        vat_type: job.vat_type,
        vat_amount: vatAmount,
        grand_total: grandTotal,
        damage_points: job.damage_points || [],
        car_diagram_type: job.car_diagram_type || "sedan",
        notes: job.notes,
      };

      const { data, error } = await supabase
        .from("job_documents")
        .insert({
          shop_id: currentShopId,
          job_id: jobId,
          doc_type: docType,
          doc_number: docNumberData,
          snapshot,
          created_by: user?.id || null,
        })
        .select()
        .single();

      if (error) throw error;

      fetchDocuments();
      window.open(`/jobs/${jobId}/documents/${data.document_id}`, "_blank");
    } catch (err) {
      setMsg({ type: "error", text: "สร้างเอกสารไม่สำเร็จ: " + err.message });
    } finally {
      setCreatingDoc(null);
    }
  }

  async function handleCopyCustomerLink() {
    if (!job?.customer_id) {
      setMsg({ type: "error", text: "งานนี้ยังไม่มีเบอร์โทรลูกค้า ไม่สามารถสร้างลิงก์ได้" });
      return;
    }

    const { data: customer } = await supabase
      .from("customers")
      .select("share_token")
      .eq("customer_id", job.customer_id)
      .maybeSingle();

    if (!customer) return;

    const url = `${window.location.origin}/share/customer/${customer.share_token}`;
    setCustomerShareUrl(url);
    navigator.clipboard?.writeText(url);
    setMsg({ type: "success", text: "คัดลอกลิงก์แล้ว ✅ (ส่งให้ลูกค้าได้เลย)" });
  }

  async function fetchJob() {
    setLoading(true);
    const { data, error } = await supabase.from("jobs").select("*").eq("job_id", jobId).single();
    if (error) {
      setMsg({ type: "error", text: "โหลดข้อมูลไม่สำเร็จ: " + error.message });
    } else {
      setJob(data);
    }
    setLoading(false);
  }

  async function fetchMembers() {
    const { data } = await supabase
      .from("shop_members")
      .select("user_id, role, contact_name, login_username")
      .eq("shop_id", currentShopId)
      .eq("status", "active")
      .in("role", ["supervisor", "technician", "assistant", "manager", "owner"]);
    setMembers(data || []);
  }

  function handleChange(e) {
    const { name, value } = e.target;
    setJob((j) => ({ ...j, [name]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    const { error } = await supabase
      .from("jobs")
      .update({
        customer_name: job.customer_name,
        customer_phone: job.customer_phone,
        customer_address: job.customer_address,
        car_brand: job.car_brand,
        car_model: job.car_model,
        license_plate: job.license_plate,
        source_type: job.source_type,
        status: job.status,
        assigned_to: job.assigned_to || null,
        notes: job.notes,
        damage_points: job.damage_points || [],
        car_diagram_type: job.car_diagram_type || "sedan",
        vehicle_purchase_price: job.vehicle_purchase_price ? Number(job.vehicle_purchase_price) : null,
      })
      .eq("job_id", jobId);

    if (error) {
      setMsg({ type: "error", text: "บันทึกไม่สำเร็จ: " + error.message });
    } else {
      setMsg({ type: "success", text: "บันทึกแล้ว ✅" });
    }
    setSaving(false);
  }

  async function handleDelete() {
    const confirmed = window.confirm(`ลบงานของ "${job.customer_name || "ลูกค้า"}" ใช่ไหม?`);
    if (!confirmed) return;

    setDeleting(true);
    const { error } = await supabase.from("jobs").delete().eq("job_id", jobId);
    if (error) {
      setMsg({ type: "error", text: "ลบไม่สำเร็จ: " + error.message });
      setDeleting(false);
    } else {
      router.push("/jobs");
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="empty">กำลังโหลด...</div>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="container">
        {msg && <div className={`msg ${msg.type}`}>{msg.text}</div>}
        <Link href="/jobs" className="nav-link secondary" style={{ marginTop: 16, display: "inline-block" }}>
          ← กลับ
        </Link>
      </div>
    );
  }

  const canDelete = currentRole === "owner" || currentRole === "manager";

  return (
    <div className="container">
      <div className="header">
        <h1>✏️ รายละเอียดงาน</h1>
        <Link href="/jobs" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>

      {msg && <div className={`msg ${msg.type}`} style={{ marginBottom: 16 }}>{msg.text}</div>}

      {job.photo_urls?.length > 0 && (
        <>
          <div className="photo-thumb-row" style={{ marginBottom: 16 }}>
            {job.photo_urls.map((url, i) => (
              <div className="photo-thumb" key={i}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`รูป ${i + 1}`} onClick={() => setLightboxIndex(i)} />
              </div>
            ))}
          </div>

          {lightboxIndex !== null && (
            <div
              onClick={() => setLightboxIndex(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.9)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 100,
                cursor: "zoom-out",
                padding: 20,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={job.photo_urls[lightboxIndex]}
                alt="ขยายรูป"
                onClick={(e) => e.stopPropagation()}
                style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8, objectFit: "contain" }}
              />
            </div>
          )}
        </>
      )}

      <form onSubmit={handleSave}>
        <label>
          สถานะงาน
          <select name="status" value={job.status} onChange={handleChange}>
            {JOB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {JOB_STATUS_STYLE[s].label}
              </option>
            ))}
          </select>
        </label>

        <label>
          มอบหมายให้ช่าง
          <select name="assigned_to" value={job.assigned_to || ""} onChange={handleChange}>
            <option value="">ยังไม่มอบหมาย</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {memberLabel(m)} ({ROLE_LABELS[m.role]})
              </option>
            ))}
          </select>
        </label>

        <label>
          ให้ใครเห็นงานนี้บ้าง (เลือกได้หลายกลุ่ม — ไม่เลือกเลย = ทุกคนในอู่เห็นได้)
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {groups.map((g) => {
              const isSelected = jobGroupIds.includes(g.group_id);
              return (
                <button
                  key={g.group_id}
                  type="button"
                  onClick={() => toggleJobGroup(g.group_id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: 20,
                    border: "1px solid var(--border-strong)",
                    background: isSelected ? "#2563eb" : "var(--surface)",
                    color: isSelected ? "white" : "var(--text)",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                >
                  {isSelected ? "✓ " : ""}
                  {g.name}
                </button>
              );
            })}
            {groups.length === 0 && (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                ยังไม่มีกลุ่มในอู่นี้ — ไปสร้างที่ /admin/groups ก่อน
              </span>
            )}
          </div>
        </label>

        <label>
          ชื่อลูกค้า
          <input type="text" name="customer_name" value={job.customer_name || ""} onChange={handleChange} />
        </label>

        <label>
          เบอร์โทรลูกค้า
          <input type="tel" name="customer_phone" value={job.customer_phone || ""} onChange={handleChange} />
        </label>

        <label>
          ที่อยู่ลูกค้า (จำเป็นสำหรับออกใบกำกับภาษี)
          <input type="text" name="customer_address" value={job.customer_address || ""} onChange={handleChange} />
        </label>

        <label>
          ทะเบียนรถ
          <input type="text" name="license_plate" value={job.license_plate || ""} onChange={handleChange} />
        </label>

        <label>
          ยี่ห้อรถ
          <input type="text" name="car_brand" value={job.car_brand || ""} onChange={handleChange} />
        </label>

        <label>
          รุ่นรถ
          <input type="text" name="car_model" value={job.car_model || ""} onChange={handleChange} />
        </label>

        {job.car_year_display && (
          <label>
            ปีที่ผลิต
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                border: "1px solid var(--border-strong)",
                background: "var(--surface-dim)",
                color: "var(--text)",
                fontSize: 14,
              }}
            >
              {job.car_year_display}
            </div>
          </label>
        )}

        <label>
          ที่มา
          <select name="source_type" value={job.source_type || ""} onChange={handleChange}>
            <option value="">— เลือก —</option>
            {JOB_SOURCE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div style={{ fontSize: 13, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 6 }}>
          แผนภาพจุดเสียหาย
          <CarDamageDiagram
            points={job.damage_points || []}
            onChange={(pts) => setJob((j) => ({ ...j, damage_points: pts }))}
            carType={job.car_diagram_type || "sedan"}
            onCarTypeChange={(type) => setJob((j) => ({ ...j, car_diagram_type: type }))}
          />
        </div>

        <label>
          หมายเหตุ
          <input type="text" name="notes" value={job.notes || ""} onChange={handleChange} />
        </label>

        <div className="card-sub" style={{ fontSize: 12 }}>
          รับเข้าเมื่อ {new Date(job.created_at).toLocaleString("th-TH")}
          {job.updated_at && <> · แก้ไขล่าสุด {new Date(job.updated_at).toLocaleString("th-TH")}</>}
        </div>

        <button type="submit" disabled={saving}>
          {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
        </button>
      </form>

      {/* ================= Phase 3: ราคาซื้อรถ + กำไรจากอะไหล่ที่ถอด ================= */}
      <div style={{ marginTop: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>💵 ต้นทุน-กำไร (อะไหล่ถอดจากคันนี้)</h2>

        <label>
          ราคาซื้อรถทั้งคัน (ก่อนถอดแยกขาย)
          <input
            type="number"
            value={job.vehicle_purchase_price ?? ""}
            onChange={(e) => setJob((j) => ({ ...j, vehicle_purchase_price: e.target.value }))}
            placeholder="เช่น 300000"
          />
        </label>

        <Link
          href={`/add?job_id=${jobId}`}
          className="no-print"
          style={{
            display: "block",
            textAlign: "center",
            marginTop: 10,
            marginBottom: 12,
            padding: 10,
            borderRadius: 8,
            border: "1px dashed var(--border-strong)",
            background: "transparent",
            color: "var(--text-muted)",
            fontSize: 13,
            textDecoration: "none",
          }}
        >
          + เพิ่มอะไหล่จากงานนี้
        </Link>

        {linkedParts.length === 0 ? (
          <div className="empty" style={{ padding: 16 }}>
            ยังไม่มีอะไหล่ที่ผูกกับงานนี้
          </div>
        ) : (
          <div style={{ fontSize: 13, marginTop: 8 }}>
            {(() => {
              const soldParts = linkedParts.filter((p) => (p.sold_quantity || 0) > 0);
              const soldTotal = linkedParts.reduce((sum, p) => sum + (p.sold_total || 0), 0);
              const purchasePrice = Number(job.vehicle_purchase_price) || 0;
              const profit = soldTotal - purchasePrice;

              return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ color: "var(--text-muted)" }}>อะไหล่ทั้งหมดที่ถอด</span>
                    <span>{linkedParts.length} ชิ้น</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
                    <span style={{ color: "var(--text-muted)" }}>ขายแล้ว</span>
                    <span>
                      {soldParts.length} ชิ้น · {soldTotal.toLocaleString()} บาท
                    </span>
                  </div>
                  {purchasePrice > 0 && (
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "8px 0",
                        borderTop: "1px solid var(--border-strong)",
                        marginTop: 6,
                        fontWeight: 700,
                        color: profit >= 0 ? "var(--success-text)" : "var(--danger-text)",
                      }}
                    >
                      <span>กำไรโดยประมาณ (เทียบเฉพาะที่ขายแล้ว)</span>
                      <span>{profit.toLocaleString()} บาท</span>
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
                    * เป็นตัวเลขประมาณการเทียบยอดขายสะสมกับราคาซื้อรถทั้งคัน ยังไม่รวมค่าซ่อม/ค่าแรงถอดแยก
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* ================= Phase E: ขั้นตอนการทำงาน ================= */}
      <div style={{ marginTop: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>📝 ขั้นตอนการทำงาน</h2>

        {workflowSteps.map((step, index) => (
          <div
            className="card"
            key={step.step_id}
            style={{ cursor: "default", alignItems: "center", flexWrap: "wrap" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <button
                type="button"
                onClick={() => handleMoveStep(index, -1)}
                disabled={index === 0}
                style={{ border: "none", background: "transparent", color: index === 0 ? "var(--border-strong)" : "var(--text-muted)", cursor: index === 0 ? "default" : "pointer", fontSize: 14, padding: 0 }}
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => handleMoveStep(index, 1)}
                disabled={index === workflowSteps.length - 1}
                style={{ border: "none", background: "transparent", color: index === workflowSteps.length - 1 ? "var(--border-strong)" : "var(--text-muted)", cursor: index === workflowSteps.length - 1 ? "default" : "pointer", fontSize: 14, padding: 0 }}
              >
                ▼
              </button>
            </div>

            <div className="card-body" style={{ flex: 1, minWidth: 140 }}>
              <div className="card-title" style={{ fontSize: 14 }}>
                {index + 1}. {step.step_name}
              </div>
              <div className="card-sub">
                {step.status === "done" && step.completed_at
                  ? `✅ เสร็จเมื่อ ${new Date(step.completed_at).toLocaleString("th-TH")}`
                  : step.status === "in_progress"
                  ? "🔧 กำลังทำ"
                  : step.status === "skipped"
                  ? "⏭️ ข้าม"
                  : "⏳ ยังไม่เริ่ม"}
              </div>
            </div>

            <select
              value={step.assigned_to || ""}
              onChange={(e) => handleStepAssigneeChange(step.step_id, e.target.value)}
              style={{ fontSize: 12, padding: 8, width: 120 }}
            >
              <option value="">ไม่มอบหมาย</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {memberLabel(m)}
                </option>
              ))}
            </select>

            <select
              value={step.status}
              onChange={(e) => handleStepStatusChange(step.step_id, e.target.value)}
              style={{ fontSize: 12, padding: 8, width: 110 }}
            >
              <option value="pending">ยังไม่เริ่ม</option>
              <option value="in_progress">กำลังทำ</option>
              <option value="done">เสร็จแล้ว</option>
              <option value="skipped">ข้าม</option>
            </select>

            <button
              type="button"
              onClick={() => handleDeleteStep(step.step_id)}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid var(--danger-border)",
                background: "transparent",
                color: "var(--danger-text)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              ลบ
            </button>
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            type="text"
            placeholder="ขั้นตอนใหม่ เช่น สั่งอะไหล่"
            value={newStepName}
            onChange={(e) => setNewStepName(e.target.value)}
            style={{ flex: 1 }}
          />
          <select
            value={newStepAssignee}
            onChange={(e) => setNewStepAssignee(e.target.value)}
            style={{ width: 130, fontSize: 12 }}
          >
            <option value="">ไม่มอบหมาย</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {memberLabel(m)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleAddStep}
            style={{
              padding: "0 16px",
              borderRadius: 8,
              border: "none",
              background: "#2563eb",
              color: "white",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + เพิ่ม
          </button>
        </div>
      </div>

      {/* ================= Phase A: รายการค่าใช้จ่าย + จัดลำดับ + VAT ================= */}
      <div style={{ marginTop: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>💰 รายการค่าใช้จ่าย</h2>

        {costItems.map((item, index) => (
          <div
            className="card"
            key={item.item_id}
            style={{ cursor: "default", alignItems: "center", justifyContent: "space-between" }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <button
                type="button"
                onClick={() => handleMoveItem(index, -1)}
                disabled={index === 0}
                style={{
                  border: "none",
                  background: "transparent",
                  color: index === 0 ? "var(--border-strong)" : "var(--text-muted)",
                  cursor: index === 0 ? "default" : "pointer",
                  fontSize: 14,
                  padding: 0,
                }}
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => handleMoveItem(index, 1)}
                disabled={index === costItems.length - 1}
                style={{
                  border: "none",
                  background: "transparent",
                  color: index === costItems.length - 1 ? "var(--border-strong)" : "var(--text-muted)",
                  cursor: index === costItems.length - 1 ? "default" : "pointer",
                  fontSize: 14,
                  padding: 0,
                }}
              >
                ▼
              </button>
            </div>

            <div className="card-body" style={{ flex: 1 }}>
              <div className="card-title" style={{ fontSize: 14 }}>
                {item.description}
              </div>
              <div className="card-sub">
                {CATEGORY_LABELS[item.category]} · จำนวน {item.quantity || 1} ·{" "}
                {Number(item.amount).toLocaleString()} บาท
                {Number(item.quantity) > 1 &&
                  ` (${(Number(item.amount) / Number(item.quantity)).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}/หน่วย)`}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleDeleteCostItem(item.item_id)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "1px solid var(--danger-border)",
                background: "transparent",
                color: "var(--danger-text)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              ลบ
            </button>
          </div>
        ))}

        {costItems.length > 0 && (
          <div style={{ padding: "10px 0", borderTop: "1px solid var(--border-strong)", marginTop: 8, fontSize: 13 }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)" }}>
              <span>ค่าแรงรวม</span>
              <span>{laborTotal.toLocaleString()} บาท</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)" }}>
              <span>ค่าอะไหล่รวม</span>
              <span>{partsTotal.toLocaleString()} บาท</span>
            </div>
            {job.vat_type === "vat7" && (
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-muted)" }}>
                <span>VAT 7%</span>
                <span>{vatAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} บาท</span>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, marginTop: 6 }}>
              <span>รวมทั้งสิ้น</span>
              <span>{grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} บาท</span>
            </div>
          </div>
        )}

        <label style={{ marginTop: 12 }}>
          VAT
          <select value={job.vat_type} onChange={handleVatChange}>
            <option value="none">Non-VAT</option>
            <option value="vat7">VAT 7%</option>
          </select>
        </label>

        {/* ค้นหาของสิ้นเปลืองจากสต็อก — เลือกแล้วตัดสต็อกอัตโนมัติตอนบันทึก */}
        <div style={{ position: "relative", marginTop: 12 }}>
          <input
            type="text"
            placeholder="🔍 ค้นหาของสิ้นเปลืองจากสต็อก (ไม่บังคับ)"
            value={consumableQuery}
            onChange={(e) => searchConsumables(e.target.value)}
            style={{ width: "100%" }}
          />
          {consumableResults.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                zIndex: 10,
                background: "var(--surface)",
                border: "1px solid var(--border-strong)",
                borderRadius: 8,
                marginTop: 4,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {consumableResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectConsumable(p)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: 10,
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text)",
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  {p.part_name} — เหลือ {p.quantity} · {p.price ? `${Number(p.price).toLocaleString()} บาท` : "ไม่มีราคา"}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedConsumablePart && (
          <div
            style={{
              fontSize: 12,
              color: "var(--zone-text)",
              background: "var(--zone-bg)",
              padding: 8,
              borderRadius: 8,
              marginTop: 8,
            }}
          >
            🔗 ผูกกับสต็อก: {selectedConsumablePart.part_name} — บันทึกแล้วจะตัดสต็อกอัตโนมัติ
          </div>
        )}

        {/* ฟอร์มเพิ่มรายการแบบเร็ว: พิมพ์ "ค่า..." จะเดาเป็นค่าแรงให้อัตโนมัติ */}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 4 }}>
            {["labor", "parts", "other"].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setNewCostItem((f) => ({ ...f, category: cat, _categoryTouched: true }))}
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid var(--border-strong)",
                  background: newCostItem.category === cat ? "#2563eb" : "var(--surface)",
                  color: newCostItem.category === cat ? "white" : "var(--text-muted)",
                  fontSize: 12,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="รายละเอียด (พิมพ์ 'ค่า...' = ค่าแรงอัตโนมัติ)"
            value={newCostItem.description}
            onChange={(e) => handleDescriptionChange(e.target.value)}
            style={{ flex: 1, minWidth: 160 }}
          />
          <input
            type="number"
            placeholder="จำนวน"
            value={newCostItem.quantity}
            onChange={(e) => setNewCostItem((f) => ({ ...f, quantity: e.target.value }))}
            style={{ width: 70 }}
            min="0.01"
            step="any"
          />
          <input
            type="number"
            placeholder="บาท (รวม)"
            value={newCostItem.amount}
            onChange={(e) => setNewCostItem((f) => ({ ...f, amount: e.target.value }))}
            style={{ width: 100 }}
          />
          <button
            type="button"
            onClick={handleAddCostItem}
            style={{
              padding: "0 16px",
              borderRadius: 8,
              border: "none",
              background: "#2563eb",
              color: "white",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + เพิ่ม
          </button>
        </div>
      </div>

      {/* ================= Phase B: เอกสาร 3 ประเภท ================= */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, marginBottom: 10 }}>🧾 เอกสาร</h2>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => handleCreateDocument("receipt")}
            disabled={creatingDoc !== null}
            style={{
              flex: 1,
              minWidth: 100,
              padding: 12,
              borderRadius: 8,
              border: "1px solid var(--border-strong)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {creatingDoc === "receipt" ? "กำลังสร้าง..." : "📋 ใบรับรถ"}
          </button>
          <button
            type="button"
            onClick={() => handleCreateDocument("quotation")}
            disabled={creatingDoc !== null}
            style={{
              flex: 1,
              minWidth: 100,
              padding: 12,
              borderRadius: 8,
              border: "1px solid var(--border-strong)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {creatingDoc === "quotation" ? "กำลังสร้าง..." : "📄 ใบเสนอราคา"}
          </button>
          <button
            type="button"
            onClick={() => handleCreateDocument("billing")}
            disabled={creatingDoc !== null}
            style={{
              flex: 1,
              minWidth: 100,
              padding: 12,
              borderRadius: 8,
              border: "1px solid var(--border-strong)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {creatingDoc === "billing" ? "กำลังสร้าง..." : "🧾 ใบแจ้งหนี้"}
          </button>
        </div>

        {documents.length > 0 && (
          <div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>เอกสารที่เคยสร้าง</div>
            {documents.map((doc) => (
              <Link
                key={doc.document_id}
                href={`/jobs/${jobId}/documents/${doc.document_id}`}
                target="_blank"
                className="card"
                style={{ textDecoration: "none", color: "inherit", padding: "10px 12px" }}
              >
                <div className="card-body" style={{ gap: 0 }}>
                  <div className="card-title" style={{ fontSize: 13 }}>
                    {DOC_TYPE_LABELS[doc.doc_type]} · {doc.doc_number}
                  </div>
                  <div className="card-sub" style={{ fontSize: 12 }}>
                    {new Date(doc.created_at).toLocaleString("th-TH")}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 24 }}>
        <button
          type="button"
          onClick={handleCopyCustomerLink}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 8,
            border: "1px solid var(--border-strong)",
            background: "var(--surface)",
            color: "var(--link)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          🔗 คัดลอกลิงก์ให้ลูกค้าดูรายการซ่อม+ค่าใช้จ่าย
        </button>
        {customerShareUrl && (
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6, wordBreak: "break-all" }}>
            {customerShareUrl}
          </div>
        )}
      </div>

      {canDelete && (
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          style={{
            marginTop: 12,
            width: "100%",
            padding: 14,
            borderRadius: 8,
            border: "1px solid var(--danger-border)",
            background: "transparent",
            color: "var(--danger-text)",
            fontSize: 15,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {deleting ? "กำลังลบ..." : "🗑️ ลบงานนี้"}
        </button>
      )}
    </div>
  );
}

export default function JobDetailPage() {
  return (
    <RequireAuth allowedRoles={["owner", "manager", "supervisor", "technician", "assistant"]}>
      <JobDetailPageContent />
    </RequireAuth>
  );
}
