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
-- ===== v57: AI 크레딧 (월 지급 + 충전) =====
-- 먼저 membership-all.sql(멤버십)이 실행되어 있어야 해요.
-- 월 지급분(monthly): 이용권이 있는 사람에게 매달 15크레딧, 이월 안 됨 / 충전분(topup): 이월됨

create table if not exists public.ai_wallet (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  monthly    int  not null default 0 check (monthly >= 0),
  topup      int  not null default 0 check (topup >= 0),
  month_key  text,                                   -- 마지막으로 월 지급을 한 달 (예: 2026-10, 한국 시간 기준)
  updated_at timestamptz not null default now()
);
alter table public.ai_wallet enable row level security;
drop policy if exists "read own ai wallet" on public.ai_wallet;
create policy "read own ai wallet" on public.ai_wallet for select to authenticated using ((select auth.uid()) = user_id);

-- 입출금 기록 (지급·충전·사용·환불). 앱에서는 읽기만 돼요.
create table if not exists public.ai_ledger (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta   int  not null,
  kind    text not null check (kind in ('monthly', 'topup', 'spend', 'refund')),
  note    text,
  at      timestamptz not null default now()
);
alter table public.ai_ledger enable row level security;
drop policy if exists "read own ai ledger" on public.ai_ledger;
create policy "read own ai ledger" on public.ai_ledger for select to authenticated using ((select auth.uid()) = user_id);
create index if not exists ai_ledger_idx on public.ai_ledger (user_id, at desc);

-- 실제 AI 사용량 기록 (비용을 다시 계산할 때 써요). 앱에서는 읽을 수 없어요.
create table if not exists public.ai_usage (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  model      text,
  in_tokens  int,
  out_tokens int,
  at         timestamptz not null default now()
);
alter table public.ai_usage enable row level security;

-- 지금 이용권이 있는지 (내부용)
create or replace function public._is_member(p_uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from entitlements e
    where e.user_id = p_uid and (e.plan = 'lifetime' or (e.expires_at is not null and e.expires_at > now()))
  );
$$;
revoke all on function public._is_member(uuid) from public, anon, authenticated;

-- 월 지급 (내부용): 이용권이 있고 이번 달에 아직 안 받았으면 월 지급분을 15로 채워요
create or replace function public._ai_sync(p_uid uuid)
returns public.ai_wallet
language plpgsql security definer set search_path = public
as $$
declare
  w public.ai_wallet;
  v_key text := to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM');
  v_grant int := 15;
begin
  insert into ai_wallet (user_id) values (p_uid) on conflict (user_id) do nothing;
  select * into w from ai_wallet where user_id = p_uid for update;
  if _is_member(p_uid) and coalesce(w.month_key, '') <> v_key then
    update ai_wallet set monthly = v_grant, month_key = v_key, updated_at = now() where user_id = p_uid returning * into w;
    insert into ai_ledger (user_id, delta, kind, note) values (p_uid, v_grant, 'monthly', v_key);
  end if;
  return w;
end;
$$;
revoke all on function public._ai_sync(uuid) from public, anon, authenticated;

-- 앱이 부르는 잔액 조회 (이때 월 지급도 같이 해요)
create or replace function public.ai_wallet_get()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); w public.ai_wallet; v_mem boolean;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  w := _ai_sync(v_uid);
  v_mem := _is_member(v_uid);
  return jsonb_build_object('ok', true, 'member', v_mem, 'monthly', case when v_mem then w.monthly else 0 end, 'topup', w.topup, 'grant', 15);
end;
$$;
revoke all on function public.ai_wallet_get() from public, anon;
grant execute on function public.ai_wallet_get() to authenticated;

