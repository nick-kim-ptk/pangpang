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
