-- ============================================================
-- Card: "Accounting Module — ผังบัญชี + journal entries + intercompany"
-- (Notion page 3a1f39f4564981bcba6ce1b5e8c66761, Priority High, XL)
--
-- ⚠️ ขอบเขตรอบนี้ (สำคัญ อ่านก่อนแก้ไฟล์นี้ต่อ) — นี่คือ SCOPED-DOWN first pass ของการ์ด XL:
--   สร้าง: ผังบัญชี 7 หลัก, journal_entries/journal_entry_lines (debit=credit invariant),
--   accounting_periods (ปิดงวด), audit trail (ผูกกับ fn_audit_row_change() ที่มีอยู่แล้ว),
--   event-rule ขาย "own" (cash/credit ผูก payment_method) + "consignment" (agent model ตาม
--   TFRS15/IFRS15, ไม่มี COGS), VAT ณ วันขายจริง (pack date), enable/disable module ต่อร้าน +
--   backfill เฉพาะงวดปัจจุบันที่เปิดอยู่, monetization gate ผูก subscription_plan
--   ไม่ทำ (นอกขอบเขต, เขียนไว้ชัดเจนว่าทำไม):
--   - Intercompany/shop_groups/consolidation — Multi-branch support (prerequisite) ยัง
--     "Not started" ใน Notion จริง (verify แล้ว 24 ก.ค. 2026 — ไม่มี shop_groups/branch concept
--     ในโค้ดเลย) รอการ์ดนั้นก่อนถึงจะออกแบบ intercompany mirror-entry/staging queue ได้
--   - Investor model (กิจการร่วมค้าแบ่งกำไร) — การ์ดเองบอกไว้ตรงๆ ว่า "ยังไม่ได้ออกแบบ journal
--     แยกต่างหาก" (ไม่ใช่ agent/commission แบบ consignment) — ไม่เดา schema/journal เอง
--   - NRV check ผูกปิดงวด — Edge Case แยกของการ์ด Salvage cost allocation ที่อาจมี agent อื่น
--     ทำคู่ขนานอยู่ — เปิดช่องให้ต่อในอนาคตผ่าน fn_is_period_closed(shop_id, date) ที่สร้างไว้นี้
--     (clean read-only interface ไม่ผูกกับ implementation ภายในของ accounting_periods)
--
-- Precedent ที่อ้างอิง/mirror:
--   - db/platform_revenue_migration.sql: create_platform_journal_entry() debit=credit validation
--     pattern (sum เทียบกัน raise exception ถ้าไม่เท่า) — journal นี้เป็นคนละชุดบัญชีเลย (ของแต่ละ
--     ร้าน ไม่ใช่ของบริษัท Beam Garage เอง) จึงไม่ reuse ตารางเดียวกัน แต่ mirror pattern เดียวกัน
--   - db/audit_log_full_coverage_migration.sql: fn_audit_row_change() เป็น generic trigger แต่
--     "ไม่ auto-apply กับตารางใหม่" — ต้อง CREATE TRIGGER ผูกเข้าตารางเองทุกตาราง (เหมือนที่ต้องทำ
--     กับ jobs/shop_members/options/zones ตอนสร้าง) — ทำให้ journal_entries ด้านล่าง
--   - db/stock_summary_report_migration.sql: effective_owner_type =
--     coalesce(parts.owner_type_override, zones.owner_type, 'own') — สูตรเดียวกับที่ใช้ที่นี่
--   - db/zones_owner_type_migration.sql: owner_entity_id ไม่มี FK ตั้งใจ รอการ์ดนี้ตัดสินใจ — เพิ่ม
--     ตาราง consignors ที่นี่ (ไม่มีตาราง "เจ้าของฝากขาย" อยู่ก่อนเลย, verify แล้ว) ผูกด้วย trigger
--     validation (ไม่ใช่ hard FK เพราะ owner_entity_id ใช้ร่วมกับ investor ในอนาคตซึ่งอาจอ้างคนละ
--     ตาราง — hard FK ตอนนี้จะบล็อกการออกแบบ investor ในอนาคตโดยไม่จำเป็น)
--   - db/payment_method_migration.sql: enum เดิมไม่มี 'credit' ("ยังไม่ตัดสินใจ...รอ Accounting
--     Module") — เพิ่มที่นี่ตามที่ตั้งใจไว้ ไม่ migration ซ้ำโครงสร้างเดิม
-- ============================================================

-- ------------------------------------------------------------
-- 0) shops: module enable/disable flag + timestamp (backfill reference point)
--    ตาม pattern เดียวกับ force_zone_scan_confirmation (คอลัมน์ตรงบน shops ไม่ใช่ตารางแยก —
--    verify แล้วว่ายังไม่มี shop_feature_overrides table ทั่วไปในระบบนี้)
-- ------------------------------------------------------------
alter table shops add column if not exists accounting_module_enabled boolean not null default false;
alter table shops add column if not exists accounting_module_enabled_at timestamptz;

