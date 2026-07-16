-- ================================================================
-- FRESH PROJECT — FULL SCHEMA (รันไฟล์นี้ไฟล์เดียวจบ บน project Supabase ใหม่)
-- ลำดับการรัน:
--   1. ไฟล์นี้ (fresh_project_full_schema.sql)
--   2. db/car_models_migration_data.sql  หรือ  seed_from_v7_adjusted.sql (ข้อมูลรถ)
--   3. สร้าง Storage bucket "part-photos" ผ่าน Dashboard (ทำเองไม่ได้ผ่าน SQL)
--   4. Signup สร้างบัญชีแรก (owner) ผ่านหน้าเว็บ /signup
--   5. รัน SQL เพิ่มตัวเองเป็น platform_admin (คอมเมนต์อยู่ท้ายไฟล์นี้)
--   6. เพิ่มค่าเริ่มต้นให้ options (สภาพ/ที่มา/สถานะ) ผ่านหน้า /admin/options เอง
--      (เพราะ options ผูกกับ shop_id ตั้งแต่ต้น ไม่มี seed กลางให้)
-- ================================================================

create extension if not exists pgcrypto;

-- ================================================================
-- ส่วนที่ 1: ข้อมูลรถอ้างอิง (global, ไม่ผูกกับอู่ไหน)
-- ================================================================

create table if not exists brands (
  brand_id        bigint generated always as identity primary key,
  brand_name      text not null unique,
  country_origin  text,
  notes           text,
  created_at      timestamptz not null default now()
);

create table if not exists models (
  model_id        bigint generated always as identity primary key,
  brand_id        bigint not null references brands(brand_id) on delete restrict,
  model_name      text not null,
  notes           text,
  created_at      timestamptz not null default now(),
  unique (brand_id, model_name)
);

create table if not exists model_generations (
  generation_id      bigint generated always as identity primary key,
  model_id           bigint not null references models(model_id) on delete restrict,
  generation_code    text not null,
  vehicle_type       text,
  year_start         smallint,
  year_start_approx  boolean not null default false,
  year_end           smallint,
  year_end_approx    boolean not null default false,
  is_current         boolean not null default false,
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (model_id, generation_code)
);

create or replace view model_generations_display as
select
  g.generation_id,
  b.brand_id,
  b.brand_name,
  m.model_id,
  m.model_name,
  g.generation_code,
  g.vehicle_type,
  concat(
    coalesce(
      (case when g.year_start_approx then '~' else '' end) || g.year_start::text,
      'ไม่ทราบปี'
    ),
    ' - ',
    case
      when g.is_current then 'ปัจจุบัน'
      when g.year_end is null then 'ไม่ทราบปี'
      else (case when g.year_end_approx then '~' else '' end) || g.year_end::text
    end
  ) as year_range_display,
  g.note,
  g.updated_at
from model_generations g
join models m on m.model_id = g.model_id
join brands b on b.brand_id = m.brand_id;

create table if not exists audit_log (
  audit_id              bigint generated always as identity primary key,
  table_name            text not null,
  record_id             bigint not null,
  action                text not null check (action in ('INSERT','UPDATE','DELETE')),
  old_data              jsonb,
  new_data              jsonb,
  changed_by_ip         inet,
  changed_by_user_agent text,
  changed_by_user_id    uuid,
  changed_at            timestamptz not null default now()
);

create index if not exists idx_audit_log_table_record on audit_log (table_name, record_id);
create index if not exists idx_audit_log_changed_at   on audit_log (changed_at);

alter table brands enable row level security;
alter table models enable row level security;
alter table model_generations enable row level security;
alter table audit_log enable row level security;

drop policy if exists "Allow public read brands" on brands;
drop policy if exists "Allow public read models" on models;
drop policy if exists "Allow public read model_generations" on model_generations;
drop policy if exists "Allow public read audit_log" on audit_log;

create policy "Allow public read brands" on brands for select using (true);
create policy "Allow public read models" on models for select using (true);
create policy "Allow public read model_generations" on model_generations for select using (true);
create policy "Allow public read audit_log" on audit_log for select using (true);

