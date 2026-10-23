// 알림 보내기 (Supabase Edge Function)
// 15분마다 호출돼요. 사람마다 켜 둔 알림 종류(prefs)를 보고, 각 종류의 시각 구간에 들어왔을 때 한 번만 보내요.
//  - daily  : 정해 둔 시간, 오늘 아직 공부 전이면 "오늘 중국어 한 문장만 말해 볼까요?" (모두 같은 문구)
//  - streak : 밤 9시, 3일 이상 이어 온 연속 학습이 오늘 끊기려 할 때
//  - goal   : 밤 8시, 오늘 목표의 절반을 넘겼고 아직 못 채웠을 때
//  - review : 낮 12시 반, 복습할 단어가 10개 이상 쌓였고 오늘 공부 전일 때
//  - rank   : 일요일 저녁 7시, 이번 주 점수가 있는 사람에게 내 순위와 다음 순위까지 남은 점수
//  - week   : 월요일 아침 9시, 지난주 결과
//  - back   : 오전 10시, 마지막 공부 후 3일째 / 7일째 (두 번만)
//  - word   : 오전 8시~밤 9시 매 정시, HSK 단어 하나 (한자·병음·읽는 표기·뜻)
// 필요한 비밀 값: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT(mailto:...), CRON_SECRET
// (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase가 자동으로 넣어 줘요)
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const WINDOW_MIN = 15;
const WORD_FROM = 8, WORD_TO = 21;          // 오늘의 단어: 현지 시각 8시~21시 정시
const EVENT_CAP = 2;                         // 연속 학습(streak)·daily·word 를 뺀 알림은 하루 최대 2개
const APP_URL = (Deno.env.get('APP_URL') ?? 'https://nick-kim-ptk.github.io/pangpang').replace(/\/$/, '');

type Prefs = {
  daily?: boolean; streak?: boolean; goal?: boolean; review?: boolean; rank?: boolean;
  week?: boolean; back?: boolean; word?: boolean; wordLv?: number[];
};
type Sub = {
  user_id: string; endpoint: string; p256dh: string; auth: string; remind_time: string; tz: string;
  goal: number | null; prefs: Prefs | null; daily_on: boolean | null;
};

// 단어 목록(앱과 함께 배포되는 words.json): [한자, 병음, 읽는 표기, 뜻]
let words: Record<string, string[][]> | null = null;
async function loadWords() {
  if (words) return words;
  try {
    const r = await fetch(`${APP_URL}/words.json`);
    if (r.ok) words = await r.json();
  } catch (_e) { /* 단어 알림만 건너뛰어요 */ }
  return words;
}

function localParts(tz: string, d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const p: Record<string, string> = {};
  f.formatToParts(d).forEach((x) => (p[x.type] = x.value));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: (parseInt(p.hour) % 24) * 60 + parseInt(p.minute) };
}
const dayNum = (day: string) => Math.floor(Date.parse(day + 'T00:00:00Z') / 864e5);
const numDay = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(day + 'T00:00:00Z').getUTCDay();   // 0=일
const mondayOf = (day: string) => numDay(dayNum(day) - ((weekday(day) + 6) % 7));
const inWin = (minutes: number, h: number, m = 0) => { const d = minutes - (h * 60 + m); return d >= 0 && d < WINDOW_MIN; };
function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

