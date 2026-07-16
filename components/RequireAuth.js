"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/AuthProvider";
import IdleSessionGuard from "./IdleSessionGuard";
import AppShell from "./AppShell";

export default function RequireAuth({ children, allowedRoles }) {
  const router = useRouter();
  const { loading, session, memberships, currentRole, signOut } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    if (memberships.length === 0) {
      router.replace("/signup"); // login แล้วแต่ยังไม่มีอู่เลย (เคสแปลก) ให้ไปสร้างอู่
    }
  }, [loading, session, memberships, router]);

  if (loading) {
    return (
      <div className="container">
        <div className="empty">กำลังตรวจสอบสิทธิ์...</div>
      </div>
    );
  }

  if (!session || memberships.length === 0) {
    return null; // กำลัง redirect อยู่
  }

  if (allowedRoles && currentRole && !allowedRoles.includes(currentRole)) {
    return (
      <div className="container">
        <div className="msg error">
          บทบาท &quot;{currentRole}&quot; ของคุณไม่มีสิทธิ์เข้าหน้านี้
        </div>
      </div>
    );
  }

  return (
    <IdleSessionGuard
      onTimeout={async () => {
        await signOut();
        router.replace("/login?reason=idle");
      }}
    >
      <AppShell>{children}</AppShell>
    </IdleSessionGuard>
  );
}
