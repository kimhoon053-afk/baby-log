-- 아기 기록 앱: 가족 공유용 데이터베이스 설정
-- Supabase 대시보드 → SQL Editor 에 이 파일 내용을 통째로 붙여넣고 Run 을 누르면 됩니다.
-- 여러 번 실행해도 괜찮도록 만들어 두었습니다.

-- 1) 아기 (가족 하나 = 아기 하나)
create table if not exists public.babies (
  id uuid primary key default gen_random_uuid(),
  name text not null default '우리 아기',
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

-- 2) 가족 구성원 (누가 어느 아기 기록을 볼 수 있는지)
create table if not exists public.members (
  baby_id uuid not null references public.babies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null,
  joined_at timestamptz not null default now(),
  primary key (baby_id, user_id)
);

-- 3) 기록
create table if not exists public.logs (
  id text primary key,
  baby_id uuid not null references public.babies(id) on delete cascade,
  kind text not null check (kind in ('feed', 'diaper', 'sleep')),
  subtype text not null,
  amount_ml integer,
  start_at timestamptz not null,
  end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_by_name text
);
create index if not exists logs_baby_start_idx on public.logs (baby_id, start_at desc);

-- 지금 로그인한 사람이 이 아기의 가족인지 확인
create or replace function public.is_member(b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.members where baby_id = b and user_id = auth.uid());
$$;

-- 가족만 볼 수 있고, 가족만 쓸 수 있게 잠금
alter table public.babies enable row level security;
alter table public.members enable row level security;
alter table public.logs enable row level security;

drop policy if exists "family can read baby" on public.babies;
create policy "family can read baby" on public.babies
  for select to authenticated using (public.is_member(id));

drop policy if exists "family can rename baby" on public.babies;
create policy "family can rename baby" on public.babies
  for update to authenticated using (public.is_member(id)) with check (public.is_member(id));

drop policy if exists "family can see family" on public.members;
create policy "family can see family" on public.members
  for select to authenticated using (public.is_member(baby_id));

drop policy if exists "anyone can leave" on public.members;
create policy "anyone can leave" on public.members
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "family can read logs" on public.logs;
create policy "family can read logs" on public.logs
  for select to authenticated using (public.is_member(baby_id));

drop policy if exists "family can add logs" on public.logs;
create policy "family can add logs" on public.logs
  for insert to authenticated with check (public.is_member(baby_id));

drop policy if exists "family can edit logs" on public.logs;
create policy "family can edit logs" on public.logs
  for update to authenticated using (public.is_member(baby_id)) with check (public.is_member(baby_id));

drop policy if exists "family can delete logs" on public.logs;
create policy "family can delete logs" on public.logs
  for delete to authenticated using (public.is_member(baby_id));

-- 새 가족(아기) 만들기: 초대 코드를 만들어 주고, 만든 사람을 가족으로 넣습니다.
create or replace function public.create_baby(baby_name text, my_name text)
returns public.babies
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
  b public.babies;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  loop
    code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    exit when not exists (select 1 from public.babies where invite_code = code);
  end loop;
  insert into public.babies (name, invite_code)
    values (coalesce(nullif(trim(baby_name), ''), '우리 아기'), code)
    returning * into b;
  insert into public.members (baby_id, user_id, display_name)
    values (b.id, auth.uid(), coalesce(nullif(trim(my_name), ''), '가족'));
  return b;
end;
$$;

-- 초대 코드로 가족에 들어가기
create or replace function public.join_baby(code text, my_name text)
returns public.babies
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.babies;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  select * into b from public.babies where invite_code = upper(trim(code));
  if not found then
    raise exception 'invite code not found';
  end if;
  insert into public.members (baby_id, user_id, display_name)
    values (b.id, auth.uid(), coalesce(nullif(trim(my_name), ''), '가족'))
    on conflict (baby_id, user_id) do update set display_name = excluded.display_name;
  return b;
end;
$$;

revoke all on function public.create_baby(text, text) from public, anon;
revoke all on function public.join_baby(text, text) from public, anon;
grant execute on function public.create_baby(text, text) to authenticated;
grant execute on function public.join_baby(text, text) to authenticated;

-- 다른 가족이 기록하면 바로 화면에 뜨도록 실시간 알림 켜기
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'logs'
  ) then
    alter publication supabase_realtime add table public.logs;
  end if;
end;
$$;
