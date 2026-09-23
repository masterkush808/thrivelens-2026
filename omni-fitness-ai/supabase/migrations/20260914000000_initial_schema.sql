-- ThriveLens A1 foundation.
-- Apply with `supabase db push` or `supabase migration up`.

create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  age integer check (age is null or age between 13 and 120),
  weight numeric check (weight is null or weight > 0),
  height numeric check (height is null or height > 0),
  gender text,
  goal text,
  activity_level text,
  experience text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  body_part text not null,
  target_muscle text,
  equipment text,
  difficulty text,
  instructions text,
  image_url text,
  video_url text,
  created_at timestamptz not null default now()
);

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  goal text,
  days_per_week integer not null default 4 check (days_per_week between 1 and 7),
  is_custom boolean not null default false,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  day_number integer not null check (day_number > 0),
  name text not null,
  focus text
);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.workout_days(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  sets integer not null default 3 check (sets > 0),
  reps text not null default '8-12',
  rest_seconds integer not null default 90 check (rest_seconds >= 0),
  "order" integer not null default 0 check ("order" >= 0),
  notes text
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.workout_plans(id) on delete set null,
  day_id uuid references public.workout_days(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  total_volume numeric,
  created_at timestamptz not null default now()
);

create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  session_id uuid references public.workout_sessions(id) on delete cascade,
  logged_at timestamptz not null default now(),
  sets_completed integer not null default 0 check (sets_completed >= 0),
  reps text,
  weight numeric,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  meal_type text not null,
  food_name text not null,
  calories integer not null default 0 check (calories >= 0),
  protein numeric not null default 0 check (protein >= 0),
  carbs numeric not null default 0 check (carbs >= 0),
  fat numeric not null default 0 check (fat >= 0),
  fiber numeric check (fiber is null or fiber >= 0),
  image_uri text,
  ai_confidence numeric check (ai_confidence is null or ai_confidence between 0 and 1),
  ai_model_version text,
  created_at timestamptz not null default now()
);

create table public.progress_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  weight numeric check (weight is null or weight > 0),
  body_fat numeric check (body_fat is null or body_fat between 0 and 100),
  notes text,
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  type text not null default 'workout_reminder',
  scheduled_at timestamptz not null,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);

create index exercises_body_part_idx on public.exercises(body_part);
create index workout_plans_user_id_idx on public.workout_plans(user_id);
create index workout_days_plan_id_idx on public.workout_days(plan_id);
create index workout_exercises_day_id_idx on public.workout_exercises(day_id);
create index workout_sessions_user_id_idx on public.workout_sessions(user_id);
create index workout_logs_user_id_idx on public.workout_logs(user_id);
create index food_logs_user_id_idx on public.food_logs(user_id);
create index progress_logs_user_id_idx on public.progress_logs(user_id);
create index notifications_user_id_idx on public.notifications(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger workout_plans_set_updated_at
before update on public.workout_plans
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'));
  return new;
end;
$$;

revoke all on public.profiles, public.exercises, public.workout_plans,
  public.workout_days, public.workout_exercises, public.workout_sessions,
  public.workout_logs, public.food_logs, public.progress_logs, public.notifications
from anon;

revoke all on public.profiles, public.exercises, public.workout_plans,
  public.workout_days, public.workout_exercises, public.workout_sessions,
  public.workout_logs, public.food_logs, public.progress_logs, public.notifications
from authenticated;

grant select, update on public.profiles to authenticated;
grant select on public.exercises to authenticated;
grant select, insert, update, delete on public.workout_plans to authenticated;
grant select, insert, update, delete on public.workout_days to authenticated;
grant select, insert, update, delete on public.workout_exercises to authenticated;
grant select, insert, update, delete on public.workout_sessions to authenticated;
grant select, insert, update, delete on public.workout_logs to authenticated;
grant select, insert, update, delete on public.food_logs to authenticated;
grant select, insert, update, delete on public.progress_logs to authenticated;
grant select, insert, update, delete on public.notifications to authenticated;

alter table public.profiles enable row level security;
alter table public.exercises enable row level security;
alter table public.workout_plans enable row level security;
alter table public.workout_days enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_logs enable row level security;
alter table public.food_logs enable row level security;
alter table public.progress_logs enable row level security;
alter table public.notifications enable row level security;

create policy profiles_select_own on public.profiles
for select to authenticated using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
for update to authenticated using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy exercises_read_authenticated on public.exercises
for select to authenticated using (true);

create policy workout_plans_own on public.workout_plans
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy workout_days_through_owned_plan on public.workout_days
for all to authenticated
using (exists (
  select 1 from public.workout_plans p
  where p.id = plan_id and p.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.workout_plans p
  where p.id = plan_id and p.user_id = (select auth.uid())
));

create policy workout_exercises_through_owned_plan on public.workout_exercises
for all to authenticated
using (exists (
  select 1
  from public.workout_days d
  join public.workout_plans p on p.id = d.plan_id
  where d.id = day_id and p.user_id = (select auth.uid())
))
with check (exists (
  select 1
  from public.workout_days d
  join public.workout_plans p on p.id = d.plan_id
  where d.id = day_id and p.user_id = (select auth.uid())
));

create policy workout_sessions_own on public.workout_sessions
for all to authenticated using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    plan_id is null
    or exists (
      select 1 from public.workout_plans p
      where p.id = plan_id and p.user_id = (select auth.uid())
    )
  )
  and (
    day_id is null
    or exists (
      select 1
      from public.workout_days d
      join public.workout_plans p on p.id = d.plan_id
      where d.id = day_id and p.user_id = (select auth.uid())
    )
  )
);

create policy workout_logs_own on public.workout_logs
for all to authenticated using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    session_id is null
    or exists (
      select 1 from public.workout_sessions s
      where s.id = session_id and s.user_id = (select auth.uid())
    )
  )
);

create policy food_logs_own on public.food_logs
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy progress_logs_own on public.progress_logs
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy notifications_own on public.notifications
for all to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
