-- ============================================================
-- Card: "Admin Role (7th role) — Maker-Checker Approval Config"
-- (ส่วนที่ 2: Approval Flow — สร้างใหม่ทั้งระบบ ไม่มี "Approval Flow" เดิมให้ reuse ตามที่การ์ด
-- สมมติไว้ — ตรวจสอบแล้วด้วย grep ทั่วโปรเจกต์ ไม่พบ table/route/UI ของ approval flow เลย)
--
-- Simplify principle (สำคัญที่สุดในการ์ด — ต้องไม่สร้างภาระให้ร้านที่ไม่ใช้ Admin เลย):
-- 1. ไม่มีแถวของร้าน = fallback ไปใช้ default table (DEFAULT_ADMIN_APPROVAL_CONFIG ใน
--    config/adminApprovalDefaults.js) อัตโนมัติ ไม่บังคับตั้งค่าก่อนใช้
-- 2. หน้า /admin/settings/admin-approvals + คิวรออนุมัติ แสดงเฉพาะร้านที่มี user role admin
--    อยู่จริงอย่างน้อย 1 คน (เช็คที่ layer แอป ไม่ใช่ตาราง — ดู 1. ด้านบน)
-- 3. Owner กด approve/reject ได้เสมอเป็น fallback สุดท้าย ไม่ว่า approver_role จะตั้งเป็นอะไร
-- 4. ร้านที่ไม่สร้าง Admin เลย = พฤติกรรม/หน้าจอเดิม 100% ไม่มี overhead ใดๆ เพิ่ม
-- ============================================================

create table if not exists admin_action_approval_config (
  id                bigint generated always as identity primary key,
  shop_id           bigint not null references shops(shop_id) on delete cascade,
  action_type       text not null check (action_type in (
    'edit_part_cost','edit_part_general','edit_part_price','reprint_document',
    'void_document','issue_credit_note','import_customers','edit_customer_contact',
    'edit_customer_credit_terms','review_duplicate_photo','confirm_duplicate_delete',
    'resolve_discrepancy_writeoff','view_reports','export_csv'
  )),
  requires_approval boolean not null default false,
  approver_role     text check (approver_role in ('owner','manager','supervisor','admin')),
  approver_user_id  uuid references auth.users(id),
  updated_by        uuid references auth.users(id),
  updated_at        timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  unique (shop_id, action_type)
);

create table if not exists pending_admin_actions (
  id               bigint generated always as identity primary key,
  shop_id          bigint not null references shops(shop_id) on delete cascade,
  action_type      text not null,
  performed_by     uuid not null references auth.users(id),
  payload          jsonb not null,
  status           text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by      uuid references auth.users(id),
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz not null default now()
);
create index if not exists idx_pending_admin_actions_shop_status on pending_admin_actions (shop_id, status);

alter table admin_action_approval_config enable row level security;
alter table pending_admin_actions enable row level security;

drop policy if exists "shop members can view approval config" on admin_action_approval_config;
create policy "shop members can view approval config" on admin_action_approval_config
  for select using (is_shop_member(shop_id, array['owner','manager','admin']));

drop policy if exists "owner/manager can manage approval config" on admin_action_approval_config;
create policy "owner/manager can manage approval config" on admin_action_approval_config
  for all using (is_shop_member(shop_id, array['owner','manager']))
  with check (is_shop_member(shop_id, array['owner','manager']));

drop policy if exists "requester or owner/manager/admin can view pending actions" on pending_admin_actions;
create policy "requester or owner/manager/admin can view pending actions" on pending_admin_actions
  for select using (
    performed_by = auth.uid()
    or is_shop_member(shop_id, array['owner','manager','admin'])
  );

drop policy if exists "eligible roles can create pending actions" on pending_admin_actions;
create policy "eligible roles can create pending actions" on pending_admin_actions
  for insert with check (
    performed_by = auth.uid()
    and is_shop_member(shop_id, array['owner','manager','admin'])
  );

-- ------------------------------------------------------------
-- Maker-checker decision: security-definer RPC แทน RLS update policy ตรงๆ เพราะกติกา
-- "Owner approve/reject ได้เสมอไม่ว่า approver_role จะตั้งเป็นอะไร" (การ์ด ตัดสินใจแล้ว 21 ก.ค.
-- 2026) ต้องดู role จริงของผู้เรียก + config ของ action นั้น + fallback logic ร่วมกัน — เขียนเป็น
-- boolean expression เดียวใน USING clause จะอ่านยากและพลาดง่ายกว่า pattern เดียวกับ
-- update_member_role() ใน auth_multi_tenant_schema.sql — RPC ระดับ tenant ใช้ auth.uid() จาก
-- session ของผู้เรียกตรงๆ (ไม่ใช่ platform_* RPC ที่ผ่าน service_role)
-- ------------------------------------------------------------
create or replace function decide_pending_admin_action(p_action_id bigint, p_decision text, p_reason text default null)
returns pending_admin_actions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action pending_admin_actions;
  v_caller_role text;
  v_config admin_action_approval_config;
begin
  if p_decision not in ('approved','rejected') then
    raise exception 'p_decision ต้องเป็น approved หรือ rejected เท่านั้น';
  end if;

  select * into v_action from pending_admin_actions where id = p_action_id for update;
  if v_action is null then
    raise exception 'ไม่พบรายการรออนุมัติ id=%', p_action_id;
  end if;
  if v_action.status <> 'pending' then
    raise exception 'รายการนี้ถูกตัดสินใจไปแล้ว (status=%)', v_action.status;
  end if;

  select role into v_caller_role from shop_members
  where shop_id = v_action.shop_id and user_id = auth.uid() and status = 'active';

  select * into v_config from admin_action_approval_config
  where shop_id = v_action.shop_id and action_type = v_action.action_type;

  -- Owner ผ่านเสมอ (fallback สุดท้าย) — เช็คก่อน โดยไม่สนใจ approver_role/approver_user_id เลย
  if v_caller_role is distinct from 'owner'
     and (v_config is null or v_config.approver_role is distinct from v_caller_role)
     and (v_config is null or v_config.approver_user_id is distinct from auth.uid())
  then
    raise exception 'ไม่มีสิทธิ์อนุมัติรายการนี้';
  end if;

  update pending_admin_actions
  set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), rejection_reason = p_reason
  where id = p_action_id
  returning * into v_action;

  return v_action;
end;
$$;

grant execute on function decide_pending_admin_action(bigint, text, text) to authenticated;

-- ------------------------------------------------------------
-- Verification query (run manually after applying):
--   select * from pg_policies where tablename in ('admin_action_approval_config','pending_admin_actions');
--   select proname, prosecdef from pg_proc where proname = 'decide_pending_admin_action';
-- ------------------------------------------------------------
