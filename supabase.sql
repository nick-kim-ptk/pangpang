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
