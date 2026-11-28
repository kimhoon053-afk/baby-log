-- 밤 당번 정하기: 가족 중 누구 휴대폰에만 밤(10시~7시) 수유 알림을 보낼지 정해요.
-- 이 파일을 SQL Editor 에 붙여넣고 Run 한 다음, push.sql 도 다시 한 번 Run 해 주세요. (여러 번 실행해도 괜찮아요)

alter table public.babies add column if not exists night_duty_user uuid references auth.users(id) on delete set null;

-- u 가 null 이면 '모두에게'
create or replace function public.set_night_duty(b uuid, u uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_member(b) then
    raise exception 'not a family member';
  end if;
  if u is not null and not exists (select 1 from public.members where baby_id = b and user_id = u) then
    raise exception 'not a family member';
  end if;
  update public.babies set night_duty_user = u where id = b;
end;
$$;

revoke all on function public.set_night_duty(uuid, uuid) from public, anon;
grant execute on function public.set_night_duty(uuid, uuid) to authenticated;
