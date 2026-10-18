-- 말문: Supabase SQL Editor에 통째로 붙여넣고 Run 하세요. (여러 번 실행해도 안전해요)

-- 1) 문제별 기억 상태 (반복 복습용)
create table if not exists public.progress (
  user_id    uuid not null references auth.users(id) on delete cascade,
  qid        text not null,                       -- 예: 'week-1'
  lesson_id  text not null,                       -- 예: 'week'
  box        int  not null default 1 check (box between 1 and 5),
  due_at     timestamptz not null default now(),  -- 이 시간 이후에 복습 대상
  correct    int  not null default 0,
  wrong      int  not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, qid)
);

-- 2) 끝낸 레슨
create table if not exists public.lesson_done (
  user_id   uuid not null references auth.users(id) on delete cascade,
  lesson_id text not null,
  done_at   timestamptz not null default now(),
  times     int not null default 1,
  primary key (user_id, lesson_id)
);

-- 3) 하루 학습량 (연속 학습일 계산용)
create table if not exists public.daily_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null,
  lessons int  not null default 0,
  answers int  not null default 0,
  primary key (user_id, day)
);

-- 4) 내 데이터는 나만 볼 수 있게 (Row Level Security)
alter table public.progress    enable row level security;
alter table public.lesson_done enable row level security;
alter table public.daily_log   enable row level security;

drop policy if exists "own progress"    on public.progress;
drop policy if exists "own lesson_done" on public.lesson_done;
drop policy if exists "own daily_log"   on public.daily_log;

create policy "own progress"    on public.progress
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own lesson_done" on public.lesson_done
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "own daily_log"   on public.daily_log
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 복습 대상 조회를 빠르게
create index if not exists progress_due_idx on public.progress (user_id, due_at);

-- 5) 복습 알림 구독 (웹 푸시) — 알림을 쓰지 않으면 이 부분은 건너뛰어도 돼요
create table if not exists public.push_subscriptions (
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null,
  p256dh      text not null,
  auth        text not null,
  remind_time text not null default '20:00',   -- 사용자 현지 시각 HH:MM
  tz          text not null default 'Asia/Seoul',
  created_at  timestamptz not null default now(),
  primary key (user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own push" on public.push_subscriptions;
create policy "own push" on public.push_subscriptions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 6) 15분마다 알림 함수 호출 (Supabase 대시보드 → Integrations → Cron, 또는 pg_cron + pg_net)
--    <PROJECT_REF> 와 <SERVICE_ROLE_KEY 또는 CRON_SECRET> 를 바꿔서 한 번만 실행하세요.
-- select cron.schedule('pangpang-reminders', '*/15 * * * *', $$
--   select net.http_post(
--     url := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-reminders',
--     headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
--   );
-- $$);


-- ===== 오류 기록 (v20) =====
create table if not exists app_errors (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users on delete set null,
  message text, stack text, url text, ua text, version text,
  created_at timestamptz default now()
);
alter table app_errors enable row level security;
drop policy if exists "insert own errors" on app_errors;
create policy "insert own errors" on app_errors for insert to authenticated
  with check ((select auth.uid()) = user_id);
-- 조회 정책은 일부러 없음: Supabase 대시보드 > Table Editor 에서만 볼 수 있어요.


-- ===== 의견 보내기 (v35) =====
create table if not exists feedback (
  id bigint generated always as identity primary key,
  user_id uuid default auth.uid() references auth.users on delete set null,
  category text check (category in ('idea','bug','praise','etc')),
  message text not null check (char_length(message) between 5 and 1000),
  nickname text, email text, version text,
  created_at timestamptz default now()
);
alter table feedback enable row level security;
drop policy if exists "insert own feedback" on feedback;
create policy "insert own feedback" on feedback for insert to authenticated
  with check ((select auth.uid()) = user_id);
-- 조회 정책은 일부러 없음: 앱 사용자는 남의 의견도, 자기 의견도 읽을 수 없고
-- 운영자(나)만 Supabase 대시보드 > Table Editor > feedback 에서 볼 수 있어요.


-- ===== v48: 이어하기 기록 동기화 + 계정 삭제 =====
create table if not exists public.resume_state (
  user_id    uuid not null references auth.users(id) on delete cascade,
  rkey       text not null,                 -- 예: 'lesson|week'
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, rkey)
);
alter table public.resume_state enable row level security;
drop policy if exists "own resume" on public.resume_state;
create policy "own resume" on public.resume_state
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 내 계정 삭제: 로그인한 본인만 자기 계정을 지울 수 있어요. (service_role 키는 앱에 넣지 않아요)
-- progress / lesson_done / daily_log / push_subscriptions / resume_state 는 on delete cascade 로 같이 지워지고,
-- feedback / app_errors 의 user_id 는 null 이 돼요.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;


