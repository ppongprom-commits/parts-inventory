-- ============================================================
-- Card: "Platform-controlled shop features" (24 ก.ค. 2026)
--
-- ก่อนหน้านี้ 3 อย่างนี้เป็น self-serve toggle ที่ owner/manager กดเองได้จาก /admin ของร้านตัวเอง:
--   1. shops.force_zone_scan_confirmation ("บังคับสแกน QR ยืนยันตำแหน่ง")
--   2. Multi-branch (จัดการสาขา) — branch CRUD ทั้งหมด
--   3. shops.accounting_module_enabled ("โมดูลบัญชี")
--
-- ตัดสินใจแล้ว (product owner, ไม่ re-litigate ในไฟล์นี้): ทั้ง 3 อย่างย้ายมาเป็น
-- platform-admin-only — จัดการจากแผง /platform-admin ต่อร้าน ไม่ใช่ shop owner/manager
-- กดเองอีกต่อไป เหตุผลสถาปัตยกรรม: ฟีเจอร์เหล่านี้กำหนด "สิทธิ์ที่ร้านนี้ใช้งานได้" (entitlement)
-- ไม่ใช่ preference ทั่วไปของร้าน จึงควรอยู่ในมือทีมงาน/ฝ่ายขายเหมือน subscription_plan/
-- subscription_status เดิม (permission matrix เดียวกับ BILLING_ROLES = ["super_admin"] ที่
-- app/api/platform/shops/route.js ใช้อยู่แล้ว)
--
-- บั๊กที่ปิดไปด้วยผลพลอยได้จากการย้าย: shops.force_zone_scan_confirmation ไม่เคย GRANT UPDATE
-- ให้ authenticated เลย (ยืนยันด้วย has_column_privilege('authenticated','public.shops',
-- 'force_zone_scan_confirmation','UPDATE') = false บน staging) การ์ด "ย้ายอะไหล่ระหว่าง Zone"
-- เดิม (db/zone_move_action_migration.sql) จึงเขียนโค้ด UPDATE shops ตรงๆ จาก browser ที่ silently
-- fail มาตลอด — แก้ตรงนี้ด้วยการเปลี่ยนเส้นทางเป็น RPC platform_set_shop_feature() ที่ SECURITY
-- DEFINER แทน (ไม่ได้ "แก้บั๊ก" ด้วยการ grant คอลัมน์เพิ่ม ตามที่การ์ดตัดสินใจไว้ตรงๆ)
--
-- Permission matrix (มิติเดียวกับ BILLING_ROLES ของ app/api/platform/shops/route.js):
--   force_zone_scan_confirmation / branches_feature_enabled / accounting_module_enabled
--     toggle ได้เฉพาะ super_admin (ทั้ง 3 ตัวกำหนด entitlement ของร้าน = billing-adjacent)
--   Branch CRUD จริง (สร้าง/เปลี่ยนชื่อ/read-only) — super_admin + support (งาน routine
--     support เหมือน join-as-support ไม่ใช่การตัดสินใจเรื่อง billing)
--   analyst — read-only ทุกจุด (ดู GET /api/platform/shops/[shopId]/branches)
--
-- ⚠️ Grandfathering (สำคัญ — ห้าม reset ค่าที่มีอยู่แล้ว): accounting_module_enabled และ
-- force_zone_scan_confirmation ของทุกร้านคงค่าเดิมไว้ 100% (ไม่มี data migration สำหรับ 2
-- คอลัมน์นี้) branches_feature_enabled เป็นคอลัมน์ใหม่เท่านั้นที่ต้อง backfill: ร้านที่มีมากกว่า
-- 1 แถวใน branches อยู่แล้ว (= ใช้งาน multi-branch จริงอยู่ก่อนหน้านี้) ตั้งเป็น true อัตโนมัติ
-- ร้านอื่นเริ่มที่ false ต้องรอ platform-admin เปิดให้ก่อนถึงจะสร้างสาขาที่ 2 ได้
-- ============================================================