-- ------------------------------------------------------------
-- 1) payment_method: เพิ่ม 'credit' (ขายเชื่อ) ตามที่ card เดิมทิ้งไว้ให้การ์ดนี้ตัดสินใจ
-- ------------------------------------------------------------
alter table part_sales drop constraint if exists part_sales_payment_method_check;
alter table part_sales add constraint part_sales_payment_method_check
  check (payment_method is null or payment_method in ('cash', 'bank_transfer', 'card', 'other', 'credit'));

-- ------------------------------------------------------------
-- 2) consignors — "เจ้าของฝากขาย" ที่ owner_entity_id ของ zones อ้างถึงเมื่อ owner_type='consignment'
--    commission_rate: default ต่อผู้ฝาก (ที่นี่) + override รายชิ้นได้ (parts.commission_rate_override)
-- ------------------------------------------------------------
create table if not exists consignors (
  consignor_id       bigint generated always as identity primary key,
  shop_id            bigint not null references shops(shop_id),
  name               text not null,
  contact_phone      text,
  default_commission_rate numeric not null default 0.10 check (default_commission_rate >= 0 and default_commission_rate <= 1),
  ar_payable_balance numeric not null default 0, -- ยอดเจ้าหนี้ผู้ฝากขายคงค้าง (เพิ่มตอนขาย, ลดตอนจ่ายคืน)
  created_at         timestamptz not null default now(),
  is_active          boolean not null default true
);
create index if not exists idx_consignors_shop on consignors (shop_id);

alter table consignors enable row level security;
drop policy if exists "shop members can view consignors" on consignors;
create policy "shop members can view consignors" on consignors
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));
drop policy if exists "owner/manager manage consignors" on consignors;
create policy "owner/manager manage consignors" on consignors
  for all using (is_shop_member(shop_id, array['owner','manager']))
  with check (is_shop_member(shop_id, array['owner','manager']));

-- parts: commission_rate override ต่อชิ้น (null = ใช้ default_commission_rate ของ consignor)
alter table parts add column if not exists commission_rate_override numeric;
alter table parts drop constraint if exists parts_commission_rate_override_check;
alter table parts add constraint parts_commission_rate_override_check
  check (commission_rate_override is null or (commission_rate_override >= 0 and commission_rate_override <= 1));

-- Validate zones.owner_entity_id -> consignors.consignor_id เมื่อ owner_type='consignment' เท่านั้น
-- (ไม่ใช่ hard FK ตรงๆ เพราะ owner_entity_id ใช้ร่วมกับ investor ในอนาคตที่อาจอ้างคนละตาราง)
create or replace function fn_validate_zone_owner_entity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.owner_type = 'consignment' and NEW.owner_entity_id is not null then
    if not exists (
      select 1 from consignors
      where consignor_id = NEW.owner_entity_id and shop_id = NEW.shop_id
    ) then
      raise exception 'owner_entity_id ไม่ตรงกับผู้ฝากขาย (consignor) ของร้านนี้';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_validate_zone_owner_entity on zones;
create trigger trg_validate_zone_owner_entity
  before insert or update of owner_type, owner_entity_id on zones
  for each row execute function fn_validate_zone_owner_entity();

-- ------------------------------------------------------------
-- 3) accounting_accounts — ผังบัญชี 7 หลัก ต่อร้าน (seed อัตโนมัติตอนเปิด module, ดูฟังก์ชัน
--    fn_seed_default_chart_of_accounts ด้านล่าง)
--    โครงสร้างรหัส 7 หลัก: [หมวด 1 หลัก][สายธุรกิจ/segment 2 หลัก][รายละเอียด 4 หลัก]
--      หมวด: 1=สินทรัพย์ 2=หนี้สิน 3=ทุน 4=รายได้ 5=ค่าใช้จ่าย
--      segment: 01=เงินสด/ธนาคาร 02=ลูกหนี้ 03=สินค้าคงเหลือ 04=เจ้าหนี้ 05=ภาษี
--               06=ขายอะไหล่(own) 07=คอมมิชชั่น(consignment) 08=ต้นทุนขาย
-- ------------------------------------------------------------
create table if not exists accounting_accounts (
  account_id     bigint generated always as identity primary key,
  shop_id        bigint not null references shops(shop_id),
  account_code   text not null check (account_code ~ '^[0-9]{7}$'),
  account_name   text not null,
  account_type   text not null check (account_type in ('asset','liability','equity','revenue','expense')),
  normal_balance text not null check (normal_balance in ('debit','credit')),
  is_system      boolean not null default true, -- seed มาตรฐาน vs owner สร้างเพิ่มเอง
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (shop_id, account_code)
);
create index if not exists idx_accounting_accounts_shop on accounting_accounts (shop_id);

alter table accounting_accounts enable row level security;
drop policy if exists "shop members can view accounts" on accounting_accounts;
create policy "shop members can view accounts" on accounting_accounts
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));
drop policy if exists "owner/manager manage accounts" on accounting_accounts;
create policy "owner/manager manage accounts" on accounting_accounts
  for all using (is_shop_member(shop_id, array['owner','manager']))
  with check (is_shop_member(shop_id, array['owner','manager']));

