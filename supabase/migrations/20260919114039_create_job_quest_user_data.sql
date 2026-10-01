-- Job Quest Guild Phase 3: user-owned cloud data only.
-- Target project ref is verified outside this migration before execution.

create table public.resume_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  skills jsonb not null default '[]'::jsonb,
  projects jsonb not null default '[]'::jsonb,
  experience jsonb,
  education jsonb,
  career_directions jsonb not null default '[]'::jsonb,
  parsed_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  source text not null check (source in ('104', '1111')),
  keyword text not null default '',
  location text not null default '',
  sort_by text not null default 'match',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_job_actions (
  user_id uuid not null references auth.users(id) on delete cascade,
  job_key text not null,
  source text not null check (source in ('104', '1111')),
  favorite boolean not null default false,
  viewed boolean not null default false,
  applied boolean not null default false,
  rejected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, job_key)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create trigger set_resume_profiles_updated_at
before update on public.resume_profiles
for each row execute function public.set_updated_at();

create trigger set_job_preferences_updated_at
before update on public.job_preferences
for each row execute function public.set_updated_at();

create trigger set_user_job_actions_updated_at
before update on public.user_job_actions
for each row execute function public.set_updated_at();

alter table public.resume_profiles enable row level security;
alter table public.job_preferences enable row level security;
alter table public.user_job_actions enable row level security;

revoke all on table public.resume_profiles from anon, authenticated;
revoke all on table public.job_preferences from anon, authenticated;
revoke all on table public.user_job_actions from anon, authenticated;
grant select, insert, update, delete on table public.resume_profiles to authenticated;
grant select, insert, update, delete on table public.job_preferences to authenticated;
grant select, insert, update, delete on table public.user_job_actions to authenticated;

revoke all on function public.set_updated_at() from public, anon, authenticated;

create policy "resume_profiles_select_own"
on public.resume_profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy "resume_profiles_insert_own"
on public.resume_profiles for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "resume_profiles_update_own"
on public.resume_profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "resume_profiles_delete_own"
on public.resume_profiles for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "job_preferences_select_own"
on public.job_preferences for select to authenticated
using ((select auth.uid()) = user_id);

create policy "job_preferences_insert_own"
on public.job_preferences for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "job_preferences_update_own"
on public.job_preferences for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "job_preferences_delete_own"
on public.job_preferences for delete to authenticated
using ((select auth.uid()) = user_id);

create policy "user_job_actions_select_own"
on public.user_job_actions for select to authenticated
using ((select auth.uid()) = user_id);

create policy "user_job_actions_insert_own"
on public.user_job_actions for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "user_job_actions_update_own"
on public.user_job_actions for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "user_job_actions_delete_own"
on public.user_job_actions for delete to authenticated
using ((select auth.uid()) = user_id);
