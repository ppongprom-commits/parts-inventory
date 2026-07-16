"use client";

export default function IdleLogoutModal({ show, secondsLeft, onStayLoggedIn, totalSeconds }) {
  if (!show) return null;

  const progressPct = Math.max(0, Math.min(100, (secondsLeft / totalSeconds) * 100));

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 200,
        padding: 20,
      }}
    >
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border-strong)",
          borderRadius: 12,
          padding: 24,
          maxWidth: 340,
          width: "100%",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 32, marginBottom: 8 }}>⏱️</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 6 }}>
          ไม่มีการใช้งาน
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
          ระบบจะออกจากระบบอัตโนมัติใน
        </div>

        <div
          style={{
            fontSize: 36,
            fontWeight: 800,
            color: secondsLeft <= 20 ? "#f87171" : "var(--text)",
            marginBottom: 12,
          }}
        >
          {secondsLeft} วินาที
        </div>

        <div
          style={{
            width: "100%",
            height: 6,
            background: "var(--surface-alt)",
            borderRadius: 4,
            overflow: "hidden",
            marginBottom: 20,
          }}
        >
          <div
            style={{
              width: `${progressPct}%`,
              height: "100%",
              background: secondsLeft <= 20 ? "#dc2626" : "#2563eb",
              transition: "width 1s linear",
            }}
          />
        </div>

        <button
          type="button"
          onClick={onStayLoggedIn}
          style={{
            width: "100%",
            padding: 14,
            borderRadius: 8,
            border: "none",
            background: "#2563eb",
            color: "white",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ยังใช้งานอยู่
        </button>
      </div>
    </div>
  );
}