-- ------------------------------------------------------------
-- 4) accounting_periods — งวดบัญชีรายเดือนต่อร้าน. ปิดแล้ว = reject journal entry ใหม่เข้างวดนั้น
-- ------------------------------------------------------------
create table if not exists accounting_periods (
  period_id    bigint generated always as identity primary key,
  shop_id      bigint not null references shops(shop_id),
  period_label text not null, -- 'YYYY-MM'
  period_start date not null,
  period_end   date not null,
  status       text not null default 'open' check (status in ('open','closed')),
  closed_by    uuid references auth.users(id),
  closed_at    timestamptz,
  created_at   timestamptz not null default now(),
  unique (shop_id, period_label)
);
create index if not exists idx_accounting_periods_shop on accounting_periods (shop_id, period_start);

alter table accounting_periods enable row level security;
drop policy if exists "shop members can view periods" on accounting_periods;
create policy "shop members can view periods" on accounting_periods
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));
-- ไม่มี insert/update policy ตรงๆ — เปิด/ปิดงวดผ่าน RPC เท่านั้น (close_accounting_period ด้านล่าง)

-- หา (หรือเปิด) งวดบัญชีของวันที่ที่กำหนด — ใช้จากทั้ง create_journal_entry และ backfill
create or replace function fn_get_or_open_period(p_shop_id bigint, p_date date)
returns accounting_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period accounting_periods;
  v_label text;
  v_start date;
  v_end date;
begin
  v_label := to_char(p_date, 'YYYY-MM');
  v_start := date_trunc('month', p_date)::date;
  v_end := (date_trunc('month', p_date) + interval '1 month - 1 day')::date;

  select * into v_period from accounting_periods
  where shop_id = p_shop_id and period_label = v_label;

  if v_period is null then
    insert into accounting_periods (shop_id, period_label, period_start, period_end, status)
    values (p_shop_id, v_label, v_start, v_end, 'open')
    on conflict (shop_id, period_label) do nothing
    returning * into v_period;

    if v_period is null then
      select * into v_period from accounting_periods
      where shop_id = p_shop_id and period_label = v_label;
    end if;
  end if;

  return v_period;
end;
$$;

-- Clean read-only interface สำหรับฟีเจอร์อื่นในอนาคต (เช่น NRV check ที่ผูกกับปิดงวด — เขียนไว้
-- ให้ agent อื่น hook ต่อได้โดยไม่ต้องรู้ internal ของ accounting_periods เลย
create or replace function fn_is_period_closed(p_shop_id bigint, p_date date)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select status = 'closed' from accounting_periods
     where shop_id = p_shop_id and period_label = to_char(p_date, 'YYYY-MM')),
    false
  );
$$;
grant execute on function fn_is_period_closed(bigint, date) to authenticated;

-- ปิดงวดบัญชีปัจจุบัน (หรืองวดที่ระบุ) — Owner/Manager เท่านั้น, reject ถ้าปิดไปแล้ว
create or replace function close_accounting_period(p_shop_id bigint, p_period_label text)
returns accounting_periods
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period accounting_periods;
begin
  if not is_shop_member(p_shop_id, array['owner','manager']) then
    raise exception 'ไม่มีสิทธิ์ปิดงวดบัญชี (เฉพาะเจ้าของ/ผู้จัดการ)';
  end if;

  select * into v_period from accounting_periods
  where shop_id = p_shop_id and period_label = p_period_label;

  if v_period is null then
    raise exception 'ไม่พบงวดบัญชี %', p_period_label;
  end if;
  if v_period.status = 'closed' then
    raise exception 'งวดบัญชี % ปิดไปแล้ว', p_period_label;
  end if;

  update accounting_periods
  set status = 'closed', closed_by = auth.uid(), closed_at = now()
  where period_id = v_period.period_id
  returning * into v_period;

  return v_period;
end;
$$;
grant execute on function close_accounting_period(bigint, text) to authenticated;

-- ------------------------------------------------------------
-- 5) journal_entries / journal_entry_lines — สมุดบัญชีของแต่ละร้าน (คนละชุดจาก
--    platform_journal_entries ของบริษัท Beam Garage เอง)
--    Invariant ศักดิ์สิทธิ์: Σ debit = Σ credit ทุก entry — บังคับที่ create_journal_entry() เท่านั้น
--    (ไม่มี insert policy ตรงบนตาราง — เขียนได้ทางเดียวผ่าน RPC/trigger ที่ security definer)
-- ------------------------------------------------------------
create table if not exists journal_entries (
  entry_id     bigint generated always as identity primary key,
  shop_id      bigint not null references shops(shop_id),
  period_id    bigint not null references accounting_periods(period_id),
  entry_date   date not null default current_date,
  description  text not null,
  source_type  text not null check (source_type in ('sale_own','sale_consignment','manual','payment_received')),
  source_table text,   -- เช่น 'part_sales'
  source_id    bigint, -- เช่น part_sales.sale_id
  created_by   uuid references auth.users(id),
  created_at   timestamptz not null default now()
);
create index if not exists idx_journal_entries_shop on journal_entries (shop_id, entry_date);
create index if not exists idx_journal_entries_period on journal_entries (period_id);
create index if not exists idx_journal_entries_source on journal_entries (source_table, source_id);

