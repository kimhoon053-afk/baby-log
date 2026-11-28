-- 가족 모두에게 가는 수유 알림 (서버 푸시)
-- schema.sql 을 실행한 다음, 이 파일도 SQL Editor 에 붙여넣고 Run 하면 됩니다. 여러 번 실행해도 괜찮아요.
--
-- 동작: 1분마다 서버가 각 가족의 마지막 수유 시각을 보고,
--       각 휴대폰이 정해 둔 간격이 지나면 그 휴대폰으로 알림을 보냅니다. (30분 뒤 한 번 더)
--       진짜 앱으로 설치한 휴대폰만 여기에 등록돼요. (Expo Go 미리보기는 휴대폰 안의 알림을 써요)

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 밤 당번: 밤 10시~아침 7시에는 당번으로 정한 사람 휴대폰에만 알림이 가요. (비어 있으면 모두에게)
alter table public.babies add column if not exists night_duty_user uuid references auth.users(id) on delete set null;

-- 알림을 받을 휴대폰과 그 휴대폰의 알림 설정
create table if not exists public.push_devices (
  user_id uuid not null references auth.users(id) on delete cascade,
  baby_id uuid not null references public.babies(id) on delete cascade,
  token text not null,
  enabled boolean not null default true,
  interval_min integer not null default 180 check (interval_min between 30 and 720),
  quiet_night boolean not null default true,
  tz text not null default 'Asia/Seoul',
  notified_for timestamptz,
  followed_up_for timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, baby_id)
);

alter table public.push_devices enable row level security;
grant select, insert, update, delete on public.push_devices to authenticated;

drop policy if exists "own devices" on public.push_devices;
create policy "own devices" on public.push_devices
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_member(baby_id));

create or replace function public.korean_duration(mins integer)
returns text
language sql
immutable
as $$
  select case
    when mins < 60 then mins || '분'
    when mins % 60 = 0 then (mins / 60) || '시간'
    else (mins / 60) || '시간 ' || (mins % 60) || '분'
  end;
$$;

create or replace function public.send_feed_reminders()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  r record;
  kind text;
  quiet boolean;
  local_last timestamp;
  local_now timestamp;
  sent integer := 0;
begin
  for r in
    select d.*, lf.last_feed, b.night_duty_user
    from public.push_devices d
    join public.babies b on b.id = d.baby_id
    join public.members m on m.baby_id = d.baby_id and m.user_id = d.user_id
    cross join lateral (
      select max(l.start_at) as last_feed
      from public.logs l
      where l.baby_id = d.baby_id and l.kind = 'feed'
    ) lf
    where d.enabled
      and lf.last_feed is not null
      and lf.last_feed > now() - interval '1 day'
  loop
    kind := null;
    if now() >= r.last_feed + make_interval(mins => r.interval_min + 30)
       and r.followed_up_for is distinct from r.last_feed then
      kind := 'late';
    elsif now() >= r.last_feed + make_interval(mins => r.interval_min)
       and r.notified_for is distinct from r.last_feed then
      kind := 'due';
    end if;
    continue when kind is null;

    local_last := r.last_feed at time zone r.tz;
    local_now := now() at time zone r.tz;
    quiet := r.quiet_night and (extract(hour from local_now) >= 22 or extract(hour from local_now) < 7);

    -- 밤에는 당번이 아닌 사람에게 보내지 않아요. (보낸 것으로 표시해서 아침에 몰려오지 않게)
    if (extract(hour from local_now) >= 22 or extract(hour from local_now) < 7)
       and r.night_duty_user is not null and r.night_duty_user <> r.user_id then
      update public.push_devices
        set notified_for = r.last_feed,
            followed_up_for = case when kind = 'late' then r.last_feed else followed_up_for end
        where user_id = r.user_id and baby_id = r.baby_id;
      continue;
    end if;

    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := jsonb_build_object(
        'to', r.token,
        'title', case when kind = 'due' then '🍼 수유할 시간이에요' else '🍼 아직 수유 기록이 없어요' end,
        'body', '마지막 수유(' ||
          case when extract(hour from local_last) < 12 then '오전 ' else '오후 ' end ||
          to_char(local_last, 'FMHH12:MI') || ') 후 ' ||
          public.korean_duration(r.interval_min + case when kind = 'late' then 30 else 0 end) || '이 지났어요.',
        'sound', case when quiet then null else 'default' end,
        'channelId', case when quiet then 'feed-quiet' else 'feed' end,
        'categoryId', 'feed-reminder',
        'priority', 'high'
      ),
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );

    update public.push_devices
      set notified_for = r.last_feed,
          followed_up_for = case when kind = 'late' then r.last_feed else followed_up_for end
      where user_id = r.user_id and baby_id = r.baby_id;
    sent := sent + 1;
  end loop;
  return sent;
end;
$$;

revoke all on function public.send_feed_reminders() from public, anon, authenticated;

-- 1분마다 실행
select cron.schedule('feed-reminders', '* * * * *', $$select public.send_feed_reminders()$$);
