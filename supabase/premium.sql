-- 가족 프리미엄: 가족 중 한 명이 구독하면 같은 가족(같은 아기) 모두가 프리미엄을 써요.
-- schema.sql 을 실행한 다음, 이 파일도 SQL Editor 에 붙여넣고 Run 하면 됩니다. 여러 번 실행해도 괜찮아요.

alter table public.babies add column if not exists premium_until timestamptz;
alter table public.babies add column if not exists premium_by_name text;

-- 가족이 아기 정보를 직접 고칠 때는 이름만 바꿀 수 있게 해요. (프리미엄 칸은 아래 함수로만 바뀌어요)
revoke update on public.babies from authenticated;
grant update (name) on public.babies to authenticated;

-- 이 가족의 프리미엄 기간을 정해요. 가족만 부를 수 있어요.
-- ⚠️ 지금은 앱이 결제 결과를 보고 직접 부르는 방식이에요 (테스트 단계).
--    정식 출시 전에 RevenueCat 웹훅(서버가 결제를 직접 확인)으로 바꾸고, 이 함수는 막을 거예요.
create or replace function public.set_family_premium(b uuid, until timestamptz, by_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_member(b) then
    raise exception 'not a family member';
  end if;
  update public.babies
    set premium_until = until,
        premium_by_name = case when until is null then null else by_name end
    where id = b;
end;
$$;

revoke all on function public.set_family_premium(uuid, timestamptz, text) from public, anon;
grant execute on function public.set_family_premium(uuid, timestamptz, text) to authenticated;