create table if not exists journal_entry_lines (
  line_id      bigint generated always as identity primary key,
  entry_id     bigint not null references journal_entries(entry_id) on delete cascade,
  account_code text not null,
  debit        numeric not null default 0,
  credit       numeric not null default 0,
  memo         text,
  created_at   timestamptz not null default now(),
  check (debit >= 0 and credit >= 0 and not (debit > 0 and credit > 0))
);
create index if not exists idx_journal_entry_lines_entry on journal_entry_lines (entry_id);

alter table journal_entries enable row level security;
alter table journal_entry_lines enable row level security;

drop policy if exists "shop members can view journal entries" on journal_entries;
create policy "shop members can view journal entries" on journal_entries
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));
-- ไม่มี insert/update/delete policy — เขียนได้ทางเดียวผ่าน create_journal_entry()/trigger เท่านั้น

drop policy if exists "shop members can view journal entry lines" on journal_entry_lines;
create policy "shop members can view journal entry lines" on journal_entry_lines
  for select using (
    exists (
      select 1 from journal_entries je
      where je.entry_id = journal_entry_lines.entry_id
        and is_shop_member(je.shop_id, array['owner','manager','supervisor','technician','assistant'])
    )
  );

-- Audit trail: ผูกเข้า fn_audit_row_change() กลาง (ไม่ auto-apply กับตารางใหม่ — ต้อง attach
-- trigger เองตามที่หัวไฟล์ audit_log_full_coverage_migration.sql อธิบาย) — journal_entries ใช้
-- entry_id (bigint) เป็น record_id เหมือน jobs/shop_members; journal_entry_lines ไม่ผูก audit
-- แยก (immutable, ไม่มีทาง update/delete เดี่ยวๆ อยู่แล้ว — ลบผ่าน cascade ตอนลบ entry เท่านั้น
-- ซึ่งไม่ควรเกิดในโหมดใช้งานจริง)
--
-- ⚠️ fn_audit_row_change() ปัจจุบัน (ดู audit_log_full_coverage_migration.sql) รู้จัก record_id
-- เฉพาะชื่อตารางที่ hardcode ไว้ใน IF/ELSIF (parts/zones/options ใช้ uuid id, jobs ใช้ job_id,
-- shop_members ใช้ member_id, shops ใช้ shop_id) — journal_entries ไม่อยู่ในลิสต์นั้น ต้องขยาย
-- ฟังก์ชันกลางให้รู้จัก entry_id ด้วย ไม่งั้น record_id จะเป็น null เสมอ (ยังบันทึก
-- old_data/new_data/changed_by_user_id/shop_id ถูกต้องอยู่ดี แค่ record_id เปล่า) — ทำที่นี่
create or replace function fn_audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_row       jsonb;
  v_shop_id   bigint;
  v_record_id bigint;
  v_record_uuid uuid;
  v_old       jsonb;
  v_new       jsonb;
begin
  if TG_OP = 'UPDATE' and to_jsonb(OLD) = to_jsonb(NEW) then
    return NEW;
  end if;

  if TG_OP = 'DELETE' then
    v_row := to_jsonb(OLD);
  else
    v_row := to_jsonb(NEW);
  end if;

  v_shop_id := nullif(v_row->>'shop_id', '')::bigint;

  if TG_TABLE_NAME in ('parts', 'zones', 'options') then
    v_record_uuid := nullif(v_row->>'id', '')::uuid;
  elsif TG_TABLE_NAME = 'jobs' then
    v_record_id := nullif(v_row->>'job_id', '')::bigint;
  elsif TG_TABLE_NAME = 'shop_members' then
    v_record_id := nullif(v_row->>'member_id', '')::bigint;
  elsif TG_TABLE_NAME = 'shops' then
    v_record_id := nullif(v_row->>'shop_id', '')::bigint;
  elsif TG_TABLE_NAME = 'journal_entries' then
    v_record_id := nullif(v_row->>'entry_id', '')::bigint;
  end if;

  if TG_OP = 'INSERT' then
    v_old := null;
    v_new := to_jsonb(NEW);
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  else
    v_old := to_jsonb(OLD);
    v_new := null;
  end if;

  insert into audit_log (
    table_name, record_id, record_uuid, action, old_data, new_data,
    shop_id, changed_by_user_id
  ) values (
    TG_TABLE_NAME, v_record_id, v_record_uuid, TG_OP, v_old, v_new,
    v_shop_id, auth.uid()
  );

  if TG_OP = 'DELETE' then
    return OLD;
  else
    return NEW;
  end if;
end;
$$;

drop trigger if exists trg_audit_journal_entries on journal_entries;
create trigger trg_audit_journal_entries
  after insert or delete or update on journal_entries
  for each row execute function fn_audit_row_change();

-- ------------------------------------------------------------
-- 6) create_journal_entry — RPC เดียวที่ insert journal entry ได้ mirror
--    create_platform_journal_entry() (db/platform_revenue_migration.sql): validate debit=credit
--    ก่อน insert เสมอ + เพิ่มเช็ค period ปิดหรือยัง (ไม่มีใน platform version เพราะที่นั่นไม่มี
--    period concept)
-- ------------------------------------------------------------
create or replace function create_journal_entry(
  p_shop_id     bigint,
  p_entry_date  date,
  p_description text,
  p_source_type text,
  p_source_table text,
  p_source_id   bigint,
  p_lines       jsonb -- [{account_code, debit, credit, memo}]
) returns journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period accounting_periods;
  v_entry journal_entries;
  v_total_debit numeric;
  v_total_credit numeric;
