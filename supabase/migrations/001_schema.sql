create extension if not exists pgcrypto;

create table public.countries (
  id text primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique,
  name text not null,
  country_id text not null references public.countries(id),
  role text not null default 'technician' check (role in ('technician','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.farms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  country_id text not null references public.countries(id),
  region text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.farm_assignments (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  farm_id uuid not null references public.farms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, farm_id)
);

create table public.lots (
  id uuid primary key default gen_random_uuid(),
  farm_id uuid not null references public.farms(id) on delete cascade,
  name text not null,
  crop text not null,
  area_ha numeric check (area_ha is null or area_ha > 0),
  planting_year integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (farm_id, name)
);

create table public.monitoring_campaigns (
  id uuid primary key default gen_random_uuid(),
  country_id text not null references public.countries(id),
  name text not null,
  starts_on date not null,
  ends_on date,
  created_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);

create table public.devices (
  id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  label text,
  platform text,
  created_at timestamptz not null,
  last_seen_at timestamptz
);

create table public.sampling_sessions (
  id uuid primary key,
  technician_id uuid not null references public.profiles(id),
  country_id text not null references public.countries(id),
  farm_id uuid not null references public.farms(id),
  lot_id uuid not null references public.lots(id),
  campaign_id uuid references public.monitoring_campaigns(id),
  device_id uuid references public.devices(id),
  crop text not null,
  target_samples integer not null check (target_samples in (10,15)),
  status text not null check (status in ('in_progress','completed','cancelled')),
  started_at timestamptz not null,
  completed_at timestamptz,
  updated_at timestamptz not null,
  sync_status text not null check (sync_status in ('pending','syncing','synced','error')),
  summary jsonb,
  check (completed_at is null or completed_at >= started_at)
);

create table public.measurements (
  id uuid primary key,
  session_id uuid references public.sampling_sessions(id) on delete cascade,
  technician_id uuid not null references public.profiles(id),
  country_id text not null references public.countries(id),
  farm_id uuid references public.farms(id),
  lot_id uuid references public.lots(id),
  campaign_id uuid references public.monitoring_campaigns(id),
  sample_number integer check (sample_number is null or sample_number between 1 and 15),
  ph numeric not null check (ph between 0 and 14),
  temperature_c numeric check (temperature_c is null or temperature_c between -40 and 85),
  latitude numeric check (latitude is null or latitude between -90 and 90),
  longitude numeric check (longitude is null or longitude between -180 and 180),
  gps_accuracy_m numeric check (gps_accuracy_m is null or gps_accuracy_m >= 0),
  source text not null check (source in ('manual','bluetooth','simulated','demo')),
  captured_at timestamptz not null,
  updated_at timestamptz not null,
  sync_status text not null check (sync_status in ('pending','syncing','synced','error')),
  unique (session_id, sample_number),
  check ((latitude is null) = (longitude is null))
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id),
  entity text not null,
  record_id uuid,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

create or replace function public.is_assigned(target_farm uuid) returns boolean
language sql stable security definer set search_path = public
as $$ select public.is_admin() or exists(select 1 from public.farm_assignments where profile_id = auth.uid() and farm_id = target_farm) $$;

alter table public.countries enable row level security;
alter table public.profiles enable row level security;
alter table public.farms enable row level security;
alter table public.farm_assignments enable row level security;
alter table public.lots enable row level security;
alter table public.monitoring_campaigns enable row level security;
alter table public.devices enable row level security;
alter table public.sampling_sessions enable row level security;
alter table public.measurements enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_read_self on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy countries_read_own on public.countries for select using (public.is_admin() or id = (select country_id from public.profiles where id = auth.uid()));
create policy farms_read_assigned on public.farms for select using (public.is_assigned(id));
create policy assignments_read_self on public.farm_assignments for select using (profile_id = auth.uid() or public.is_admin());
create policy lots_read_assigned on public.lots for select using (public.is_assigned(farm_id));
create policy campaigns_read_country on public.monitoring_campaigns for select using (public.is_admin() or country_id = (select country_id from public.profiles where id = auth.uid()));
create policy devices_own on public.devices for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy sessions_read_own on public.sampling_sessions for select using (technician_id = auth.uid() or public.is_admin());
create policy sessions_insert_own on public.sampling_sessions for insert with check (
  technician_id = auth.uid() and public.is_assigned(farm_id)
  and country_id = (select country_id from public.profiles where id = auth.uid())
  and exists(select 1 from public.lots where id = lot_id and farm_id = sampling_sessions.farm_id)
);
create policy sessions_update_own on public.sampling_sessions for update using (technician_id = auth.uid() or public.is_admin()) with check (
  public.is_admin() or (technician_id = auth.uid() and public.is_assigned(farm_id)
  and country_id = (select country_id from public.profiles where id = auth.uid())
  and exists(select 1 from public.lots where id = lot_id and farm_id = sampling_sessions.farm_id))
);
create policy measurements_read_own on public.measurements for select using (technician_id = auth.uid() or public.is_admin());
create policy measurements_insert_own on public.measurements for insert with check (
  technician_id = auth.uid()
  and country_id = (select country_id from public.profiles where id = auth.uid())
  and (session_id is null or exists(select 1 from public.sampling_sessions s where s.id = session_id and s.technician_id = auth.uid() and public.is_assigned(s.farm_id)))
);
create policy measurements_update_own on public.measurements for update using (technician_id = auth.uid() or public.is_admin()) with check (public.is_admin() or technician_id = auth.uid());
create policy audit_read_admin on public.audit_events for select using (public.is_admin());
create policy audit_insert_own on public.audit_events for insert with check (user_id = auth.uid());

create index sessions_farm_lot_campaign_idx on public.sampling_sessions(farm_id, lot_id, campaign_id);
create index measurements_session_idx on public.measurements(session_id, sample_number);
