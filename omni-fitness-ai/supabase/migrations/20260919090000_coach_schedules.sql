alter table public.profiles
  add column if not exists goal_timeline text;

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_id uuid,
  kind text not null default 'meal_prep' check (kind in ('workout', 'meal_prep')),
  title text not null,
  scheduled_for timestamptz not null,
  detail_json jsonb,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists schedules_user_idx
  on public.schedules(user_id, status, scheduled_for);

alter table public.schedules enable row level security;

drop policy if exists schedules_own on public.schedules;
create policy schedules_own on public.schedules
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.touch_schedule_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists schedules_touch_updated_at on public.schedules;
create trigger schedules_touch_updated_at
  before update on public.schedules
  for each row execute function public.touch_schedule_updated_at();