begin
  if not is_shop_member(p_shop_id, array['owner','manager','supervisor']) then
    raise exception 'ไม่มีสิทธิ์บันทึกรายการบัญชี (เฉพาะเจ้าของ/ผู้จัดการ/หัวหน้างาน)';
  end if;

  select coalesce(sum((l->>'debit')::numeric),0), coalesce(sum((l->>'credit')::numeric),0)
    into v_total_debit, v_total_credit
  from jsonb_array_elements(p_lines) l;

  if v_total_debit <> v_total_credit then
    raise exception 'รายการไม่สมดุล: debit % ไม่เท่ากับ credit %', v_total_debit, v_total_credit;
  end if;
  if v_total_debit = 0 then
    raise exception 'รายการว่างเปล่า (debit/credit เป็น 0 ทั้งคู่)';
  end if;

  v_period := fn_get_or_open_period(p_shop_id, p_entry_date);
  if v_period.status = 'closed' then
    raise exception 'งวดบัญชี % ปิดไปแล้ว ไม่สามารถบันทึกรายการเข้างวดนี้ได้', v_period.period_label;
  end if;

  insert into journal_entries (shop_id, period_id, entry_date, description, source_type, source_table, source_id, created_by)
  values (p_shop_id, v_period.period_id, p_entry_date, p_description, p_source_type, p_source_table, p_source_id, auth.uid())
  returning * into v_entry;

  insert into journal_entry_lines (entry_id, account_code, debit, credit, memo)
  select v_entry.entry_id, l->>'account_code', (l->>'debit')::numeric, (l->>'credit')::numeric, l->>'memo'
  from jsonb_array_elements(p_lines) l;

  return v_entry;
end;
$$;
grant execute on function create_journal_entry(bigint, date, text, text, text, bigint, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 7) ผังบัญชีมาตรฐาน — seed ต่อร้านตอนเปิด module
-- ------------------------------------------------------------
create or replace function fn_seed_default_chart_of_accounts(p_shop_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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

-- ------------------------------------------------------------
-- 8) VAT rate — ค่าคงที่ระดับ DB (คู่กับ config/accountingConfig.js ฝั่งแอป) ใช้ค่าเดียวกับที่
--    app/jobs/[id]/page.js ใช้อยู่แล้ว (vatAmount = subtotal * 0.07) มาตรฐานประเทศไทย 7%
-- ------------------------------------------------------------
create or replace function fn_vat_rate()
returns numeric
language sql
immutable
as $$ select 0.07::numeric $$;

