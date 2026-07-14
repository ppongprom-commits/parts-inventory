"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../lib/AuthProvider";
import { SUBSCRIPTION_TIERS, getTierConfig } from "../../config/subscriptionTiers";

const STATUS_OPTIONS = ["trialing", "active", "past_due", "suspended", "canceled"];
const PLAN_OPTIONS = Object.keys(SUBSCRIPTION_TIERS);

const STATUS_STYLE = {
  trialing: { label: "ทดลองใช้", color: "#93c5fd" },
  active: { label: "ใช้งานปกติ", color: "#86efac" },
  past_due: { label: "ค้างชำระ", color: "#fbbf24" },
  suspended: { label: "ระงับใช้งาน", color: "#f87171" },
  canceled: { label: "ยกเลิกแล้ว", color: "#6b7280" },
};

const ROLE_LABELS = {
  owner: "เจ้าของ",
  manager: "ผู้จัดการ",
  supervisor: "หัวหน้างาน",
  technician: "ช่าง",
  assistant: "ผู้ช่วยช่าง",
};

async function authedFetch(path, options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${session?.access_token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "เกิดข้อผิดพลาด");
  return json.data;
}

function ShopDetailPanel({ shop, onClose, onSaved }) {
  const [shopName, setShopName] = useState(shop.shop_name);
  const [status, setStatus] = useState(shop.subscription_status);
  const [plan, setPlan] = useState(shop.subscription_plan);
  const [trialEndsAt, setTrialEndsAt] = useState(
    shop.trial_ends_at ? shop.trial_ends_at.slice(0, 10) : ""
  );
  const [periodEnd, setPeriodEnd] = useState(
    shop.current_period_end ? shop.current_period_end.slice(0, 10) : ""
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const [members, setMembers] = useState(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [showMembers, setShowMembers] = useState(false);

  async function handleSave() {
    if (!shopName.trim()) {
      setMsg({ type: "error", text: "ชื่ออู่ห้ามเว้นว่าง" });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await authedFetch("/api/platform/shops", {
        method: "PATCH",
        body: JSON.stringify({
          shop_id: shop.shop_id,
          shop_name: shopName.trim(),
          subscription_status: status,
          subscription_plan: plan,
          trial_ends_at: trialEndsAt || null,
          current_period_end: periodEnd || null,
        }),
      });
      setMsg({ type: "success", text: "บันทึกแล้ว ✅" });
      onSaved();
    } catch (err) {
      setMsg({ type: "error", text: "บันทึกไม่สำเร็จ: " + err.message });
    } finally {
      setSaving(false);
    }
  }

  async function toggleMembers() {
    if (showMembers) {
      setShowMembers(false);
      return;
    }
    setShowMembers(true);
    if (members === null) {
      setMembersLoading(true);
      try {
        const data = await authedFetch(`/api/platform/shops/${shop.shop_id}/members`);
        setMembers(data);
      } catch (err) {
        setMsg({ type: "error", text: "โหลดสมาชิกไม่สำเร็จ: " + err.message });
      } finally {
        setMembersLoading(false);
      }
    }
  }

  return (
    <div
      style={{
        border: "1px solid #333844",
        borderRadius: 8,
        padding: 16,
        marginTop: -4,
        marginBottom: 12,
        background: "#14161b",
      }}
    >
      {msg && <div className={`msg ${msg.type}`} style={{ marginBottom: 12 }}>{msg.text}</div>}

      <label>
        ชื่ออู่/ร้าน
        <input type="text" value={shopName} onChange={(e) => setShopName(e.target.value)} />
      </label>

      <label>
        สถานะ subscription
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_STYLE[s]?.label || s}
            </option>
          ))}
        </select>
      </label>

      <label>
        Plan
        <select value={plan} onChange={(e) => setPlan(e.target.value)}>
          {PLAN_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {SUBSCRIPTION_TIERS[p].label} (
              {SUBSCRIPTION_TIERS[p].priceMonthly === null
                ? "ติดต่อฝ่ายขาย"
                : `${SUBSCRIPTION_TIERS[p].priceMonthly.toLocaleString()} บาท/ด.`}
              )
            </option>
          ))}
        </select>
      </label>

      <div style={{ display: "flex", gap: 8 }}>
        <label style={{ flex: 1 }}>
          Trial หมดอายุ
          <input type="date" value={trialEndsAt} onChange={(e) => setTrialEndsAt(e.target.value)} />
        </label>
        <label style={{ flex: 1 }}>
          ครบรอบบิลถัดไป
          <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </label>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 8,
            border: "none",
            background: "#2563eb",
            color: "white",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {saving ? "กำลังบันทึก..." : "บันทึก"}
        </button>
        <button
          type="button"
          onClick={toggleMembers}
          style={{
            padding: "0 16px",
            borderRadius: 8,
            border: "1px solid #333844",
            background: "transparent",
            color: "#93c5fd",
            cursor: "pointer",
          }}
        >
          👥 {showMembers ? "ซ่อนสมาชิก" : "ดูสมาชิก"}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "0 16px",
            borderRadius: 8,
            border: "1px solid #333844",
            background: "transparent",
            color: "#a8adb8",
            cursor: "pointer",
          }}
        >
          ปิด
        </button>
      </div>

      {showMembers && (
        <div style={{ marginTop: 12, borderTop: "1px solid #262a33", paddingTop: 12 }}>
          {membersLoading && <div style={{ fontSize: 13, color: "#6b7280" }}>กำลังโหลด...</div>}
          {members?.length === 0 && (
            <div style={{ fontSize: 13, color: "#6b7280" }}>ยังไม่มีสมาชิก</div>
          )}
          {members?.map((m) => (
            <div
              key={m.member_id}
              style={{
                fontSize: 13,
                padding: "6px 0",
                borderBottom: "1px solid #262a33",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <span>{m.email || "ไม่พบอีเมล"}</span>
              <span style={{ color: "#a8adb8" }}>
                {ROLE_LABELS[m.role] || m.role} · {m.status === "disabled" ? "🚫 ปิดใช้งาน" : "✅"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PlatformAdminPage() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();

  const [tab, setTab] = useState("shops"); // "shops" | "users"

  const [shops, setShops] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expandedShopId, setExpandedShopId] = useState(null);

  const [users, setUsers] = useState(null);
  const [usersError, setUsersError] = useState(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    fetchShops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, session]);

  useEffect(() => {
    if (tab === "users" && users === null && !authLoading && session) {
      fetchUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, authLoading, session]);

  async function fetchUsers() {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const data = await authedFetch("/api/platform/users");
      setUsers(data);
    } catch (err) {
      setUsersError(err.message);
    } finally {
      setUsersLoading(false);
    }
  }

  async function fetchShops() {
    setLoading(true);
    setError(null);
    try {
      const data = await authedFetch("/api/platform/shops");
      setShops(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const filteredShops = useMemo(() => {
    if (!shops) return [];
    return shops.filter((s) => {
      const matchSearch =
        !search ||
        s.shop_name?.toLowerCase().includes(search.toLowerCase()) ||
        s.owner_email?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = !statusFilter || s.subscription_status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [shops, search, statusFilter]);

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    if (!userSearch) return users;
    const q = userSearch.toLowerCase();
    return users.filter(
      (u) =>
        u.email?.toLowerCase().includes(q) ||
        u.memberships.some(
          (m) =>
            m.shop_name?.toLowerCase().includes(q) ||
            m.contact_name?.toLowerCase().includes(q) ||
            m.contact_phone?.includes(q)
        )
    );
  }, [users, userSearch]);

  const stats = useMemo(() => {
    if (!shops) return null;
    const byStatus = shops.reduce((acc, s) => {
      acc[s.subscription_status] = (acc[s.subscription_status] || 0) + 1;
      return acc;
    }, {});
    const mrr = shops
      .filter((s) => s.subscription_status === "active")
      .reduce((sum, s) => {
        const tier = getTierConfig(s.subscription_plan);
        return sum + (tier.priceMonthly || 0);
      }, 0);
    return { total: shops.length, byStatus, mrr };
  }, [shops]);

  if (authLoading || (tab === "shops" && loading)) {
    return (
      <div className="container">
        <div className="empty">กำลังโหลด...</div>
      </div>
    );
  }

  if (tab === "shops" && error) {
    return (
      <div className="container">
        <div className="header">
          <h1>🛠️ Platform Admin</h1>
          <Link href="/" className="nav-link secondary">
            ← กลับ
          </Link>
        </div>
        <div className="msg error">{error}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <h1>🛠️ Platform Admin</h1>
        <Link href="/" className="nav-link secondary">
          ← กลับ
        </Link>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setTab("shops")}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #333844",
            background: tab === "shops" ? "#2563eb" : "transparent",
            color: tab === "shops" ? "white" : "#a8adb8",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          🏪 อู่ทั้งหมด
        </button>
        <button
          type="button"
          onClick={() => setTab("users")}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #333844",
            background: tab === "users" ? "#2563eb" : "transparent",
            color: tab === "users" ? "white" : "#a8adb8",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: 13,
          }}
        >
          👤 ผู้ใช้ทั้งหมด
        </button>
      </div>

      {tab === "shops" && (
        <>
      {/* สรุปสถิติ */}
      <div className="filters" style={{ marginBottom: 16 }}>
        <div className="tag" style={{ fontSize: 13 }}>
          ทั้งหมด {stats.total} อู่
        </div>
        {STATUS_OPTIONS.map(
          (status) =>
            stats.byStatus[status] && (
              <div
                key={status}
                className="tag"
                style={{ fontSize: 13, color: STATUS_STYLE[status]?.color }}
              >
                {STATUS_STYLE[status]?.label}: {stats.byStatus[status]}
              </div>
            )
        )}
        <div className="tag zone" style={{ fontSize: 13 }}>
          💰 MRR ≈ {stats.mrr.toLocaleString()} บาท/เดือน
        </div>
      </div>

      {/* Search + filter */}
      <div className="filters" style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="ค้นหาชื่ออู่ / อีเมลเจ้าของ"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">ทุกสถานะ</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_STYLE[s]?.label}
            </option>
          ))}
        </select>
      </div>

      {filteredShops.length === 0 && <div className="empty">ไม่พบอู่ที่ตรงกับเงื่อนไข</div>}

      {filteredShops.map((shop) => (
        <div key={shop.shop_id} style={{ marginBottom: 10 }}>
          <div
            className="card"
            onClick={() =>
              setExpandedShopId(expandedShopId === shop.shop_id ? null : shop.shop_id)
            }
          >
            <div className="card-body" style={{ flex: 1 }}>
              <div className="card-title">{shop.shop_name}</div>
              <div className="card-sub">{shop.owner_email || "ไม่พบอีเมลเจ้าของ"}</div>

              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                <span
                  className="tag"
                  style={{ color: STATUS_STYLE[shop.subscription_status]?.color || "#a8adb8" }}
                >
                  {STATUS_STYLE[shop.subscription_status]?.label || shop.subscription_status}
                </span>
                <span className="tag">{SUBSCRIPTION_TIERS[shop.subscription_plan]?.label || shop.subscription_plan}</span>
                <span className="tag">👥 {shop.active_member_count} คน</span>
              </div>

              <div className="card-sub" style={{ marginTop: 6, fontSize: 12 }}>
                สมัครเมื่อ {new Date(shop.created_at).toLocaleDateString("th-TH")}
                {shop.trial_ends_at && (
                  <> · trial หมดอายุ {new Date(shop.trial_ends_at).toLocaleDateString("th-TH")}</>
                )}
                {shop.current_period_end && (
                  <> · ครบรอบบิล {new Date(shop.current_period_end).toLocaleDateString("th-TH")}</>
                )}
              </div>
            </div>
          </div>

          {expandedShopId === shop.shop_id && (
            <ShopDetailPanel
              shop={shop}
              onClose={() => setExpandedShopId(null)}
              onSaved={fetchShops}
            />
          )}
        </div>
      ))}
        </>
      )}

      {tab === "users" && (
        <>
          <div className="filters" style={{ marginBottom: 16 }}>
            <input
              type="text"
              placeholder="ค้นหาอีเมล / ชื่อผู้ติดต่อ / เบอร์โทร / ชื่ออู่"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
          </div>

          {usersLoading && <div className="empty">กำลังโหลด...</div>}
          {usersError && <div className="msg error">{usersError}</div>}

          {!usersLoading && users && (
            <div className="tag" style={{ fontSize: 13, marginBottom: 12, display: "inline-block" }}>
              ทั้งหมด {users.length} คน
            </div>
          )}

          {!usersLoading && filteredUsers.length === 0 && users !== null && (
            <div className="empty">ไม่พบผู้ใช้ที่ตรงกับเงื่อนไข</div>
          )}

          {filteredUsers.map((u) => (
            <div className="card" key={u.user_id} style={{ cursor: "default", marginBottom: 10 }}>
              <div className="card-body" style={{ flex: 1 }}>
                <div className="card-title">
                  {u.email || "(ไม่พบอีเมล)"}
                  {u.is_platform_admin && (
                    <span
                      className="tag"
                      style={{ marginLeft: 8, fontSize: 11, color: "#fbbf24" }}
                    >
                      ⭐ Platform Admin
                    </span>
                  )}
                </div>
                <div className="card-sub" style={{ fontSize: 12 }}>
                  สมัครเมื่อ {new Date(u.created_at).toLocaleDateString("th-TH")}
                  {u.last_sign_in_at && (
                    <> · login ล่าสุด {new Date(u.last_sign_in_at).toLocaleDateString("th-TH")}</>
                  )}
                </div>

                {u.memberships.length === 0 ? (
                  <div className="card-sub" style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                    ยังไม่สังกัดอู่ไหน
                  </div>
                ) : (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {u.memberships.map((m) => (
                      <div
                        key={m.shop_id}
                        style={{
                          fontSize: 12,
                          padding: "6px 8px",
                          borderRadius: 6,
                          background: "#1a1d24",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                      >
                        <span>
                          🏪 {m.shop_name} · {ROLE_LABELS[m.role] || m.role}
                          {m.status === "disabled" && " · 🚫 ปิดใช้งาน"}
                        </span>
                        {(m.contact_name || m.contact_phone) && (
                          <span style={{ color: "#a8adb8" }}>
                            {m.contact_name} {m.contact_phone && `· ${m.contact_phone}`}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