Deno.serve(async (req) => {
  if (req.headers.get('Authorization') !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
    return new Response('unauthorized', { status: 401 });
  }
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hello@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: subs, error } = await db.from('push_subscriptions').select('*');
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0, skipped = 0, removed = 0;
  // 알림은 멤버십 기능이라, 이용권이 있는 사람에게만 보내요 (평생이거나 월 구독이 아직 남아 있을 때)
  const { data: ents } = await db.from('entitlements').select('user_id, plan, expires_at');
  const proUsers = new Set(
    (ents ?? [])
      .filter((e: { plan: string; expires_at: string | null }) => e.plan === 'lifetime' || (e.expires_at && new Date(e.expires_at) > new Date()))
      .map((e: { user_id: string }) => e.user_id),
  );

  // 오래된 발송 기록 정리 (중복 방지용 표)
  await db.from('push_sent').delete().lt('sent_at', new Date(Date.now() - 14 * 864e5).toISOString());

  // ---- 사용자별로 필요할 때만 불러와서 재사용 ----
  const logCache = new Map<string, Map<string, number>>();
  async function getLog(uid: string) {
    let m = logCache.get(uid);
    if (!m) {
      m = new Map();
      const { data } = await db.from('daily_log').select('day, answers').eq('user_id', uid)
        .gte('day', numDay(Math.floor(Date.now() / 864e5) - 60));
      (data ?? []).forEach((r: { day: string; answers: number }) => m!.set(r.day, r.answers));
      logCache.set(uid, m);
    }
    return m;
  }
  const sentToday = new Map<string, string[]>();
  async function getSentToday(uid: string, day: string) {
    const k = uid + day;
    let v = sentToday.get(k);
    if (!v) {
      const { data } = await db.from('push_sent').select('kind').eq('user_id', uid).eq('day', day);
      v = (data ?? []).map((r: { kind: string }) => r.kind);
      sentToday.set(k, v);
    }
    return v;
  }
  // 주간 합계: week(월요일 날짜) → (user_id → 합계)
  let weekly: Map<string, Map<string, number>> | null = null;
  async function getWeekly(kstDay: string) {
    if (weekly) return weekly;
    weekly = new Map();
    const from = numDay(dayNum(mondayOf(kstDay)) - 14);
    for (let off = 0; off < 100000; off += 1000) {
      const { data, error: e } = await db.from('weekly_scores').select('user_id, week, score').gte('week', from).range(off, off + 999);
      if (e || !data) break;
      data.forEach((r: { user_id: string; week: string; score: number }) => {
        let m = weekly!.get(r.week);
        if (!m) { m = new Map(); weekly!.set(r.week, m); }
        m.set(r.user_id, (m.get(r.user_id) ?? 0) + r.score);
      });
      if (data.length < 1000) break;
    }
    return weekly;
  }
  function rankOf(m: Map<string, number> | undefined, uid: string) {
    if (!m || !(m.get(uid) > 0)) return null;
    const mine = m.get(uid)!;
    let above = 0, next = Infinity;
    m.forEach((t) => { if (t > mine) { above++; if (t < next) next = t; } });
    return { rnk: above + 1, cnt: m.size, total: mine, gap: next === Infinity ? 0 : next - mine };
  }

  // 한 알림을 보내요. 같은 (사람·기기·종류·키)는 한 번만 (표에 먼저 적어 두고 보내요).
  async function push(s: Sub, kind: string, key: string, day: string, payload: { title: string; body: string; tag?: string }) {
    const claim = await db.from('push_sent').insert({ user_id: s.user_id, kind, key: `${key}|${s.endpoint.slice(-24)}`, day });
    if (claim.error) { skipped++; return false; }   // 이미 보냈거나(중복) 표가 아직 없어요
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload));
      sent++;
      (await getSentToday(s.user_id, day)).push(kind);
      return true;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {   // 구독이 만료됨
        await db.from('push_subscriptions').delete().eq('user_id', s.user_id).eq('endpoint', s.endpoint);
        removed++;
      } else {
        await db.from('push_sent').delete().eq('user_id', s.user_id).eq('kind', kind).eq('key', `${key}|${s.endpoint.slice(-24)}`);   // 다음 구간에 다시 시도
      }
      return false;
    }
  }

  for (const s of (subs ?? []) as Sub[]) {
    if (!proUsers.has(s.user_id)) { skipped++; continue; }
    // 예전 방식(daily_on 만 있던 구독)도 그대로 동작해요
    const pr: Prefs = s.prefs ?? { daily: s.daily_on !== false };
    const now = localParts(s.tz || 'Asia/Seoul');
    const hour = Math.floor(now.minutes / 60);

    // 1) 복습 알림: 정한 시간, 오늘 아직 공부 전이면 (모두 같은 문구)
    if (pr.daily) {
      const [h, m] = String(s.remind_time).split(':').map(Number);
      if (inWin(now.minutes, h, m)) {
        const log = await getLog(s.user_id);
        if (!((log.get(now.day) ?? 0) > 0)) {
          await push(s, 'daily', now.day, now.day, { title: '팽팽이', body: '오늘 중국어 한 문장만 말해 볼까요?' });
        }
      }
    }

    // 2) 연속 학습 지키기: 밤 9시
    if (pr.streak && inWin(now.minutes, 21)) {
      const log = await getLog(s.user_id);
      if (!((log.get(now.day) ?? 0) > 0)) {
        let n = 0, d = dayNum(now.day) - 1;
        while ((log.get(numDay(d)) ?? 0) > 0) { n++; d--; }
        if (n >= 3) await push(s, 'streak', now.day, now.day, { title: `🔥 ${n}일 연속 중이에요!`, body: '오늘 한 문제만 풀면 이어져요' });
      }
    }

    // 3) 이후는 하루 최대 EVENT_CAP 개까지 (streak·daily·word 는 세지 않아요)
    const capLeft = async () => {
      const t = await getSentToday(s.user_id, now.day);
      return t.filter((k) => !['streak', 'daily', 'word'].includes(k)).length < EVENT_CAP;
    };

    // 4) 오늘 목표 거의 다 왔어요: 밤 8시
    if (pr.goal && inWin(now.minutes, 20) && await capLeft()) {
      const goal = s.goal ?? 50;
      const a = (await getLog(s.user_id)).get(now.day) ?? 0;
      if (a >= Math.ceil(goal / 2) && a < goal) {
        await push(s, 'goal', now.day, now.day, { title: '거의 다 왔어요 💪', body: `오늘 목표까지 ${goal - a}문제 남았어요` });
      }
    }

    // 5) 복습할 단어: 낮 12시 반
    if (pr.review && inWin(now.minutes, 12, 30) && await capLeft()) {
      const a = (await getLog(s.user_id)).get(now.day) ?? 0;
      if (a === 0) {
        const { data: srs } = await db.from('user_srs').select('data').eq('user_id', s.user_id).maybeSingle();
        const t = dayNum(now.day);
        const due = Object.values((srs?.data ?? {}) as Record<string, number[]>).filter((e) => Array.isArray(e) && e[1] <= t).length;
        if (due >= 10) await push(s, 'review', now.day, now.day, { title: '팽팽이', body: `오늘 복습할 단어가 ${due}개예요` });
      }
    }

    // 6) 주간 순위 마감: 일요일 저녁 7시 (주차는 한국 시간 월요일 기준)
    const kst = localParts('Asia/Seoul');
    if (pr.rank && weekday(now.day) === 0 && inWin(now.minutes, 19) && await capLeft()) {
      const w = await getWeekly(kst.day);
      const r = rankOf(w.get(mondayOf(kst.day)), s.user_id);
      if (r) {
        const body = r.rnk === 1
          ? `이번 주 1위예요! 오늘 밤까지 지켜 볼까요? (${r.total}점)`
          : `이번 주 ${r.rnk}위예요. ${r.rnk - 1}위까지 ${r.gap + 1}점 남았어요`;
        await push(s, 'rank', mondayOf(kst.day), now.day, { title: '주간 순위 마감이 오늘 밤이에요', body });
      }
    }

    // 7) 지난주 결과: 월요일 아침 9시
    if (pr.week && weekday(now.day) === 1 && inWin(now.minutes, 9) && await capLeft()) {
      const w = await getWeekly(kst.day);
      const thisMon = mondayOf(kst.day), prev = numDay(dayNum(thisMon) - 7), prev2 = numDay(dayNum(thisMon) - 14);
      const r = rankOf(w.get(prev), s.user_id);
      if (r) {
        let title = `지난주 ${r.rnk}위였어요`, body = `${r.cnt}명 중 ${r.rnk}위 · ${r.total}점. 이번 주도 도전해 볼까요?`;
        if (r.rnk <= 3) { title = `🏆 지난주 ${r.rnk}위!`; body = `${r.total}점으로 멋지게 마무리했어요. 이번 주도 이어가 볼까요?`; }
        else if (r.rnk > 10) {
          const before = w.get(prev2)?.get(s.user_id) ?? 0;
          title = '지난주 결과가 나왔어요';
          body = before > 0 && r.total > before
            ? `지난주 ${r.total}점, 그 전 주보다 ${r.total - before}점 올랐어요!`
            : `지난주 ${r.total}점을 모았어요. 이번 주는 더 높이 가 볼까요?`;
        }
        await push(s, 'week', thisMon, now.day, { title, body });
      }
    }

    // 8) 오랜만이에요: 마지막 공부 후 3일째, 7일째 아침 10시
    if (pr.back && inWin(now.minutes, 10) && await capLeft()) {
      const log = await getLog(s.user_id);
      let last = -1;
      log.forEach((a, d) => { if (a > 0) last = Math.max(last, dayNum(d)); });
      const gap = last < 0 ? -1 : dayNum(now.day) - last;
      if (gap === 3) await push(s, 'back', 'b3', now.day, { title: '팽팽이', body: '3일째 쉬고 있어요. 오늘 한 문장만 말해 볼까요?' });
      if (gap === 7) await push(s, 'back', 'b7', now.day, { title: '팽팽이', body: '일주일이 지났어요. 하던 게임이 있으면 이어서 할 수 있어요' });
    }

    // 9) 오늘의 단어: 현지 8시~21시 정시마다 한 단어 (앱을 열지 않아도 배울 수 있게)
    if (pr.word && hour >= WORD_FROM && hour <= WORD_TO && now.minutes % 60 < WINDOW_MIN) {
      const all = await loadWords();
      const lvs = (pr.wordLv && pr.wordLv.length ? pr.wordLv : [1]).filter((l) => l >= 1 && l <= 4).sort();
      if (all) {
        const pool: { lv: number; w: string[] }[] = [];
        lvs.forEach((l) => (all[String(l)] ?? []).forEach((w) => pool.push({ lv: l, w })));
        if (pool.length) {
          const slots = WORD_TO - WORD_FROM + 1;
          const idx = (dayNum(now.day) * slots + (hour - WORD_FROM) + hash(s.user_id)) % pool.length;
          const { lv, w } = pool[idx];
          await push(s, 'word', `${now.day}-${hour}`, now.day, {
            title: `${w[0]} · ${w[1]} · ${w[2]}`, body: `${w[3]}\nHSK ${lv}급`, tag: 'pangpang-word',
          });
        }
      }
    }
  }
  return Response.json({ sent, skipped, removed });
});
