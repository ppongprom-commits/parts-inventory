-- ============================================================
-- Card: "Platform Revenue Module — บัญชีของบริษัทเจ้าของระบบเอง (Subscription + Commission)"
-- (19 ก.ค. 2026 — ขอบเขตรอบนี้: subscription revenue tracking เท่านั้น)
--
-- คนละชุดสมุดบัญชีจาก Accounting Module ของแต่ละอู่โดยสิ้นเชิง (ยังไม่มี Accounting Module เลย
-- ในระบบตอนนี้ — ยืนยันด้วย grep) การ์ดนี้คือบัญชีของบริษัท Beam Garage เอง เห็นได้เฉพาะ
-- Platform Admin — ตามธรรมเนียมเดียวกับ platform_admins/platform_audit_log: ตารางแยกจาก tenant
-- ทั้งหมด, enable RLS แต่ไม่สร้าง policy ใดๆ (เข้าถึงได้เฉพาะผ่าน service_role key เท่านั้น)
--
-- Commission (ทั้ง 2 กลไก a/b ในการ์ด) ยังไม่ทำรอบนี้ — บล็อกด้วย marketplace feature ที่ยังไม่ได้
-- ออกแบบ ไม่เดา schema/timing ล่วงหน้า — source_type/event_type ด้านล่างจึงมีแค่ 'subscription'/
-- 'manual' เท่านั้น เพิ่ม commission_* เข้า constraint ทีหลังตอนมีการ์ด marketplace แล้ว
--
-- Analyst เห็น journal เต็ม (ตัดสินใจกับผู้ใช้แล้ว 23 ก.ค. 2026 — ต่างจาก default ที่การ์ดเสนอไว้
-- ว่า Analyst เห็นแค่ dashboard สรุป) ดู DASHBOARD_ROLES/JOURNAL_DETAIL_ROLES ใน
-- app/api/platform/revenue/*/route.js
-- ============================================================

create table if not exists platform_journal_entries (
  entry_id        bigint generated always as identity primary key,
  entry_date      date not null default current_date,
  description     text not null,
  source_type     text not null check (source_type in ('subscription','manual')),
  source_event_id bigint,
  created_by      uuid references auth.users(id), -- null = ระบบสร้างเอง (เช่น cron recognition)
  created_at      timestamptz not null default now()
);

create table if not exists platform_journal_entry_lines (
  line_id      bigint generated always as identity primary key,
  entry_id     bigint not null references platform_journal_entries(entry_id) on delete cascade,
  account_code text not null, -- free-text — ยังไม่มีผังบัญชี (chart of accounts) จริงทั้งระดับ
                               -- tenant และ platform ในระบบนี้เลย เป็นการลดรูปที่ตั้งใจไว้
  debit        numeric not null default 0,
  credit       numeric not null default 0,
  shop_id      bigint references shops(shop_id), -- แถวนี้เกี่ยวกับอู่ไหน (สำหรับ MRR breakdown ต่อร้าน)
  created_at   timestamptz not null default now(),
  check (debit >= 0 and credit >= 0 and not (debit > 0 and credit > 0))
);
create index if not exists idx_platform_journal_entry_lines_entry on platform_journal_entry_lines (entry_id);
create index if not exists idx_platform_journal_entry_lines_shop on platform_journal_entry_lines (shop_id);

create table if not exists platform_revenue_events (
  event_id         bigint generated always as identity primary key,
  shop_id          bigint not null references shops(shop_id),
  event_type       text not null check (event_type in ('subscription')), -- commission_* ยังไม่เพิ่ม
  amount           numeric not null,
  recognized_at    timestamptz,
  deferred_until   timestamptz,
  period_start     date,
  period_end       date,
  journal_entry_id bigint references platform_journal_entries(entry_id), -- entry ตอน "รับเงิน"
  created_at       timestamptz not null default now()
);
create index if not exists idx_platform_revenue_events_shop on platform_revenue_events (shop_id);

create table if not exists platform_deferred_revenue_schedule (
  schedule_id                 bigint generated always as identity primary key,
  revenue_event_id            bigint not null references platform_revenue_events(event_id) on delete cascade,
  recognize_on                date not null,
  amount                      numeric not null,
  recognized                  boolean not null default false,
  recognized_journal_entry_id bigint references platform_journal_entries(entry_id),
  created_at                  timestamptz not null default now()
);
create index if not exists idx_deferred_revenue_schedule_recognize
  on platform_deferred_revenue_schedule (recognize_on) where recognized = false;

alter table platform_journal_entries enable row level security;
alter table platform_journal_entry_lines enable row level security;
alter table platform_revenue_events enable row level security;
alter table platform_deferred_revenue_schedule enable row level security;
-- ไม่สร้าง policy ใดๆ ทั้งสิ้น — ตรงกับธรรมเนียม platform_admins/platform_audit_log: เข้าถึงได้
-- เฉพาะผ่าน service_role key (app/api/platform/**\/route.js) เท่านั้น ร้าน/อู่ไม่มีทางเห็นได้เลย

-- ------------------------------------------------------------
-- ต้องขยาย CHECK constraint ของ platform_audit_log.action ก่อน ไม่งั้น insert จาก RPC ด้านล่าง
-- จะพังด้วยปัญหาเดียวกับที่เคยเกิดกับ platform_update_shop_subscription ก่อนแก้ในการ์ด
-- platform_admin_rpc_auth_check_migration.sql — ต้อง include ค่าที่ live อยู่แล้วทั้งหมดด้วย
-- (ตรวจสอบ live values ก่อนเขียนไฟล์นี้ ไม่ใช่เดาจากไฟล์ migration เก่าไฟล์เดียว)
-- ------------------------------------------------------------
alter table platform_audit_log drop constraint if exists platform_audit_log_action_check;
alter table platform_audit_log add constraint platform_audit_log_action_check
  check (action in (
    'subscription_edit','join_as_support','admin_added','admin_removed','admin_role_changed',
    'burst_mode_extension_override','revenue_journal_entry_created'
  ));

-- ------------------------------------------------------------
-- บันทึก journal entry แบบมี actor จริง (ใช้จากหน้า "Record subscription payment") — pattern
-- เดียวกับ platform_add_admin/platform_update_shop_subscription (db/platform_admin_rpc_auth_check_
-- migration.sql): รับ p_actor_user_id จาก route.js ที่ verify ตัวตนจริงมาแล้วผ่าน
-- requirePlatformRole(), lookup role จริงจาก platform_admins เอง (ไม่เชื่อ role ที่ผู้เรียกอ้างมา)
-- + defense-in-depth เช็ค auth.uid() คู่ (เผื่อ grant หลุดไปเปิดให้ authenticated เรียกตรงในอนาคต)
-- ------------------------------------------------------------
create or replace function create_platform_journal_entry(
  p_actor_user_id   uuid,
  p_description     text,
  p_source_type     text,
  p_source_event_id bigint,
  p_lines           jsonb  -- [{account_code, debit, credit, shop_id}]
) returns platform_journal_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_role text;
  v_entry platform_journal_entries;
  v_total_debit numeric;
  v_total_credit numeric;
begin
  if auth.uid() is not null and auth.uid() <> p_actor_user_id then
    raise exception 'ไม่มีสิทธิ์ทำรายการนี้ (actor ไม่ตรงกับ session)';
  end if;

  select role into v_actor_role from platform_admins where user_id = p_actor_user_id;
  if v_actor_role is null or v_actor_role <> 'super_admin' then
    raise exception 'ไม่มีสิทธิ์บันทึกรายการบัญชีของแพลตฟอร์ม';
  end if;

  select coalesce(sum((l->>'debit')::numeric),0), coalesce(sum((l->>'credit')::numeric),0)
    into v_total_debit, v_total_credit
  from jsonb_array_elements(p_lines) l;

  if v_total_debit <> v_total_credit then
    raise exception 'รายการไม่สมดุล: debit % ไม่เท่ากับ credit %', v_total_debit, v_total_credit;
  end if;

  insert into platform_journal_entries (description, source_type, source_event_id, created_by)
  values (p_description, p_source_type, p_source_event_id, p_actor_user_id)
  returning * into v_entry;

  insert into platform_journal_entry_lines (entry_id, account_code, debit, credit, shop_id)
  select v_entry.entry_id, l->>'account_code', (l->>'debit')::numeric, (l->>'credit')::numeric,
         nullif(l->>'shop_id','')::bigint
  from jsonb_array_elements(p_lines) l;

  insert into platform_audit_log (admin_user_id, admin_role, action, status, new_data)
  values (p_actor_user_id, v_actor_role, 'revenue_journal_entry_created', 'success', to_jsonb(v_entry));

  return v_entry;
end;
$$;

revoke execute on function create_platform_journal_entry(uuid, text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function create_platform_journal_entry(uuid, text, text, bigint, jsonb) to service_role;

-- ------------------------------------------------------------
-- รับรู้รายได้รับล่วงหน้าตามกำหนด — เรียกจาก pg_cron (ไม่มี actor ผู้ใช้จริง) จึงเป็นฟังก์ชันแยก
-- ไม่ผ่าน create_platform_journal_entry (ซึ่งบังคับ actor ต้องเป็น super_admin จริงใน
-- platform_admins) — insert entry/lines/audit log เองตรงๆ balance โดยธรรมชาติ (2 บรรทัดเท่ากันเสมอ)
-- ไม่ต้องเช็ค sum แยกเหมือนฟังก์ชันข้างบนที่รับ arbitrary lines จาก client
-- Idempotent เต็มรูป — เรียกซ้ำกี่ครั้งก็ได้ไม่เกิดรายการซ้ำ (WHERE recognized = false)
-- ------------------------------------------------------------
create or replace function recognize_due_platform_revenue()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_schedule record;
  v_entry platform_journal_entries;
  v_count integer := 0;
  v_system_actor uuid := '00000000-0000-0000-0000-000000000000'; -- sentinel: ไม่ใช่ auth.users จริง
                                                                    -- ใช้เฉพาะใน platform_audit_log
                                                                    -- (ไม่มี FK ไปตารางนั้น) ห้ามใช้
                                                                    -- ใน platform_journal_entries.
                                                                    -- created_by (มี FK -> auth.users)
begin
  for v_schedule in
    select s.schedule_id, s.revenue_event_id, s.amount, e.shop_id as event_shop_id
    from platform_deferred_revenue_schedule s
    join platform_revenue_events e on e.event_id = s.revenue_event_id
    where s.recognize_on <= current_date and s.recognized = false
    order by s.recognize_on
    for update of s
  loop
    insert into platform_journal_entries (description, source_type, source_event_id, created_by)
    values ('รับรู้รายได้ค่าบริการ SaaS (deferred revenue recognition)', 'subscription',
            v_schedule.revenue_event_id, null)
    returning * into v_entry;

    insert into platform_journal_entry_lines (entry_id, account_code, debit, credit, shop_id)
    values
      (v_entry.entry_id, 'deferred_revenue', v_schedule.amount, 0, v_schedule.event_shop_id),
      (v_entry.entry_id, 'saas_service_revenue', 0, v_schedule.amount, v_schedule.event_shop_id);

    update platform_deferred_revenue_schedule
    set recognized = true, recognized_journal_entry_id = v_entry.entry_id
    where schedule_id = v_schedule.schedule_id;

    insert into platform_audit_log (admin_user_id, admin_role, action, status, target_shop_id, new_data)
    values (v_system_actor, 'system', 'revenue_journal_entry_created', 'success',
            v_schedule.event_shop_id, to_jsonb(v_entry));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke execute on function recognize_due_platform_revenue() from public, anon, authenticated;
grant execute on function recognize_due_platform_revenue() to service_role;

-- ------------------------------------------------------------
-- pg_cron: เรียกทุกวัน 01:00 — idempotent อยู่แล้ว รันถี่แค่ไหนก็ปลอดภัย รันรายวันแทนรายเดือนเพื่อ
-- เก็บแถวที่ถึงกำหนดให้ไวหลัง recognize_on โดยไม่ต้องกังวลเรื่อง timing รายเดือน (เช่นเดือนกุมภา)
-- pg_cron ติดตั้งอยู่แล้วบน project นี้ (ยืนยันผ่าน list_extensions ก่อนเขียนไฟล์นี้)
-- หมายเหตุ: แก้ปัญหา cron เฉพาะของฟีเจอร์นี้เท่านั้น — Field Scanner Role/Stock Value Cap Engine
-- ยังมีช่องโหว่ "ยังไม่ตัดสินใจกลไก cron" ค้างอยู่เหมือนเดิม ไม่ได้แก้ให้ในรอบนี้ (นอกขอบเขตการ์ดนี้)
-- ------------------------------------------------------------
select cron.unschedule('recognize-platform-deferred-revenue')
  where exists (select 1 from cron.job where jobname = 'recognize-platform-deferred-revenue');

select cron.schedule(
  'recognize-platform-deferred-revenue',
  '0 1 * * *',
  $$select recognize_due_platform_revenue()$$
);

-- ------------------------------------------------------------
-- Verification query (run manually after applying):
--   select jobname, schedule, active from cron.job where jobname = 'recognize-platform-deferred-revenue';
--   select recognize_due_platform_revenue(); -- ควรคืน 0 ถ้าไม่มีอะไรถึงกำหนด (ยังไม่มีข้อมูลจริง)
-- ------------------------------------------------------------