-- ------------------------------------------------------------
-- 1) shops.branches_feature_enabled — เกตใหม่ที่ "AND" กับ tier limit เดิม (config/
--    subscriptionTiers.js maxBranches / fn_tier_max_branches) ไม่ใช่แทนที่ — ร้านต้องผ่านทั้ง 2
--    เงื่อนไขถึงจะสร้างสาขาที่ 2 ขึ้นไปได้: (1) platform-admin เปิดฟีเจอร์นี้ให้ก่อน (2) ยังไม่ถึง
--    maxBranches ของ tier ปัจจุบัน
-- ------------------------------------------------------------
alter table shops add column if not exists branches_feature_enabled boolean not null default false;
comment on column shops.branches_feature_enabled is
  'platform-admin ต้องเปิดให้ก่อน (default ปิด) ร้านถึงจะสร้างสาขาที่ 2 ขึ้นไปได้ — AND กับ tier limit เดิม (maxBranches/fn_tier_max_branches) ไม่ใช่แทนที่ — เปิด/ปิดผ่าน RPC platform_set_shop_feature() เท่านั้น (super_admin เท่านั้น) ดู app/platform-admin';

-- Grandfathering: ร้านที่มีมากกว่า 1 branch อยู่แล้ว ณ วันที่ apply migration นี้ = กำลังใช้
-- multi-branch จริงอยู่ก่อนหน้า (สร้างผ่าน /admin/branches เดิมก่อนย้ายมาเป็น platform-admin-only)
-- ต้องไม่ถูกล็อกฟีเจอร์ทันทีที่ apply migration — ร้านอื่นที่ยังมีแค่ 1 สาขา (>99%) เริ่มที่ false
update shops
set branches_feature_enabled = true
where shop_id in (
  select shop_id from branches group by shop_id having count(*) > 1
);

-- ------------------------------------------------------------
-- 2) platform_audit_log.action — เพิ่ม action string ใหม่ 2 ตัวที่ RPC ด้านล่างจะ insert
--    ('set_feature' สำหรับ platform_set_shop_feature, 'accounting_module_toggled' สำหรับ
--    set_accounting_module_enabled เวอร์ชันใหม่ — เดิมฟังก์ชันนี้ไม่เคยเขียน audit log เลย
--    เพิ่มเข้ามาตอนนี้เพราะย้ายมาเป็น super_admin-only แล้ว ควร audit เหมือนฟีเจอร์อื่นที่กระทบ
--    entitlement ของร้าน — ดูบทเรียนจาก db/platform_admin_rpc_auth_check_migration.sql ที่เคย
--    insert action string ไม่ตรงกับ CHECK constraint นี้มาก่อนจนฟังก์ชัน rollback เงียบๆ)
--    ต้อง DROP constraint เดิมก่อนเพิ่มค่าใหม่ (CHECK ผูกกับชื่อ constraint ตายตัว ไม่มี "ADD VALUE"
--    แบบ enum ให้ใช้)
-- ------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'platform_audit_log_action_check') then
    alter table platform_audit_log drop constraint platform_audit_log_action_check;
  end if;
  alter table platform_audit_log add constraint platform_audit_log_action_check
    check (action = any (array[
      'subscription_edit', 'join_as_support', 'admin_added', 'admin_removed',
      'admin_role_changed', 'burst_mode_extension_override', 'revenue_journal_entry_created',
      'set_feature', 'accounting_module_toggled'
    ]));
end $$;