-- ===== v49/v51: 알림 두 종류를 따로 켜고 끄기 (복습 알림 / 1분 중국어) =====
alter table public.push_subscriptions add column if not exists daily_on  boolean not null default true;
alter table public.push_subscriptions add column if not exists minute_on boolean not null default false;


-- ===== v52: 멤버십 (무료 3강 / 월 구독 / 평생) + 쿠폰 — 테스트 모드 =====
-- 설정값: 테스트 모드일 때만 test_purchase() 가 이용권을 열어 줘요. 실제 결제를 붙이면 'false' 로 바꾸세요.
create table if not exists public.app_settings (key text primary key, value text not null);
insert into public.app_settings (key, value) values ('payment_test_mode', 'true') on conflict (key) do nothing;
alter table public.app_settings enable row level security;   -- 정책을 만들지 않아서 앱에서는 읽고 쓸 수 없어요

-- 이용권: 본인 것만 읽을 수 있고, 앱에서는 직접 쓸 수 없어요 (쓰기는 아래 함수들만 해요)
create table if not exists public.entitlements (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  plan       text not null check (plan in ('monthly', 'lifetime')),
  expires_at timestamptz,                         -- 월 구독의 만료 시각, 평생이면 null
  source     text not null default 'test',        -- test / coupon / (나중에) payment
  updated_at timestamptz not null default now()
);
alter table public.entitlements enable row level security;
drop policy if exists "read own entitlement" on public.entitlements;
create policy "read own entitlement" on public.entitlements
  for select to authenticated using ((select auth.uid()) = user_id);

-- 쿠폰: 앱에서는 읽을 수 없어요 (운영자가 SQL Editor 에서 만들어요)
create table if not exists public.coupons (
  code       text primary key,                    -- 대문자·숫자만 (하이픈 없이)
  days       int  not null default 30 check (days between 1 and 3650),
  max_uses   int  not null default 1 check (max_uses >= 1),
  used_count int  not null default 0,
  expires_at timestamptz,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.coupons enable row level security;
create table if not exists public.coupon_redemptions (
  id          bigint generated always as identity primary key,
  code        text not null references public.coupons(code),
  user_id     uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  unique (code, user_id)
);
alter table public.coupon_redemptions enable row level security;
-- 쿠폰 번호 무차별 대입을 막기 위한 시도 기록 (한 시간에 10번 틀리면 잠시 막아요)
create table if not exists public.coupon_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  at      timestamptz not null default now(),
  ok      boolean not null
);
alter table public.coupon_attempts enable row level security;
create index if not exists coupon_attempts_idx on public.coupon_attempts (user_id, at);

-- 이용 기간 늘리기 (내부용): 평생이면 그대로, 월 구독이면 남은 기간 뒤에 이어 붙여요
create or replace function public._grant_days(p_uid uuid, p_days int, p_source text)
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare v_exp timestamptz;
begin
  insert into entitlements (user_id, plan, expires_at, source)
  values (p_uid, 'monthly', now() + make_interval(days => p_days), p_source)
  on conflict (user_id) do update set
    plan = case when entitlements.plan = 'lifetime' then 'lifetime' else 'monthly' end,
    expires_at = case when entitlements.plan = 'lifetime' then null
                      else greatest(coalesce(entitlements.expires_at, now()), now()) + make_interval(days => p_days) end,
    source = p_source, updated_at = now()
  returning expires_at into v_exp;
  return v_exp;
end;
$$;
revoke all on function public._grant_days(uuid, int, text) from public, anon, authenticated;

