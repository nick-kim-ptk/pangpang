// 복습 알림 보내기 (Supabase Edge Function)
// 15분마다 호출돼요. 알림 시각이 지금 15분 구간에 들어오고, 오늘 아직 공부하지 않은 사람에게만 보내요.
// 필요한 비밀 값: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT(mailto:...), CRON_SECRET
// (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase가 자동으로 넣어 줘요)
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const WINDOW_MIN = 15;

function localParts(tz: string, d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const p: Record<string, string> = {};
  f.formatToParts(d).forEach((x) => (p[x.type] = x.value));
  return { day: `${p.year}-${p.month}-${p.day}`, minutes: (parseInt(p.hour) % 24) * 60 + parseInt(p.minute) };
}

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
  for (const s of subs ?? []) {
    const now = localParts(s.tz || 'Asia/Seoul');
    const [h, m] = String(s.remind_time).split(':').map(Number);
    const diff = now.minutes - (h * 60 + m);
    if (diff < 0 || diff >= WINDOW_MIN) { skipped++; continue; }
    const { data: log } = await db.from('daily_log').select('answers').eq('user_id', s.user_id).eq('day', now.day).maybeSingle();
    if (log && log.answers > 0) { skipped++; continue; }   // 오늘 이미 공부했어요
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify({ title: '팽팽이', body: '오늘 중국어 한 문장만 말해 볼까요?' }),
      );
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {   // 구독이 만료됨
        await db.from('push_subscriptions').delete().eq('user_id', s.user_id).eq('endpoint', s.endpoint);
        removed++;
      }
    }
  }
  return Response.json({ sent, skipped, removed });
});
