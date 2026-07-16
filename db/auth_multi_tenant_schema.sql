-- ============================================================
-- Multi-Tenant Auth Schema — พร้อมรันจริง
-- ต้องเปิด Email Auth ใน Supabase Dashboard (Authentication > Providers)
-- ก่อนรันไฟล์นี้ (ปกติเปิดเป็น default อยู่แล้ว เช็คให้แน่ใจอีกที)
-- ============================================================

-- ------------------------------------------------------------
-- 1) shops
-- ------------------------------------------------------------
create table shops (
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

-- ------------------------------------------------------------
-- 2) shop_members
-- ------------------------------------------------------------
create table shop_members (
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

create index idx_shop_members_user on shop_members (user_id);
create index idx_shop_members_shop on shop_members (shop_id);

-- ------------------------------------------------------------
-- 3) shop_invites — เชิญคนที่ยังไม่มี account เข้าอู่ผ่านอีเมล
-- ------------------------------------------------------------
create table shop_invites (
  invite_id     bigint generated always as identity primary key,
  shop_id       bigint not null references shops(shop_id) on delete cascade,
  email         text not null,
  role          text not null
    check (role in ('manager','supervisor','technician','assistant')), -- เชิญเป็น owner ไม่ได้
  invited_by    uuid not null references auth.users(id),
  accepted_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (shop_id, email)
);

-- ------------------------------------------------------------
-- 4) user_sessions — บังคับ maxDevicesPerUser / maxConcurrentSessions
--    (ตัวเลขจริงอ่านจาก config/subscriptionTiers.js ฝั่งแอป)
-- ------------------------------------------------------------
create table user_sessions (
  session_id    bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id),
  shop_id       bigint not null references shops(shop_id) on delete cascade,
  device_label  text,
  ip_address    inet,
  last_seen_at  timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index idx_user_sessions_user on user_sessions (user_id);
create index idx_user_sessions_shop on user_sessions (shop_id);

-- ------------------------------------------------------------
-- 5) เพิ่ม shop_id ให้ตารางที่ต้องแยกข้อมูลตามอู่
-- ------------------------------------------------------------
alter table parts   add column if not exists shop_id bigint references shops(shop_id);
alter table zones   add column if not exists shop_id bigint references shops(shop_id);
alter table options add column if not exists shop_id bigint references shops(shop_id);

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- สร้างอู่ใหม่ + ตั้งผู้สมัครเป็น owner ทันที (เรียกตอน signup)
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

-- สร้างคำเชิญ (เฉพาะ owner/manager ของอู่นั้นเรียกได้)
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

-- ผู้ใช้ที่ signup ใหม่ เรียกฟังก์ชันนี้เพื่อเช็ค+รับคำเชิญที่ค้างอยู่ตามอีเมลตัวเอง
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

-- เปลี่ยนสิทธิ์/ปิดการใช้งานสมาชิก (owner/manager เท่านั้น, แก้ตัวเองไม่ได้)
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

-- ============================================================
-- Helper functions ใช้ใน RLS
-- ============================================================
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

-- ============================================================
-- RLS: shops, shop_members, shop_invites, user_sessions
-- ============================================================
alter table shops enable row level security;
alter table shop_members enable row level security;
alter table shop_invites enable row level security;
alter table user_sessions enable row level security;

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

-- ============================================================
-- RLS: parts / zones / options — บังคับแยกตามอู่ + ตามสิทธิ์
-- ============================================================
alter table parts enable row level security;
alter table zones enable row level security;
alter table options enable row level security;

drop policy if exists "Allow public read" on parts;
drop policy if exists "Allow public insert" on parts;
drop policy if exists "Allow public update" on parts;
drop policy if exists "Allow public delete" on parts;

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

drop policy if exists "Allow public read zones" on zones;
drop policy if exists "Allow public insert zones" on zones;
drop policy if exists "Allow public delete zones" on zones;

create policy "shop members can view zones" on zones
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

create policy "managers+ can manage zones" on zones
  for all using (is_shop_member(shop_id, array['owner','manager']))
  with check (is_shop_member(shop_id, array['owner','manager']));

drop policy if exists "Allow public read options" on options;
drop policy if exists "Allow public insert options" on options;
drop policy if exists "Allow public delete options" on options;

create policy "shop members can view options" on options
  for select using (is_shop_member(shop_id, array['owner','manager','supervisor','technician','assistant']));

create policy "managers+ can manage options" on options
  for all using (is_shop_member(shop_id, array['owner','manager']))
  with check (is_shop_member(shop_id, array['owner','manager']));

-- ============================================================
-- ⚠️ หลังรันไฟล์นี้: parts/zones/options เก่าทั้งหมด (ที่ shop_id = null)
-- จะ "มองไม่เห็น" เพราะ RLS บังคับ shop_id ต้องตรงกับ shop ที่ user เป็นสมาชิก
-- ต้อง signup สร้างอู่แรกก่อน แล้วรัน UPDATE ผูกข้อมูลเก่าเข้าอู่นั้น
-- (ดูขั้นตอนใน README หัวข้อ "Migrate ข้อมูลเดิมเข้าอู่แรก")
-- ============================================================
