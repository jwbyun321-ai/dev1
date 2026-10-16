-- 새 Supabase 프로젝트의 SQL Editor에서 실행합니다.
begin;
create table public.work_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  work_date date not null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  project text not null default '' check (char_length(project) <= 80),
  content text not null default '' check (char_length(content) <= 10000),
  status text not null default '진행 중' check (status in ('대기','진행 중','완료')),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index work_logs_user_date_idx on public.work_logs(user_id, work_date desc);
alter table public.work_logs enable row level security;
revoke all on public.work_logs from anon;
grant select, insert, update on public.work_logs to authenticated;
revoke delete on public.work_logs from authenticated;
create policy work_logs_read_own on public.work_logs for select to authenticated using ((select auth.uid()) = user_id);
create policy work_logs_insert_own on public.work_logs for insert to authenticated with check ((select auth.uid()) = user_id);
create policy work_logs_update_own on public.work_logs for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
commit;