-- ------------------------------------------------------------
-- 3) platform_set_shop_feature — super_admin เท่านั้น toggle feature flag ระดับร้าน
--    ⚠️ Security: feature ต้องผ่าน allow-list แบบ explicit if/elsif เท่านั้น (ห้าม dynamic SQL
--    ต่อ column name จาก input ตรงๆ — RPC นี้เรียกผ่าน supabaseAdmin จาก API route แต่ก็ยังต้อง
--    ป้องกันชั้นนี้ไว้เป็น defense-in-depth เดียวกับที่ทั้งไฟล์ platform_admin_rpc_auth_check_
--    migration.sql ทำไว้กับ RPC อื่นๆ)
-- ------------------------------------------------------------
create or replace function platform_set_shop_feature(
  p_actor_user_id uuid,
  p_shop_id       bigint,
  p_feature       text,
  p_enabled       boolean
) returns shops
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_old shops;
  v_new shops;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'ไม่มีสิทธิ์ทำรายการนี้ (actor ไม่ตรงกับ session)';
  end if;

  select role into v_actor_role from platform_admins where user_id = p_actor_user_id;
  if v_actor_role is null or v_actor_role <> 'super_admin' then
    raise exception 'ไม่มีสิทธิ์เปลี่ยน feature ของร้าน (Super Admin เท่านั้น)';
  end if;

  select * into v_old from shops where shop_id = p_shop_id for update;
  if v_old is null then
    raise exception 'ไม่พบอู่ shop_id=%', p_shop_id;
  end if;

  if p_feature = 'force_zone_scan_confirmation' then
    update shops set force_zone_scan_confirmation = p_enabled where shop_id = p_shop_id
    returning * into v_new;
  elsif p_feature = 'branches_feature_enabled' then
    update shops set branches_feature_enabled = p_enabled where shop_id = p_shop_id
    returning * into v_new;
  else
    raise exception 'ไม่รู้จัก feature "%"', p_feature;
  end if;

  insert into platform_audit_log (admin_user_id, admin_role, action, status, target_shop_id, old_data, new_data)
  values (p_actor_user_id, v_actor_role, 'set_feature', 'success', p_shop_id, to_jsonb(v_old),
          jsonb_build_object('feature', p_feature, 'enabled', p_enabled));

  return v_new;
end;
$$;

-- เหลือแค่ postgres/service_role เรียกได้ (แอปจริงเรียกผ่าน supabaseAdmin เท่านั้น) — ตาม idiom
-- เดียวกับ platform_join_as_support/platform_update_shop_subscription ใน
-- db/platform_admin_rpc_auth_check_migration.sql (revoke แบบถาวรกัน GRANT ALL ย้อนกลับมาเงียบๆ)
revoke execute on function platform_set_shop_feature(uuid, bigint, text, boolean) from public, anon, authenticated;
grant execute on function platform_set_shop_feature(uuid, bigint, text, boolean) to service_role;

-- ------------------------------------------------------------
-- 4) trg_check_branch_limit — เพิ่มเช็ค branches_feature_enabled (DB-level defense-in-depth,
--    คู่กับชั้น API ใน app/api/branches/route.js POST — "always enforce both layers" ตาม
--    convention ของโปรเจกต์นี้ เหมือน checkBranchLimit()/fn_tier_max_branches เดิม)
--    ยัง AND กับ tier limit เดิมเหมือนเดิมทุกประการ ไม่ได้แทนที่เช็คเดิม — แค่เพิ่มเงื่อนไขก่อนหน้า
-- ------------------------------------------------------------
create or replace function trg_check_branch_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_max int;
  v_count int;
  v_feature_enabled boolean;
begin
  select subscription_plan, branches_feature_enabled into v_plan, v_feature_enabled
  from shops where shop_id = new.shop_id;

  if not coalesce(v_feature_enabled, false) then
    raise exception 'ฟีเจอร์สาขายังไม่ได้เปิดใช้งานสำหรับอู่นี้ — ติดต่อทีมงานเพื่อเปิดใช้งาน'
      using errcode = 'P0001';
  end if;

  v_max := fn_tier_max_branches(v_plan);

  if v_max is not null then
    select count(*) into v_count from branches where shop_id = new.shop_id and is_active = true;
    if v_count >= v_max then
      raise exception 'จำนวนสาขาถึงขีดจำกัดของแพ็กเกจแล้ว (สูงสุด % สาขา)', v_max
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;
-- trg_branches_tier_limit trigger เดิม (WHEN new.is_default is not true) ยังใช้ฟังก์ชันนี้อยู่ —
-- create or replace ด้านบนพอ ไม่ต้อง drop/recreate trigger เอง (backfill/create_shop_with_owner's
-- แถว is_default=true ยังข้าม trigger นี้เหมือนเดิมทุกประการ ไม่ถูกเช็ค branches_feature_enabled)