-- 쿠폰 등록: 성공하면 쿠폰의 기간(기본 30일)만큼 이용권을 늘려요
create or replace function public.redeem_coupon(p_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  c coupons%rowtype;
  v_exp timestamptz;
  v_plan text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if (select count(*) from coupon_attempts where user_id = v_uid and ok = false and at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('ok', false, 'error', 'too_many_attempts');
  end if;
  v_code := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  select * into c from coupons where coupons.code = v_code for update;
  if not found or (c.expires_at is not null and c.expires_at < now()) or c.used_count >= c.max_uses then
    insert into coupon_attempts (user_id, ok) values (v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'invalid_coupon');
  end if;
  if exists (select 1 from coupon_redemptions where code = v_code and user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'already_used');
  end if;
  if exists (select 1 from entitlements where user_id = v_uid and plan = 'lifetime') then
    return jsonb_build_object('ok', false, 'error', 'already_lifetime');
  end if;
  insert into coupon_redemptions (code, user_id) values (v_code, v_uid);
  update coupons set used_count = used_count + 1 where coupons.code = v_code;
  v_exp := _grant_days(v_uid, c.days, 'coupon');
  insert into coupon_attempts (user_id, ok) values (v_uid, true);
  select plan into v_plan from entitlements where user_id = v_uid;
  return jsonb_build_object('ok', true, 'plan', v_plan, 'expires_at', v_exp);
end;
$$;
revoke all on function public.redeem_coupon(text) from public, anon;
grant execute on function public.redeem_coupon(text) to authenticated;

-- 테스트 결제: 테스트 모드일 때만 동작해요. (실제 결제를 붙이면 payment_test_mode 를 false 로)
create or replace function public.test_purchase(p_plan text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce((select value from app_settings where key = 'payment_test_mode'), 'false') <> 'true' then
    return jsonb_build_object('ok', false, 'error', 'test_mode_off');
  end if;
  if p_plan = 'lifetime' then
    insert into entitlements (user_id, plan, expires_at, source) values (v_uid, 'lifetime', null, 'test')
    on conflict (user_id) do update set plan = 'lifetime', expires_at = null, source = 'test', updated_at = now();
  elsif p_plan = 'monthly' then
    perform _grant_days(v_uid, 30, 'test');
  else
    return jsonb_build_object('ok', false, 'error', 'invalid_plan');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.test_purchase(text) from public, anon;
grant execute on function public.test_purchase(text) to authenticated;

-- 쿠폰 만들기 (운영자용): SQL Editor 에서  select * from make_coupons(10, 30);  → 쿠폰 10개(각 30일, 1회용)
create or replace function public.make_coupons(p_count int default 1, p_days int default 30, p_max_uses int default 1)
returns setof text
language plpgsql
as $$
declare i int := 0; v_code text;
begin
  while i < p_count loop
    v_code := 'PANG' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    begin
      insert into coupons (code, days, max_uses) values (v_code, p_days, p_max_uses);
      i := i + 1;
      return next substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4) || '-' || substr(v_code, 9, 4);
    exception when unique_violation then null;
    end;
  end loop;
end;
$$;
revoke all on function public.make_coupons(int, int, int) from public, anon, authenticated;

-- v55: 테스트용 복구 — 내 이용권을 지우고 무료 상태로 되돌려요 (테스트 모드일 때만)
create or replace function public.test_reset()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce((select value from app_settings where key = 'payment_test_mode'), 'false') <> 'true' then
    return jsonb_build_object('ok', false, 'error', 'test_mode_off');
  end if;
  delete from entitlements where user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.test_reset() from public, anon;
grant execute on function public.test_reset() to authenticated;

-- ===== v56: 평생 이용 → 1년 + 2개월(14개월) 연간 이용 =====
-- 이용권 종류에 'yearly' 추가 (기존 'monthly', 'lifetime' 은 그대로 유효)
alter table public.entitlements drop constraint if exists entitlements_plan_check;
alter table public.entitlements add constraint entitlements_plan_check check (plan in ('monthly', 'yearly', 'lifetime'));

-- 이용 기간 늘리기: 평생이면 그대로, 아니면 남은 기간 뒤에 이어 붙여요 (연간을 한 번이라도 샀으면 연간 표시 유지)
drop function if exists public._grant_days(uuid, int, text);
create or replace function public._grant_days(p_uid uuid, p_days int, p_source text, p_plan text default 'monthly')
returns timestamptz
language plpgsql security definer set search_path = public
as $$
declare v_exp timestamptz;
begin
  insert into entitlements (user_id, plan, expires_at, source)
  values (p_uid, p_plan, now() + make_interval(days => p_days), p_source)
  on conflict (user_id) do update set
    plan = case when entitlements.plan = 'lifetime' then 'lifetime'
                when p_plan = 'yearly' or entitlements.plan = 'yearly' then 'yearly'
                else 'monthly' end,
    expires_at = case when entitlements.plan = 'lifetime' then null
                      else greatest(coalesce(entitlements.expires_at, now()), now()) + make_interval(days => p_days) end,
    source = p_source, updated_at = now()
  returning expires_at into v_exp;
  return v_exp;
end;
$$;
revoke all on function public._grant_days(uuid, int, text, text) from public, anon, authenticated;

-- 테스트 결제: monthly(30일) / yearly(425일 = 1년 + 2개월)
create or replace function public.test_purchase(p_plan text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce((select value from app_settings where key = 'payment_test_mode'), 'false') <> 'true' then
    return jsonb_build_object('ok', false, 'error', 'test_mode_off');
  end if;
  if p_plan = 'yearly' then
    perform _grant_days(v_uid, 425, 'test', 'yearly');
  elsif p_plan = 'monthly' then
    perform _grant_days(v_uid, 30, 'test', 'monthly');
  else
    return jsonb_build_object('ok', false, 'error', 'invalid_plan');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.test_purchase(text) from public, anon;
grant execute on function public.test_purchase(text) to authenticated;
