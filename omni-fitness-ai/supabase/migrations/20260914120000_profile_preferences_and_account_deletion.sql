alter table public.profiles
  add column if not exists calorie_target integer check (calorie_target is null or calorie_target > 0),
  add column if not exists protein_target numeric check (protein_target is null or protein_target >= 0),
  add column if not exists dietary_preference text,
  add column if not exists training_days_per_week integer check (training_days_per_week is null or training_days_per_week between 1 and 7),
  add column if not exists session_duration_minutes integer check (session_duration_minutes is null or session_duration_minutes between 10 and 180),
  add column if not exists workout_location text,
  add column if not exists workout_type text;

create or replace function public.delete_current_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_current_account() from public, anon;
grant execute on function public.delete_current_account() to authenticated;
