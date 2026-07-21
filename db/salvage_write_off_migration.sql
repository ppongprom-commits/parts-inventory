-- ============================================================
-- Card: "Salvage vehicle cost allocation — edge cases to design for" (Priority: Medium)
--
-- Scope this run: ONLY edge case 1 (write-off), and only its explicitly-decided generic-action
-- requirement — not the full relative-sales-value cost allocation engine itself (Σ allocated_cost
-- = purchase_price), which needs `parts.allocated_cost` to exist at all first and is a much larger
-- undertaking tied to the still-unstarted Accounting Module. There is currently NOTHING in this
-- schema that computes or stores allocated_cost — this migration does not add it either, since
-- doing so without the full allocation engine would be a half-built column nobody writes to.
--
-- ✅ ตัดสินใจแล้วในการ์ด (19 ก.ค. 2026): "กลไก write-off นี้ต้องออกแบบเป็น generic action บนตัว
-- part ไม่ผูกกับ salvage อย่างเดียว เพราะการ์ด 'โอนอะไหล่ข้ามสาขา' นำ mechanism นี้ไปใช้ซ้ำสำหรับกรณี
-- ของขาด/เสียหายระหว่างขนส่งข้ามสาขาด้วย" — implemented as a generic action on ANY part, not
-- gated to salvage-sourced parts only, so Branch Transfer (still Not started) can reuse the same
-- 3 columns later without a schema change.
--
-- Assumption made for an explicitly still-open ❓ in the card ("Write-off ต้องมี approval ไหม —
-- owner เท่านั้น?"): NOT resolved by the card. Assumed no separate approval workflow — gated to
-- the same roles that can already edit parts (owner/manager/supervisor/technician/assistant, same
-- as the existing "ซ่อนอะไหล่" soft-delete action) rather than inventing an owner-only gate the
-- card never actually decided. Flagged here so คุณอั้ม can tighten this later if a real approval
-- step is wanted.
-- ============================================================

alter table parts add column if not exists write_off_reason text;
alter table parts add column if not exists written_off_at timestamptz;
alter table parts add column if not exists written_off_by uuid references auth.users(id);

-- ------------------------------------------------------------
-- Verification query (run manually after applying):
--   select id, part_name, is_active, write_off_reason, written_off_at from parts
--   where write_off_reason is not null;
-- ------------------------------------------------------------