-- ------------------------------------------------------------
-- 9) fn_post_sale_journal_entry — สร้าง journal entry อัตโนมัติตอนขาย "เสร็จจริง" (item_status
--    ='completed' — ตรงกับจังหวะ "pack date"/ส่งมอบลูกค้าตามที่ตัดสินใจเรื่อง VAT timing (ดูหัว
--    ไฟล์การ์ด: "VAT ออกที่ pack date ตามที่ตัดสินใจไว้ก่อนหน้านี้แล้ว") — ครอบทั้ง 2 flow ที่มีจริง:
--      - ขายทีละชิ้น (app/edit/[id]/page.js): insert ด้วย item_status='completed' ทันที (ค่า
--        default ของคอลัมน์) -> trigger ทำงานตอน INSERT
--      - Cart-based selling (app/checkout/page.js): insert เป็น 'pending_pick' ก่อน แล้ว UPDATE
--        เป็น 'completed' ตอน Confirm Pick (ส่งมอบลูกค้าจริง) -> trigger ทำงานตอน UPDATE
--    ข้าม (ไม่ post): sale ที่รอ approval (approval_status='pending_approval' — ยังไม่นับเป็นรายการ
--    ขายจริงตาม convention เดียวกับ app/admin/reports/page.js) — เมื่ออนุมัติแล้ว
--    (approval_status: pending_approval -> approved) จะ post ตอนนั้นแทน (trigger แยกด้านล่าง)
--    Idempotent: เช็ค journal_entries.source_table/source_id ก่อนเสมอ กัน insert ซ้ำเมื่อทั้ง
--    item_status และ approval_status ถูกอัปเดตพร้อมกันในหลาย UPDATE statement
-- ------------------------------------------------------------
-- (ฟังก์ชัน fn_post_sale_journal_entry() ตัวจริงถูกสร้างด้านล่าง หลัง fn_post_sale_journal_entry_body()
-- — เป็น thin trigger wrapper ที่ delegate ไปที่ ..._body() เพื่อให้ trigger เองและ backfill
-- (fn_post_sale_journal_entry_for_sale_id) เรียก logic เดียวกันไม่ซ้ำโค้ด)

-- Insert แบบ system-generated (ไม่ผ่าน create_journal_entry() เพราะ trigger รันในบริบทที่
-- auth.uid() อาจเป็นของผู้ขาย ไม่ใช่ "ผู้บันทึกบัญชี" — เช็ค role ซ้ำจะพังกรณีพนักงานขาย (technician/
-- assistant) ที่ role ไม่ใช่ owner/manager/supervisor แต่ขายของได้ปกติ) — balance โดยธรรมชาติจาก
-- เลขที่คำนวณเองในฟังก์ชันข้างบน ไม่ต้อง re-validate sum เหมือน create_journal_entry() ที่รับ
-- arbitrary input จาก client โดยตรง (mirror เหตุผลเดียวกับ recognize_due_platform_revenue() ใน
-- db/platform_revenue_migration.sql)
create or replace function fn_insert_system_journal_entry(
  p_shop_id bigint, p_entry_date date, p_description text, p_source_type text,
  p_source_table text, p_source_id bigint, p_lines jsonb
) returns journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period accounting_periods;
  v_entry journal_entries;
begin
  v_period := fn_get_or_open_period(p_shop_id, p_entry_date);

  insert into journal_entries (shop_id, period_id, entry_date, description, source_type, source_table, source_id, created_by)
  values (p_shop_id, v_period.period_id, p_entry_date, p_description, p_source_type, p_source_table, p_source_id, auth.uid())
  returning * into v_entry;

  insert into journal_entry_lines (entry_id, account_code, debit, credit, memo)
  select v_entry.entry_id, l->>'account_code', (l->>'debit')::numeric, (l->>'credit')::numeric, l->>'memo'
  from jsonb_array_elements(p_lines) l;

  return v_entry;
end;
$$;

-- (trigger สร้างด้านล่าง หลัง fn_post_sale_journal_entry() ตัวจริงถูก define แล้ว — CREATE TRIGGER
-- ต้องการให้ function มีอยู่จริง ณ ตอนสร้าง ไม่เหมือน function body ที่เรียกฟังก์ชันอื่นซึ่ง
-- Postgres ไม่เช็ค existence ตอน CREATE FUNCTION)

-- ------------------------------------------------------------
-- 10) Enable/disable module + backfill-on-enable (เฉพาะงวดปัจจุบันที่ยังเปิดอยู่เท่านั้น — ✅
--     ตัดสินใจแล้วในการ์ด: งวดก่อนหน้าที่ปิดไปแล้วไม่แตะต้องเลย ไม่บังคับ backfill ย้อนหลัง)
-- ------------------------------------------------------------
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
    -- เรียก logic เดียวกับ trigger โดยจำลอง NEW ผ่านการอัปเดต item_status ตัวเองแบบ no-op ไม่ได้
    -- (จะไม่ trigger UPDATE ถ้าค่าเดิม=ใหม่) จึงเรียกฟังก์ชันภายในตรงๆ แทนผ่าน helper ด้านล่าง
    perform fn_post_sale_journal_entry_for_sale_id(v_sale.sale_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Helper: รัน logic เดียวกับ trigger แต่เรียกตรงด้วย sale_id (ใช้จาก backfill) — ดึงแถวจริงมา
-- ทำงานเหมือน trigger ทุกประการโดยไม่ต้องพึ่งกลไก trigger ของ Postgres
create or replace function fn_post_sale_journal_entry_for_sale_id(p_sale_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale part_sales;
begin
  select * into v_sale from part_sales where sale_id = p_sale_id;
  if v_sale is null then
    return;
  end if;
  perform fn_post_sale_journal_entry_body(v_sale);
end;
$$;

-- Refactor: ย้าย body ของ fn_post_sale_journal_entry ให้เป็นฟังก์ชันแยกที่รับ part_sales record
-- ตรงๆ (ใช้ร่วมกันทั้ง trigger ปกติ และ backfill) — ลด logic ซ้ำ 2 ที่
create or replace function fn_post_sale_journal_entry_body(p_sale part_sales)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop shops;
  v_effective_owner_type text;
  v_owner_entity_id bigint;
  v_commission_rate numeric;
  v_part parts;
  v_sale_amount numeric;
  v_vat_amount numeric;
  v_cogs_amount numeric;
  v_cash_or_ar_account text;
  v_entry_date date;
  v_lines jsonb;
  v_description text;
  v_commission_amount numeric;
  v_payable_amount numeric;
begin
  if p_sale.item_status <> 'completed' then
    return;
  end if;
  if p_sale.approval_status = 'pending_approval' or p_sale.approval_status = 'rejected' then
    return;
  end if;
  if exists (select 1 from journal_entries where source_table = 'part_sales' and source_id = p_sale.sale_id) then
    return;
  end if;

  select * into v_shop from shops where shop_id = p_sale.shop_id;
  if v_shop is null or not v_shop.accounting_module_enabled then
    return;
  end if;

  select * into v_part from parts where id = p_sale.part_id;
  -- ✅ FIX (พบตอน smoke test บน staging): parts มีแค่ owner_type_override/commission_rate_override
  -- — ไม่มี owner_entity_id เลย (owner_entity_id อยู่ที่ zones เท่านั้น ตาม
  -- zones_owner_type_migration.sql) ดึง effective owner_type/entity จาก zones เมื่อ part ไม่มี
  -- override เอง — เดิมโค้ดร่างแรกอ้าง v_part.owner_entity_id ที่ไม่มีจริง (ตอน CREATE FUNCTION
  -- ไม่ error เพราะ Postgres ไม่เช็ค field access ของ composite type ตอน compile แบบ strict เสมอ
  -- ไป error ตอน runtime แทน) แก้แล้วที่นี่ก่อน commit
  v_effective_owner_type := coalesce(v_part.owner_type_override, (select z.owner_type from zones z where z.id = v_part.zone_id), 'own');

  v_entry_date := coalesce(p_sale.sold_at::date, current_date);
  v_sale_amount := p_sale.quantity_sold * p_sale.sale_price;
  v_vat_amount := round(v_sale_amount * fn_vat_rate(), 2);

  -- period ปิดไปแล้ว (เช่น backfill ของงวดเก่า หรือ sold_at ย้อนหลังเข้างวดที่ปิดแล้ว) —
  -- ไม่ block การขาย (การขายสำคัญกว่าตาม convention เดียวกับ cost-override ใน checkout) แค่ข้าม
  -- การ post journal entry ไปเงียบๆ พร้อม warning ให้เห็นใน log — known rough edge: ไม่มีกลไก
  -- แจ้งเตือน owner ว่ามี sale ที่ไม่ได้ post journal เพราะ period ปิด (ดูรายงานสรุปผลตอนท้าย)
  if fn_is_period_closed(p_sale.shop_id, v_entry_date) then
    raise warning 'ข้าม journal entry ของ sale_id=% เพราะงวดบัญชี % ปิดไปแล้ว', p_sale.sale_id, to_char(v_entry_date, 'YYYY-MM');
    return;
  end if;

  if v_effective_owner_type = 'consignment' then
    -- Agent model ตาม TFRS15/IFRS15 — ไม่มี COGS เลย (ร้านไม่เคยเป็นเจ้าของสินค้า)
    -- owner_entity_id (ผู้ฝากขายคนไหน) มาจาก zones เท่านั้น — parts ไม่มีคอลัมน์นี้
    v_owner_entity_id := (select z.owner_entity_id from zones z where z.id = v_part.zone_id);
    select coalesce(v_part.commission_rate_override, default_commission_rate) into v_commission_rate
    from consignors where consignor_id = v_owner_entity_id;
    v_commission_rate := coalesce(v_commission_rate, 0.10);

    v_commission_amount := round(v_sale_amount * v_commission_rate, 2);
    v_payable_amount := v_sale_amount - v_commission_amount;

    v_description := 'ขายฝากขาย (consignment) sale_id=' || p_sale.sale_id;
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', '1010100', 'debit', v_sale_amount + v_vat_amount, 'credit', 0, 'memo', 'รับเงินสด/ธนาคารเต็มยอดขาย'),
      jsonb_build_object('account_code', '2010100', 'debit', 0, 'credit', v_payable_amount, 'memo', 'เจ้าหนี้ผู้ฝากขาย (ยอดขาย - ค่าคอมมิชชั่น)'),
      jsonb_build_object('account_code', '4070100', 'debit', 0, 'credit', v_commission_amount, 'memo', 'รายได้ค่าคอมมิชชั่น'),
      jsonb_build_object('account_code', '2050100', 'debit', 0, 'credit', v_vat_amount, 'memo', 'ภาษีขายรอนำส่ง')
    );

    if v_owner_entity_id is not null then
      update consignors set ar_payable_balance = ar_payable_balance + v_payable_amount where consignor_id = v_owner_entity_id;
    end if;
  else
    -- Normal sale (own) — cash/credit ตาม payment_method (มติการ์ด payment_method):
    -- ขายเชื่อ -> Dr ลูกหนี้การค้า; อื่นๆ (cash/bank_transfer/card/other) -> Dr เงินสด-ธนาคาร
    v_cash_or_ar_account := case when p_sale.payment_method = 'credit' then '1020100' else '1010100' end;
    v_cogs_amount := coalesce(v_part.allocated_cost, v_part.price, 0) * p_sale.quantity_sold;

    v_description := 'ขายอะไหล่ (own) sale_id=' || p_sale.sale_id;
    v_lines := jsonb_build_array(
      jsonb_build_object('account_code', v_cash_or_ar_account, 'debit', v_sale_amount + v_vat_amount, 'credit', 0, 'memo', 'รับชำระ/ลูกหนี้จากการขาย'),
      jsonb_build_object('account_code', '4060100', 'debit', 0, 'credit', v_sale_amount, 'memo', 'รายได้จากการขายอะไหล่'),
      jsonb_build_object('account_code', '2050100', 'debit', 0, 'credit', v_vat_amount, 'memo', 'ภาษีขายรอนำส่ง'),
      jsonb_build_object('account_code', '5080100', 'debit', v_cogs_amount, 'credit', 0, 'memo', 'ต้นทุนขายอะไหล่ (COGS)'),
      jsonb_build_object('account_code', '1030100', 'debit', 0, 'credit', v_cogs_amount, 'memo', 'ตัดสินค้าคงเหลือ')
    );
  end if;

  perform fn_insert_system_journal_entry(p_sale.shop_id, v_entry_date, v_description,
    case when v_effective_owner_type = 'consignment' then 'sale_consignment' else 'sale_own' end,
    'part_sales', p_sale.sale_id, v_lines);
end;
$$;

-- trigger function (thin wrapper) — delegate ไปที่ ..._body() ด้านบนทั้งหมด ใช้ร่วมกับ backfill
create or replace function fn_post_sale_journal_entry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform fn_post_sale_journal_entry_body(NEW);
  return NEW;
end;
$$;

drop trigger if exists trg_post_sale_journal_entry on part_sales;
create trigger trg_post_sale_journal_entry
  after insert or update of item_status, approval_status on part_sales
  for each row execute function fn_post_sale_journal_entry();

-- Enable/disable RPC — Owner/Manager เท่านั้น, backfill อัตโนมัติตอนเปิด (งวดปัจจุบันเท่านั้น)
create or replace function set_accounting_module_enabled(p_shop_id bigint, p_enabled boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_backfilled integer := 0;
  v_was_enabled boolean;
  v_plan text;
begin
  if not is_shop_member(p_shop_id, array['owner','manager']) then
    raise exception 'ไม่มีสิทธิ์เปิด/ปิดโมดูลบัญชี (เฉพาะเจ้าของ/ผู้จัดการ)';
  end if;

  -- Monetization gate (defense-in-depth ฝั่ง DB — คู่กับ UI gate ที่
  -- config/accountingConfig.js hasAccountingModuleFeature()/config/subscriptionTiers.js) ค่า tier
  -- ที่ผ่านได้ต้อง sync กับ config/subscriptionTiers.js เอง (pro/enterprise มี feature
  -- 'accounting_module'/'all') — ซ้ำกันตั้งใจแบบเดียวกับ VAT_RATE (ดู
  -- config/accountingConfig.js หัวไฟล์อธิบาย pattern นี้)
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

  return v_backfilled;
end;
$$;
grant execute on function set_accounting_module_enabled(bigint, boolean) to authenticated;
grant execute on function fn_seed_default_chart_of_accounts(bigint) to authenticated;

-- ------------------------------------------------------------
-- 11) จ่ายคืนผู้ฝากขาย + รับชำระ AR (ขายเชื่อ) — เหตุการณ์ "รับชำระจริง" ตามมติการ์ด
--     payment_method: "รับชำระจริง -> Dr เงินสด-ธนาคาร / Cr ลูกหนี้การค้า"
--     ขอบเขตรอบนี้: RPC เท่านั้น (ไม่มี UI เฉพาะ — ดูหมายเหตุใน accounting UI ว่าเป็น known gap)
-- ------------------------------------------------------------
create or replace function record_ar_payment_received(
  p_shop_id bigint, p_amount numeric, p_entry_date date, p_description text
) returns journal_entries
language plpgsql
security definer
set search_path = public
as $$
begin
  return create_journal_entry(
    p_shop_id, p_entry_date, coalesce(p_description, 'รับชำระหนี้ลูกหนี้การค้า'),
    'payment_received', null, null,
    jsonb_build_array(
      jsonb_build_object('account_code', '1010100', 'debit', p_amount, 'credit', 0, 'memo', 'รับเงินสด/ธนาคาร'),
      jsonb_build_object('account_code', '1020100', 'debit', 0, 'credit', p_amount, 'memo', 'ตัดลูกหนี้การค้า')
    )
  );
end;
$$;
grant execute on function record_ar_payment_received(bigint, numeric, date, text) to authenticated;

create or replace function record_consignor_payout(
  p_shop_id bigint, p_consignor_id bigint, p_amount numeric, p_entry_date date
) returns journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry journal_entries;
begin
  if not is_shop_member(p_shop_id, array['owner','manager']) then
    raise exception 'ไม่มีสิทธิ์จ่ายเงินคืนผู้ฝากขาย';
  end if;

  v_entry := create_journal_entry(
    p_shop_id, p_entry_date, 'จ่ายคืนผู้ฝากขาย consignor_id=' || p_consignor_id,
    'payment_received', 'consignors', p_consignor_id,
    jsonb_build_array(
      jsonb_build_object('account_code', '2010100', 'debit', p_amount, 'credit', 0, 'memo', 'ตัดเจ้าหนี้ผู้ฝากขาย'),
      jsonb_build_object('account_code', '1010100', 'debit', 0, 'credit', p_amount, 'memo', 'จ่ายเงินสด/ธนาคาร')
    )
  );

  update consignors set ar_payable_balance = ar_payable_balance - p_amount where consignor_id = p_consignor_id;

  return v_entry;
end;
$$;
grant execute on function record_consignor_payout(bigint, bigint, numeric, date) to authenticated;

-- ------------------------------------------------------------
-- Verification queries (run manually after applying):
--   select * from accounting_accounts where shop_id = <test_shop_id>;
--   select create_journal_entry(<shop_id>, current_date, 'test', 'manual', null, null,
--     '[{"account_code":"1010100","debit":100,"credit":0},{"account_code":"4060100","debit":0,"credit":100}]'::jsonb);
--   select set_accounting_module_enabled(<shop_id>, true);
--   select fn_is_period_closed(<shop_id>, current_date);
-- ------------------------------------------------------------
