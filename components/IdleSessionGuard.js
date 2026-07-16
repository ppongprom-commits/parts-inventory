"use client";

import { useIdleTimeout } from "../lib/useIdleTimeout";
import IdleLogoutModal from "./IdleLogoutModal";
import { GLOBAL_SESSION_CONFIG } from "../config/subscriptionTiers";

/**
 * ครอบ children ด้วยระบบตรวจจับ idle + auto logout
 * onTimeout ควรผูกกับฟังก์ชัน logout จริง เช่น:
 *   onTimeout={() => { supabase.auth.signOut(); router.push('/login'); }}
 *
 * ตอนนี้ระบบยังไม่มี Auth จริง — ใส่ onTimeout เป็น placeholder ไว้ก่อน
 * พร้อมต่อเข้ากับ auth flow ทันทีที่ทำ login เสร็จ
 */
export default function IdleSessionGuard({ children, onTimeout, enabled = true }) {
  const { showWarning, secondsLeft, stayLoggedIn } = useIdleTimeout({
    onTimeout: onTimeout || (() => console.warn("Idle timeout — ยังไม่ได้ผูก logout function จริง")),
    enabled,
  });

  return (
    <>
      {children}
      <IdleLogoutModal
        show={showWarning}
        secondsLeft={secondsLeft}
        totalSeconds={GLOBAL_SESSION_CONFIG.idleWarningCountdownSeconds}
        onStayLoggedIn={stayLoggedIn}
      />
    </>
  );
}