-- 크레딧 쓰기 (서버 함수 전용): 월 지급분부터 쓰고 모자라면 충전분을 써요
create or replace function public.ai_spend(p_uid uuid, p_cost int, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare w public.ai_wallet; v_m int; v_t int;
begin
  if p_cost is null or p_cost < 1 or p_cost > 50 then return jsonb_build_object('ok', false, 'error', 'bad_cost'); end if;
  if not _is_member(p_uid) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  w := _ai_sync(p_uid);
  if w.monthly + w.topup < p_cost then
    return jsonb_build_object('ok', false, 'error', 'no_credit', 'monthly', w.monthly, 'topup', w.topup);
  end if;
  v_m := least(w.monthly, p_cost);
  v_t := p_cost - v_m;
  update ai_wallet set monthly = monthly - v_m, topup = topup - v_t, updated_at = now() where user_id = p_uid returning * into w;
  insert into ai_ledger (user_id, delta, kind, note) values (p_uid, -p_cost, 'spend', p_note);
  return jsonb_build_object('ok', true, 'from_monthly', v_m, 'from_topup', v_t, 'monthly', w.monthly, 'topup', w.topup);
end;
$$;
revoke all on function public.ai_spend(uuid, int, text) from public, anon, authenticated;
grant execute on function public.ai_spend(uuid, int, text) to service_role;

-- 크레딧 돌려주기 (서버 함수 전용): AI 호출이 실패했을 때
create or replace function public.ai_refund(p_uid uuid, p_from_monthly int, p_from_topup int, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare w public.ai_wallet;
begin
  update ai_wallet set monthly = monthly + greatest(coalesce(p_from_monthly, 0), 0), topup = topup + greatest(coalesce(p_from_topup, 0), 0), updated_at = now()
  where user_id = p_uid returning * into w;
  insert into ai_ledger (user_id, delta, kind, note) values (p_uid, greatest(coalesce(p_from_monthly, 0), 0) + greatest(coalesce(p_from_topup, 0), 0), 'refund', p_note);
  return jsonb_build_object('ok', true, 'monthly', w.monthly, 'topup', w.topup);
end;
$$;
revoke all on function public.ai_refund(uuid, int, int, text) from public, anon, authenticated;
grant execute on function public.ai_refund(uuid, int, int, text) to service_role;

-- 테스트 충전: 테스트 모드이고 이용권이 있을 때만 (실제 결제를 붙이면 영수증 확인 함수로 교체)
create or replace function public.test_topup(p_pack text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_n int; w public.ai_wallet;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce((select value from app_settings where key = 'payment_test_mode'), 'false') <> 'true' then
    return jsonb_build_object('ok', false, 'error', 'test_mode_off');
  end if;
  if not _is_member(v_uid) then return jsonb_build_object('ok', false, 'error', 'not_member'); end if;
  v_n := case p_pack when 'p60' then 60 when 'p170' then 170 when 'p360' then 360 else 0 end;
  if v_n = 0 then return jsonb_build_object('ok', false, 'error', 'invalid_pack'); end if;
  w := _ai_sync(v_uid);
  update ai_wallet set topup = topup + v_n, updated_at = now() where user_id = v_uid returning * into w;
  insert into ai_ledger (user_id, delta, kind, note) values (v_uid, v_n, 'topup', p_pack);
  return jsonb_build_object('ok', true, 'monthly', w.monthly, 'topup', w.topup);
end;
$$;
revoke all on function public.test_topup(text) from public, anon;
grant execute on function public.test_topup(text) to authenticated;
-- ===== v60: AI 선생님 — '왜 이렇게 써요?' 설명 저장 + 가이드형 자유 대화 =====
-- 앞에서 v57(pangpang-all.sql)을 먼저 실행한 프로젝트에서 실행하세요. 여러 번 실행해도 안전해요.

-- 정답 문장 설명 저장소: 한 문장을 AI가 한 번 설명하면 모두가 다시 써요. 앱에서는 읽을 수 없어요.
create table if not exists public.ai_explain (
  zh         text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.ai_explain enable row level security;

-- 자유 대화 한 판의 기록(서버 전용): 앱에서는 읽고 쓸 수 없어요.
create table if not exists public.ai_chat (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  scenario   text,
  msgs       jsonb not null default '[]'::jsonb,
  turns      int not null default 0,
  done       boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.ai_chat enable row level security;
create index if not exists ai_chat_user_idx on public.ai_chat (user_id, created_at desc);

-- 서버 함수(service_role)가 내부 함수를 쓸 수 있게 확실히 허용해요
grant execute on function public._is_member(uuid) to service_role;
grant execute on function public._ai_sync(uuid) to service_role;
grant execute on function public.ai_spend(uuid, int, text) to service_role;
grant execute on function public.ai_refund(uuid, int, int, text) to service_role;

notify pgrst, 'reload schema';

-- v69: AI 선생님이 고쳐 준 문장 모음 (복습 탭). 여러 번 실행해도 안전해요.
create table if not exists public.ai_fix (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  zh         text not null,
  pinyin     text not null default '',
  why        text not null default '',
  mine       text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, zh)
);
alter table public.ai_fix enable row level security;
drop policy if exists "ai_fix own select" on public.ai_fix;
drop policy if exists "ai_fix own insert" on public.ai_fix;
drop policy if exists "ai_fix own update" on public.ai_fix;
drop policy if exists "ai_fix own delete" on public.ai_fix;
create policy "ai_fix own select" on public.ai_fix for select using (auth.uid() = user_id);
create policy "ai_fix own insert" on public.ai_fix for insert with check (auth.uid() = user_id);
create policy "ai_fix own update" on public.ai_fix for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_fix own delete" on public.ai_fix for delete using (auth.uid() = user_id);
grant select, insert, update, delete on public.ai_fix to authenticated;
-- v70: 대화에서 모은 표현(질문/대답)도 같은 표에 저장해요
alter table public.ai_fix add column if not exists kind text not null default 'fix';
alter table public.ai_fix add column if not exists ko text not null default '';

-- v106: 콘텐츠 검수도구 (review.html) — 선생님이 남긴 검수 의견·수정 저장. 여러 번 실행해도 안전해요.
-- 아직 오픈 전이라 로그인 없이 누구나 읽고 쓸 수 있게 열어 둬요. (오픈 전에 꼭 다시 잠그세요)
create table if not exists public.review_notes (
  item_id    text primary key,
  data       jsonb not null default '{}'::jsonb,
  who        text not null default '',
  updated_at timestamptz not null default now(),
  constraint review_notes_size check (octet_length(data::text) < 20000 and char_length(item_id) < 80)
);
alter table public.review_notes enable row level security;
drop policy if exists "review_notes read" on public.review_notes;
drop policy if exists "review_notes insert" on public.review_notes;
drop policy if exists "review_notes update" on public.review_notes;
create policy "review_notes read" on public.review_notes for select to anon, authenticated using (true);
create policy "review_notes insert" on public.review_notes for insert to anon, authenticated with check (true);
create policy "review_notes update" on public.review_notes for update to anon, authenticated using (true) with check (true);
grant select, insert, update on public.review_notes to anon, authenticated;
notify pgrst, 'reload schema';
-- v109: AI 프롬프트 캐싱 사용량 기록 (원가 계산용). 여러 번 실행해도 안전해요.
-- 서버 함수(ai-coach)를 배포하기 전에 먼저 실행하세요.
alter table public.ai_usage add column if not exists cache_read  int;
alter table public.ai_usage add column if not exists cache_write int;
notify pgrst, 'reload schema';

-- v117: HSK 단어 복습 주기(간격 반복)를 기기끼리 맞추는 표. 안 만들어도 앱은 이 기기에서 잘 동작해요.
create table if not exists public.user_srs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_srs enable row level security;
drop policy if exists "user_srs own select" on public.user_srs;
drop policy if exists "user_srs own insert" on public.user_srs;
drop policy if exists "user_srs own update" on public.user_srs;
create policy "user_srs own select" on public.user_srs for select using (auth.uid() = user_id);
create policy "user_srs own insert" on public.user_srs for insert with check (auth.uid() = user_id);
create policy "user_srs own update" on public.user_srs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- v119: AI 대화 기록(말한 그대로) 저장. 안 만들어도 앱은 이 기기에서 잘 동작해요.
create table if not exists public.ai_chats (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
alter table public.ai_chats enable row level security;
drop policy if exists "ai_chats own select" on public.ai_chats;
drop policy if exists "ai_chats own insert" on public.ai_chats;
drop policy if exists "ai_chats own update" on public.ai_chats;
drop policy if exists "ai_chats own delete" on public.ai_chats;
create policy "ai_chats own select" on public.ai_chats for select using (auth.uid() = user_id);
create policy "ai_chats own insert" on public.ai_chats for insert with check (auth.uid() = user_id);
create policy "ai_chats own update" on public.ai_chats for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ai_chats own delete" on public.ai_chats for delete using (auth.uid() = user_id);