create or replace function get_or_create_brand(p_brand_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand_id bigint;
begin
  select brand_id into v_brand_id from brands where brand_name = p_brand_name;
  if v_brand_id is null then
    insert into brands (brand_name) values (p_brand_name) returning brand_id into v_brand_id;
  end if;
  return v_brand_id;
end;
$$;

create or replace function get_or_create_model(p_brand_id bigint, p_model_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_model_id bigint;
begin
  select model_id into v_model_id from models where brand_id = p_brand_id and model_name = p_model_name;
  if v_model_id is null then
    insert into models (brand_id, model_name) values (p_brand_id, p_model_name) returning model_id into v_model_id;
  end if;
  return v_model_id;
end;
$$;

create or replace function insert_model_generation(
  p_model_id           bigint,
  p_generation_code    text,
  p_vehicle_type       text,
  p_year_start         smallint,
  p_year_start_approx  boolean,
  p_year_end           smallint,
  p_year_end_approx    boolean,
  p_is_current         boolean,
  p_note               text,
  p_client_ip          inet,
  p_user_agent         text
) returns model_generations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new model_generations;
begin
  insert into model_generations (
    model_id, generation_code, vehicle_type,
    year_start, year_start_approx, year_end, year_end_approx,
    is_current, note
  ) values (
    p_model_id, p_generation_code, p_vehicle_type,
    p_year_start, p_year_start_approx, p_year_end, p_year_end_approx,
    p_is_current, p_note
  )
  returning * into v_new;

  insert into audit_log (table_name, record_id, action, old_data, new_data, changed_by_ip, changed_by_user_agent)
  values ('model_generations', v_new.generation_id, 'INSERT', null, to_jsonb(v_new), p_client_ip, p_user_agent);

  return v_new;
end;
$$;

create or replace function update_model_generation(
  p_generation_id      bigint,
  p_generation_code    text,
  p_vehicle_type       text,
  p_year_start         smallint,
  p_year_start_approx  boolean,
  p_year_end           smallint,
  p_year_end_approx    boolean,
  p_is_current         boolean,
  p_note               text,
  p_client_ip          inet,
  p_user_agent         text
) returns model_generations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old model_generations;
  v_new model_generations;
begin
  select * into v_old from model_generations where generation_id = p_generation_id for update;

  update model_generations set
    generation_code   = p_generation_code,
    vehicle_type      = p_vehicle_type,
    year_start        = p_year_start,
    year_start_approx = p_year_start_approx,
    year_end          = p_year_end,
    year_end_approx   = p_year_end_approx,
    is_current        = p_is_current,
    note              = p_note,
    updated_at        = now()
  where generation_id = p_generation_id
  returning * into v_new;

  insert into audit_log (table_name, record_id, action, old_data, new_data, changed_by_ip, changed_by_user_agent)
  values ('model_generations', p_generation_id, 'UPDATE', to_jsonb(v_old), to_jsonb(v_new), p_client_ip, p_user_agent);

  return v_new;
end;
$$;

grant execute on function get_or_create_brand(text) to anon, authenticated;
grant execute on function get_or_create_model(bigint, text) to anon, authenticated;
grant execute on function insert_model_generation(
  bigint, text, text, smallint, boolean, smallint, boolean, boolean, text, inet, text
) to anon, authenticated;
grant execute on function update_model_generation(
  bigint, text, text, smallint, boolean, smallint, boolean, boolean, text, inet, text
) to anon, authenticated;

-- ================================================================
-- ส่วนที่ 2: Multi-tenant (shops, สมาชิก, สิทธิ์, session)
-- ================================================================

create table if not exists shops (
  shop_id             bigint generated always as identity primary key,
  shop_name           text not null,
  owner_user_id       uuid not null references auth.users(id),
  subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing','active','past_due','suspended','canceled')),
  subscription_plan   text not null default 'trial'
    check (subscription_plan in ('trial','starter','founder','pro','enterprise')),
  trial_ends_at        timestamptz,
  current_period_end   timestamptz,
  past_due_since        timestamptz,
  suspended_at          timestamptz,
  canceled_at           timestamptz,
  created_at           timestamptz not null default now()
);

create table if not exists shop_members (
  member_id     bigint generated always as identity primary key,
  shop_id       bigint not null references shops(shop_id) on delete cascade,
  user_id       uuid not null references auth.users(id),
  role          text not null
    check (role in ('owner','manager','supervisor','technician','assistant')),
  status        text not null default 'active'
    check (status in ('active','invited','disabled')),
  invited_by    uuid references auth.users(id),
  created_at    timestamptz not null default now(),
  unique (shop_id, user_id)
);

create index if not exists idx_shop_members_user on shop_members (user_id);
create index if not exists idx_shop_members_shop on shop_members (shop_id);

create table if not exists shop_invites (
  invite_id     bigint generated always as identity primary key,
  shop_id       bigint not null references shops(shop_id) on delete cascade,
  email         text not null,
  role          text not null
    check (role in ('manager','supervisor','technician','assistant')),
  invited_by    uuid not null references auth.users(id),
  accepted_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (shop_id, email)
);

create table if not exists user_sessions (
  session_id    bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id),
  shop_id       bigint not null references shops(shop_id) on delete cascade,
  device_label  text,
  ip_address    inet,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_user_sessions_user on user_sessions (user_id);
create index if not exists idx_user_sessions_shop on user_sessions (shop_id);

create table if not exists platform_admins (
  user_id     uuid primary key references auth.users(id),
  note        text,
  created_at  timestamptz not null default now()
);

create or replace function create_shop_with_owner(p_shop_name text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id bigint;
begin
  insert into shops (shop_name, owner_user_id, subscription_status, subscription_plan, trial_ends_at)
  values (p_shop_name, auth.uid(), 'trialing', 'trial', now() + interval '14 days')
  returning shop_id into v_shop_id;

  insert into shop_members (shop_id, user_id, role, status)
  values (v_shop_id, auth.uid(), 'owner', 'active');

  return v_shop_id;
end;
$$;

grant execute on function create_shop_with_owner(text) to authenticated;

create or replace function create_shop_invite(p_shop_id bigint, p_email text, p_role text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite_id bigint;
  v_caller_role text;
begin
  select role into v_caller_role from shop_members
  where shop_id = p_shop_id and user_id = auth.uid() and status = 'active';

  if v_caller_role is null or v_caller_role not in ('owner','manager') then
    raise exception 'ไม่มีสิทธิ์เชิญสมาชิกในอู่นี้';
  end if;

  insert into shop_invites (shop_id, email, role, invited_by)
  values (p_shop_id, lower(p_email), p_role, auth.uid())
  on conflict (shop_id, email) do update set role = excluded.role, accepted_at = null
  returning invite_id into v_invite_id;

  return v_invite_id;
end;
$$;

grant execute on function create_shop_invite(bigint, text, text) to authenticated;

create or replace function accept_pending_invites()
returns setof shop_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_invite record;
begin
  select email into v_email from auth.users where id = auth.uid();

  for v_invite in
    select * from shop_invites where lower(email) = lower(v_email) and accepted_at is null
  loop
    insert into shop_members (shop_id, user_id, role, status, invited_by)
    values (v_invite.shop_id, auth.uid(), v_invite.role, 'active', v_invite.invited_by)
    on conflict (shop_id, user_id) do nothing;

    update shop_invites set accepted_at = now() where invite_id = v_invite.invite_id;
  end loop;

  return query select * from shop_members where user_id = auth.uid();
end;
$$;

grant execute on function accept_pending_invites() to authenticated;

create or replace function update_member_role(p_member_id bigint, p_new_role text, p_new_status text)
returns shop_members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target shop_members;
  v_caller_role text;
begin
  select * into v_target from shop_members where member_id = p_member_id;

  select role into v_caller_role from shop_members
  where shop_id = v_target.shop_id and user_id = auth.uid() and status = 'active';

  if v_caller_role is null or v_caller_role not in ('owner','manager') then
    raise exception 'ไม่มีสิทธิ์แก้ไขสมาชิกในอู่นี้';
  end if;

  if v_target.user_id = auth.uid() then
    raise exception 'แก้ไขสิทธิ์ตัวเองไม่ได้';
  end if;

  update shop_members set role = p_new_role, status = p_new_status
  where member_id = p_member_id
  returning * into v_target;

  return v_target;
end;
$$;

grant execute on function update_member_role(bigint, text, text) to authenticated;

create or replace function is_shop_member(p_shop_id bigint, p_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from shop_members
    where shop_id = p_shop_id
      and user_id = auth.uid()
      and status = 'active'
      and role = any(p_roles)
  );
$$;

create or replace function is_shop_active(p_shop_id bigint)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select subscription_status in ('trialing','active','past_due')
  from shops where shop_id = p_shop_id;
$$;

alter table shops enable row level security;
alter table shop_members enable row level security;
alter table shop_invites enable row level security;
alter table user_sessions enable row level security;
alter table platform_admins enable row level security;
-- platform_admins ไม่มี policy เลย -> เข้าถึงได้แค่ผ่าน service role key เท่านั้น

create policy "members can view own shop" on shops
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

create policy "members can view shop_members of own shop" on shop_members
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

create policy "owner/manager can view invites" on shop_invites
  for select using (is_shop_member(shop_id, array['owner','manager']));

create policy "users manage own sessions" on user_sessions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "members can view shop sessions" on user_sessions
  for select using (is_shop_member(shop_id, array['owner','manager']));

-- ================================================================
-- ส่วนที่ 3: parts / zones / options — ผูกกับอู่ตั้งแต่ต้น (shop-scoped)
-- ================================================================

create table if not exists parts (
  id                uuid default gen_random_uuid() primary key,
  shop_id           bigint references shops(shop_id),
  photo_url         text,
  photo_urls        text[],
  part_name         text not null,
  car_brand         text,
  car_model         text,
  generation_id     bigint references model_generations(generation_id),
  car_year_display  text,
  condition         text,
  zone_code         text,
  source_type       text,
  status            text default 'available',
  is_active         boolean not null default true,
  price             numeric,
  created_at        timestamp default now()
);

create table if not exists zones (
  id          uuid default gen_random_uuid() primary key,
  shop_id     bigint references shops(shop_id),
  code        text not null,
  name        text,
  created_at  timestamp default now()
);

create table if not exists options (
  id          uuid default gen_random_uuid() primary key,
  shop_id     bigint references shops(shop_id),
  category    text not null,
  value       text not null,
  sort_order  integer default 0,
  created_at  timestamp default now()
);

alter table parts enable row level security;
alter table zones enable row level security;
alter table options enable row level security;

create policy "shop members can view parts" on parts
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

create policy "eligible roles can insert parts" on parts
  for insert with check (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant'])
    and is_shop_active(shop_id)
  );

create policy "eligible roles can update parts" on parts
  for update using (
    is_shop_member(shop_id, array['owner','manager','supervisor','technician'])
  );

create policy "managers+ can hard delete parts" on parts
  for delete using (is_shop_member(shop_id, array['owner','manager']));

create policy "shop members can view zones" on zones
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

create policy "managers+ can manage zones" on zones
  for all using (is_shop_member(shop_id, array['owner','manager']))
  with check (is_shop_member(shop_id, array['owner','manager']));

create policy "shop members can view options" on options
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

create policy "managers+ can manage options" on options
  for all using (is_shop_member(shop_id, array['owner','manager']))
  with check (is_shop_member(shop_id, array['owner','manager']));

-- ================================================================
-- ขั้นตอนถัดไปหลังรันไฟล์นี้จบ (ทำตามลำดับ):
--
-- 1. รัน db/car_models_migration_data.sql (ถ้าอยากได้ข้อมูล 311 รุ่นเดิม)
--    หรือ seed_from_v7_adjusted.sql (ถ้าอยากได้ข้อมูล 395 รุ่นชุดใหม่ที่สะอาดกว่า)
--    ทั้งคู่รันได้ตรงๆ กับ project ใหม่นี้เลย ไม่ต้องแก้อะไรเพิ่ม
--
-- 2. Supabase Dashboard -> Storage -> New bucket -> ชื่อ "part-photos" -> Public
--    แล้วรัน SQL:
--    create policy "Allow public upload" on storage.objects
--      for insert with check (bucket_id = 'part-photos');
--    create policy "Allow public read photos" on storage.objects
--      for select using (bucket_id = 'part-photos');
--
-- 3. เข้า /signup สร้างบัญชีแรก (จะกลายเป็น owner ของอู่แรก)
--
-- 4. รัน SQL นี้ (แทนอีเมลด้วยของจริง) เพื่อตั้งตัวเองเป็น platform admin:
--    insert into platform_admins (user_id)
--    select id from auth.users where email = 'your-email@example.com';
--
-- 5. เข้า /admin/options เพิ่มค่าเริ่มต้นเอง (ไม่มี seed กลางให้เพราะผูกกับ shop_id):
--    สภาพ: ใหม่, มือสอง-ดี, มือสอง-ซ่อม, มือสองตามสภาพ
--    ที่มา: รถชน, ประกัน total loss, น้ำท่วม
--    สถานะ: available, reserved, sold
--
-- 6. เข้า /admin/zones เพิ่มโซนจัดเก็บตามต้องการ
-- ================================================================
