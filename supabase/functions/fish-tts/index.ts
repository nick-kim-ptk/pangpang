// Fish Audio 음성 테스트 (Supabase Edge Function)
// 로그인한 사용자가 보낸 문장을 Fish Audio로 읽어서 mp3로 돌려줘요. (앱 본체와는 별개인 테스트용)
// 필요한 비밀 값: FISH_API_KEY  (채팅에 붙여넣지 말고 Supabase 대시보드에서 직접 넣어요)
// 선택: FISH_MODEL (기본 s2.1-pro)
// (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase가 자동으로 넣어 줘요. 'Verify JWT'는 끄고 코드에서 로그인을 직접 확인해요.)
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const MAX_TEXT = 200;       // 한 번에 읽을 최대 글자 수
const MAX_PER_MINUTE = 20;  // 사용자당 분당 호출 제한
const hits = new Map<string, number[]>();

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  const key = Deno.env.get('FISH_API_KEY');
  if (!key) return json({ ok: false, error: 'no_key' }, 500);

  // 1) 로그인 확인
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ ok: false, error: 'auth' }, 401);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: ud, error: ue } = await db.auth.getUser(token);
  const uid = ud?.user?.id;
  if (ue || !uid) return json({ ok: false, error: 'auth' }, 401);

  // 2) 호출 횟수 제한
  const now = Date.now();
  const recent = (hits.get(uid) ?? []).filter((t) => now - t < 60000);
  if (recent.length >= MAX_PER_MINUTE) return json({ ok: false, error: 'rate' }, 429);
  recent.push(now);
  hits.set(uid, recent);

  // 3) 입력 확인
  let body: any = null;
  try { body = await req.json(); } catch (_e) { /* 아래에서 처리 */ }
  const text = String(body?.text ?? '').trim().slice(0, MAX_TEXT);
  if (!text) return json({ ok: false, error: 'text' }, 400);
  const voice = String(body?.voice ?? '').trim();
  const speed = Math.min(1.5, Math.max(0.6, Number(body?.speed) || 1));

  const MODELS = ['s2.1-pro', 's2-pro', 'drama-3'];
  const asked = String(body?.model ?? '');
  const model = MODELS.includes(asked) ? asked : (Deno.env.get('FISH_MODEL') ?? 's2.1-pro');

  const payload: Record<string, unknown> = {
    text,
    format: 'mp3',
    latency: 'low',
    language: 'zh-CN',
    prosody: { speed },
  };
  if (/^[A-Za-z0-9_-]{8,64}$/.test(voice)) payload.reference_id = voice;

  // 4) Fish Audio 호출
  const t0 = Date.now();
  let r: Response;
  try {
    r = await fetch('https://api.fish.audio/v1/tts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        model: model,
      },
      body: JSON.stringify(payload),
    });
  } catch (_e) {
    return json({ ok: false, error: 'network' }, 502);
  }
  if (!r.ok) {
    const msg = (await r.text().catch(() => '')).slice(0, 200);
    return json({ ok: false, error: 'fish', status: r.status, message: msg }, 502);
  }
  const audio = await r.arrayBuffer();
  return new Response(audio, {
    status: 200,
    headers: { ...CORS, 'Content-Type': 'audio/mpeg', 'X-Fish-Ms': String(Date.now() - t0), 'Access-Control-Expose-Headers': 'X-Fish-Ms' },
  });
});