-- ------------------------------------------------------------
-- 5) set_accounting_module_enabled — เปลี่ยนเฉพาะ "ใครเรียกได้" (is_shop_member(owner/manager)
--    -> platform_admins.role = 'super_admin') side-effect logic เดิม (seed ผังบัญชี + backfill
--    งวดปัจจุบัน + monetization tier gate) คงเดิมทุกประการ ชื่อฟังก์ชัน/return type (integer,
--    จำนวนที่ backfill) เหมือนเดิมทั้งหมด กันของอื่นที่อ้างอิงอยู่พัง
--    ต้อง DROP ก่อนเพราะเปลี่ยน parameter list (เพิ่ม p_actor_user_id) — "create or replace" จะ
--    สร้าง overload คู่กันแทนที่จะแทนที่ ทำให้ signature เดิม (ไม่เช็คสิทธิ์ใหม่) ยังเรียกได้อยู่
-- ------------------------------------------------------------
drop function if exists set_accounting_module_enabled(bigint, boolean);

create or replace function set_accounting_module_enabled(
  p_actor_user_id uuid,
  p_shop_id       bigint,
  p_enabled       boolean
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_backfilled integer := 0;
  v_was_enabled boolean;
  v_plan text;
  v_actor_role text;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'ไม่มีสิทธิ์ทำรายการนี้ (actor ไม่ตรงกับ session)';
  end if;

  select role into v_actor_role from platform_admins where user_id = p_actor_user_id;
  if v_actor_role is null or v_actor_role <> 'super_admin' then
    raise exception 'ไม่มีสิทธิ์เปิด/ปิดโมดูลบัญชี (Super Admin เท่านั้น)';
  end if;

  -- Monetization gate (ไม่เปลี่ยนแปลงจากเดิม) — ค่านี้ sync กับ config/subscriptionTiers.js /
  -- config/accountingConfig.js hasAccountingModuleFeature() เอง (pro/enterprise เท่านั้น)
  if p_enabled then
    select subscription_plan into v_plan from shops where shop_id = p_shop_id;
    if coalesce(v_plan, 'trial') not in ('pro', 'enterprise') then
      raise exception 'แพ็กเกจปัจจุบัน (%) ไม่รองรับโมดูลบัญชี — ต้องเป็น Pro ขึ้นไป', coalesce(v_plan, 'trial');
    end if;
  end if;

  select accounting_module_enabled into v_was_enabled from shops where shop_id = p_shop_id;

  update shops
  set accounting_module_enabled = p_enabled,
      accounting_module_enabled_at = case when p_enabled and not coalesce(v_was_enabled, false) then now() else accounting_module_enabled_at end
  where shop_id = p_shop_id;

  if p_enabled and not coalesce(v_was_enabled, false) then
    if not exists (select 1 from accounting_accounts where shop_id = p_shop_id) then
      perform fn_seed_default_chart_of_accounts(p_shop_id);
    end if;
    v_backfilled := fn_backfill_current_period_sales(p_shop_id);
  end if;

  insert into platform_audit_log (admin_user_id, admin_role, action, status, target_shop_id, new_data)
  values (p_actor_user_id, v_actor_role, 'accounting_module_toggled', 'success', p_shop_id,
          jsonb_build_object('enabled', p_enabled, 'backfilled_count', v_backfilled));

  return v_backfilled;
end;
$$;

-- เดิม PUBLIC/anon/authenticated เรียกได้หมด (เพราะเดิมเรียกตรงจาก browser ผ่าน supabase.rpc())
-- ตอนนี้เรียกผ่าน supabaseAdmin จาก app/api/platform/shops/[shopId]/accounting-module/route.js
-- เท่านั้น — revoke ทิ้งแบบถาวรตาม idiom เดียวกับข้อ 3
revoke execute on function set_accounting_module_enabled(uuid, bigint, boolean) from public, anon, authenticated;
grant execute on function set_accounting_module_enabled(uuid, bigint, boolean) to service_role;

-- ------------------------------------------------------------
-- 6) บั๊กที่พบระหว่างทดสอบจริง (qa-automation/tests/platform-controlled-shop-features.spec.js,
--    24 ก.ค. 2026): set_accounting_module_enabled() เวอร์ชันใหม่เรียกผ่าน supabaseAdmin
--    (service_role) เสมอ — auth.uid() จึงเป็น NULL ในบริบทนี้ (service_role JWT ไม่มี claim
--    sub ของผู้ใช้จริง) แต่ 2 ฟังก์ชันลูกที่มันเรียกต่อ (fn_seed_default_chart_of_accounts,
--    fn_backfill_current_period_sales — db/accounting_module_migration.sql /
--    db/security_advisor_batch_fixes_migration.sql) มีเช็คสิทธิ์ภายในตัวเองอีกชั้นแบบ
--    `is_shop_member(p_shop_id, array['owner','manager'])` ซึ่งอิง auth.uid() ตรงๆ — เมื่อ
--    auth.uid() เป็น NULL เช็คนี้ fail เสมอ (ไม่มีแถว shop_members ไหน user_id = NULL) ทำให้เปิด
--    โมดูลบัญชีผ่าน API ใหม่ไม่ได้เลย (500 "ไม่มีสิทธิ์...") ทั้งที่ set_accounting_module_enabled
--    ชั้นนอกตรวจสิทธิ์จริงผ่าน platform_admins ไปแล้วถูกต้อง
--
--    แก้ด้วย idiom เดียวกับที่ใช้ทั้งไฟล์ db/platform_admin_rpc_auth_check_migration.sql:
--    เช็ค is_shop_member() เฉพาะเมื่อ auth.uid() ไม่ใช่ NULL เท่านั้น (= มีคน authenticated
--    เรียกตรงๆ ผ่าน anon/authenticated key จริง) — ถ้าเรียกผ่าน service_role (auth.uid() is null)
--    ให้เชื่อว่า caller ชั้นนอก (set_accounting_module_enabled) ตรวจสิทธิ์มาแล้ว ไม่เช็คซ้ำ
--    ทั้ง 2 ฟังก์ชันนี้ยัง**คงการเช็คไว้**สำหรับกรณีถูกเรียกตรงจาก anon/authenticated (ยังไม่ revoke
--    execute ออกจาก 2 ฟังก์ชันนี้ — คงพฤติกรรมเดิมไว้ ไม่ขยายขอบเขตการแก้ไขเกินกว่าที่จำเป็น)
-- ------------------------------------------------------------
create or replace function fn_seed_default_chart_of_accounts(p_shop_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and not is_shop_member(p_shop_id, array['owner','manager']) then
    raise exception 'ไม่มีสิทธิ์ seed ผังบัญชีของร้านนี้ (เฉพาะเจ้าของ/ผู้จัดการ)';
  end if;

  insert into accounting_accounts (shop_id, account_code, account_name, account_type, normal_balance)
  values
    (p_shop_id, '1010100', 'เงินสด', 'asset', 'debit'),
    (p_shop_id, '1010200', 'เงินฝากธนาคาร', 'asset', 'debit'),
    (p_shop_id, '1020100', 'ลูกหนี้การค้า', 'asset', 'debit'),
    (p_shop_id, '1030100', 'สินค้าคงเหลือ-อะไหล่', 'asset', 'debit'),
    (p_shop_id, '2010100', 'เจ้าหนี้ผู้ฝากขาย', 'liability', 'credit'),
    (p_shop_id, '2050100', 'ภาษีขายรอนำส่ง (VAT Output)', 'liability', 'credit'),
    (p_shop_id, '4060100', 'รายได้จากการขายอะไหล่', 'revenue', 'credit'),
    (p_shop_id, '4070100', 'รายได้ค่าคอมมิชชั่น (ฝากขาย)', 'revenue', 'credit'),
    (p_shop_id, '5080100', 'ต้นทุนขายอะไหล่ (COGS)', 'expense', 'debit')
  on conflict (shop_id, account_code) do nothing;
end;
$$;

create or replace function fn_backfill_current_period_sales(p_shop_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale record;
  v_count integer := 0;
  v_period_start date;
begin
  if auth.uid() is not null and not is_shop_member(p_shop_id, array['owner','manager']) then
    raise exception 'ไม่มีสิทธิ์ backfill รายการบัญชีของร้านนี้ (เฉพาะเจ้าของ/ผู้จัดการ)';
  end if;

  v_period_start := date_trunc('month', current_date)::date;

  for v_sale in
    select * from part_sales
    where shop_id = p_shop_id
      and item_status = 'completed'
      and approval_status <> 'pending_approval'
      and approval_status <> 'rejected'
      and sold_at >= v_period_start
      and not exists (select 1 from journal_entries where source_table = 'part_sales' and source_id = part_sales.sale_id)
    order by sold_at
  loop
    perform fn_post_sale_journal_entry_for_sale_id(v_sale.sale_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
