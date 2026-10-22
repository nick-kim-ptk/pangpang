/* 팽팽이 — 말하면서 익히는 중국어 */
(function () {
  'use strict';

  var LESSONS = window.LESSONS;
  var GRAMMAR = window.GRAMMAR || [];
  var Grade = window.Grade;
  var Hangul = window.Hangul;
  var PHRASES = window.PHRASES || [];
  function kr(py) {
    if (typeof state !== 'undefined' && state && state.profile && state.profile.kr === false) return '';
    return Hangul ? Hangul.fromPinyin(py) : '';
  }
  var cfg = window.APP_CONFIG || {};
  var sb = null;
  if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase) {
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }

  var $app = document.getElementById('app');
  var $toast = document.getElementById('toast');

  // 스플래시: 최소 이만큼은 보여 준 뒤 홈으로 들어가요
  var SPLASH_MS = 3800;
  var splashStart = Date.now();
  var splashDone = false;
  function afterSplash(cb) {
    if (splashDone) { cb(); return; }
    var wait = Math.max(0, SPLASH_MS - (Date.now() - splashStart));
    setTimeout(function () {
      splashDone = true;
      var el = document.querySelector ? document.querySelector('.sp') : null;
      if (el) { el.classList.add('sp-out'); setTimeout(cb, 250); } else cb();
    }, wait);
  }

  var APP_VERSION = 'v175';

  var QMAP = {};
  LESSONS.concat(GRAMMAR).forEach(function (l) { l.qs.forEach(function (q) { QMAP[q.id] = q; }); });

  var INTERVALS = [0, 1, 3, 7, 14, 30]; // 박스별 복습 간격(일)
  var REVIEW_SIZE = 8;
  var CLEAR_COUNT = 20; // 이 만큼 풀면 레슨 완료 (이후 나머지는 더 연습하기)
  var PRACTICE_SIZE = 50; // 레슨 연습 한 번에 푸는 문제 수 (레슨의 문장을 섞어 반복)

  var GOALS = [20, 50, 100];
  // HSK 단어별 '알아요' 표시: 급마다 0/1 문자열 (예: '0110…')
  function normHsk(h) {
    var out = {};
    [1, 2, 3, 4].forEach(function (lv) {
      var s = h && typeof h[lv] === 'string' ? h[lv] : '';
      out[lv] = /^[01]*$/.test(s) ? s.slice(0, 1100) : '';
    });
    return out;
  }
  function normProfile(p) {
    p = p || {};
    var g = parseInt(p.goal, 10);
    return {
      nickname: p.nickname || '',
      goal: GOALS.indexOf(g) >= 0 ? g : 50,
      theme: (p.theme === 'light' || p.theme === 'dark') ? p.theme : 'auto',
      remind: /^\d\d:\d\d$/.test(p.remind || '') ? p.remind : '20:00',
      remindOn: !!p.remindOn,
      minuteOn: !!p.minuteOn,
      speedUsed: Math.max(0, parseInt(p.speedUsed, 10) || 0),
      sound: p.sound !== false,
      kr: p.kr !== false,
      input: p.input === 'type' ? 'type' : 'voice',
      hsk3: normHsk(p.hsk3),
      dlg: (Array.isArray(p.dlg) ? p.dlg : []).filter(function (x) { return typeof x === 'string'; }).slice(0, 50),
      favs: (Array.isArray(p.favs) ? p.favs : []).filter(function (x) { return typeof x === 'string'; }).slice(0, 100)
    };
  }
  function applyTheme() {
    var t = state.profile.theme;
    try { localStorage.setItem('pangpang.theme', t); } catch (e) { /* 무시 */ }
    try {
      var root = document.documentElement;
      if (t === 'light' || t === 'dark') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
      var dark = t === 'dark' || (t === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      var m = document.querySelector('meta[name="theme-color"]');
      if (m) m.setAttribute('content', dark ? '#0d111f' : '#f2f3f5');
    } catch (e) { /* 무시 */ }
  }
  var state = {
    screen: 'loading', // loading | login | tab | intro | practice | done
    tab: 'home',       // home | lessons | review | words | me
    user: null,
    ent: null,         // 이용권 {plan, expires_at}
    entErr: false,
    progress: {},      // qid -> row
    done: {},          // lessonId -> row
    daily: {},         // 'YYYY-MM-DD' -> {lessons, answers}
    srs: {},           // HSK 단어 복습 주기 'lv.idx' -> [상자, 다음 복습일(일 번호), 마지막 날, 틀린 횟수]
    lessonId: null,
    s: null,           // 연습 세션
    result: null,      // 완료 화면 정보
    profile: normProfile({}),
    editNick: false,
    modal: null
  };

  /* ---------- 유틸 ---------- */
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function dayStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function lessonById(id) { return LESSONS.concat(GRAMMAR).filter(function (l) { return l.id === id; })[0]; }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  // qs를 섞어 가며 n개가 될 때까지 반복 (같은 문제가 연달아 나오지 않게)
  // 첫 바퀴는 원문 그대로, 두 번째 바퀴부터는 단어를 바꾼 변형 문제가 섞여 나와요.
  function rounds(qs, n) {
    var out = [], round = 0;
    while (out.length < n) {
      var batch = shuffle(qs);
      if (round > 0 && window.Variants) {
        batch = batch.map(function (q) {
          var pool = Variants.all(q);
          return pool[Math.floor(Math.random() * pool.length)];
        });
      }
      if (out.length && batch.length > 1 && batch[0].zh === out[out.length - 1].zh) batch.push(batch.shift());
      out = out.concat(batch);
      round++;
    }
    return out.slice(0, n);
  }
  function dueISO(box) {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + INTERVALS[box]);
    return d.toISOString();
  }
  var toastTimer = null;
  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $toast.classList.remove('show'); }, 2600);
  }

  /* ---------- 아이콘 ---------- */
  var I = {
    lock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    mic: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    spk: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    close: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8z"/></svg>',
    chat: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.3A8 8 0 1 1 21 12z"/><path d="M8.5 11.5h7M8.5 14.5h4"/></svg>',
    review: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></svg>',
    list: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/></svg>',
    user: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6"/></svg>',
    star: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8L12 3.5z"/></svg>',
    book: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z"/><path d="M8 17h10"/></svg>',
    google: '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.500 42.600 14.600 48 24 48z"/></svg>'
  };

  /* ---------- 음성 합성(질문/정답 들려주기) ---------- */
  var voices = [];
  function loadVoices() { if ('speechSynthesis' in window) voices = window.speechSynthesis.getVoices() || []; }
  if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
  // 이 폰에 중국어 읽기 음성이 있는지: 'yes' / 'no' / 'unknown'(목록이 아직 비어 있어 모를 때)
  function zhVoiceState() {
    if (!('speechSynthesis' in window)) return 'no';
    if (!voices.length) loadVoices();
    if (!voices.length) return 'unknown';
    return voices.some(function (x) { return /^(zh|cmn|yue)/i.test(x.lang) || /chinese|中文|普通话|mandarin/i.test(x.name || ''); }) ? 'yes' : 'no';
  }
  var zhGuideShown = false;
  var ZH_GUIDE = '이 폰에는 중국어 읽기 음성이 없어서 소리가 이상하게 나올 수 있어요.\n\n1) 설정 → 일반 → 언어 → 텍스트 음성 변환\n2) 선호하는 엔진을 ‘Google 음성 합성’으로\n3) 톱니바퀴 → 언어 → 중국어 음성 데이터 내려받기\n4) 앱을 완전히 닫았다가 다시 열기\n\n※ 폰 종류에 따라 메뉴 이름이 조금 달라요.';
  function showZhGuide() {
    zhGuideShown = true;
    askConfirm({ title: '중국어 음성이 필요해요', body: ZH_GUIDE, ok: '알겠어요', cancel: '그래도 들어볼래요', m: 'sleep', left: true }, null, function () { speakForce = true; render(); });
  }
  var speakForce = false;
  function speak(text, rate, onend) {
    if (!('speechSynthesis' in window) || !text) { if (onend) onend(); return; }
    if (!speakForce && zhVoiceState() === 'no') {          // 중국어 음성이 없으면 엉뚱한 소리로 읽지 않고 안내해요
      if (!zhGuideShown) showZhGuide();
      if (onend) onend();
      return;
    }
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(String(text).replace(/[“”"]/g, ''));
    u.lang = 'zh-CN';
    u.rate = rate || 0.85;
    var v = voices.filter(function (x) { return /zh[-_]CN/i.test(x.lang); })[0] ||
            voices.filter(function (x) { return /^zh/i.test(x.lang); })[0];
    if (v) u.voice = v;
    if (onend) { var fired = false; u.onend = u.onerror = function () { if (!fired) { fired = true; onend(); } }; }
    window.speechSynthesis.speak(u);
  }
  function speakKo(text, onend) {
    if (!('speechSynthesis' in window)) { if (onend) onend(); return; }
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text); u.lang = 'ko-KR'; u.rate = 1.05;
    var v = voices.filter(function (x) { return /^ko/i.test(x.lang); })[0]; if (v) u.voice = v;
    var fired = false; u.onend = u.onerror = function () { if (!fired) { fired = true; if (onend) onend(); } };
    window.speechSynthesis.speak(u);
  }
  function stopSpeak() { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }

  /* ---------- 저장소 (Supabase / 미리보기 모드) ---------- */
  var LOCAL_KEY = 'pangpang.v1';
  var GUEST_KEY = 'pangpang.guest';   // 로그인 전 학습 기록(이 기기에만). 로그인하면 계정으로 옮겨요
  function isGuest() { return !!(state.user && state.user.id === 'guest'); }
  function persistLocal() {
    try {
      localStorage.setItem(isGuest() ? GUEST_KEY : LOCAL_KEY, JSON.stringify({ progress: state.progress, done: state.done, daily: state.daily, profile: state.profile, srs: state.srs, srsUid: state.user ? state.user.id : null }));
    } catch (e) { /* 저장 공간이 없으면 무시 */ }
  }
  function saveFailed(err) {
    if (window.console) console.error(err);
    toast('저장하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요');
  }

  /* ---------- 서버에서 최신 기록 가져오기 ---------- */
  async function fetchRemote() {
    var res = await Promise.all([
      sb.from('progress').select('*'),
      sb.from('lesson_done').select('*'),
      sb.from('daily_log').select('*').order('day', { ascending: false }).limit(120)
    ]);
    return { res: res, err: res[0].error || res[1].error || res[2].error };
  }
  function applyRemote(d, keepProfile) {
    var res = d.res;
    state.progress = {}; state.done = {}; state.daily = {};
    if (!keepProfile) {
      var meta = (state.user && state.user.user_metadata) || {};
      state.profile = normProfile({ nickname: meta.nickname, goal: meta.goal, theme: meta.theme, remind: meta.remind, remindOn: meta.remindOn, minuteOn: meta.minuteOn, speedUsed: meta.speedUsed, sound: meta.sound, kr: meta.kr, input: meta.input, favs: meta.favs, dlg: meta.dlg, hsk3: meta.hsk3 });
      applyTheme();
    }
    (res[0].data || []).forEach(function (r) { state.progress[r.qid] = r; });
    (res[1].data || []).forEach(function (r) { state.done[r.lesson_id] = r; });
    (res[2].data || []).forEach(function (r) { state.daily[r.day] = r; });
  }
  // 저장이 진행 중일 때 새로 가져오면 방금 한 기록이 덮어써질 수 있어서, 저장 횟수를 세어 둬요.
  var pendingSaves = 0, saveGen = 0, lastRefresh = 0;
  function tracked(fn) {
    return async function () {
      pendingSaves++; saveGen++;
      try { return await fn.apply(null, arguments); } finally { pendingSaves--; saveGen++; }
    };
  }
  // 하단 탭을 누를 때 조용히 최신 기록으로 맞춰요. 달라진 게 있을 때만 화면을 다시 그려서 깜빡이지 않아요.
  async function refreshQuiet() {
    if (!sb || !state.user || state.user.id === 'local' || isGuest() || pendingSaves > 0) return;
    if (Date.now() - lastRefresh < 4000) return;
    lastRefresh = Date.now();
    var gen = saveGen;
    try {
      var d = await fetchRemote();
      if (d.err || pendingSaves > 0 || gen !== saveGen || state.screen !== 'tab') return;
      var before = JSON.stringify([state.progress, state.done, state.daily]);
      applyRemote(d, true);
      var rch = await pullResume();
      var entBefore = JSON.stringify([state.ent, state.ai]);
      await loadEnt();
      if (!rch && JSON.stringify([state.ent, state.ai]) === entBefore && JSON.stringify([state.progress, state.done, state.daily]) === before) return;
      var sc = document.querySelector ? document.querySelector('.scroll') : null;
      var top = sc ? sc.scrollTop : 0;
      render();
      var sc2 = document.querySelector ? document.querySelector('.scroll') : null;
      if (sc2) sc2.scrollTop = top;
    } catch (e) { /* 네트워크가 안 되면 조용히 넘어가요 */ }
  }

  var store = {
    load: async function () {
      if (!sb || isGuest()) {
        try {
          var raw = JSON.parse(localStorage.getItem(isGuest() ? GUEST_KEY : LOCAL_KEY) || '{}');
          state.progress = raw.progress || {};
          state.done = raw.done || {};
          state.daily = raw.daily || {};
          state.profile = normProfile(raw.profile);
          state.srs = raw.srs || {};
        } catch (e) { state.progress = {}; state.done = {}; state.daily = {}; state.profile = normProfile({}); state.srs = {}; }
        applyTheme();
        return;
      }
      var d = await fetchRemote();
      if (d.err) saveFailed(d.err);
      applyRemote(d);
      await srsLoadRemote();
    },
    saveProgress: tracked(async function (rows) {
      persistLocal();
      if (!sb || isGuest() || !rows.length) return;
      var out = rows.map(function (r) { return Object.assign({ user_id: state.user.id }, r); });
      var res = await sb.from('progress').upsert(out, { onConflict: 'user_id,qid' });
      if (res.error) saveFailed(res.error);
    }),
    saveDone: tracked(async function (row) {
      persistLocal();
      if (!sb || isGuest()) return;
      var res = await sb.from('lesson_done').upsert(Object.assign({ user_id: state.user.id }, row), { onConflict: 'user_id,lesson_id' });
      if (res.error) saveFailed(res.error);
    }),
    saveProfile: tracked(async function () {
      persistLocal();
      if (!sb || isGuest()) return;
      var p = state.profile;
      var res = await sb.auth.updateUser({ data: { nickname: p.nickname, goal: p.goal, theme: p.theme, remind: p.remind, remindOn: p.remindOn, minuteOn: p.minuteOn, speedUsed: p.speedUsed, sound: p.sound, kr: p.kr, input: p.input, favs: p.favs, dlg: p.dlg, hsk3: p.hsk3 } });
      if (res.error) saveFailed(res.error); else if (res.data && res.data.user) state.user = res.data.user;
    }),
    saveDaily: tracked(async function (row) {
      persistLocal();
      if (!sb || isGuest()) return;
      var res = await sb.from('daily_log').upsert(Object.assign({ user_id: state.user.id }, row), { onConflict: 'user_id,day' });
      if (res.error) saveFailed(res.error);
    })
  };

  // 로그인 전에 한 학습을 계정으로 옮겨요 (계정에 이미 있는 기록은 그대로 둬요)
  function mergeGuest() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(GUEST_KEY) || 'null'); } catch (e) { raw = null; }
    if (!raw) return 0;
    var rows = [], n = 0;
    Object.keys(raw.progress || {}).forEach(function (q) {
      if (!state.progress[q]) { state.progress[q] = raw.progress[q]; rows.push(raw.progress[q]); }
    });
    Object.keys(raw.done || {}).forEach(function (l) {
      if (!state.done[l]) { state.done[l] = raw.done[l]; store.saveDone(raw.done[l]); n++; }
    });
    Object.keys(raw.daily || {}).forEach(function (d) {
      var g = raw.daily[d], r = state.daily[d];
      if (!r) { state.daily[d] = g; store.saveDaily(g); }
      else if ((g.answers || 0) > (r.answers || 0)) { r.answers = g.answers; r.lessons = Math.max(r.lessons || 0, g.lessons || 0); store.saveDaily(r); }
    });
    if (rows.length) store.saveProgress(rows);
    try { localStorage.removeItem(GUEST_KEY); } catch (e) {}
    return rows.length + n;
  }

  /* ---------- 학습 상태 계산 ---------- */
  // 오늘의 한 문장: 날짜로 순서를 정해 하루에 하나씩
  function todayPhrase() {
    if (!PHRASES.length) return null;
    var d = new Date();
    var n = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
    return PHRASES[n % PHRASES.length];
  }
  function phraseAt(back) {
    if (!PHRASES.length) return null;
    var d = new Date();
    var n = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000) - (back || 0);
    return PHRASES[((n % PHRASES.length) + PHRASES.length) % PHRASES.length];
  }
  function isFav(zh) { return state.profile.favs.indexOf(zh) >= 0; }
  function toggleFav(zh) {
    var f = state.profile.favs.slice(), i = f.indexOf(zh);
    if (i >= 0) f.splice(i, 1); else f.unshift(zh);
    sfx(i >= 0 ? 'tap' : 'pop');
    setProfile({ favs: f });
  }
  function spkBtn(text) {
    return '<button class="row-spk" data-act="say" data-text="' + esc(text) + '" aria-label="듣기">' + I.spk + '</button>';
  }
  function phraseRow(ph) {
    return '<div class="prow"><button class="pmain" data-act="say" data-text="' + esc(ph[0]) + '" aria-label="듣기">' +
      '<div class="zh p-zh2">' + esc(ph[0]) + '</div><div class="py">' + esc(ph[1]) + '</div><div class="kr">' + esc(kr(ph[1])) + '</div><div class="ko">' + esc(ph[2]) + '</div></button><div class="prow-btns">' + spkBtn(ph[0]) +
      '<button class="star' + (isFav(ph[0]) ? ' on' : '') + '" data-act="fav" data-text="' + esc(ph[0]) + '" aria-pressed="' + (isFav(ph[0]) ? 'true' : 'false') + '" aria-label="문장 저장">' + I.star + '</button></div></div>';
  }
  function nickname() { return (state.profile && state.profile.nickname || '').trim(); }

  /* ---------- 멤버십 (무료 3강 / 월 구독 / 연간 14개월) ---------- */
  var FREE_LESSONS = 3, PRICE_MONTH = 2990, PRICE_LIFE = 19900, WAS_MONTH = 4900, WAS_YEAR = PRICE_MONTH * 12, YEAR_DAYS = 425;   // 연간: 1년 + 2개월 무료(14개월), 정가 대신 '월 구독 12개월 값'을 비교해요
  function offPct(was, now) { return Math.round((1 - now / was) * 100); }
  function won(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '원'; }
  // 이용권 정보(state.ent)를 서버에서 가져와요. 못 가져오면(네트워크·표 없음) 잠그지 않아요.
  async function loadEnt() {
    state.entErr = false;
    if (!sb || !state.user || state.user.id === 'local' || isGuest()) { state.ent = null; state.ai = null; return; }
    var key = 'pangpang.ent.' + state.user.id;
    try {
      var res = await sb.from('entitlements').select('plan,expires_at').eq('user_id', state.user.id).maybeSingle();
      if (res.error) throw res.error;
      state.ent = res.data || null;
      try { localStorage.setItem(key, JSON.stringify({ v: state.ent })); } catch (e) {}
    } catch (e) {
      var c = null;
      try { c = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e2) {}
      if (c && 'v' in c) state.ent = c.v; else { state.ent = null; state.entErr = true; }
    }
    await loadAi();
  }
  /* ---------- AI 크레딧 (멤버십이 있을 때만 보여요) ---------- */
  var AI_PACKS = [{ id: 'p60', credits: 60, price: 1900 }, { id: 'p170', credits: 170, price: 4900 }, { id: 'p360', credits: 360, price: 9900 }];
  var AI_ERR = {
    no_credit: '크레딧이 모두 소진됐어요. 마이 화면의 AI 크레딧에서 충전할 수 있어요.',
    not_member: 'AI 선생님은 멤버십 기능이에요.',
    too_fast: '너무 빨리 눌렀어요. 잠시 후 다시 해 주세요.',
    ai_failed: 'AI가 응답하지 못했어요. 크레딧은 돌려드렸어요. 잠시 후 다시 해 주세요.',
    auth: '로그인이 필요해요.'
  };
  async function loadAi() {
    var prev = state.ai;       // 새로 받는 동안·잠깐 실패했을 때 멤버십 화면이 깜빡 '가입 전'으로 바뀌지 않게, 이전 값을 지키지 않고 바로 비우지 않아요
    if (!sb || isGuest() || state.entErr || !isPro()) { state.ai = null; state.aiOff = false; return; }
    try {
      var r = await sb.rpc('ai_wallet_get');
      if (r.error) throw r.error;
      var d = r.data || {};
      if (d.ok && d.member) { state.ai = { monthly: d.monthly | 0, topup: d.topup | 0, grant: d.grant | 0 }; state.aiOff = false; aiTries = 0; }
      else { state.ai = null; state.aiOff = true; }   // 서버가 '멤버가 아니다'라고 확실히 답한 경우만
    } catch (e) {
      state.ai = prev || null;
      var code = e && (e.code || '');
      state.aiOff = (code === '42883' || code === 'PGRST202');   // 함수가 아직 없을 때만 AI 메뉴를 숨겨요
      if (!state.aiOff) aiRetry();                                  // 일시적인 오류는 잠시 뒤 다시 받아요
    }
    if (state.ai) await loadFixes();
  }
  var aiTries = 0, aiRetryT = null;
  function aiRetry() {
    if (aiTries >= 4 || aiRetryT) return;
    aiTries++;
    aiRetryT = setTimeout(function () { aiRetryT = null; loadAi().then(function () { if (state.screen === 'tab') render(); }); }, 2500 * aiTries);
  }
  /* AI가 고쳐 준 문장·모은 표현 (AI 대화 탭에 보여요). 서버 표 ai_fix가 있으면 거기에, 없으면 이 기기에 저장해요 */
  var FIX_KEY = 'pangpang.aifix';
  function fixUid() { return (state.user && state.user.id) || 'x'; }
  function fixLocalRead() { try { var a = JSON.parse(localStorage.getItem(FIX_KEY + '.' + fixUid()) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function fixLocalWrite() { try { localStorage.setItem(FIX_KEY + '.' + fixUid(), JSON.stringify((state.fixes || []).slice(0, 100))); } catch (e) { /* 무시 */ } }
  function aiFixes() { return state.fixes || []; }
  async function loadFixes() {
    var local = fixLocalRead();
    state.fixes = local;
    try {
      var r = await sb.from('ai_fix').select('zh,pinyin,why,mine,kind,ko,created_at').order('created_at', { ascending: false }).limit(200);
      if (r && !r.error && Array.isArray(r.data)) {
        var seen = {}, out = [];
        r.data.map(function (x) { return x && x.zh ? Object.assign({}, x, { natural: x.zh }) : x; }).concat(local).forEach(function (x) { if (x && x.natural && !seen[x.natural]) { seen[x.natural] = 1; out.push({ natural: x.natural, pinyin: x.pinyin || '', why: x.why || '', mine: x.mine || '', kind: x.kind || 'fix', ko: x.ko || '', at: x.created_at || x.at || '' }); } });
        state.fixes = out.slice(0, 200); fixLocalWrite();
      }
    } catch (e) { /* 표가 아직 없으면 이 기기에만 저장돼요 */ }
  }
  function aiFixAdd(f) {
    if (!f || !f.natural) return;
    var list = (state.fixes || []).filter(function (x) { return x.natural !== f.natural; });
    list.unshift({ natural: f.natural, pinyin: f.pinyin || '', why: f.why || '', mine: f.mine || '', kind: f.kind || 'fix', ko: f.ko || '', at: new Date().toISOString() });
    state.fixes = list.slice(0, 200); fixLocalWrite();
    try {
      Promise.resolve(sb.from('ai_fix').upsert({ user_id: state.user.id, zh: f.natural, pinyin: f.pinyin || '', why: f.why || '', mine: f.mine || '', kind: f.kind || 'fix', ko: f.ko || '' }, { onConflict: 'user_id,zh' })).catch(function () {});
    } catch (e) { /* 무시 */ }
  }
  function aiFixDel(natural) {
    state.fixes = (state.fixes || []).filter(function (x) { return x.natural !== natural; }); fixLocalWrite();
    try { Promise.resolve(sb.from('ai_fix').delete().eq('zh', natural)).catch(function () {}); } catch (e) { /* 무시 */ }
  }
  var fixUi = { seg: 'expr', n: {} };
  // 모은 날짜: 오늘 / 1일 전 / 3개월 전 처럼 보여요
  function agoText(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    var a = new Date(); a.setHours(0, 0, 0, 0); d.setHours(0, 0, 0, 0);
    var n = Math.round((a - d) / 864e5);
    if (n <= 0) return '오늘';
    if (n < 30) return n + '일 전';
    if (n < 365) return Math.floor(n / 30) + '개월 전';
    return Math.floor(n / 365) + '년 전';
  }
  var ICON_TRASH = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
  function fixRowHtml(f, noDel) {
    var x = f.kind === 'ask' || f.kind === 'say', ago = agoText(f.at);
    var row = '<div class="fixrow' + (x ? '' : ' no-chip') + '"><button class="fixrow-main" data-act="say" data-text="' + esc(f.natural) + '">' +
      (ago ? '<span class="fix-ago">' + ago + '</span>' : '') +
      (x ? '<span class="xchip ' + f.kind + '">' + (f.kind === 'ask' ? '질문' : '대답') + '</span>' : '') +
      '<span class="zh">' + esc(f.natural) + '</span>' +
      (f.pinyin ? '<span class="py">' + esc(f.pinyin) + '</span>' : '') + (f.ko ? '<span class="why">' + esc(f.ko) + '</span>' : '') +
      (f.mine ? '<span class="mine">내가 한 말 · ' + esc(f.mine) + '</span>' : '') +
      (f.why ? '<span class="why">' + esc(f.why) + '</span>' : '') + '</button>' + spkBtn(f.natural) + '</div>';
    if (noDel) return row;
    // 전체 보기: 왼쪽으로 밀면 휴지통이 나와요
    return '<div class="fixswipe"><button class="fixdel" data-act="ai-fix-del" data-t="' + esc(f.natural) + '" aria-label="삭제">' + ICON_TRASH + '</button>' + row + '</div>';
  }
  // 전체 보기 화면: '모은 표현'과 '고쳐 준 문장' 두 메뉴. 7개씩 보여 주고 더보기로 늘려요
  function aiFixFull() {
    var fx = aiFixes();
    var lists = {
      expr: fx.filter(function (f) { return f.kind === 'ask' || f.kind === 'say'; }),
      fix: fx.filter(function (f) { return !f.kind || f.kind === 'fix'; })
    };
    var seg = fixUi.seg === 'fix' ? 'fix' : 'expr', list = lists[seg];
    var take = fixUi.n[seg] || 7, shown = list.slice(0, take);
    var tabs = '<div class="aiseg" role="tablist">' +
      '<button role="tab" class="' + (seg === 'expr' ? 'on' : '') + '" data-act="ai-seg" data-k="expr">모은 표현<b>' + lists.expr.length + '</b></button>' +
      '<button role="tab" class="' + (seg === 'fix' ? 'on' : '') + '" data-act="ai-seg" data-k="fix">고쳐 준 문장<b>' + lists.fix.length + '</b></button></div>';
    var note = seg === 'expr' ? '대화에서 자주 묻고 답할 만한 말을 모았어요. 눌러서 소리를 듣고 따라 말해 보세요.' : 'AI 선생님이 고쳐 준 문장이에요. 눌러서 소리를 듣고 따라 말해 보세요.';
    var body = list.length ?
      '<p class="hsk-note under-title">' + note + '</p><div class="fixlist">' + shown.map(function (f) { return fixRowHtml(f); }).join('') + '</div>' +
        (list.length > take ? '<button class="more-btn" data-act="ai-fix-more" data-k="' + seg + '">더보기 (' + Math.min(7, list.length - take) + '개 더)</button>' : '')
      : '<div class="aiempty">' + (seg === 'expr' ? '아직 모은 표현이 없어요.<br>AI와 대화하고 마치면 자주 쓸 표현이 여기에 모여요.' : '아직 고쳐 받은 문장이 없어요.<br>대화 중 어색한 말을 하면 AI 선생님이 고쳐 줘요.') + '</div>';
    return tabs + body;
  }
  // AI 대화 탭: 모은 표현 최근 5건만 보여 주고, 전체는 '전체 보기'에서 봐요
  function aiFixSection() {
    var list = aiFixes().filter(function (f) { return f.kind === 'ask' || f.kind === 'say'; }).slice(0, 5);
    var head = '<div class="aisec-head"><div class="section-title" style="margin:0">다시 써 볼 표현</div><button class="aisec-all" data-act="open-aiall">전체 보기</button></div>';
    var body = list.length ?
      '<div class="fixlist" style="margin-top:12px">' + list.map(function (f) { return fixRowHtml(f, true); }).join('') + '</div>'
      : '<div class="aiempty">아직 모은 표현이 없어요.<br>AI와 대화하고 마치면 자주 쓸 표현이 여기에 모여요.</div>';
    return '<div style="margin-top:28px"></div>' + head + body;
  }
  function viewAiAll() {
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll" style="padding-top:4px"><h1 class="big-title" style="margin-top:0">다시 써 볼 표현</h1>' + aiFixFull() + '<div style="height:60px"></div></div></div>';
  }
  function aiOn() { return !!(sb && !isGuest() && !state.entErr && isPro() && !state.aiOff); }
  function aiBal() { return state.ai ? state.ai.monthly + state.ai.topup : 0; }
  function isPro() {
    if (!sb) return true;                 // 미리보기 모드는 전부 열려 있어요
    if (state.entErr) return true;        // 이용권을 확인하지 못했을 땐 잠그지 않아요
    var e = state.ent;
    if (!e) return false;
    if (e.plan === 'lifetime') return true;
    return !!e.expires_at && new Date(e.expires_at) > new Date();
  }
  // 비로그인·미멤버십은 앞의 2개 상황만 체험해요
  function scAvail() { return (loggedOut() || !isPro()) ? SCENES.slice(0, 2) : SCENES; }
  function loggedOut() { return isGuest() || !state.user || state.user.id === 'local'; }
  function lessonLocked(id) {
    var i = LESSONS.indexOf(lessonById(id));
    return i >= FREE_LESSONS && !isPro();
  }
  // 무료 체험: 스피드 퀴즈는 1회분, HSK는 1급만
  function speedLocked() { return !isPro() && state.profile.speedUsed >= 1; }
  function dialogLocked(id) {   // 첫 번째 상황 대화는 무료로 계속 할 수 있어요
    if (isPro()) return false;
    var ds = window.DIALOGS || [];
    return !ds.length || !id || ds[0].id !== id;
  }
  function hskLocked(lv) { return lv >= 2 && !isPro(); }
  function fmtDate(iso) { var d = new Date(iso); return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate(); }
  function memberLabel() {
    var e = state.ent;
    if (!isPro()) return { t: '무료 이용 중', s: '3강까지 무료예요' };
    if (e && e.plan === 'lifetime') return { t: '평생 이용 중', s: '모든 레슨을 계속 쓸 수 있어요' };
    if (e && e.plan === 'yearly' && e.expires_at) return { t: '연간 이용 중', s: fmtDate(e.expires_at) + '까지 이용할 수 있어요' };
    if (e && e.expires_at) return { t: '구독 중', s: fmtDate(e.expires_at) + '까지 이용할 수 있어요' };
    return { t: '이용 중', s: '모든 레슨을 쓸 수 있어요' };
  }

  function dueRows() {
    var now = new Date();
    return Object.keys(state.progress).map(function (k) { return state.progress[k]; })
      .filter(function (r) { return QMAP[r.qid] && new Date(r.due_at) <= now; })
      .sort(function (a, b) { return new Date(a.due_at) - new Date(b.due_at); });
  }
  var WEAK_SIZE = 20;
  // 틀린 적이 있고 아직 익숙하지 않은(상자 4 미만) 문제
  function weakRows() {
    return Object.keys(state.progress).map(function (k) { return state.progress[k]; })
      .filter(function (r) { return QMAP[r.qid] && r.wrong > 0 && r.box < 4; })
      .sort(function (x, y) { return y.wrong - x.wrong; });
  }
  function streak() {
    var d = new Date();
    function has(x) { var r = state.daily[dayStr(x)]; return r && r.answers > 0; }
    if (!has(d)) d.setDate(d.getDate() - 1);
    var n = 0;
    while (has(d)) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function todayAnswers() { var r = state.daily[dayStr(new Date())]; return r ? (r.answers || 0) : 0; }
  function setProfile(patch) {
    Object.keys(patch).forEach(function (k) { state.profile[k] = patch[k]; });
    state.profile = normProfile(state.profile);
    applyTheme();
    render();
    store.saveProfile();
  }
  var MILESTONES = [3, 7, 14, 30, 50, 100];
  function todayDone() { var r = state.daily[dayStr(new Date())]; return !!(r && r.lessons > 0); }
  function nextLesson() {
    return LESSONS.filter(function (l) { return !state.done[l.id]; })[0] || null;
  }
  function learnedLessons() { return LESSONS.filter(function (l) { return state.done[l.id]; }); }
  function mastered(lesson) {
    return lesson.qs.filter(function (q) { var r = state.progress[q.id]; return r && r.box >= 4; }).length;
  }

  /* ---------- 화면 이동 ---------- */
  // 뒤로 가기: 폰의 뒤로 제스처·버튼(기록)과 화면 왼쪽 가장자리에서 오른쪽으로 미는 동작을 같이 처리해요
  var SUBSCREEN = { pay: 1, privacy: 1, login: 1, intro: 1, practice: 1, quiz: 1, stats: 1, done: 1, hsk: 1, hskstudy: 1, tone: 1, feedback: 1, speed: 1, account: 1, coupon: 1, aicharge: 1, aichat: 1, aiall: 1, aichats: 1, aichatlog: 1, scene: 1, gram: 1, chain: 1, rain: 1, scenes: 1, phrases: 1, prefs: 1, about: 1, advisor: 1 };
  var inSub = false, ignorePop = 0, backAnim = false;
  function syncHistory(screen) {
    try {
      if (SUBSCREEN[screen] && !inSub) { history.pushState({ pp: 1 }, ''); inSub = true; }
      else if (!SUBSCREEN[screen] && inSub) {
        inSub = false; ignorePop++;
        history.back();
        setTimeout(function () { ignorePop = 0; }, 600);
      }
    } catch (e) { /* 무시 */ }
  }
  function canGoBack() { return !!state.modal || !!SUBSCREEN[state.screen]; }
  function goBack() {
    if (state.modal) { closeModal(); return; }
    var sc = state.screen;
    if (sc === 'practice' && state.s && state.s.wordsOpen) { state.s.wordsOpen = false; render(); return; }
    if (sc === 'aichat') {
      var ac = state.ac;
      if (ac && ac.mode === 'chat' && !ac.ended && ac.turns > 0 && !ac.leave) { ac.leave = true; render(); return; }
      if (ac && ac.mode === 'chat' && ac.leave) { ac.leave = false; render(); return; }
      acStop(); go('tab');
    }
    else if (sc === 'practice') quitPractice();
    else if (sc === 'quiz') { stopSpeak(); go('tab', { tab: 'words' }); }
    else if (sc === 'hskstudy') { stopSpeak(); clearTimeout(hskTimer); store.saveProfile(); go('tab', { tab: 'words' }); }
    else if (sc === 'tone') { stopSpeak(); go('tab', { tab: 'words' }); }
    else if (sc === 'aichats') go('tab');
    else if (sc === 'aichatlog') go(state.chatFrom === 'all' ? 'aichats' : 'tab');
    else if (sc === 'hsk') go('tab');
    else if (sc === 'login') loginLater();
    else if (sc === 'pay') go('tab');
    else if (sc === 'privacy') go(state.privFrom === 'login' ? 'login' : 'tab');
    else if (sc === 'speed') { stopSpeed(); go('tab'); }
    else if (sc === 'chain') { chStop(); go('tab', { tab: 'words' }); }
    else if (sc === 'rain') { rnStop(); go('tab', { tab: 'words' }); }
    else if (sc === 'scene') { stopSpeak(); scStopRec(); state.sc = null; go(state.scFrom === 'scenes' ? 'scenes' : 'tab'); }
    else if (sc === 'gram') { stopSpeak(); go('intro', { lessonId: state.gm.l.id }); }
    else if (sc === 'scenes') go('tab', { tab: 'lessons' });
    else if (sc === 'done') go('tab', { tab: 'home' });
    else if (sc === 'feedback' || sc === 'account' || sc === 'coupon') go('prefs');
    else if (sc === 'intro' || sc === 'stats' || sc === 'aicharge' || sc === 'aiall' || sc === 'phrases' || sc === 'prefs' || sc === 'about' || sc === 'advisor') go('tab');
  }
  window.addEventListener('popstate', function () {
    if (ignorePop > 0) { ignorePop--; return; }
    if (!inSub) return;
    if (state.modal || state.screen === 'practice' || state.screen === 'quiz' || state.screen === 'hskstudy' || (state.screen === 'aichat' && state.ac && state.ac.mode === 'chat')) {
      try { history.pushState({ pp: 1 }, ''); } catch (e) { /* 무시 */ }   // 그 자리에 머물며 확인 창만 보여요
      goBack();
      return;
    }
    inSub = false;
    backAnim = true;
    goBack();
  });
  var sw = null;
  function swReset(el) { if (el) { el.style.transition = ''; el.style.transform = ''; } }
  document.addEventListener('touchstart', function (e) {
    var t = e.touches && e.touches[0];
    if (!t || e.touches.length !== 1 || t.clientX > 32 || !canGoBack() || !document.querySelector) { sw = null; return; }
    sw = { x: t.clientX, y: t.clientY, dx: 0, drag: false, el: document.querySelector('.screen') };
  }, { passive: true });
  document.addEventListener('touchmove', function (e) {
    if (!sw) return;
    var t = e.touches[0], dx = t.clientX - sw.x, dy = t.clientY - sw.y;
    if (!sw.drag) {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) { sw = null; return; }
      if (dx > 10) sw.drag = true; else return;
    }
    sw.dx = Math.max(0, dx);
    if (sw.el) { sw.el.style.transition = 'none'; sw.el.style.transform = 'translateX(' + sw.dx + 'px)'; }
  }, { passive: true });
  function swEnd() {
    var s = sw; sw = null;
    if (!s || !s.drag) return;
    var ok = s.dx > Math.min(110, (window.innerWidth || 360) * 0.3);
    if (s.el) { s.el.style.transition = 'transform .18s ease'; s.el.style.transform = ok ? 'translateX(100%)' : ''; }
    if (ok) setTimeout(function () { backAnim = true; goBack(); }, 180);
    else setTimeout(function () { swReset(s.el); }, 200);
  }
  document.addEventListener('touchend', swEnd, { passive: true });
  document.addEventListener('touchcancel', function () { var s = sw; sw = null; if (s) swReset(s.el); }, { passive: true });

  // 로그인이 필요한 순간: 로그인 화면을 띄우고, '나중에'를 누르면 하려던 곳으로 보내요
  var LOGIN_MSG = {
    save: '학습한 내용을 저장하려면 로그인이 필요해요.',
    me: '내 기록과 설정을 보려면 로그인이 필요해요.',
    ai: 'AI 대화는 회원가입 후 로그인해야 쓸 수 있어요.',
    pay: '멤버십을 쓰려면 로그인이 필요해요.'
  };
  function requireLogin(reason, later) {
    state.loginReason = reason; state.loginLater = later; state.loginBusy = false;
    go('login');
  }
  function loginLater() {
    var f = state.loginLater;
    state.loginLater = null; state.loginReason = null;
    if (f) f(); else go('tab', { tab: 'home' });
  }
  function go(screen, extra) {
    if (screen === 'done' && isGuest() && !(extra && extra.loginDone)) {
      requireLogin('save', function () { go('done', Object.assign({}, extra || {}, { loginDone: true })); });
      return;
    }
    if (screen === 'intro' && extra && extra.lessonId && lessonLocked(extra.lessonId)) {
      extra = { payWhy: '‘' + lessonById(extra.lessonId).title + '’ 레슨은 멤버십이 필요해요.' }; screen = 'pay';
    }
    state.screen = screen;
    syncHistory(screen);
    if (extra) Object.keys(extra).forEach(function (k) { state[k] = extra[k]; });
    render();
    window.scrollTo(0, 0);
    if (screen === 'done') maybeCelebrate(); else if (celEl) closeCelebration(true);
  }

  /* ---------- 캐릭터 ---------- */
  function ms(name) { return (window.MASCOT && window.MASCOT[name]) || 'img/' + name + '.webp'; }
  // 팽팽 캐릭터 모션 (CSS만으로 움직여요): hello 인사 / book 학습 / ai 튜터
  function ppm(kind, w, cls) {
    var P = 'img/pm/', st = ' style="--w:' + w + 'px"';
    if (kind === 'hello') return '<div class="ppm ppm-hello"' + st + ' role="img" aria-label="인사하는 달팽이"><div class="ppm__shadow"></div><div class="ppm__body"><img src="' + P + 'hello-body.webp" alt=""><img class="ppm__blink" src="' + P + 'hello-blink.webp" alt=""></div><img class="ppm__nihao" src="' + P + 'hello-nihao.webp" alt=""><img class="ppm__annyeong" src="' + P + 'hello-annyeong.webp" alt=""></div>';
    if (kind === 'book') return '<div class="ppm ppm-book"' + st + ' role="img" aria-label="책 읽는 달팽이"><div class="ppm__shadow"></div><div class="ppm__body"><div class="ppm__breath"><img src="' + P + 'book-body.webp" alt=""><img class="ppm__blink" src="' + P + 'book-blink.webp" alt=""></div></div><span class="ppm__g" style="--c:#FFF6E4; --d:0s">文</span><span class="ppm__g" style="--c:#FFD45E; --d:-2.67s">A</span><span class="ppm__g" style="--c:#B9E3FF; --d:-1.34s">字</span></div>';
    if (kind === 'laptop') {
      var keys = [['N', 66, -20, 0, -10], ['I', 78, 30, .22, 8], ['H', 70, -10, 1.05, -6], ['A', 82, 40, 1.27, 10], ['O', 74, 10, 1.5, -8]].map(function (k) {
        return '<span class="ppm__key" style="--x:' + k[1] + '%;--tx:' + k[2] + '%;--d:' + k[3] + 's;--r:' + k[4] + 'deg">' + k[0] + '</span>';
      }).join('');
      return '<div class="ppm ppm-laptop' + (cls ? ' ' + cls : '') + '"' + st + ' role="img" aria-label="노트북으로 타자 치는 달팽이"><div class="ppm__shadow"></div><div class="ppm__body"><img src="' + P + 'laptop-body.webp" alt=""><img class="ppm__blink" src="' + P + 'laptop-blink.webp" alt=""><div class="ppm__glow"></div></div><img class="ppm__laptop" src="' + P + 'laptop-desk.webp" alt="">' + keys + '<span class="ppm__done">你好!</span></div>';
    }
    return '<div class="ppm ppm-ai"' + st + ' role="img" aria-label="AI 튜터 달팽이"><div class="ppm__shadow"></div><div class="ppm__body"><img src="' + P + 'ai-body.webp" alt=""><img class="ppm__blink" src="' + P + 'ai-blink.webp" alt=""><div class="ppm__scan"></div><span class="ppm__ring"></span><span class="ppm__ring" style="--d:1s"></span></div><img class="ppm__marks" src="' + P + 'ai-marks.webp" alt=""></div>';
  }
  function mascot(name, cls) {
    return '<img class="mascot' + (cls ? ' ' + cls : '') + '" src="' + ms(name) + '" alt="" draggable="false">';
  }
  // 스플래시 문구: 앱을 켤 때마다 하나를 무작위로 골라요 (로딩 중 다시 그려도 바뀌지 않아요)
  var SPLASH_TAGS = ["오늘도 한 걸음, 잘하고 있어", "서두르지 않아도, 조금씩 자라고 있어", "천천히 배워도 매일은 쌓이니까", "어제보다 한마디 더 알게 되는 기쁨", "작은 한마디부터 시작하는 새로운 세상", "너의 속도로, 너의 중국어를", "오늘은 한마디, 내일은 더 넓은 세상", "한마디씩 배우며 더 넓은 세상으로", "중국어로 만나는 새로운 나", "낯선 말이 익숙한 세상이 될 때까지", "오늘 배운 한마디가 세상을 넓혀줄 거야", "작은 시작이 새로운 가능성이 되도록", "한 걸음씩, 더 많은 세상과 연결되도록", "중국어를 배우는 만큼 세상이 가까워져", "느릿느릿, 그래도 앞으로!", "팽팽이와 함께라면 천천히도 좋아", "오늘도 한 뼘 자라는 중", "느려도 매일, 팽팽하게!", "서두르지 마, 재미있게 가자", "한마디씩 차곡차곡, 팽팽!", "조금 느려도 도착할 거야"];
  var splashTag = SPLASH_TAGS[Math.floor(Math.random() * SPLASH_TAGS.length)];
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  /* ---------- 화면: 로딩 / 로그인 ---------- */
  // 스플래시: 370×824 기준 화면을 기기에 맞춰 키우고 줄여요
  function spScale() {
    var w = window.innerWidth || 390, h = window.innerHeight || 844;
    return Math.max(0.5, Math.min(w / 370, h / 824)).toFixed(3);
  }
  var spTapN = 0;
  function splashTap(el) {
    if (!el || !document.querySelector) return;
    el.classList.remove('boing'); void el.offsetWidth; el.classList.add('boing');
    var st = document.querySelector('.sp-stage');
    if (!st) return;
    var fx = document.createElement('div');
    fx.className = 'sp-tapfx';
    fx.textContent = '嘭!';
    spTapN++;
    fx.style.left = (80 + ((spTapN * 53) % 230)) + 'px';
    fx.style.top = (230 + ((spTapN * 37) % 120)) + 'px';
    fx.style.setProperty('--rot', (((spTapN * 11) % 31) - 15) + 'deg');
    st.appendChild(fx);
    setTimeout(function () { if (fx.parentNode) fx.parentNode.removeChild(fx); }, 950);
  }
  function viewLoading() {
    return '<div class="screen sp" role="progressbar" aria-label="불러오는 중" style="--k:' + spScale() + '"><div class="sp-stage"><div class="sp-dots"></div><div class="sp-glow"></div><div class="sp-spiral"><svg viewBox="0 0 640 640" aria-hidden="true"><path d="M323.5 321.5 L324.1 322.1 L324.6 322.9 L324.9 323.7 L325.2 324.6 L325.4 325.5 L325.4 326.5 L325.3 327.5 L325.1 328.6 L324.7 329.7 L324.2 330.7 L323.5 331.8 L322.7 332.8 L321.8 333.7 L320.7 334.6 L319.6 335.4 L318.2 336.0 L316.8 336.6 L315.3 337.0 L313.7 337.3 L312.0 337.5 L310.3 337.4 L308.5 337.2 L306.7 336.9 L304.8 336.3 L303.0 335.6 L301.2 334.6 L299.5 333.5 L297.8 332.2 L296.2 330.7 L294.7 329.0 L293.3 327.2 L292.1 325.1 L291.0 323.0 L290.1 320.6 L289.3 318.2 L288.8 315.7 L288.5 313.0 L288.4 310.3 L288.6 307.5 L289.0 304.7 L289.7 301.9 L290.6 299.1 L291.8 296.3 L293.2 293.6 L294.9 290.9 L296.8 288.4 L299.0 286.0 L301.5 283.8 L304.1 281.7 L307.0 279.8 L310.1 278.1 L313.4 276.7 L316.8 275.6 L320.3 274.7 L324.0 274.1 L327.8 273.8 L331.7 273.8 L335.6 274.2 L339.5 274.9 L343.4 275.9 L347.3 277.3 L351.0 279.0 L354.7 281.0 L358.3 283.4 L361.7 286.1 L364.9 289.1 L367.9 292.4 L370.6 296.0 L373.1 299.8 L375.3 303.9 L377.2 308.2 L378.7 312.7 L379.8 317.4 L380.6 322.2 L381.0 327.2 L381.0 332.2 L380.6 337.2 L379.7 342.3 L378.5 347.3 L376.8 352.3 L374.6 357.1 L372.1 361.8 L369.1 366.4 L365.8 370.8 L362.0 374.9 L357.9 378.7 L353.5 382.2 L348.7 385.4 L343.7 388.2 L338.3 390.6 L332.8 392.6 L327.0 394.2 L321.1 395.3 L315.0 395.9 L308.8 396.0 L302.6 395.6 L296.4 394.7 L290.2 393.3 L284.1 391.4 L278.1 388.9 L272.3 386.0 L266.7 382.5 L261.3 378.6 L256.2 374.2 L251.5 369.4 L247.1 364.2 L243.1 358.6 L239.6 352.6 L236.5 346.3 L233.9 339.7 L231.8 332.9 L230.3 325.8 L229.4 318.6 L229.0 311.3 L229.3 303.9 L230.1 296.5 L231.5 289.2 L233.6 281.9 L236.2 274.7 L239.4 267.8 L243.3 261.0 L247.7 254.6 L252.6 248.4 L258.0 242.7 L264.0 237.3 L270.4 232.5 L277.2 228.1 L284.4 224.2 L292.0 221.0 L299.9 218.3 L308.0 216.2 L316.3 214.9 L324.7 214.1 L333.2 214.1 L341.8 214.7 L350.4 216.1 L358.9 218.1 L367.2 220.8 L375.4 224.3 L383.3 228.4 L390.9 233.1 L398.1 238.5 L405.0 244.5 L411.3 251.1 L417.2 258.2 L422.5 265.8 L427.2 273.9 L431.3 282.3 L434.7 291.2 L437.4 300.3 L439.4 309.7 L440.6 319.2 L441.0 328.9 L440.7 338.7 L439.5 348.4 L437.6 358.1 L434.9 367.7 L431.4 377.1 L427.1 386.2 L422.1 395.0 L416.4 403.5 L409.9 411.4 L402.8 418.9 L395.1 425.8 L386.8 432.2 L378.0 437.8 L368.6 442.8 L358.9 447.0 L348.8 450.5 L338.4 453.1 L327.7 454.9 L316.9 455.9 L306.0 456.0 L295.0 455.2 L284.1 453.5 L273.3 450.9 L262.6 447.5 L252.3 443.1 L242.2 438.0 L232.6 432.0 L223.4 425.2 L214.7 417.7 L206.6 409.4 L199.2 400.5 L192.5 391.0 L186.5 380.9 L181.4 370.3 L177.1 359.2 L173.6 347.8 L171.1 336.1 L169.5 324.2 L168.9 312.1 L169.3 300.0 L170.6 287.8 L172.9 275.8 L176.2 263.9 L180.4 252.2 L185.6 240.9 L191.8 230.0 L198.8 219.5 L206.6 209.6 L215.3 200.4 L224.8 191.8 L234.9 183.9 L245.7 176.9 L257.1 170.7 L269.0 165.4 L281.3 161.1 L294.0 157.7 L307.0 155.4 L320.2 154.1 L333.5 153.9 L346.9 154.7 L360.2 156.7 L373.3 159.7 L386.3 163.8 L398.9 168.9 L411.2 175.0 L422.9 182.1 L434.1 190.2 L444.7 199.2 L454.5 209.1 L463.6 219.8 L471.8 231.2 L479.1 243.2 L485.4 255.9 L490.8 269.1 L495.0 282.8 L498.2 296.8 L500.3 311.1 L501.2 325.5 L500.9 340.1 L499.5 354.6 L496.9 369.0 L493.1 383.3 L488.2 397.2 L482.2 410.8 L475.0 423.9 L466.8 436.4 L457.6 448.3 L447.4 459.5 L436.4 469.8 L424.4 479.3 L411.7 487.8 L398.4 495.3 L384.3 501.7 L369.8 507.0 L354.9 511.2 L339.5 514.1 L324.0 515.8 L308.3 516.3 L292.5 515.5 L276.8 513.4 L261.3 510.0 L246.0 505.5 L231.1 499.6 L216.6 492.6 L202.7 484.4 L189.4 475.1 L176.9 464.7 L165.2 453.3 L154.4 441.0 L144.7 427.8 L135.9 413.8 L128.3 399.1 L121.9 383.7 L116.7 367.9 L112.7 351.6 L110.1 335.0 L108.8 318.1 L108.9 301.2 L110.3 284.2 L113.1 267.4 L117.2 250.8 L122.7 234.5 L129.5 218.7 L137.5 203.3 L146.8 188.7 L157.3 174.7 L168.9 161.6 L181.6 149.5 L195.2 138.3 L209.7 128.3 L225.1 119.4 L241.1 111.7 L257.8 105.3 L275.0 100.3 L292.6 96.6 L310.5 94.4 L328.6 93.6 L346.8 94.3 L364.9 96.4 L382.8 99.9 L400.5 104.9 L417.7 111.4 L434.5 119.2 L450.6 128.3 L466.0 138.8 L480.5 150.5 L494.1 163.3 L506.7 177.3 L518.2 192.2 L528.4 208.1 L537.4 224.8 L545.0 242.2 L551.3 260.3 L556.0 278.8 L559.4 297.7 L561.1 316.9 L561.4 336.3 L560.1 355.6 L557.2 374.9 L552.8 393.9 L546.8 412.5 L539.4 430.7 L530.5 448.3 L520.2 465.1 L508.6 481.2 L495.6 496.3 L481.5 510.3 L466.2 523.3 L449.9 534.9 L432.6 545.3 L414.6 554.3 L395.8 561.9 L376.4 567.9 L356.5 572.4 L336.2 575.2 L315.8 576.5 L295.2 576.1 L274.7 574.0 L254.3 570.4 L234.3 565.0 L214.7 558.1 L195.6 549.6 L177.3 539.6 L159.7 528.1 L143.1 515.2 L127.5 500.9 L113.0 485.4 L99.8 468.8 L88.0 451.1 L77.6 432.5 L68.6 413.0 L61.3 392.8 L55.5 372.1 L51.4 350.8 L49.1 329.3 L48.4 307.6 L49.5 285.8 L52.4 264.2 L56.9 242.7 L63.2 221.7 L71.2 201.2 L80.8 181.3 L92.1 162.2 L104.8 144.0 L119.0 126.8 L134.6 110.8 L151.4 96.0 L169.5 82.6 L188.6 70.7 L208.6 60.3 L229.5 51.5 L251.0 44.3 L273.2 38.9 L295.7 35.3 L318.5 33.5 L341.5 33.6 L364.4 35.4 L387.2 39.2 L409.7 44.7 L431.7 52.0 L453.1 61.1 L473.8 71.9 L493.5 84.4 L512.3 98.4 L530.0 114.0 L546.3 130.9 L561.3 149.2 L574.9 168.6 L586.9 189.1 L597.2 210.6 L605.8 232.9 L612.6 255.8 L617.5 279.3 L620.6 303.2 L621.7 327.3 L621.0 351.4 L618.2 375.5 L613.6 399.4 L607.0 422.8 L598.6 445.8 L588.3 468.0 L576.3 489.4 L562.5 509.8 L547.1 529.1 L530.2 547.2 L511.9 563.8 L492.2 579.0 L471.3 592.6 L449.4 604.5 L426.5 614.7"/></svg></div><i class="sp-bubble" style="left:40px;top:640px;width:26px;height:26px;--dur:6.5s;--delay:1.2s;--sway:18px"></i><i class="sp-bubble" style="left:318px;top:520px;width:18px;height:18px;--dur:5.5s;--delay:2.0s;--sway:-14px"></i><i class="sp-bubble" style="left:300px;top:700px;width:34px;height:34px;--dur:7.5s;--delay:1.6s;--sway:-22px"></i><i class="sp-bubble" style="left:70px;top:420px;width:14px;height:14px;--dur:5s;--delay:2.6s;--sway:12px"></i><i class="sp-bubble" style="left:200px;top:760px;width:12px;height:12px;--dur:6s;--delay:3.1s;--sway:10px"></i><div class="sp-pop"><i class="sp-ring" style="--d:.72s;--sz:300px"></i><i class="sp-ring" style="--d:.82s;--sz:460px"></i><i class="sp-ring" style="--d:.95s;--sz:620px"></i><i class="sp-ray" style="--a:15deg"></i><i class="sp-ray" style="--a:45deg"></i><i class="sp-ray" style="--a:75deg"></i><i class="sp-ray" style="--a:105deg"></i><i class="sp-ray" style="--a:135deg"></i><i class="sp-ray" style="--a:165deg"></i><i class="sp-ray" style="--a:195deg"></i><i class="sp-ray" style="--a:225deg"></i><i class="sp-ray" style="--a:255deg"></i><i class="sp-ray" style="--a:285deg"></i><i class="sp-ray" style="--a:315deg"></i><i class="sp-ray" style="--a:345deg"></i><i class="sp-conf" style="--dx:120px;--dy:30px;--s:6px;--r:50%;--c:#FFD45E;--rot:-270deg"></i><i class="sp-conf" style="--dx:139px;--dy:103px;--s:11px;--r:2px;--c:#FF8FA3;--rot:-187deg"></i><i class="sp-conf" style="--dx:109px;--dy:190px;--s:9px;--r:2px;--c:#7FD8C6;--rot:-104deg"></i><i class="sp-conf" style="--dx:92px;--dy:137px;--s:7px;--r:50%;--c:#FFFFFF;--rot:-21deg"></i><i class="sp-conf" style="--dx:40px;--dy:203px;--s:12px;--r:2px;--c:#B9A4FF;--rot:62deg"></i><i class="sp-conf" style="--dx:-32px;--dy:151px;--s:10px;--r:2px;--c:#FFB24A;--rot:145deg"></i><i class="sp-conf" style="--dx:-23px;--dy:190px;--s:8px;--r:50%;--c:#FFD45E;--rot:228deg"></i><i class="sp-conf" style="--dx:-117px;--dy:191px;--s:6px;--r:2px;--c:#FF8FA3;--rot:-229deg"></i><i class="sp-conf" style="--dx:-131px;--dy:94px;--s:11px;--r:2px;--c:#7FD8C6;--rot:-146deg"></i><i class="sp-conf" style="--dx:-154px;--dy:129px;--s:9px;--r:50%;--c:#FFFFFF;--rot:-63deg"></i><i class="sp-conf" style="--dx:-130px;--dy:41px;--s:7px;--r:2px;--c:#B9A4FF;--rot:20deg"></i><i class="sp-conf" style="--dx:-154px;--dy:-35px;--s:12px;--r:2px;--c:#FFB24A;--rot:103deg"></i><i class="sp-conf" style="--dx:-196px;--dy:-27px;--s:10px;--r:50%;--c:#FFD45E;--rot:186deg"></i><i class="sp-conf" style="--dx:-108px;--dy:-75px;--s:8px;--r:2px;--c:#FF8FA3;--rot:269deg"></i><i class="sp-conf" style="--dx:-58px;--dy:-149px;--s:6px;--r:2px;--c:#7FD8C6;--rot:-188deg"></i><i class="sp-conf" style="--dx:-56px;--dy:-93px;--s:11px;--r:50%;--c:#FFFFFF;--rot:-105deg"></i><i class="sp-conf" style="--dx:10px;--dy:-142px;--s:9px;--r:2px;--c:#B9A4FF;--rot:-22deg"></i><i class="sp-conf" style="--dx:108px;--dy:-149px;--s:7px;--r:2px;--c:#FFB24A;--rot:61deg"></i><i class="sp-conf" style="--dx:65px;--dy:-112px;--s:12px;--r:50%;--c:#FFD45E;--rot:144deg"></i><i class="sp-conf" style="--dx:153px;--dy:-88px;--s:10px;--r:2px;--c:#FF8FA3;--rot:227deg"></i><i class="sp-conf" style="--dx:138px;--dy:6px;--s:8px;--r:2px;--c:#7FD8C6;--rot:-230deg"></i><i class="sp-conf" style="--dx:170px;--dy:-20px;--s:6px;--r:50%;--c:#FFFFFF;--rot:-147deg"></i><i class="sp-ball"></i></div><div class="sp-floor"></div><div class="sp-snailwrap"><div class="sp-snailpop"><div class="sp-snailidle"><img class="sp-snail" data-act="splash-tap" src="' + ms('snail-cheer') + '" alt="" draggable="false"></div></div></div><div class="sp-sfx" style="left:30px;top:196px;font-size:46px;--rot:-14deg;--d:.95s">嘭!</div><div class="sp-sfx" style="right:26px;top:262px;font-size:34px;--rot:12deg;--d:1.08s">嘭!</div><div class="sp-brand"><div class="sp-word"><span class="sp-ch" style="--d:1.25s">嘭</span><span class="sp-ch" style="--d:1.39s">嘭</span></div><div class="sp-sub">PĒNG · PĒNG</div></div><div class="sp-tag">' + esc(splashTag) + '</div><div class="sp-loader"><div class="sp-track"></div><div class="sp-trail"></div><i class="sp-mini"></i></div><div class="sp-ver">' + esc(APP_VERSION) + '</div></div></div>';
  }
  function viewLogin() {
    var local = !sb;
    var reason = LOGIN_MSG[state.loginReason];
    var offline = !local && navigator.onLine === false;
    var cta;
    if (offline) cta = emptyState('offline', { small: true, cta: { act: 'pp-retry', label: '다시 시도' } });
    else if (local) cta = '<div class="lg-note">Supabase 설정 전이라 미리보기 모드예요. 학습 기록은 이 기기에만 저장돼요.</div>' +
      '<button class="btn g-btn" data-act="start-local">미리보기로 시작하기</button>';
    else if (state.loginBusy) cta = '<button class="btn g-btn loading" disabled><span class="lg-spin"></span>로그인 중…</button>';
    else cta = '<button class="btn g-btn" data-act="google">' + I.google + 'Google로 계속하기</button>';
    var later = (!local && !state.loginBusy) ? '<button class="lg-later" data-act="lg-later">' + (state.loginLater ? '나중에 할게요' : '둘러보기') + '</button>' : '';
    function bub(cls, zh, ko, d, x1, y1, x2, y2) {
      return '<div class="lg-bub ' + cls + '" style="--d:' + d + 's;--x1:' + x1 + 'px;--y1:' + y1 + 'px;--x2:' + x2 + 'px;--y2:' + y2 + 'px">' + zh + ' <small>' + ko + '</small></div>';
    }
    return '<div class="screen lg">' +
      '<div class="lg-dots"></div>' +
      '<div class="lg-main">' +
        '<div class="lg-hero" data-act="lg-tap">' +
          '<div class="lg-glow"></div>' +
          '<div class="lg-orbit"><i></i><i></i></div>' +
          bub('', '你好', '안녕', 1.4, -150, -200, -162, -238) +
          bub('b2', '谢谢!', '고마워', 3.53, 24, -176, 30, -214) +
          bub('b3', '加油', '힘내', 5.66, -168, -96, -180, -130) +
          '<div class="lg-shadow"></div>' +
          '<div class="lg-hop">' +
            '<img src="' + ms('snail-phone-body') + '" alt="" draggable="false">' +
            '<img class="blink" src="' + ms('snail-phone-blink') + '" alt="" draggable="false">' +
            '<img class="marks" src="' + ms('snail-phone-marks') + '" alt="" draggable="false">' +
          '</div>' +
        '</div>' +
        '<div class="lg-copy">' +
          '<div class="lg-logo"><span style="--d:.55s">嘭</span><span style="--d:.69s">嘭</span></div>' +
          '<div class="lg-sub">PĒNG · PĒNG</div>' +
          '<p class="lg-lede">' + (reason
            ? esc(reason)
            : '천천히, 그래도 매일<br><b>계속 연습하면서 중국어를 배워요!</b>') + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="lg-cta">' + cta + later + (local ? '' : '<p class="lg-legal">계속하면 <button data-act="open-privacy">개인정보처리방침</button>에 동의한 것으로 봐요.</p>') + '</div>' +
    '</div>';
  }

  /* ---------- 화면: 탭(홈/복습/단어장) ---------- */
  function navHtml() {
    function b(id, label, icon) {
      return '<button data-act="tab" data-id="' + id + '"' + (state.tab === id ? ' aria-current="page"' : '') + '>' + icon + '<span>' + label + '</span></button>';
    }
    return '<nav class="nav" aria-label="메뉴">' + b('home', '홈', I.home) + b('lessons', '레슨', I.list) + b('review', 'AI 대화', I.chat + (aiOn() && !aiUsed() ? '<i class="nav-dot" aria-hidden="true"></i>' : '')) + b('words', 'HSK', I.book) + b('me', '마이', I.user) + '</nav>';
  }

  // 소개글의 첫 문장까지만 (예: "오늘은 … 배워볼 거예요.")
  function firstSentence(t) { var m = String(t || '').match(/^.*?[.!?](?=\s|$)/); return m ? m[0] : t; }
  var GREETS = [
    ["니하오, 오늘도!", "우리 또 만나서 반가워"],
    ["오늘의 한마디는?", "미래의 백 마디!"],
    ["중국어 한 스푼,", "자신감 두 스푼"],
    ["한자는 낯설어도,", "대화는 친근하게"],
    ["Ni Hao부터 시작해,", "너의 세계를 넓혀봐"],
    ["조금씩, 스며들듯", "너의 언어가 되는 중"],
    ["서툰 오늘도", "분명한 성장의 일부"],
    ["한마디의 용기,", "새로운 세상의 시작"],
    ["느긋하게, 단단하게", "너만의 중국어"],
    ["어제보다 조금 더", "중국어다운 하루"],
    ["공부하려고 왔어?", "그럼 일단 수다부터!"],
    ["오늘도 작심삼일?", "삼일씩 계속하면 되지!"],
    ["중국어가 어렵다고?", "팽팽도 처음엔 달팽이였어!"],
    ["틀릴 준비 완료?", "그럼 말할 준비도 완료!"],
    ["오늘 공부 안 했어?", "지금 하면 오늘 한 거야!"],
    ["팽팽도 매일 조금씩,", "너도 오늘 한마디!"],
    ["우리 서두르지 말자,", "중국어는 도망 안 가!"],
    ["오늘도 슬금슬금,", "실력은 차곡차곡"],
    ["나랑 같이 가자,", "중국어가 쉬워질 때까지"],
    ["느려도 괜찮아!", "우리 제법 잘하고 있어"],
    ["느린 게 아니라,", "음미하는 중이야"],
    ["니하오부터 시작해,", "니하오로 세상을 넓혀"],
    ["오늘도 중국어랑,", "한 뼘 더 친해지기"],
    ["혀가 꼬여도 괜찮아,", "실력은 안 꼬이니까"],
    ["달팽이도 도착해,", "꾸준하다면 어디든"],
    ["오늘 배운 한마디,", "언젠가 쓸 날이 와!"],
    ["틀리면 어때,", "대화는 계속되니까"],
    ["공부 말고 수다,", "하다 보면 실력 쑥!"],
    ["중국어 레벨 업,", "오늘도 슬금슬금"],
    ["오늘의 니하오,", "내일은 유창하게!"],
    ["천천히 해도 돼,", "분명 늘고 있으니까"],
    ["오늘도 조금씩,", "너답게 배워가자"],
    ["서두르지 마,", "배움은 너의 속도로"],
    ["한마디씩 차근차근,", "중국어와 가까워지기"],
    ["조금 서툴러도,", "너는 잘하고 있어"],
    ["오늘의 작은 한 걸음,", "내일의 큰 자신감"],
    ["모르는 게 당연해,", "하나씩 알아가면 돼"],
    ["오늘도 한마디,", "어제보다 한 뼘 더"],
    ["완벽하지 않아도,", "시작은 충분하니까"],
    ["작은 꾸준함이,", "너만의 실력이 되도록"],
    ["느려도 괜찮아,", "너만의 속도로."]
  ];
  // 멘트는 하루에 한 번만 바뀌어요(날짜로 정해서, 하루 종일 같은 멘트가 나와요)
  function greetFor(d) { var h = 0, k = dayStr(d); for (var i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return h % GREETS.length; }
  var greetIdx = greetFor(new Date());
  function refreshGreet() { greetIdx = greetFor(new Date()); }
  /* ---------- 오늘 할 일 (v156): 홈을 체크리스트로. 필수는 무료로 끝낼 수 있고, 선택 항목은 날마다 달라져요 ---------- */
  var TD_LESSON_Q = 10;
  function tdKey(s) { return 'pangpang.todo' + (s || '') + '.' + (state.user ? state.user.id : 'x'); }
  function tdLoad() {
    var day = dayStr(new Date()), o = null;
    try { o = JSON.parse(localStorage.getItem(tdKey()) || 'null'); } catch (e) { o = null; }
    if (!o || o.day !== day) o = { day: day, lessonQ: 0, done: {}, rev0: -1, plan: null };
    return o;
  }
  function tdSave(o) { try { localStorage.setItem(tdKey(), JSON.stringify(o)); } catch (e) { /* 무시 */ } }
  function tdLastAll() { try { return JSON.parse(localStorage.getItem(tdKey('.last')) || '{}'); } catch (e) { return {}; } }
  function tdMark(key) {
    var o = tdLoad(); o.done[key] = 1; tdSave(o);
    var l = tdLastAll(); l[key] = o.day;
    try { localStorage.setItem(tdKey('.last'), JSON.stringify(l)); } catch (e) { /* 무시 */ }
  }
  function tdLessonQ(n) { var o = tdLoad(); o.lessonQ = (o.lessonQ || 0) + n; tdSave(o); }
  function tdRng(seed) {
    var h = 1779033703 ^ seed.length, i;
    for (i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
  }
  function tdSince(last, day) { return last ? Math.round((new Date(day) - new Date(last)) / 86400000) : 999; }
  function tdLv() { var lv = hskLvSel(); return hskLocked(lv) ? 1 : lv; }
  function tdTarget(k) {
    var lv = tdLv(), pg, ds, o;
    if (k === 'scene') {
      pg = scProg(); o = scAvail().filter(function (s) { return !(pg[s.id] && pg[s.id].done); })[0] || scAvail()[0];
      return o ? { id: o.id, name: o.title } : null;
    }
    if (k === 'dialog') {
      ds = window.DIALOGS || [];
      o = ds.filter(function (d) { return state.profile.dlg.indexOf(d.id) < 0 && !dialogLocked(d.id); })[0] || ds.filter(function (d) { return state.profile.dlg.indexOf(d.id) < 0; })[0] || ds[0];
      return o ? { id: o.id, name: o.title } : null;
    }
    return { id: String(lv), name: '' };
  }
  function tdPaid(k) {
    if (k === 'ai') return !aiOn();
    if (k === 'dialog') { var t = tdTarget('dialog'); return !!t && dialogLocked(t.id); }
    return false;
  }
  // 오늘의 선택 항목: 날짜로 정해서 같은 날엔 항상 같고, 어제 한 건 빼고, 오래 안 한 것일수록 잘 나와요 (유료는 하루 1개 이하)
  function tdPlan(o) {
    if (o.plan && o.plan.length >= 2) return o.plan;
    var last = tdLastAll(), rng = tdRng(o.day + (state.user ? state.user.id : 'x')), pool = [];
    if (Object.keys(HSKW).length) pool = ['hsk-study'];
    if (SCENES.length) pool.push('scene');
    if ((window.DIALOGS || []).length) pool.push('dialog');
    if (sb && !isGuest()) pool.push('ai');
    var keep = o.plan || [];
    pool = pool.filter(function (k) { return keep.indexOf(k) < 0; });
    var cand = pool.map(function (k) { var s = tdSince(last[k], o.day); return { k: k, s: s }; });
    var fresh = cand.filter(function (c) { return c.s > 1; });
    if (fresh.length >= 2) cand = fresh;
    var n = 2 - keep.length, out = [], paid = 0;
    while (out.length < n && cand.length) {
      var tot = cand.reduce(function (t, c) { return t + (c.s >= 999 ? 8 : Math.min(7, Math.max(1, c.s))); }, 0), r = rng() * tot, pickI = 0;
      for (var i = 0; i < cand.length; i++) { r -= (cand[i].s >= 999 ? 8 : Math.min(7, Math.max(1, cand[i].s))); if (r <= 0) { pickI = i; break; } }
      var c = cand.splice(pickI, 1)[0];
      if (tdPaid(c.k)) { if (paid) continue; paid++; }
      out.push(c.k);
    }
    o.plan = keep.concat(out); tdSave(o);
    return o.plan;
  }
  // 오늘의 필수 HSK 퀴즈: 날짜로 정해서 하루 동안 같고, 어제 한 것은 피해서 매번 다르게 나와요
  var TD_HSK_REQ = ['hsk-quiz', 'ch-start', 'tone-start', 'rain-start'];
  function tdHskReq(o) {
    if (!Object.keys(HSKW).length) return '';
    if (o.hskReq) return o.hskReq;
    var last = tdLastAll(), rng = tdRng('h' + o.day + (state.user ? state.user.id : 'x'));
    var c = TD_HSK_REQ.filter(function (k) { return tdSince(last[k], o.day) > 1; });
    if (!c.length) c = TD_HSK_REQ.slice();
    o.hskReq = c[Math.floor(rng() * c.length) % c.length]; tdSave(o);
    return o.hskReq;
  }
  // 보너스 안내: 화면을 위로 올리면(또는 버튼) 뾰로롱 소리와 함께 걷히고, 아래 '더 해 볼까요?'가 스르륵 나타나요
  function tdBonusGo() {
    if (!state.tdBonus || state.tdBonusBusy) return;
    state.tdBonusBusy = true;
    sfx('chime');
    var st = document.getElementById('tbStage');
    if (st) { st.classList.remove('snap'); st.classList.add('leave'); }
    setTimeout(function () {
      state.tdBonus = false; state.tdBonusBusy = false;
      if (state.screen === 'tab' && state.tab === 'home') {
        renderKeep();
        var ex = document.querySelector('.td-extra'); if (ex && ex.scrollIntoView) setTimeout(function () { ex.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 300);
      }
    }, 460);
  }
  (function tdBonusGestures() {
    var y0 = null, dy = 0, st = null;
    document.addEventListener('pointerdown', function (e) {
      var o = e.target.closest && e.target.closest('.td-bonus');
      if (!o || state.tdBonusBusy) return;
      y0 = e.clientY; dy = 0; state.tdMoved = false; st = document.getElementById('tbStage'); if (st) st.classList.remove('snap');
    });
    document.addEventListener('pointermove', function (e) {
      if (y0 === null || !st) return;
      dy = Math.min(0, e.clientY - y0);
      if (dy < -6) state.tdMoved = true;
      st.style.transform = 'translateY(' + (dy * 0.6) + 'px)';
    });
    function end() {
      if (y0 === null) return; y0 = null;
      if (dy < -90) tdBonusGo(); else if (st) { st.classList.add('snap'); st.style.transform = ''; }
      setTimeout(function () { state.tdMoved = false; }, 60);
    }
    document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
    document.addEventListener('wheel', function (e) { if (e.deltaY > 30 && document.querySelector('.td-bonus')) tdBonusGo(); }, { passive: true });
    // 달팽이를 톡 누르면 통! 하고 쿠키 소리말이 떠올라요
    var words = ['냠!', '쿠키!', '팽!', '하나 더!'], wi = 0;
    document.addEventListener('click', function (e) {
      var h = e.target.closest && e.target.closest('#tbHero');
      if (!h || state.tdMoved) return;
      var im = h.querySelector('img'); im.classList.remove('boing'); void im.offsetWidth; im.classList.add('boing');
      try { if (navigator.vibrate) navigator.vibrate(8); } catch (e2) { /* 무시 */ }
      var r = h.getBoundingClientRect(), p = document.createElement('span');
      p.className = 'tb-pop'; p.textContent = words[wi++ % words.length];
      p.style.left = (e.clientX - r.left + (Math.random() * 40 - 20)) + 'px'; p.style.top = (e.clientY - r.top - 30) + 'px';
      p.style.setProperty('--r', (Math.random() * 24 - 12) + 'deg');
      h.appendChild(p); setTimeout(function () { p.remove(); }, 900);
    });
  })();
  function tdMeta(k) {
    var t = tdTarget(k) || { id: '', name: '' }, rec = chRec(parseInt(t.id, 10) || 1);
    var tbl = {
      'hsk-study': { title: 'HSK 카드 학습', sub: '밀어서 외우기', act: 'hsk-study', id: t.id },
      'hsk-quiz': { title: 'HSK 단어 퀴즈', sub: '소리·뜻 고르기', act: 'hsk-quiz', id: t.id },
      'ch-start': { title: '기억 사슬', sub: rec.best ? '최고 ' + rec.best + '단계에 도전' : '몇 단계까지 갈까요?', act: 'ch-start', id: t.id },
      'tone-start': { title: '성조 연습', sub: '소리로 성조 맞히기', act: 'tone-start', id: t.id },
      'rain-start': { title: '소나기 퀴즈', sub: '떨어지는 한자를 잡아요', act: 'rain-start', id: t.id },
      'scene': { title: '상황 레슨 · ' + t.name, sub: '말하고, 풀고, 듣기까지 3분', act: 'sc-open', id: t.id },
      'dialog': { title: '상황 대화 · ' + t.name, sub: '대화로 주고받아 보기', act: 'dialog-start', id: t.id },
      'ai': { title: 'AI 선생님과 대화', sub: '자유롭게 중국어로 이야기해요', act: 'tab', id: 'review' }
    };
    var m = tbl[k];
    if (m) m.btn = k === 'ai' ? '대화' : '시작';
    return m || null;
  }
  function tdRow(it) {
    var chip = it.pro ? '<em class="td-pro">' + I.lock + 'PRO</em>' : (it.free ? '<em class="td-free">무료 체험</em>' : '');
    return '<div class="td-item' + (it.done ? ' done' : '') + '"><span class="td-chk" aria-hidden="true">' + (it.done ? I.check : '') + '</span>' +
      '<div class="td-txt"><div class="td-t">' + esc(it.title) + chip + '</div><div class="td-s">' + esc(it.done && it.doneSub ? it.doneSub : it.sub) + '</div>' +
      (it.why && !it.done ? '<div class="td-why">' + esc(it.why) + '</div>' : '') + '</div>' +
      (it.done || it.phrase ? '' : '<button class="btn sm' + (it.req ? '' : ' soft') + '" data-act="' + it.act + '" data-id="' + esc(it.id || '') + '">' + esc(it.btn) + '</button>') + '</div>';
  }
  function tdBuild(rtot, due, wdue, phraseCard) {
    var o = tdLoad(), next = nextLesson(), items = [], day = o.day;
    if (o.rev0 < 0) { o.rev0 = rtot; tdSave(o); }
    if (o.rev0 > 0) items.push({ req: 1, done: rtot === 0, title: '오늘의 복습', sub: (due ? '문장 ' + due + '개' : '') + (due && wdue ? ' · ' : '') + (wdue ? '단어 ' + wdue + '개' : ''), doneSub: '복습을 모두 마쳤어요', act: 'today-review', btn: '복습 시작' });
    if (next || o.lessonQ > 0) {
      var q = Math.min(o.lessonQ, TD_LESSON_Q);
      items.push({ req: 1, done: o.lessonQ >= TD_LESSON_Q, title: '레슨 ' + TD_LESSON_Q + '문제 대답하기', sub: q + '/' + TD_LESSON_Q + (next ? ' · ' + next.title : ''), doneSub: TD_LESSON_Q + '문제를 말했어요',
        act: next ? 'open-lesson' : 'review-start', id: next ? next.id : '', btn: q ? '이어서' : '학습하기' });
    }
    if (phraseCard) items.push({ req: 1, done: !!o.done.phrase, title: '오늘의 한 문장 듣기', sub: '카드의 스피커를 눌러 들어 보세요', doneSub: '들어 봤어요', phrase: 1 });
    var hk = tdHskReq(o), hm = hk ? tdMeta(hk) : null;
    if (hm) items.push(Object.assign(hm, { req: 1, done: !!o.done[hk], title: 'HSK ' + hm.title.replace(/^HSK /, ''), doneSub: '오늘 해냈어요', btn: '시작' }));
    var last = tdLastAll(), opt = [];
    tdPlan(o).forEach(function (k) {
      var m = tdMeta(k); if (!m) return;
      var s = tdSince(last[k], day), why = s >= 999 ? '아직 안 해 봤어요' : (s >= 3 ? s + '일 만에 해 봐요' : '');
      var dlgFree = k === 'dialog' && !isPro() && !tdPaid('dialog');
      opt.push(Object.assign(m, { done: !!o.done[k], why: why, pro: tdPaid(k), free: dlgFree, doneSub: '오늘 해냈어요' }));
    });
    var req = items.filter(function (i) { return i.req; }), all = items.concat(opt);
    var doneN = req.filter(function (i) { return i.done; }).length, reqLeft = req.filter(function (i) { return !i.done; }).length;
    var pct = req.length ? Math.round(doneN / req.length * 100) : 0, st = streak(), over = !!req.length && !reqLeft;
    var hr = new Date().getHours(), night = hr >= 22 || hr < 6, tdMood;
    if (over) tdMood = (hr >= 18 || hr < 6) ? { img: 'rest', msg: '오늘 할 일 끝! 푹 쉬세요' } : { img: 'happy', msg: '필수를 모두 마쳤어요, 최고예요!' };
    else if (night) tdMood = { img: 'beg', msg: '필수 ' + reqLeft + '개만 하고 자요, 제발!' };
    else if (hr >= 18) tdMood = { img: 'restless', msg: '필수 ' + reqLeft + '개, 오늘이 얼마 안 남았어요!' };
    else if (hr >= 12) tdMood = { img: 'care', msg: '필수 ' + reqLeft + '개, 슬슬 해 볼까요?' };
    else tdMood = { img: 'calm', msg: '필수 ' + reqLeft + '개, 여유롭게 시작해요' };
    var head = '<div class="td-head2"><div class="td-hl"><span class="td-hlab">오늘 할 일</span><b class="td-cnt">' + doneN + '<small>/' + req.length + '</small></b>' +
      '<span class="td-sub">' + tdMood.msg + '</span></div>' +
      '<img class="mascot td-mascot" src="img/td-' + tdMood.img + '.webp" alt="" draggable="false"></div>' +
      '<div class="td-bar"><i style="width:' + pct + '%"></i></div>';
    var warn = (new Date().getHours() >= 20 && st > 0 && todayAnswers() === 0)
      ? '<div class="td-warn">' + icn('flame') + '<span>오늘 한 가지만 해도 <b>연속 ' + st + '일</b>이 이어져요</span></div>' : '';
    var body = items.map(function (i) {
      return i.phrase ? '<div class="td-group">' + tdRow(i) + phraseCard + '</div>' : tdRow(i);
    }).join('');
    var more = !opt.length ? '' : (over ? '<div class="td-extra"><div class="td-more">더 해 볼까요? <em>선택</em></div>' + opt.map(tdRow).join('') + '</div>' : '');
    // 필수를 막 끝낸 날: 18시 전이면 가끔(60%) 전체 화면으로 '하나만 더?'를 물어봐요. 저녁·밤엔 묻지 않아요
    if (over && !o.overSeen) {
      o.overSeen = 1; tdSave(o);
      var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!calm && hr >= 6 && hr < 18 && Math.random() < 0.6) state.tdBonus = true;
    }
    var bits = [[58, 212, 16, 'star', '#FFD45E', .5, 2.4, 12], [316, 196, 9, 'dot', '#7FB3FF', .6, 2, 12], [304, 420, 14, 'ring', '#FFB24A', .7, 2.8, -10], [300, 262, 11, 'star', '#FF9BB0', .8, 2.2, -16], [72, 404, 8, 'dot', '#FFD45E', .9, 2.6, 12], [96, 168, 10, 'ring', '#7FB3FF', 1, 3, 12]].map(function (b) {
      return '<span class="tb-bit ' + b[3] + '" style="left:' + (b[0] / 370 * 100).toFixed(1) + '%;top:' + (b[1] / 824 * 100).toFixed(1) + '%;--s:' + b[2] + 'px;--c:' + b[4] + ';--d:' + b[5] + 's;--t:' + b[6] + 's;--rot:' + b[7] + 'deg"></span>';
    }).join('');
    var bonus = (over && state.tdBonus) ? '<div class="td-bonus" role="dialog" aria-label="보너스 학습 안내"><div class="tb-stage" id="tbStage">' +
      '<div class="tb-bits">' + bits + '</div>' +
      '<div class="tb-mid"><div class="tb-hero" id="tbHero"><img src="img/td-cookie.webp" alt="" draggable="false"></div>' +
      '<div class="tb-copy"><h2 class="tb-title"><span style="--d:.35s">헉</span><span class="bang" style="--d:.42s">!</span> <span style="--d:.55s">벌써</span> <span style="--d:.65s">다</span> <span style="--d:.75s">끝내셨나요</span><span class="bang" style="--d:.88s">!</span></h2>' +
      '<p class="tb-sub"><mark><b>조금만 더</b></mark> 해 보시라고<br>준비했어요</p></div></div>' +
      '<div class="tb-swipe"><div class="tb-chev"><i></i><i></i><i></i></div><button class="tb-pill" data-act="td-bonus-go" aria-label="보너스 학습 열기">화면을 올려보세요!</button></div>' +
      '</div></div>' : '';
    return bonus + warn + '<div class="td-card' + (over ? ' over' : '') + '">' + head + '<div class="td-list">' + body + '</div></div>' + more;
  }

  function viewHome() {
    var next = nextLesson();
    var due = dueRows().length;
    var done = todayDone();
    var st = streak();

    var nick = nickname();
    // 다른 페이지 제목과 같은 크기(32px)로 두고, 화면이 좁아 한 줄에 안 들어갈 때만 실제 글자 폭을 재서 줄여요 (fitGreet)
    var head = '<div class="home-greet"><h1><span class="gl">' + esc(GREETS[greetIdx][0]) + '</span><br><span class="gl">' + esc(GREETS[greetIdx][1]) + '</span></h1></div>';

    var wdue = hskDue(0).length, rtot = due + wdue;
    var ph = todayPhrase();
    var phraseCard = ph ? '<div class="phrase-card"><div class="lab">오늘의 한 문장</div>' +
      '<div class="row"><div class="txt"><div class="zh p-zh">' + esc(ph[0]) + '</div><div class="py p-py">' + esc(ph[1]) + '</div>' +
      '<div class="kr p-kr">' + esc(kr(ph[1])) + '</div><div class="ko p-ko">' + esc(ph[2]) + '</div></div>' +
      '<div class="p-btns"><button class="round-btn" data-act="say" data-text="' + esc(ph[0]) + '" aria-label="오늘의 한 문장 듣기">' + I.spk + '</button>' +
      '<button class="star' + (isFav(ph[0]) ? ' on' : '') + '" data-act="fav" data-text="' + esc(ph[0]) + '" aria-pressed="' + (isFav(ph[0]) ? 'true' : 'false') + '" aria-label="문장 저장">' + I.star + '</button></div></div>' +
      '<button class="phrase-past" data-act="open-phrases">지난 문장 보기<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg></button></div>' : '';
    return '<div class="screen"><div class="scroll with-nav home-scroll">' + head + tdBuild(rtot, due, wdue, phraseCard) + '</div>' + navHtml() + '</div>';
  }

  // 레슨 진행률: 이어서 하기로 저장된 푼 문제 수를 완료 기준(20문제)으로 나눠요
  function lessonPercent(id) {
    var snap = readResume()[resumeKey('lesson', id)];
    var n = snap && snap.solved ? snap.solved : 0;
    return Math.max(0, Math.min(100, Math.round(n / CLEAR_COUNT * 100)));
  }
  var lessonUi = { n: null, rn: null, g: null, go: {} };
  // 처음엔 7개, 다음 레슨(NEW)이 아래에 있으면 그 줄까지 보여 줘요
  function lessonInitN() {
    var nx = nextLesson(), idx = nx ? LESSONS.indexOf(nx) : 0;
    return Math.max(7, Math.ceil((idx + 1) / 7) * 7);
  }
  function renderKeep() {
    var sc = document.querySelector('.scroll'), top = sc ? sc.scrollTop : 0, wy = window.pageYOffset || 0;
    render();
    var s2 = document.querySelector('.scroll'); if (s2) s2.scrollTop = top;
    try { window.scrollTo(0, wy); } catch (e) { /* 무시 */ }
  }
  // 문법 레슨(HSK 1급): 3개 묶음(기본 문장 / 문장 꾸미기 / 묻기와 위치)으로 나눠 보여요
  function gmOpen(gi) {
    if (lessonUi.go[gi] != null) return lessonUi.go[gi];
    var gs = GRAMMAR.groups || [], f = gs.findIndex(function (g) { return g.ids.some(function (x) { return !state.done[x]; }); });
    return gi === Math.max(0, f);
  }
  function gmShort(id) { var l = lessonById(id); return l ? l.title.split(' · ')[0] : ''; }
  function grammarSection() {
    if (!GRAMMAR.length) return '';
    var n = GRAMMAR.filter(function (g) { return state.done[g.id]; }).length, pct = Math.round(n / GRAMMAR.length * 100);
    var groups = GRAMMAR.groups || [{ name: '문법', ids: GRAMMAR.map(function (g) { return g.id; }) }];
    var body = groups.map(function (g, gi) {
      var dn = g.ids.filter(function (id) { return state.done[id]; }).length;
      var open = gmOpen(gi);
      var items = open ? '<ul class="list" style="margin-top:8px">' + g.ids.map(function (id) {
        var l = lessonById(id), isDone = !!state.done[id], pc = isDone ? 0 : lessonPercent(id);
        var rel = (l.rel || []).map(gmShort).filter(Boolean);
        return '<li><button class="item' + (isDone ? '' : ' off') + '" data-act="open-lesson" data-id="' + id + '">' +
          '<span class="num">' + (GRAMMAR.indexOf(l) + 1) + '</span><span class="txt"><div class="t">' + esc(l.title) + '</div><div class="s">' + esc(l.sub) + '</div>' +
          (rel.length ? '<div class="gm-rel">같이 보면 좋아요 · ' + esc(rel.join(', ')) + '</div>' : '') + '</span>' +
          '<span class="chips-end">' + (l.tag ? '<span class="chip soft gm-tag">' + esc(l.tag) + '</span>' : '') +
          (isDone ? '<span class="chip green">' + I.check + '완료</span>' : (pc > 0 ? '<span class="chip soft pct">' + pc + '%</span>' : '')) + '</span></button></li>';
      }).join('') + '</ul>' : '';
      return '<div class="gm-group"><button class="gm-ghead" data-act="gm-group" data-id="' + gi + '" aria-expanded="' + open + '"><b>' + esc(g.name) + '</b><span>' + dn + ' / ' + g.ids.length + '</span><i class="gm-car' + (open ? ' on' : '') + '">' + I.back + '</i></button>' + items + '</div>';
    }).join('');
    return '<div class="sc-head" style="margin-top:24px"><div class="section-title" style="margin:0">문법 레슨</div><span class="chip y">NEW</span></div>' +
      '<p class="hsk-note under-title">HSK 1급 문법을 규칙부터 짚어요. 순서 맞추기, 빈칸 채우기, 틀린 문장 고치기로 익혀요.</p>' +
      '<div class="lesson-progress"><div class="row"><b>' + n + ' / ' + GRAMMAR.length + '</b><span>문법 완료</span></div>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div></div>' + body;
  }
  function viewLessons() {
    var next = nextLesson();
    var n = learnedLessons().length;
    var pct = Math.round(n / LESSONS.length * 100);
    var take = Math.min(LESSONS.length, lessonUi.n || lessonInitN());
    var list = LESSONS.slice(0, take).map(function (l, i) {
      var isDone = !!state.done[l.id];
      var pc = isDone ? 0 : lessonPercent(l.id);
      var locked = lessonLocked(l.id);
      return '<li><button class="item' + (isDone && !locked ? '' : ' off') + (locked ? ' locked' : '') + '" data-act="open-lesson" data-id="' + l.id + '"' + (locked && loggedOut() ? ' disabled aria-disabled="true"' : '') + '>' +
        '<span class="num">' + (i + 1) + '</span><span class="txt"><div class="t">' + esc(l.title) + '</div><div class="s">' + esc(l.sub) + '</div></span>' +
        (locked ? '<span class="chip lockchip">' + I.lock + 'PRO</span>' : isDone ? '<span class="chip green">' + I.check + '완료</span>' : '<span class="chips-end">' +
          (pc > 0 ? '<span class="chip soft pct">' + pc + '%</span>' : '') + '</span>') +
        '</button></li>';
    }).join('');
    return '<div class="screen"><div class="scroll with-nav" style="padding-top:28px">' +
      '<h1 class="big-title">전체 레슨</h1>' +
      '<p class="sub-title">' + '배운 내용을 활용해 보며 자연스럽게 익혀가요.' + '</p>' +
      scenesSection() +
      grammarSection() +
      '<div class="section-title" style="margin-top:24px">말하기 레슨</div>' +
      '<div class="lesson-progress"><div class="row"><b>' + n + ' / ' + LESSONS.length + '</b><span>레슨 완료</span></div>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div></div>' +
      '<ul class="list" style="margin-top:0">' + list + '</ul>' +
      (take < LESSONS.length ? '<button class="more-btn" data-act="lessons-more">레슨 더보기 (' + Math.min(7, LESSONS.length - take) + '개 더 · 전체 ' + LESSONS.length + '개)</button>' : '') +
      '</div>' + navHtml() + '</div>';
  }

  function dialogSection() {
    var ds = window.DIALOGS || [];
    if (!ds.length) return '';
    return '<div class="section-title" style="margin-top:28px">상황 대화 연습</div>' +
      (isPro() ? '' : '<p class="hsk-note under-title">첫 번째 대화는 무료로 계속 연습할 수 있어요. 나머지는 멤버십이 필요해요.</p>') + '<ul class="list">' + ds.map(function (d) {
      var done = state.profile.dlg.indexOf(d.id) >= 0;
      return '<li><button class="item" data-act="dialog-start" data-id="' + d.id + '"><span class="txt"><div class="t">' + esc(d.title) + '</div>' +
        '<div class="s">' + esc(d.intro) + ' · ' + d.turns.length + '번 주고받기</div></span>' +
        (dialogLocked(d.id) ? '<span class="chip lockchip">' + I.lock + 'PRO</span>' : '<span class="chip ' + (done ? 'green' : 'soft') + '">' + (done ? '완료' : '시작') + '</span>') + '</button></li>';
    }).join('') + '</ul>';
  }
  // 레슨 탭 위쪽 '연습하기': 약한 문제 · 스피드 퀴즈 · 듣기 연습 (복습은 홈의 '오늘의 복습'이 맡아요)
  // 하단 'AI 대화' 탭
  // AI 대화 안내(로그인 전 / 멤버십 전): 이미지 + 좋은 점 + 버튼
  var AI_CHECK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function aiPromo(member) {
    var items = member
      ? [['AI 선생님과 자유롭게 대화해요', '정해진 문장이 아니라, 내가 하고 싶은 말로 연습해요.'],
         ['말이 막히면 한국어로 물어봐요', '바로 쓸 수 있는 중국어 표현으로 알려줘요.'],
         ['고친 문장은 복습으로 모여요', '틀린 표현을 모아 두었다가 잊기 전에 다시 보여줘요.'],
         ['HSK 2~4급과 모든 상황 대화가 열려요', '기억 사슬·카드·퀴즈를 전 급수에서 쓸 수 있어요.']]
      : [['학습 기록이 계정에 저장돼요', '기기를 바꿔도 그대로 이어서 공부해요.'],
         ['복습 일정을 챙겨 줘요', '틀린 문장과 단어를 잊기 전에 다시 알려줘요.'],
         ['HSK 1급 단어와 첫 상황 대화는 무료예요', '가입만 해도 바로 시작할 수 있어요.'],
         ['멤버십을 시작하면 AI 대화를 바로 써요', '가입한 계정으로 이어서 이용해요.']];
    return '<div class="ai-promo"><div class="ap-hero"><img src="img/ai-promo.webp" alt="" draggable="false"></div>' +
      '<h2>' + (member ? 'AI 대화, 멤버십으로 시작해요' : '가입하고 AI 선생님과 말해 봐요') + '</h2>' +
      '<p class="ap-sub">' + (member ? '멤버십이 되면 이런 점이 좋아요' : '가입하면 이런 점이 좋아요') + '</p>' +
      '<ul class="ap-list">' + items.map(function (x) { return '<li><i>' + AI_CHECK + '</i><div><b>' + x[0] + '</b><span>' + x[1] + '</span></div></li>'; }).join('') + '</ul>' +
      '<button class="btn btn-3d" data-act="' + (member ? 'open-pay' : 'ai-login') + '">' + (member ? '멤버십 보기' : '회원가입 · 로그인') + '</button></div>';
  }
  function viewAi() {
    var head = '<h1 class="big-title">AI 대화</h1>' + (aiOn() ? '<p class="sub-title">틀려도 괜찮아요. 편하게 말해 보세요.</p>' : '');
    var body;
    if (aiOn()) {
      if ((!state.chats || state.chatsUid !== (state.user && state.user.id)) && !state.chatsBusy) { state.chatsBusy = true; chatsInit().then(function () { state.chatsBusy = false; if (state.screen === 'tab' && state.tab === 'review') renderKeep(); }); }
      var noExpr = !aiFixes().some(function (f) { return f.kind === 'ask' || f.kind === 'say'; });
      body = aiCreditBar() + aiEntry() + ((state.chats || []).length || !noExpr ? aiHistorySection() + aiFixSection() : '<div class="chat-empty first">대화하면 지난 대화와<br>다시 써 볼 표현이<br>여기에 쌓여요.</div>');
    }
    else if (sb && isGuest()) body = aiPromo(false);
    else body = aiPromo(true);
    return '<div class="screen"><div class="scroll with-nav" style="padding-top:28px">' + head + body + '</div>' + navHtml() + '</div>';
  }

  function phraseSections() {
    var favs = state.profile.favs.map(function (zh) { return PHRASES.filter(function (p) { return p[0] === zh; })[0]; }).filter(Boolean);
    var h = '';
    if (favs.length) h += '<div class="section-title" style="margin-top:28px">저장한 문장 ' + favs.length + '</div><div class="words">' + favs.map(phraseRow).join('') + '</div>';
    return h;
  }
  // 지난 오늘의 한 문장: 홈의 '지난 문장 보기'에서 열려요 (어제부터 최대 30개)
  function viewPhrases() {
    var past = [];
    for (var i = 1; i <= 30; i++) { var p = phraseAt(i); if (p && past.indexOf(p) < 0) past.push(p); }
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll" style="padding-top:4px"><h1 class="big-title" style="margin-top:0">지난 오늘의 한 문장</h1>' +
      '<p class="sub-title">어제부터 최근 ' + past.length + '개예요. 듣고, 별을 눌러 저장해요.</p>' +
      (past.length ? '<div class="words">' + past.map(phraseRow).join('') + '</div>' : '<div class="chat-empty">아직 지난 문장이 없어요.</div>') +
      '<div style="height:60px"></div></div></div>';
  }
  // 단어장: 레슨이 많아져도 보기 편하도록 레슨별로 접고 펼치고, 검색할 수 있어요
  var wordsUi = { open: null, q: '' };
  var CHEV = '<svg class="w-chev" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
  function wordsOrdered() { return learnedLessons().slice().sort(function (a, b) { return LESSONS.indexOf(b) - LESSONS.indexOf(a); }); }
  function wordsOpenMap() {
    if (!wordsUi.open) { wordsUi.open = {}; var f = wordsOrdered()[0]; if (f) wordsUi.open[f.id] = true; }
    return wordsUi.open;
  }
  function wordMatch(w, q) {
    return (w[0] + ' ' + w[1] + ' ' + w[2] + ' ' + kr(w[1])).toLowerCase().indexOf(q) >= 0;
  }
  function wordsListHtml() {
    var q = wordsUi.q.trim().toLowerCase(), open = wordsOpenMap(), out = '', hit = 0;
    wordsOrdered().forEach(function (l) {
      var ws = q ? l.words.filter(function (w) { return wordMatch(w, q); }) : l.words;
      if (!ws.length) return;
      hit++;
      var isOpen = q ? true : !!open[l.id];
      out += '<div class="wl' + (isOpen ? ' open' : '') + '"><button class="wl-head" data-act="w-toggle" data-id="' + l.id + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '">' +
        '<span class="num">' + (LESSONS.indexOf(l) + 1) + '</span><span class="wl-t">' + esc(l.title) + '</span><span class="wl-n">' + ws.length + '단어</span>' + CHEV + '</button>' +
        (isOpen ? '<div class="words">' + ws.map(function (w) { return wordRow(w); }).join('') + '</div>' : '') + '</div>';
    });
    return hit ? out : '<p class="w-none">' + (q ? '“' + esc(wordsUi.q.trim()) + '”에 맞는 단어가 없어요' : '') + '</p>';
  }
  function refreshWordsList() {
    var el = document.getElementById('w-list');
    if (el) el.innerHTML = wordsListHtml();
  }
  function viewWords() {
    return '<div class="screen"><div class="scroll with-nav">' +
      '<div class="tab-head"><div><h1 class="big-title">HSK</h1>' +
      '<p class="sub-title" style="margin-bottom:0">급을 고르고<br>단어를 익혀 보세요.</p></div>' + ppm('book', 92) + '</div>' +
      hskSection() +
      phraseSections() +
      '</div>' + navHtml() + '</div>';
  }

  function wordRow(w) {
    return '<button class="word" data-act="say" data-text="' + esc(w[0]) + '" aria-label="' + esc(w[0]) + ' 듣기">' +
      '<span class="zhw">' + esc(w[0]) + '</span>' +
      '<span class="mid"><div><span class="py">' + esc(w[1]) + '</span> <b class="kr">' + esc(kr(w[1])) + '</b></div><div class="ko">' + esc(w[2]) + '</div></span>' +
      '<span class="spk">' + I.spk + '</span></button>';
  }

  /* ---------- 화면: 레슨 소개 ---------- */
  // 레슨 상세: 이 레슨 문제로 스피드 퀴즈·듣기 연습 (레슨을 끝내면 열려요)
  function introPractice(l, learned) {
    var sl = learned && speedLocked();
    function card(act, title, sub, off, pro) {
      return '<button class="pr-card' + (off ? ' off' : '') + '" data-act="' + act + '" data-id="' + l.id + '"' + (off ? ' disabled' : '') + '>' +
        '<b>' + title + '</b><span>' + sub + '</span>' + (pro ? '<em class="pr-pro">' + I.lock + 'PRO</em>' : '') + '</button>';
    }
    return '<div class="pr-row pr-two">' +
      card('speed-start', '스피드 퀴즈', learned ? SPEED_SIZE + '문제 · ' + SPEED_SEC + '초' : '레슨을 마치면 열려요', !learned, sl) +
      card('quiz-listen', '듣기 연습', learned ? QUIZ_SIZE + '문제' : '레슨을 마치면 열려요', !learned, false) + '</div>';
  }
  /* ---------- 문법 연습: 규칙 카드 → 어순 맞추기 → 틀 채우기 → 틀린 문장 고치기 ---------- */
  function gmRuleCard(l) {
    var r = l.rule; if (!r) return '';
    var ex = r.ex.map(function (e) {
      return '<div class="gm-ex"><div class="gm-row"><span class="gm-lab">한국어</span>' + e.ko.map(function (k, i) { return '<span class="gm-b c' + (i % 4) + '">' + esc(k) + '</span>'; }).join('') + '</div>' +
        '<div class="gm-row"><span class="gm-lab">중국어</span>' + e.zh.map(function (z, i) { return '<span class="gm-b zh c' + (e.link[i] % 4) + '">' + esc(z) + '</span>'; }).join('') + '</div></div>';
    }).join('');
    return '<div class="gm-rule"><div class="gm-rt">핵심 규칙</div><div class="gm-rl">' + esc(r.line) + '</div>' + ex +
      '<ul class="gm-notes">' + r.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>' +
      '<div class="gm-steps"><span>어순 맞추기 ' + l.od.length + '</span><span>빈칸 채우기 ' + l.fl.length + '</span><span>틀린 문장 고치기 ' + l.fx.length + '</span></div>';
  }
  function gmPrep(g) {
    var st = g.steps[g.i], d = st.d;
    g.picked = null; g.ok = null; g.placed = [];
    if (st.t === 'od') {
      var idx = d.t.map(function (_, i) { return i; }), tries = 0;
      do { idx = shuffle(idx); tries++; } while (tries < 8 && idx.every(function (v, i) { return d.t[v] === d.t[i]; }));
      g.pool = idx;
    } else if (st.t === 'fl') {
      g.opts = shuffle(d.opts.map(function (o, i) { return { t: o, ok: i === 0 }; }));
    } else {
      g.opts = shuffle([d.right].concat(d.alts).map(function (o) { return { t: o, ok: o === d.right }; }));
    }
  }
  function startGrammar(lid) {
    var l = lessonById(lid); if (!l || !l.od) return;
    var steps = [];
    shuffle(l.od.slice()).forEach(function (d) { steps.push({ t: 'od', d: d }); });
    shuffle(l.fl.slice()).forEach(function (d) { steps.push({ t: 'fl', d: d }); });
    shuffle(l.fx.slice()).forEach(function (d) { steps.push({ t: 'fx', d: d }); });
    state.gm = { l: l, steps: steps, i: 0, right: 0, combo: 0, before: todayAnswers() };
    gmPrep(state.gm);
    go('gram');
  }
  function gmResult(ok) {
    var g = state.gm;
    g.ok = ok; g.picked = true;
    if (ok) { g.right++; g.combo++; sfx('right', g.combo); } else { g.combo = 0; sfx('wrong'); }
    bumpAnswer();
    render();
  }
  function gmPut(i) {
    var g = state.gm, st = g.steps[g.i]; if (g.picked || g.pool.indexOf(i) < 0) return;
    g.pool.splice(g.pool.indexOf(i), 1); g.placed.push(i); sfx('tap');
    if (!g.pool.length) gmResult(g.placed.every(function (v, k) { return st.d.t[v] === st.d.t[k]; }));
    else render();
  }
  function gmTake(i) {
    var g = state.gm; if (g.picked) return;
    var k = g.placed.indexOf(i); if (k < 0) return;
    g.placed.splice(k, 1); g.pool.push(i); sfx('tap'); render();
  }
  function gmPick(i) { var g = state.gm; if (g.picked) return; g.pick = i; gmResult(!!g.opts[i].ok); }
  function gmNext() {
    var g = state.gm; if (!g.picked) return;
    g.i++;
    if (g.i >= g.steps.length) { finishGrammar(); return; }
    gmPrep(g); render();
  }
  function finishGrammar() {
    var g = state.gm, l = g.l, goal = state.profile.goal, now = todayAnswers(), hit = g.before < goal && now >= goal;
    var t = new Date().toISOString(), prev = state.done[l.id];
    var drow = { lesson_id: l.id, done_at: t, times: (prev ? prev.times : 0) + 1 };
    state.done[l.id] = drow; store.saveDone(drow);
    var day = dayStr(new Date()), d0 = state.daily[day] || { day: day, lessons: 0, answers: 0 };
    var d = { day: day, lessons: d0.lessons + 1, answers: d0.answers };
    state.daily[day] = d; store.saveDaily(d);
    sfx(hit ? 'goal' : 'done');
    go('done', { result: {
      kind: 'quiz', title: '문법 연습 끝!',
      line: g.steps.length + '문제 중 ' + g.right + '개 맞혔어요' + (g.right === g.steps.length ? '. 전부 정답이에요!' : '.') + ' 배운 문장을 말로도 해 볼까요?',
      answers: now, goal: goal, goalHit: hit, milestone: 0,
      again: { act: 'practice-lesson', id: l.id, label: '말하기로 마무리하기' }
    } });
  }
  function viewGram() {
    var g = state.gm, st = g.steps[g.i], d = st.d, done = g.picked !== null;
    var pct = Math.round((g.i + (done ? 1 : 0)) / g.steps.length * 100);
    var top = '<div class="topbar"><button class="icon-btn" data-act="gm-quit" aria-label="그만하기">' + I.close + '</button>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
      '<span class="chip" style="min-width:48px;justify-content:center">' + (g.i + (done ? 1 : 0)) + '/' + g.steps.length + '</span></div>';
    var kind = st.t === 'od' ? '순서를 맞춰 문장을 만들어요' : st.t === 'fl' ? '빈칸에 알맞은 말을 골라요' : '맞는 문장을 골라요';
    var body = '<div class="gm-kind">' + kind + '</div>';
    var correctZh = st.t === 'od' ? d.t.join('') : st.t === 'fl' ? d.zh.replace('___', d.opts[0]).replace(/\s/g, '') : d.right;
    if (st.t === 'od') {
      body += '<div class="gm-q">' + esc(d.ko) + '</div>' +
        '<div class="gm-slot' + (done ? (g.ok ? ' ok' : ' no') : '') + '">' + (g.placed.length ? g.placed.map(function (i) {
          return '<button class="gm-b zh big" data-act="gm-take" data-id="' + i + '"' + (done ? ' disabled' : '') + '>' + esc(d.t[i]) + '</button>';
        }).join('') : '<span class="gm-ph">아래 블록을 차례로 눌러요</span>') + '</div>' +
        '<div class="gm-pool">' + g.pool.map(function (i) { return '<button class="gm-b zh big pool" data-act="gm-put" data-id="' + i + '">' + esc(d.t[i]) + '</button>'; }).join('') + '</div>';
    } else if (st.t === 'fl') {
      var parts = d.zh.split('___');
      body += '<div class="gm-q">' + esc(d.ko) + '</div><div class="gm-sent">' + esc(parts[0]) + '<span class="gm-blank' + (done ? (g.ok ? ' ok' : ' no') : '') + '">' + (done ? esc(d.opts[0]) : '&nbsp;') + '</span>' + esc(parts[1]) + '</div>' +
        '<div class="qz-opts gm-opts">' + g.opts.map(function (o, i) {
          var cls = 'opt gm-opt'; if (done) cls += o.ok ? ' ok' : (i === g.pick ? ' no' : ' dim');
          return '<button class="' + cls + '" data-act="gm-pick" data-id="' + i + '"' + (done ? ' disabled' : '') + '>' + esc(o.t) + '</button>';
        }).join('') + '</div>';
    } else {
      body += '<div class="gm-q">이 문장을 바르게 고쳐요</div><div class="gm-sent wrong">' + esc(d.wrong) + '</div>' +
        '<div class="qz-opts gm-opts">' + g.opts.map(function (o, i) {
          var cls = 'opt gm-opt zh'; if (done) cls += o.ok ? ' ok' : (i === g.pick ? ' no' : ' dim');
          return '<button class="' + cls + '" data-act="gm-pick" data-id="' + i + '"' + (done ? ' disabled' : '') + '>' + esc(o.t) + '</button>';
        }).join('') + '</div>';
    }
    var note = '';
    if (done) {
      var py = st.t === 'od' ? d.py : '';
      note = '<div class="gm-exp"><div class="zh">' + esc(correctZh) + '</div>' + (py ? '<div class="py">' + esc(py) + '</div>' : '') +
        (st.t === 'fx' ? '<div class="why">' + esc(d.why) + '</div>' : '') + '</div>';
    }
    var foot = qzFoot(done, g.ok, g.ok ? (g.combo >= 2 ? '연속 ' + g.combo + '번 정답' : '잘했어요') : '괜찮아요, 규칙을 다시 봐요', 'gm-next', g.i + 1 >= g.steps.length ? '결과 보기' : '다음');
    return '<div class="screen qz-fit">' + top + '<div class="qz-wrap qz-ctr gm-wrap">' + body + '<div class="gm-exp-slot">' + note + '</div></div>' + foot + '</div>';
  }

  function viewIntro() {
    var l = lessonById(state.lessonId);
    var learned = !!state.done[l.id];
    if (state.introFor !== l.id) { state.introFor = l.id; state.introTab = 'words'; }
    return '<div class="screen">' +
      '<div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll" style="padding-bottom:8px">' +
        '<div class="intro-head"><div><span class="chip y lesson-no">' + (l.kind === 'grammar' ? '문법 ' + (GRAMMAR.indexOf(l) + 1) + ' · HSK 1급' : (LESSONS.indexOf(l) + 1) + '번째 레슨') + '</span><h1 class="big-title" style="margin-top:8px">' + esc(l.title) + '</h1>' +
        '<p class="sub-title" style="margin-bottom:0">' + esc(l.intro) + '</p></div></div>' +
        (l.kind === 'grammar' ? '' : '<div class="pattern" style="margin-top:16px"><div class="zh">' + esc(l.pattern.zh) + '</div><div class="py" style="margin-top:2px">' + esc(l.pattern.py) + '</div><div class="kr">' + esc(kr(l.pattern.py)) + '</div><div class="ko" style="margin-top:2px">' + esc(l.pattern.ko) + '</div></div>') +
        (l.kind === 'grammar' ? gmRuleCard(l) : introPractice(l, learned)) +
        '<div class="seg-row intro-seg" role="tablist" style="margin-top:24px">' +
          '<button role="tab" class="seg-b' + (state.introTab !== 'qs' ? ' on' : '') + '" data-act="intro-tab" data-id="words" aria-selected="' + (state.introTab !== 'qs') + '">단어 보기 ' + l.words.length + '</button>' +
          '<button role="tab" class="seg-b' + (state.introTab === 'qs' ? ' on' : '') + '" data-act="intro-tab" data-id="qs" aria-selected="' + (state.introTab === 'qs') + '">문제 문장 ' + l.qs.length + '</button></div>' +
        (state.introTab === 'qs'
          ? '<div class="qlist">' + l.qs.map(function (q, n) {
              function line(s, cls) {
                return '<button class="qline' + cls + '" data-act="say" data-text="' + esc(s.zh) + '" aria-label="듣기"><span class="qtx"><span class="zh q-zh">' + esc(s.zh) + '</span>' +
                  '<span class="py">' + esc(s.py) + '</span><span class="ko">' + esc(s.ko) + '</span></span><span class="spk">' + I.spk + '</span></button>';
              }
              return '<div class="qcard"><span class="qno">' + (n + 1) + '</span>' + line(q, '') + line(q.a, ' ans') + '</div>';
            }).join('') + '</div>'
          : '<div class="words">' + l.words.map(wordRow).join('') + '</div>') +
      '</div>' +
      '<div class="footer">' + (l.kind === 'grammar'
        ? '<button class="btn" data-act="gm-start" data-id="' + l.id + '">' + (learned ? '문법 다시 연습하기' : '문법 연습 시작') + '</button>'
        : '<button class="btn" data-act="practice-lesson" data-id="' + l.id + '">' + (learned ? '다시 연습하기' : '말하기 연습 시작') + '</button>') + '</div>' +
    '</div>';
  }

  /* ---------- 화면: 말하기 연습 ---------- */
  function viewPractice() {
    var s = state.s;
    var q = s.cur;
    var l = s.kind === 'dialog' ? { title: s.dlg.title, tip: '' } : lessonById(q.lessonId);
    var pct = Math.round((s.solved / s.total) * 100), cnt = s.solved + '/' + s.total;
    if (s.kind === 'lesson') {   // 레슨은 20문제가 기준이고, 더 하기를 고르면 남은 문제로 바가 다시 채워져요
      if (!s.cleared) { pct = Math.min(100, Math.round(s.solved / CLEAR_COUNT * 100)); cnt = Math.min(s.solved, CLEAR_COUNT) + '/' + CLEAR_COUNT; }
      else { pct = Math.min(100, Math.round((s.solved - CLEAR_COUNT) / Math.max(1, s.total - CLEAR_COUNT) * 100)); }
    }

    var top = '<div class="topbar"><button class="icon-btn" data-act="quit" aria-label="그만하기">' + I.close + '</button>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
      '<span class="chip" style="min-width:48px;justify-content:center">' + cnt + '</span></div>';

    var showAnswer = s.revealed && s.phase === 'ask';
    // 힌트 보기 → '~로 답해 보세요' 안내만 보여 주고, 그다음 정답 보기 → 예시 답안을 보여 줘요 (상황 대화는 답변 안내 말풍선이 힌트라서 바로 정답 보기)
    var canAsk = !s.revealed && s.phase === 'ask';
    var tipFirst = s.kind !== 'dialog' && !!l.tip && !s.hint;
    var hintBtn = canAsk ? (tipFirst ? '<button class="link-btn" data-act="hint">힌트 보기</button>' : '<button class="link-btn" data-act="reveal">정답 보기</button>') : '';
    var body;
    if (s.kind === 'dialog') {
      // 질문(상대 말풍선) 안에 중국어·병음·발음·뜻을 함께 넣고, 내 답변 안내는 보낼 메시지처럼 아래에 떠올라요
      var on = s.guideOn && s.phase === 'ask';
      body = '<div class="q-wrap">' +
        '<div class="q-head"><span class="chip soft">' + esc(l.title) + '</span></div>' +
        '<div class="chat">' + transcriptHtml(s) +
          '<div class="cb them cur"><div class="cb-main"><div class="q-zh">' + esc(q.zh) + '</div>' +
            '<div class="q-py">' + esc(q.py) + '</div><div class="q-kr">' + esc(kr(q.py)) + '</div>' +
            (s.showKo ? koBlock(s, q.ko, 'q-ko') : '') + qTools(s) + '</div>' +
            '<button class="round-btn cb-spk" data-act="hear-q" aria-label="질문 다시 듣기">' + I.spk + '</button></div>' +
          (s.phase === 'ask' ? '<div id="dlg-guide" class="cb me ghost' + (on ? ' on' : '') + '"' + (on ? '' : ' aria-hidden="true"') + '><div class="lab">이렇게 답변해보세요</div><div class="ko">' + esc(q.a.ko) + '</div></div>' : '') +
        '</div>' +
        (hintBtn ? '<div class="q-actions">' + hintBtn + '</div>' : '') +
        (showAnswer ? answerCard(q, '따라 말해 보세요') : '') +
      '</div>';
    } else {
      body = '<div class="q-wrap">' +
      '<div class="q-head"><span class="chip soft">' + esc(l.title) + '</span></div>' +
      '<div class="q-zh">' + esc(q.zh) + '</div>' +
      '<div class="q-py">' + esc(q.py) + '</div>' +
      '<div class="q-kr">' + esc(kr(q.py)) + '</div>' +
      (s.showKo ? koBlock(s, q.ko, 'q-ko') : '') + qTools(s) +
      '<div class="q-actions">' +
        '<button class="round-btn" data-act="hear-q" aria-label="질문 다시 듣기">' + I.spk + '</button>' +
        hintBtn +
      '</div>' +
      (l.tip && s.hint && s.kind !== 'dialog' ? '<div class="tip-line"><span class="tip">' + esc(l.tip) + '</span></div>' : '') +
      (showAnswer ? answerCard(q, '따라 말해 보세요') : '') +
    '</div>';
    }

    var bottom = s.phase === 'ask' ? micArea() : resultSheet(q);
    return '<div class="screen">' + top + body + bottom + (s.wordsOpen ? wordsSheet(s, q) : '') + '</div>';
  }

  function transcriptHtml(s) {
    if (!s.log || !s.log.length) return '';
    return '<div class="tr">' + s.log.map(function (t) {
      return '<div class="tr-b them">' + esc(t.npc) + '</div><div class="tr-b me' + (t.skipped ? ' sk' : '') + '">' + esc(t.me) + '</div>';
    }).join('') + '</div>';
  }
  /* ---------- 문장 속 단어 (레슨 단어 + HSK 단어 + 아래 보충 단어로 문장을 쪼개요) ---------- */
  var EXTRA_WORDS = [
    ['首尔', "Shǒu'ěr", '서울'], ['北京', 'Běijīng', '베이징'], ['韩国', 'Hánguó', '한국'], ['日语', 'Rìyǔ', '일본어'],
    ['分钟', 'fēnzhōng', '분 (시간의 길이)'], ['二十', 'èrshí', '20, 스물'], ['三十', 'sānshí', '30, 서른'], ['四十', 'sìshí', '40, 마흔'],
    ['欢迎光临', 'huānyíng guāng lín', '어서 오세요 (손님을 맞는 인사)'], ['职员', 'zhíyuán', '직원, 사무직'],
    ['金民秀', 'Jīn Mínxiù', '김민수 (사람 이름)'], ['小李', 'Xiǎo Lǐ', '샤오리 (이 씨를 친근하게 부르는 말)'], ['王明', 'Wáng Míng', '왕밍 (사람 이름)'],
    ['踩', 'cǎi', '밟다'], ['菜馆', 'càiguǎn', '음식점, 식당'], ['烤鸭', 'kǎoyā', '오리구이'], ['点儿', 'diǎnr', '조금, 약간'],
    ['付款', 'fùkuǎn', '돈을 내다, 결제하다'], ['码', 'mǎ', '코드 (扫码: 코드를 스캔하다)'], ['预订', 'yùdìng', '예약하다'],
    ['出示', 'chūshì', '제시하다, 내보이다'], ['网络', 'wǎngluò', '인터넷, 네트워크'], ['不见不散', 'bú jiàn bú sàn', '만날 때까지 기다리다 (꼭 만나자)'],
    ['抽烟', 'chōuyān', '담배를 피우다'], ['相', 'xiàng', '사진 (照相: 사진을 찍다)']
  ];
  var wordIdx = null, wordMax = 1;
  function buildWordIdx() {
    var idx = {};
    function add(w, src) { if (!idx[w[0]]) { idx[w[0]] = { zh: w[0], py: w[1], ko: w[2], src: src }; if (w[0].length > wordMax) wordMax = w[0].length; } }
    EXTRA_WORDS.forEach(function (w) { add(w, 'x'); });
    LESSONS.forEach(function (l, i) { (l.words || []).forEach(function (w) { add(w, 'L' + l.id); }); });
    Object.keys(HSKW).forEach(function (lv) { (HSKW[lv] || []).forEach(function (w) { add(w, 'H' + lv); }); });
    return idx;
  }
  // 문장을 사전 단어로 쪼개요 (긴 단어부터 맞춰 봐요). 사전에 없는 글자(이름 등)는 건너뛰어요.
  function segWords(zh) {
    if (!wordIdx) wordIdx = buildWordIdx();
    var out = [], seen = {}, i = 0, str = String(zh || '');
    while (i < str.length) {
      if (!/[\u4e00-\u9fff]/.test(str[i])) { i++; continue; }
      var hit = null;
      for (var L = Math.min(wordMax, str.length - i); L >= 1; L--) { var t = str.substr(i, L); if (wordIdx[t]) { hit = wordIdx[t]; break; } }
      if (hit) { if (!seen[hit.zh]) { seen[hit.zh] = 1; out.push(hit); } i += hit.zh.length; } else i++;
    }
    return out;
  }
  function srcLabel(src) {
    if (src === 'x') return '';
    if (src[0] === 'H') return 'HSK ' + src.slice(1) + '급';
    var n = LESSONS.map(function (l) { return l.id; }).indexOf(src.slice(1));
    return n >= 0 ? (n + 1) + '강' : '';
  }
  function wsRow(w) {
    var k = kr(w.py), lab = srcLabel(w.src);
    return '<button class="ws-row" data-act="say" data-text="' + esc(w.zh) + '"><span class="ws-top"><span class="zh ws-zh">' + esc(w.zh) + '</span><span class="py ws-py">' + esc(w.py) + '</span>' +
      (k ? '<span class="ws-kr">' + esc(k) + '</span>' : '') + (lab ? '<span class="ws-src">' + lab + '</span>' : '') + '</span><span class="ws-ko">' + esc(w.ko) + '</span></button>';
  }
  function wordsSheet(s, q) {
    var lesson = s.kind === 'dialog' ? null : lessonById(q.lessonId);
    var own = {}; if (lesson) (lesson.words || []).forEach(function (w) { own[w[0]] = 1; });
    var sents = [{ lab: '질문', zh: q.zh }];
    if (s.revealed || s.phase === 'result') sents.push({ lab: '예시 답안', zh: q.a.zh });
    var seen = {}, all = [];
    sents.forEach(function (t) { segWords(t.zh).forEach(function (w) { if (!seen[w.zh]) { seen[w.zh] = 1; all.push(w); } }); });
    var out = all.filter(function (w) { return !own[w.zh]; }), inn = all.filter(function (w) { return own[w.zh]; });
    var body = '';
    if (!lesson) body = '<div class="ws-list">' + all.map(wsRow).join('') + '</div>';
    else {
      body += '<div class="ws-lab">이 레슨 밖 단어 <em>' + out.length + '</em></div>' +
        (out.length ? '<div class="ws-list">' + out.map(wsRow).join('') + '</div>' : '<p class="ws-none">이 문장의 단어는 모두 이 레슨에서 배운 단어예요.</p>');
      if (inn.length) body += '<div class="ws-lab">이 레슨에서 배운 단어 <em>' + inn.length + '</em></div><div class="ws-list">' + inn.map(wsRow).join('') + '</div>';
    }
    if (!all.length) body = '<p class="ws-none">설명할 단어가 없어요.</p>';
    return '<div class="ws-scrim" data-act="words-close"></div><div class="ws" role="dialog" aria-label="문장 속 단어"><div class="ws-grip"></div>' +
      '<div class="ws-head"><b>문장 속 단어</b><button class="icon-btn" data-act="words-close" aria-label="닫기">' + I.close + '</button></div>' +
      '<div class="ws-sent zh">' + esc(q.zh) + '</div><div class="ws-body">' + body + '</div></div>';
  }
  function qTools(s) {
    var on = !(state.profile && state.profile.kr === false);
    return '<div class="q-tools">' + '<button class="ko-peek' + (s.showKo ? ' on' : '') + '" data-act="ko" aria-pressed="' + (!!s.showKo) + '">' + (s.showKo ? '뜻 가리기' : '뜻 보기') + '</button>' +
      '<button class="tg' + (on ? ' on' : '') + '" data-act="set-kr" data-v="' + (on ? 'off' : 'on') + '" role="switch" aria-checked="' + on + '">한글 발음<i aria-hidden="true"></i></button>' +
      '<button class="tg wd" data-act="words-open">' + I.book + '단어</button></div>';
  }
  function koBlock(s, text, cls) {
    return s.showKo
      ? '<div class="' + cls + '" data-act="ko" role="button" tabindex="0">' + esc(text) + '</div>'
      : '';
  }

  function answerCard(q, label) {
    return '<div class="answer" style="margin-top:20px"><div class="body">' +
      '<div class="py" style="margin-bottom:4px">' + esc(label) + '</div>' +
      '<div class="zh">' + esc(q.a.zh) + '</div><div class="py">' + esc(q.a.py) + '</div><div class="kr">' + esc(kr(q.a.py)) + '</div>' + koBlock(state.s, q.a.ko, 'ko a-ko') + aiWhy(q) + '</div>' +
      '<button class="round-btn" data-act="hear-a" aria-label="정답 듣기">' + I.spk + '</button></div>';
  }

  function micArea() {
    var s = state.s;
    var hint = s.msg || '버튼을 누른 채로 중국어로 말하고, 끝나면 손을 떼세요';
    if (s.typing) {
      return '<div class="mic-area">' +
        '<div class="type-row"><input id="typed" class="zh" lang="zh-CN" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="중국어로 입력" aria-label="중국어로 답 입력">' +
        '<button class="btn" data-act="submit-typed">확인</button></div>' +
        (window.SpeechRecognition || window.webkitSpeechRecognition ? '<button class="link-btn" data-act="voice-mode">' + (state.profile.input === 'type' ? '이번만 음성으로 답하기' : '음성으로 답하기') + '</button>' : '') + '</div>';
    }
    return '<div class="mic-area">' +
      '<div id="live" class="live' + (s.listening ? (s.live ? '' : ' wait') : ' hint') + '">' + esc(s.listening ? (s.live || '듣고 있어요…') : hint) + '</div>' +
      '<button id="mic" class="mic' + (s.listening ? ' on' : '') + '" data-hold="mic" aria-label="누른 채로 말하기">' + I.mic + '</button></div>';
  }

  // 틀렸을 때: 빠진 핵심 표현과(정답을 보기 전), 놓친 글자(정답을 본 뒤)를 알려줘요
  function diagHtml(q) {
    var s = state.s;
    if (!s.heard || !Grade.diagnose) return '';
    var d = Grade.diagnose(q, s.heard), h = '';
    if (d.missing.length) {
      h += '<div class="diag"><span class="lab">꼭 들어가야 해요</span>' + d.missing.map(function (g) {
        return '<span class="need">' + esc(g.slice(0, 3).join(' / ')) + '</span>';
      }).join('') + '</div>';
    }
    if (s.revealed) {
      h += '<div class="diag"><span class="lab">정답에서 놓친 글자</span><span class="zh dline">' + d.answer.split('').map(function (c, i) {
        return d.mask[i] ? esc(c) : '<u class="miss">' + esc(c) + '</u>';
      }).join('') + '</span></div>';
    }
    return h;
  }
  function aiBlock(q) {
    var h = aiBlockInner(q);
    return h ? '<div class="ai-wrap">' + h + '</div>' : '';
  }
  function aiBlockInner(q) {
    var s = state.s;
    if (!aiOn() || !s.heard) return '';
    var r = (s.aiRes || {})[q.id + '|' + s.heard];
    if (r && r.busy) return '<div class="ai-card busy"><span class="ai-dots"><i></i><i></i><i></i></span>AI 선생님이 보고 있어요…</div>';
    if (r && r.res) {
      var v = r.res, lab = v.verdict === 'good' ? '아주 좋아요' : v.verdict === 'fix' ? '이렇게 고쳐 보세요' : '조금 더 자연스럽게';
      return '<div class="ai-card ' + esc(v.verdict) + '"><div class="ai-top"><span class="ai-lab">AI 선생님 · ' + lab + '</span><span class="ai-bal">남은 크레딧 ' + aiBal() + '</span></div>' +
        '<button class="ai-nat" data-act="say" data-text="' + esc(v.natural) + '"><span class="zh">' + esc(v.natural) + '</span>' + (v.pinyin ? '<span class="py">' + esc(v.pinyin) + '</span>' : '') + (v.pinyin && kr(v.pinyin) ? '<span class="kr">' + esc(kr(v.pinyin)) + '</span>' : '') + '</button>' +
        (v.why ? '<p class="ai-why">' + esc(v.why) + '</p>' : '') + aiFuHtml(r) + '</div>';
    }
    if (r && r.err) return '<div class="ai-card err"><div class="ai-err-row"><span>' + esc(r.err) + '</span>' + (r.retry ? '<button class="ai-retry" data-act="ai-correct">다시 호출하기</button>' : '') + '</div></div>';
    return '<button class="ai-btn" data-act="ai-correct"><span>AI 선생님, 궁금해요!</span><em>1크레딧</em><span class="ai-bal">남은 크레딧 ' + aiBal() + '</span></button>';
  }
  // 교정을 본 뒤 궁금한 점을 한 번만 물어볼 수 있어요(질문 → 답변, 이어서 묻기는 없어요)
  function aiFuHtml(r) {
    var f = r.fu;
    if (f && f.busy) return '<div class="ai-fu"><div class="ai-fu-a busy"><span class="ai-dots"><i></i><i></i><i></i></span>선생님이 답을 쓰고 있어요…</div></div>';
    if (f && f.ans) return '<div class="ai-fu"><div class="ai-fu-q">내 질문 · ' + esc(f.q) + '</div><div class="ai-fu-a">' + esc(f.ans).replace(/\n/g, '<br>') + '</div></div>';
    if (r.fuOpen) {
      return '<div class="ai-fu"><textarea id="ai-fu-in" class="ai-fu-in" rows="2" maxlength="150" placeholder="궁금한 점을 적어 주세요 (한 번만 물어볼 수 있어요)">' + esc(r.fuText || '') + '</textarea>' +
        (f && f.err ? '<div class="ai-fu-err">' + esc(f.err) + '</div>' : '') +
        '<div class="ai-fu-btns"><button class="ai-fu-cancel" data-act="ai-fu-close">취소</button><button class="ai-fu-send" data-act="ai-fu-send">질문하기</button></div></div>';
    }
    return '<button class="ai-fu-open" data-act="ai-fu-open">다른 질문이 있어요</button>';
  }
  function aiFuCur() { var s = state.s; return s && s.aiRes && s.aiFuKey ? s.aiRes[s.aiFuKey] : null; }
  async function aiFuSend() {
    var s = state.s, r = aiFuCur();
    if (!s || !r || !r.res || (r.fu && (r.fu.busy || r.fu.ans))) return;
    var q = String(r.fuText || '').trim();
    if (q.length < 2) { toast('궁금한 점을 적어 주세요'); return; }
    var cur = s.cur;
    r.fu = { busy: true, q: q }; render();
    try {
      var res = await sb.functions.invoke('ai-coach', { body: { action: 'followup', q: q, zh: cur.zh, ko: cur.ko, answer: s.heard, natural: r.res.natural, why: r.res.why } });
      if (res.error) throw res.error;
      var d = res.data || {};
      if (d.ok && d.result && d.result.answer) r.fu = { ans: d.result.answer, q: q };
      else r.fu = { err: d.error === 'limit' ? '오늘 물어볼 수 있는 횟수를 다 썼어요.' : d.error === 'too_fast' ? '너무 빨리 눌렀어요. 잠시 후 다시 해 주세요.' : '선생님이 답하지 못했어요. 한 번 더 보내 주세요.' };
    } catch (e) {
      if (window.console) console.error(e);
      r.fu = { err: '연결하지 못했어요. 한 번 더 보내 주세요.' };
    }
    if (state.s === s && state.screen === 'practice') render();
  }
  async function aiCorrect() {
    var s = state.s;
    if (!s || !aiOn() || !s.heard) return;
    var q = s.cur, key = q.id + '|' + s.heard;
    s.aiRes = s.aiRes || {};
    if (s.aiRes[key] && s.aiRes[key].busy) return;
    s.aiRes[key] = { busy: true }; render();
    try {
      var r = await sb.functions.invoke('ai-coach', { body: { action: 'correct', zh: q.zh, ko: q.ko, answer: s.heard } });
      if (r.error) throw r.error;
      var d = r.data || {};
      if (typeof d.monthly === 'number' && typeof d.topup === 'number') { state.ai = state.ai || { monthly: 0, topup: 0, grant: 15 }; state.ai.monthly = d.monthly; state.ai.topup = d.topup; }
      var noRetry = d.error === 'no_credit' || d.error === 'not_member' || d.error === 'auth';
      s.aiRes[key] = d.ok ? { res: d.result } : noRetry ? { err: AI_ERR[d.error] } : { err: '선생님이 도착하지 않았어요.', retry: true };
    } catch (e) {
      if (window.console) console.error(e);
      s.aiRes[key] = { err: '선생님이 도착하지 않았어요.', retry: true };
      loadAi().then(function () { if (state.s === s) render(); });
    }
    if (state.s === s && state.screen === 'practice') render();
  }
  function resultSheet(q) {
    var s = state.s;
    var last = s.pass && s.queue.length === 0;
    if (s.pass) {
      return '<div class="sheet ok" role="status">' + mascot(s.mood || 'love', 'm') +
        '<div class="head"><span class="badge">' + I.check + '</span>잘했어요!' + (s.combo >= 2 ? '<span class="combo">연속 ' + s.combo + '번</span>' : '') + '</div>' +
        (s.heard ? '<div class="heard">내가 한 말 <span class="zh">' + esc(s.heard) + '</span></div>' : '') +
        answerCard(q, '예시 답안').replace('style="margin-top:20px"', '') + aiBlock(q) +
        '<div class="btns"><button class="btn green" data-act="next">' + (last ? '끝내기' : '다음 문제') + '</button></div></div>';
    }
    return '<div class="sheet no" role="status">' + mascot('cheer', 'm') +
      '<div class="head"><span class="badge">' + I.x + '</span>다시 해볼까요?</div>' +
      '<div class="heard">' + (s.heard ? '들린 말 <span class="zh">' + esc(s.heard) + '</span>' : '소리가 잘 들리지 않았어요') + '</div>' +
      diagHtml(q) +
      (s.revealed ? answerCard(q, '정답을 따라 말해 보세요').replace('style="margin-top:20px"', '') : '<div style="height:14px"></div>') + aiBlock(q) +
      '<div class="btns">' +
        '<button class="btn" data-act="retry">다시 말하기</button>' +
        (s.revealed ? '<button class="btn gray" data-act="skip">나중에 다시 할게요</button>' : '<button class="btn gray" data-act="reveal-result">정답 보기</button>') +
      '</div></div>';
  }

  /* ---------- 화면: 완료 ---------- */
  function confetti() {
    var cols = ['#eccd4c', '#1a2139', '#8fa0d8', '#f4a9a0', '#7bc9a0'], h = '';
    for (var i = 0; i < 28; i++) {
      h += '<i style="left:' + Math.round((i * 37) % 100) + '%;background:' + cols[i % cols.length] +
        ';animation-delay:' + ((i % 7) * 0.12).toFixed(2) + 's;animation-duration:' + (2.2 + (i % 5) * 0.35).toFixed(2) + 's"></i>';
    }
    return '<div class="confetti" aria-hidden="true">' + h + '</div>';
  }
  /* ---------- 축하 모먼트 · 빈 화면 (팽팽 UI) ---------- */
  function ppImg(n) { return (window.MASCOT && window.MASCOT['pp-' + n]) || 'img/pp-' + n + '.webp'; }
  var EMPTY_PRESETS = {
    empty:   { title: '아직 아무것도 없어요', desc: '달팽이가 기다리다 잠들었어요.\n첫 기록을 남겨서 깨워볼까요?', badge: null },
    search:  { title: '찾는 결과가 없어요', desc: '다른 방법으로 천천히 다시 찾아볼까요?', badge: { text: '0건', dot: '#9aa3c0' } },
    offline: { title: '인터넷이 끊겼어요', desc: '연결되면 바로 이어서 갈게요.\n잠깐 쉬어가도 괜찮아요.', badge: { text: '오프라인', dot: '#ff8f8f' } },
    error:   { title: '잠깐 길을 잃었어요', desc: '일시적인 문제가 생겼어요.\n잠시 후 다시 시도해 주세요.', badge: { text: '오류', dot: '#f4b23e' } }
  };
  // 빈 화면: 졸고 있는 달팽이를 누르면 깨어나요. o = {title, desc, badge, cta:{act,id,v,label}, small}
  function emptyState(variant, o) {
    o = o || {};
    var p = EMPTY_PRESETS[variant] || EMPTY_PRESETS.empty, b = o.badge !== undefined ? o.badge : p.badge;
    var desc = String(o.desc || p.desc).split('\n').map(esc).join('<br>');
    var c = o.cta;
    return '<div class="pp-empty' + (o.small ? ' sm' : '') + '"><div class="pp-empty__art">' +
      '<div class="pp-empty__halo"></div><div class="pp-empty__floor"></div>' +
      '<div class="pp-empty__snail"><img data-act="pp-wake" src="' + ppImg('calm') + '" alt="" draggable="false"></div>' +
      '<span class="pp-z" style="left:150px;top:46px;font-size:18px;--d:0s">z</span><span class="pp-z" style="left:162px;top:30px;font-size:24px;--d:1.2s">Z</span><span class="pp-z" style="left:140px;top:40px;font-size:14px;--d:2.4s">z</span>' +
      (b ? '<div class="pp-empty__badge" style="--dot:' + b.dot + '"><i></i>' + esc(b.text) + '</div>' : '') +
      '</div><div class="pp-empty__swap"><div class="pp-empty__title">' + esc(o.title || p.title) + '</div><div class="pp-empty__desc">' + desc + '</div>' +
      (c ? '<div class="pp-empty__actions"><button class="btn sm" data-act="' + c.act + '"' + (c.id != null ? ' data-id="' + c.id + '"' : '') + (c.v ? ' data-v="' + c.v + '"' : '') + '>' + esc(c.label) + '</button></div>' : '') +
      '</div></div>';
  }
  function ppWake(img) {
    var host = img.closest ? img.closest('.pp-empty') : null;
    if (!host) return;
    buzz(8);
    img.src = ppImg('wink');
    host.classList.add('is-awake');
    var fx = document.createElement('span');
    fx.className = 'pp-sfx pp-tapfx'; fx.textContent = '팽!';
    fx.style.cssText = 'left:60px;top:40px;font-size:26px;--rot:-12deg';
    var art = host.querySelector('.pp-empty__art'); if (art) art.appendChild(fx);
    setTimeout(function () { if (fx.parentNode) fx.parentNode.removeChild(fx); }, 900);
    clearTimeout(host._pt);
    host._pt = setTimeout(function () { host.classList.remove('is-awake'); img.src = ppImg('calm'); }, 2600);
  }

  var celEl = null;
  function closeCelebration(now) {
    var el = celEl; celEl = null;
    if (!el) return;
    if (now || !el.classList) { if (el.parentNode) el.parentNode.removeChild(el); return; }
    el.classList.add('is-leaving');
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 280);
  }
  // o = {kind:'complete'|'streak', title, sub, chip(html)}
  function showCelebration(o) {
    try {
      closeCelebration(true);
      var rays = '', conf = '', cols = ['#FFD45E', '#FF8FA3', '#7FD8C6', '#FFFFFF', '#B9A4FF', '#FFB24A'], i;
      for (i = 0; i < 12; i++) rays += '<div class="pp-cel__ray" style="--a:' + (i * 30 + 15) + 'deg"></div>';
      for (i = 0; i < 24; i++) {
        var ang = (i / 24) * Math.PI * 2 + (i % 3) * 0.21, dist = 110 + (i * 37) % 100;
        conf += '<div class="pp-cel__conf" style="--dx:' + Math.round(Math.cos(ang) * dist) + 'px;--dy:' + Math.round(Math.sin(ang) * dist + 40) + 'px;--s:' + (6 + (i * 5) % 7) + 'px;--r:' + (i % 3 === 0 ? '50%' : '2px') + ';--c:' + cols[i % 6] + ';--rot:' + (((i * 83) % 540) - 270) + 'deg"></div>';
      }
      var sfx = o.kind === 'streak' ? '팽팽!' : '팽!';
      var el = document.createElement('div');
      el.className = 'pp-cel'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', o.title);
      el.innerHTML = '<div class="pp-cel__dim"></div><div class="pp-cel__content">' +
        '<div class="pp-cel__stage" aria-hidden="true"><div class="pp-cel__glow"></div><div class="pp-cel__burst"></div>' +
        '<div class="pp-cel__ring" style="--d:.44s;--sz:260px"></div><div class="pp-cel__ring" style="--d:.54s;--sz:400px"></div><div class="pp-cel__ring" style="--d:.66s;--sz:560px"></div>' +
        rays + conf + '<div class="pp-cel__ball"></div>' +
        '<div class="pp-cel__snail"><div class="pp-cel__snail-pop"><div class="pp-cel__snail-bob"><img src="' + ppImg('cheer') + '" alt="" draggable="false"></div></div></div>' +
        '<div class="pp-sfx pp-cel__sfx" style="left:-150px;top:-150px;font-size:40px;--rot:-14deg;--d:.6s">' + sfx + '</div>' +
        '<div class="pp-sfx pp-cel__sfx" style="left:96px;top:-96px;font-size:30px;--rot:12deg;--d:.72s">' + sfx + '</div></div>' +
        '<div class="pp-cel__text"><div class="pp-cel__title">' + esc(o.title) + '</div><div class="pp-cel__sub">' + esc(o.sub) + '</div>' +
        '<div class="pp-cel__chip">' + o.chip + '</div></div>' +
        '<div class="pp-cel__actions"><button class="btn" type="button" data-pp="close">계속하기</button></div></div>';
      el.addEventListener('click', function (e) {
        var t = e.target;
        if (t.getAttribute && t.getAttribute('data-pp') === 'close') { closeCelebration(); return; }
        if (t.tagName === 'IMG') {
          buzz(8);
          t.classList.remove('is-boing'); void t.offsetWidth; t.classList.add('is-boing');
          var fx = document.createElement('div'), r = el.getBoundingClientRect();
          fx.className = 'pp-sfx pp-tapfx'; fx.textContent = sfx;
          fx.style.cssText = 'left:' + Math.round(e.clientX - r.left + (Math.random() * 60 - 30)) + 'px;top:' + Math.round(e.clientY - r.top - 40) + 'px;--rot:' + Math.round(Math.random() * 30 - 15) + 'deg';
          el.appendChild(fx);
          setTimeout(function () { if (fx.parentNode) fx.parentNode.removeChild(fx); }, 900);
          return;
        }
        if (t.className && String(t.className).indexOf('pp-cel__dim') >= 0) closeCelebration();
      });
      document.body.appendChild(el);
      celEl = el;
      buzz([12, 40, 18]);
    } catch (e) { celEl = null; if (window.console) console.error(e); }
  }
  document.addEventListener('keydown', function (e) { if (celEl && e.key === 'Escape') closeCelebration(); });
  function netChanged() { if (state.screen === 'login') render(); }
  window.addEventListener('online', netChanged); window.addEventListener('offline', netChanged);
  function maybeCelebrate() {
    var r = state.result;
    if (state.screen !== 'done' || !r) { if (celEl) closeCelebration(true); return; }
    if (r.milestone) showCelebration({ kind: 'streak', title: r.milestone + '일 연속 달성!', sub: '한 걸음씩 꾸준히, 정말 멋져요', chip: '<b>' + r.milestone + '일</b> 연속 기록 중' });
    else if (r.goalHit) showCelebration({ kind: 'complete', title: '오늘 목표 달성!', sub: '천천히, 그래도 끝까지 왔어요', chip: '오늘 푼 문제 <b>' + r.goal + '</b>개' });
  }

  function speedDone(r) {
    var marks = '<div class="sq-marks" role="img" aria-label="' + r.total + '문제 중 ' + r.right + '개 정답">' + r.marks.map(function (ok, k) {
      return '<span class="sq-mk ' + (ok ? 'ok' : 'no') + '"><i>' + (k + 1) + '</i><b>' + (ok ? 'O' : 'X') + '</b></span>';
    }).join('') + '</div>';
    var miss = r.missed.length ? '<div class="sq-miss"><div class="lab">다시 볼 문장</div>' + r.missed.slice(0, 4).map(function (m) {
      return '<div class="it"><div class="zh">' + esc(m.zh) + '</div><div class="py">' + esc(m.py) + '</div><div class="ko">' + esc(m.ko) + '</div></div>';
    }).join('') + '</div>' : '';
    return '<div class="screen done-screen">' + ((r.goalHit || r.score === 100) ? confetti() : '') + '<div class="hero sq-done">' +
      '<div class="stage">' + mascot(r.score >= 50 ? 'love' : 'cheer') + '</div>' +
      '<h1>' + esc(r.title) + '</h1><p>' + esc(r.line) + '</p>' +
      '<div class="sq-sum"><span><b>' + r.right + '</b> / ' + r.total + ' 정답</span>' + (r.best >= 2 ? '<span>최고 연속 <b>' + r.best + '</b>번</span>' : '') + '</div>' +
      marks + miss +
      (r.goalHit ? '<div class="cele"><b>오늘 목표 달성!</b><span>' + r.goal + '문제를 모두 풀었어요</span></div>' : '') +
      '</div><div class="footer" style="padding-left:0;padding-right:0">' +
      '<button class="btn" data-act="' + r.again.act + '">' + esc(r.again.label) + '</button>' +
      '<button class="btn gray" data-act="home">홈으로</button></div></div>';
  }
  function viewDone() {
    var r = state.result;
    if (r.kind === 'speed') return speedDone(r);
    if (r.kind === 'chain') return chainDone(r);
    var st = streak();
    return '<div class="screen done-screen">' + ((r.goalHit || r.milestone) ? confetti() : '') + '<div class="hero">' +
      '<div class="stage">' + mascot(r.kind === 'lesson' ? 'love' : 'cheer') + '</div>' +
      '<h1>' + esc(r.title) + '</h1>' +
      '<p>' + esc(r.line) + '</p>' +
      (r.goalHit ? '<div class="cele"><b>오늘 목표 달성!</b><span>' + r.goal + '문제를 모두 풀었어요</span></div>' : '') +
      (r.milestone ? '<div class="cele"><b>' + r.milestone + '일 연속 학습!</b><span>꾸준함이 실력이 돼요</span></div>' : '') +
      '<div class="chips"><span class="chip soft">오늘 푼 문제 ' + r.answers + '/' + r.goal + '</span>' +
      (st > 0 ? '<span class="chip y">' + st + '일 연속 학습</span>' : '') + '</div>' +
      '</div><div class="footer" style="padding-left:0;padding-right:0">' +
      '<button class="btn" data-act="home">홈으로</button>' +
      (r.again ? '<button class="btn gray" data-act="' + r.again.act + '"' + (r.again.id ? ' data-id="' + r.again.id + '"' : '') + '>' + esc(r.again.label) + '</button>' : '') +
      '</div></div>';
  }

  function isLifetime() { return !!sb && !state.entErr && !!state.ent && state.ent.plan === 'lifetime'; }
  /* ---------- AI 선생님: '왜 이렇게 써요?' 설명 (정답 문장마다, 크레딧 없음) ---------- */
  function aiWhy(q) {
    var s = state.s;
    if (true) return '';   // v91: '왜 이렇게 써요?'는 AI 선생님 호출과 겹쳐 화면에서 뺐어요
    if (!aiOn() || !s || !q || !q.a) return '';
    var r = (s.why || {})[q.a.zh], h;
    if (r && r.busy) h = '<div class="why-box busy"><span class="ai-dots"><i></i><i></i><i></i></span>설명을 불러오는 중…</div>';
    else if (r && r.res) h = '<div class="why-box"><div class="why-lab">왜 이렇게 써요?' + (r.mock ? ' · 테스트' : '') + '</div><ul class="why-list">' + r.res.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul></div>';
    else if (r && r.err) h = '<div class="why-box err">' + esc(r.err) + '</div>';
    else h = '<button class="why-btn" data-act="ai-why">왜 이렇게 써요?</button>';
    return h;
  }
  async function aiWhyLoad() {
    var s = state.s;
    if (!s || !aiOn() || !s.cur) return;
    var q = s.cur, key = q.a.zh;
    s.why = s.why || {};
    if (s.why[key] && s.why[key].busy) return;
    s.why[key] = { busy: true }; render();
    try {
      var r = await sb.functions.invoke('ai-coach', { body: { action: 'explain', zh: q.a.zh, ko: q.a.ko } });
      if (r.error) throw r.error;
      var d = r.data || {};
      s.why[key] = d.ok ? { res: d.result, mock: !!d.mock } : { err: d.error === 'limit' ? '오늘은 새 설명을 더 만들 수 없어요. 내일 다시 눌러 주세요.' : (AI_ERR[d.error] || '설명을 가져오지 못했어요. 잠시 후 다시 해 주세요.') };
    } catch (e) {
      if (window.console) console.error(e);
      s.why[key] = { err: '연결하지 못했어요. 잠시 후 다시 해 주세요.' };
    }
    if (state.s === s && state.screen === 'practice') render();
  }

  /* ---------- AI 자유 대화 (가이드형): 상황을 고르면 AI가 먼저 말을 걸고, 뭐라고 말할지 알려 줘요 ---------- */
  var AI_CHAT_COST = 2, acRec = null;   // 한 번 주고받을 때마다 2크레딧
  // 한 번이라도 AI와 대화해 봤는지 (뱃지 문구와 탭의 빨간 점에 써요)
  function aiUsedKey() { return 'pangpang.aiused.' + (state.user ? state.user.id : 'x'); }
  function aiUsed() {
    try { if (localStorage.getItem(aiUsedKey())) return true; } catch (e) { /* 무시 */ }
    return (state.chats || chatsLocal()).length > 0 || aiFixes().length > 0;
  }
  function aiCreditBar() {
    if (!aiOn()) return '';
    return '<div class="ai-credit"><span>내 크레딧 <b>' + aiBal() + '</b></span><button class="ai-credit-go" data-act="open-aicharge">충전</button></div>';
  }
  function aiEntry() {
    if (!aiOn()) return '';
    var t = state.acTopic || '';
    var chips = AC_TOPICS.map(function (c, i) { return '<button class="ai-chip' + (t === c ? ' on' : '') + '" data-act="ai-chip" data-i="' + i + '">' + esc(c) + '</button>'; }).join('');
    var low = aiBal() < AI_CHAT_COST;
    return '<div class="ai-hero big">' +
      '<div class="ai-hero-art">' + ppm('ai', 96) + '</div>' +
      '<div class="ai-hero-txt"><span class="ai-hero-chip">' + (aiUsed() ? '대표 기능' : '신규 기능') + '</span><h2>AI 자유 대화</h2><p>AI 선생님과 자유롭게 이야기해요</p></div>' +
      '<label class="ai-hero-lab" for="ai-topic">어떤 이야기를 해볼까요?</label>' +
      '<input id="ai-topic" class="ai-hero-in" maxlength="30" autocomplete="off" spellcheck="false" placeholder="예: 내일 친구랑 점심 약속 잡기" value="' + esc(t) + '">' +
      '<p class="ai-hero-note">주제를 입력하지 않아도 대화를 시작할 수 있어요.</p>' +
      '<div class="ai-hero-chips' + (state.aiChipsOpen ? ' open' : '') + '">' + chips + '</div>' +
      '<button class="ai-chips-more" data-act="ai-chips-more" hidden>' + (state.aiChipsOpen ? '접기' : '더보기') + '</button>' +
      '<div class="ai-hero-foot"><button class="ai-hero-go" data-act="ai-go"' + (low ? ' disabled' : '') + '>대화 시작하기</button></div>' +
      '<p class="ai-hero-cost">' + (low ? '크레딧이 부족해요. 위의 충전 버튼으로 충전해 주세요.' : '한 번 대화할 때마다 ' + AI_CHAT_COST + ' 크레딧이 소모돼요.') + '</p></div>';
  }
  function acStop() {
    acHolding = false;
    if (acRec) { try { acRec.abort(); } catch (e) { /* 무시 */ } acRec = null; }
    stopSpeak();
  }
  function acScroll() { try { window.scrollTo(0, document.body.scrollHeight); } catch (e) { /* 무시 */ } }
  function viewAiChat() {
    var a = state.ac;
    if (!aiOn() || !a) return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div><div class="scroll"><p class="sub-title">멤버십이 있을 때 쓸 수 있어요.</p></div></div>';
    return a.mode === 'pick' ? acPick(a) : a.mode === 'end' ? acEnd(a) : acChat(a);
  }
  var AC_TOPICS = ['중국 카페에서 주문하기', '식당에서 음식 시키기', '택시 타고 길 알려 주기', '처음 만난 친구와 인사하기', '호텔 체크인하기', '쇼핑하며 가격 물어보기', '주말 계획 이야기하기', '내 가족 소개하기', '좋아하는 취미 이야기하기'];
  function acPick(a) {
    if (a.direct) {   // 홈 카드에서 바로 시작: 주제 화면 없이 선생님을 불러와요
      return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
        '<div class="ac-loading"><span class="ai-dots"><i></i><i></i><i></i></span><b>선생님을 불러오고 있어요</b><span>' + esc(a.topic || '자유 주제') + '</span></div></div>';
    }
    var bal = aiBal(), can = bal >= AI_CHAT_COST;
    var ok = can && !a.busy;
    var chips = AC_TOPICS.map(function (t, i) { return '<button class="ac-chip' + (a.topic === t ? ' on' : '') + '" data-act="ac-topic" data-i="' + i + '">' + esc(t) + '</button>'; }).join('');
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll" style="padding-top:4px"><h1 class="big-title" style="margin-top:0">중국어로, 아무 말이나 해봐요</h1>' +
      '<p class="sub-title">틀려도 괜찮아요.<br>AI 선생님과 이야기하며 자연스럽게 중국어를 익혀봐요.</p>' +
      (can ? '' : '<div class="notice" style="margin-bottom:12px">크레딧이 부족해요. <button class="link-btn inl" data-act="open-aicharge">충전하기</button></div>') +
      '<label class="ac-lab" for="ac-topic">어떤 이야기를 해볼까요?</label>' +
      '<input id="ac-topic" class="ac-topic" maxlength="30" autocomplete="off" spellcheck="false" placeholder="예: 내일 친구랑 점심 약속 잡기" value="' + esc(a.topic || '') + '">' +
      '<p class="ac-hint">주제 선택 없이 시작하면 선생님이 먼저 말을 걸어요.</p>' +
      '<div class="ac-lab" style="margin-top:30px">이런 주제는 어때요?</div><div class="ac-chips">' + chips + '</div>' +
      '<div style="height:150px"></div></div>' +
      '<div class="footer ac-footer"><div class="ac-cost"><b>' + bal + ' 크레딧 남음</b><span>대화 1회 당 ' + AI_CHAT_COST + '크레딧 사용</span></div><button id="ac-go" class="btn" data-act="ac-start"' + (ok ? '' : ' disabled') + '>' + (a.busy ? '대화를 준비하고 있어요…' : '대화하기') + '</button></div></div>';
  }
  
  function acBubble(m, idx) {
    if (m.who === 'me') {
      return '<div class="acb me' + (m.corrected ? ' fixed' : '') + '">' + (m.corrected ? '<div class="acb-tag">고친 문장으로 다시 말했어요</div>' : '') + '<div class="zh">' + esc(m.zh) + '</div></div>' +
        (m.fix ? '<div class="acfix"><div class="acfix-l">이렇게 말하면 더 자연스러워요</div>' +
          '<button class="acfix-n" data-act="say" data-text="' + esc(m.fix.natural) + '"><span class="zh">' + esc(m.fix.natural) + '</span>' + (m.fix.pinyin ? '<span class="py">' + esc(m.fix.pinyin) + '</span>' : '') + '</button>' +
          (m.fix.ko ? '<div class="acfix-k">' + esc(m.fix.ko) + '</div>' : '') +
          (m.fix.why ? '<div class="acfix-w">' + esc(m.fix.why) + '</div>' : '') +
          (state.ac && state.ac.pending ? '' : '<button class="acfix-rep" data-act="ac-rep" data-i="' + idx + '">따라 말해 보기</button>') + '</div>' : '');
    }
    return '<div class="acb them"><div class="acb-main"><div class="zh">' + esc(m.zh) + '</div>' + (m.py ? '<div class="py">' + esc(m.py) + '</div><div class="kr">' + esc(kr(m.py)) + '</div>' : '') +
      (m.ko ? (m.showKo ? '<div class="ko">' + esc(m.ko) + '</div>' : '') + '<button class="acb-kobtn" data-act="ac-showko" data-i="' + idx + '">' + (m.showKo ? '뜻 가리기' : '한국어 뜻 보기') + '</button>' : '') + '</div>' +
      '<button class="round-btn" data-act="say" data-text="' + esc(m.zh) + '" aria-label="듣기">' + I.spk + '</button></div>';
  }
  function acHasSR() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
  function acMicBox(a, hint, kind) {
    kind = kind || 'zh';
    if (!acHasSR() || state.profile.input === 'type') {   // 음성 인식이 안 되거나 야외 모드면 입력창을 보여요
      if (kind === 'ko') {
        return '<div class="ac-in"><input id="ac-ko-in" autocomplete="off" spellcheck="false" placeholder="하고 싶은 말을 한국어로 써 주세요" value="' + esc(a.koIn || '') + '"' + (a.busy ? ' disabled' : '') + '>' +
          '<button class="btn ac-send" data-act="ac-ko-send"' + (a.busy ? ' disabled' : '') + '>찾기</button></div>';
      }
      return (kind === 'both' && !a.rep ? '<div class="ac-kolink"><button class="link-btn" data-act="ac-ko">중국어로 어떻게 말할지 모르겠어요</button></div>' : '') + '<div class="ac-in"><input id="ac-in" lang="zh-CN" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="중국어로 입력해 주세요" value="' + esc(a.input || '') + '"' + (a.busy ? ' disabled' : '') + '>' +
        '<button class="btn ac-send" data-act="ac-send"' + (a.busy ? ' disabled' : '') + '>' + (a.rep ? '확인' : '보내기') + '</button></div>';
    }
    var dis = a.busy ? ' disabled' : '';
    var zhB = '<div class="ac-mic1"><button id="ac-mic" class="mic' + (a.listening && a.lk !== 'ko' ? ' on' : '') + '" data-achold="zh" aria-label="누른 채로 중국어로 말하기"' + dis + '>' + I.mic + '</button>' + (kind === 'both' ? '<span>중국어로 말하기</span>' : '') + '</div>';
    var koB = '<div class="ac-mic1"><button id="ac-mic-ko" class="mic ko' + (a.listening && a.lk === 'ko' ? ' on' : '') + '" data-achold="ko" aria-label="누른 채로 한국어로 말하기"' + dis + '>' + I.mic + '</button>' + (kind === 'both' ? '<span>한국어로 말하기</span>' : '') + '</div>';
    return '<div class="ac-micbox"><div id="ac-live" class="live' + (a.listening ? (a.live ? '' : ' wait') : ' hint') + '">' + esc(a.listening ? (a.live || '듣고 있어요…') : (a.busy ? '' : hint)) + '</div>' +
      '<div class="ac-mics">' + (kind === 'ko' ? koB : kind === 'both' ? zhB + koB : zhB) + '</div></div>';
  }
  // 말이 안 나올 때: 한국어로 말하면 쉬운 중국어 문장을 알려 줘요(무료). 고르면 따라 말해 본 뒤 대화에 보내요
  function acKoBox(a) {
    var k = a.ko, opts = k.opts || [];
    var list = opts.map(function (o, i) {
      return '<div class="ac-ko-opt"><div class="ac-ko-t"><div class="zh">' + esc(o.zh) + '</div>' + (o.py ? '<div class="py">' + esc(o.py) + '</div><div class="kr">' + esc(kr(o.py)) + '</div>' : '') +
        (o.ko ? '<div class="ko">' + esc(o.ko) + '</div>' : '') + '</div>' +
        '<button class="round-btn" data-act="say" data-text="' + esc(o.zh) + '" aria-label="듣기">' + I.spk + '</button></div>' +
        '<button class="btn ac-ko-use" data-act="ac-ko-pick" data-i="' + i + '">이 문장으로 말해 보기</button>';
    }).join('');
    return '<div class="ac-rep ac-ko"><div class="ac-ko-head"><div class="ac-rep-l">' + (opts.length ? '이렇게 말해 보세요' : '하고 싶은 말을 한국어로 해 보세요') + '</div><button class="ac-ko-x" data-act="ac-ko-close">대화로 돌아가기</button></div>' +
      (k.heard ? '<div class="ac-ko-heard">내가 한 말 · ' + esc(k.heard) + '</div>' : '') +
      (k.busy ? '<div class="acb them typing" style="align-self:flex-start"><span class="ai-dots"><i></i><i></i><i></i></span></div>' : list) +
      (k.busy ? '' : acMicBox(a, opts.length ? '다른 말이 하고 싶으면 다시 한국어로 말해 보세요' : '버튼을 누른 채로 한국어로 말하고, 끝나면 손을 떼세요', 'ko')) +
      '</div>';
  }
  async function acKoRun(text) {
    var a = state.ac;
    if (!a || !a.ko || a.ko.busy) return;
    a.ko.heard = text; a.ko.busy = true; a.live = ''; render(); acScroll();
    try {
      var d = await acCall({ action: 'ko2zh', sid: a.sid, ko: text });
      if (!a.ko) return;
      a.ko.busy = false;
      if (!d.ok) { toast(d.error === 'bad_session' ? '이 대화는 이미 끝났어요' : (AI_ERR[d.error] || 'AI가 응답하지 못했어요. 한 번 더 말해 주세요')); render(); return; }
      a.ko.opts = (d.result && d.result.options) || [];
      render(); acScroll();
    } catch (e) {
      if (window.console) console.error(e);
      if (a.ko) { a.ko.busy = false; toast('연결하지 못했어요. 한 번 더 말해 주세요'); render(); }
    }
  }
  function acRepBox(a) {
    var r = a.rep, res = r.res;
    return '<div class="ac-rep"><div class="ac-rep-l">이 문장을 따라 말해 보세요</div>' +
      '<div class="ac-rep-card"><div class="ac-rep-t"><div class="zh">' + esc(r.zh) + '</div>' + (r.py ? '<div class="py">' + esc(r.py) + '</div><div class="kr">' + esc(kr(r.py)) + '</div>' : '') + (r.ko ? '<div class="acfix-k">' + esc(r.ko) + '</div>' : '') + '</div>' +
      '<div class="rep-spk"><button class="round-btn" data-act="say" data-text="' + esc(r.zh) + '" aria-label="듣기">' + I.spk + '</button><button class="rep-slow" data-act="say-slow" data-text="' + esc(r.zh) + '" aria-label="천천히 듣기">🐢 천천히</button></div></div>' +
      (res ? '<div class="ac-rep-res ' + res + '"><b>' + (res === 'ok' ? '잘했어요!' : '조금 달랐어요') + '</b><span>들린 말 · ' + esc(r.heard) + '</span></div>' + (res === 'no' ? acRepDiffHtml(r) + (r.tries >= 2 ? '<p class="rd-note">인식기가 완벽하지 않아서, 맞게 말해도 다르게 들릴 수 있어요. 천천히 듣고 또박또박 따라 해 보세요. 충분히 했다면 넘어가도 괜찮아요.</p>' : '') : '') : '') +
      (res === 'ok' ? '' : acMicBox(a, '버튼을 누른 채로 말하고, 끝나면 손을 떼세요', 'zh')) +
      '<div class="ac-rep-btns">' + (res ? '<button class="btn gray" data-act="ac-rep-again">다시 해 보기</button>' : '') +
      '<button class="btn' + (res === 'ok' ? '' : ' gray') + '" data-act="ac-rep-close">' + (a.pending ? '다음 대화로' : a.koSend ? (res === 'ok' ? '이 말로 대화하기' : '다른 문장 보기') : '대화로 돌아가기') + '</button></div></div>';
  }
  function acChat(a) {
    var log = a.msgs.map(acBubble).join('') + (a.busy ? '<div class="acb them typing"><span class="ai-dots"><i></i><i></i><i></i></span></div>' : '');
    var foot, sug = '';
    if (a.ended) {
      foot = '<div class="ac-foot"><button class="btn" data-act="ac-finish">대화 마치고 정리 보기</button></div>';
    } else if (a.rep) {
      foot = '<div class="ac-foot">' + acRepBox(a) + '</div>';
    } else if (a.ko) {
      foot = '<div class="ac-foot">' + acKoBox(a) + '</div>';
    } else {
      a.shown = a.shown || {};
      sug = !a.busy && a.sug.length ? '<div class="acsug' + (a.wait ? ' hide' : '') + '"><div class="acsug-l">이렇게 말해볼 수 있어요 <small>눌러서 듣기</small></div>' +
        a.sug.map(function (x, i) {
          var on = !!a.shown[i];
          return '<div class="acsg' + (on ? ' on' : '') + '"><button class="acsg-main" data-act="ac-sug" data-i="' + i + '">' + esc(x.ko || x.zh) + '</button>' +
            (on ? '<div class="acsg-ans"><span class="zh">' + esc(x.zh) + '</span>' + (x.py ? '<span class="py">' + esc(x.py) + '</span>' : '') + '</div>' : '') +
            '<button class="acsg-show" data-act="ac-sug-show" data-i="' + i + '">' + (on ? '답변 가리기' : '답변 보기') + '</button></div>';
        }).join('') + '</div>' : '';
      foot = '<div class="ac-foot">' + (a.low ? '<div class="notice ac-low">크레딧이 모자라요. 마이 화면에서 충전하거나, 대화를 마치고 정리를 볼 수 있어요.</div>' : '') +
        acMicBox(a, '누른 채로 말하고, 끝나면 손을 떼세요', acHasSR() ? 'both' : 'zh') + '</div>';
    }
    var leave = a.leave ? '<div class="ac-leave"><div class="ac-leave-b"><b>대화를 마칠까요?</b><span>지금까지 ' + a.turns + '번 주고받았어요. ' + (a.turns * AI_CHAT_COST) + '크레딧이 쓰였고, 마치면 정리 화면으로 가요.</span>' +
      '<div class="ac-leave-btns"><button class="btn gray" data-act="ac-leave-no">계속하기</button><button class="btn" data-act="ac-leave-yes">마치기</button></div></div></div>' : '';
    return '<div class="screen ac"><div class="topbar ac-top"><button class="icon-btn" data-act="ac-leave" aria-label="그만하기">' + I.close + '</button>' +
      '<span class="ac-tchip">' + esc(a.scenario.title) + '</span><span class="ac-count">남은 크레딧 ' + aiBal() + '</span></div>' +
      '<div class="scroll ac-log">' + log + sug + '</div>' + foot + leave + '</div>';
  }
  function acWrapHtml(a) {
    var w = a.wrap;
    if (!w) return '';
    var head = '<div class="section-title ac-wrap-h">자주 쓸 만한 표현</div>';
    if (w.busy) return head + '<div class="ac-wraploading"><span class="ai-dots"><i></i><i></i><i></i></span><span>이번 대화에서 다시 쓸 만한 말을 고르고 있어요…</span></div>';
    if (w.err) return head + '<p class="hsk-note under-title">표현을 고르지 못했어요. 다음 대화에서는 꼭 모아 드릴게요.</p>';
    return head + '<p class="hsk-note under-title">AI 대화 탭에 저장했어요. 눌러서 소리를 들어 보세요.</p><div class="fixlist">' + (w.items || []).map(function (x) {
      return '<div class="fixrow"><button class="fixrow-main" data-act="say" data-text="' + esc(x.zh) + '"><span class="xchip ' + (x.kind === 'ask' ? 'ask' : 'say') + '">' + (x.kind === 'ask' ? '질문' : '대답') + '</span><span class="zh">' + esc(x.zh) + '</span>' +
        (x.py ? '<span class="py">' + esc(x.py) + '</span>' : '') + (x.ko ? '<span class="why">' + esc(x.ko) + '</span>' : '') + '</button>' + spkBtn(x.zh) + '</div>';
    }).join('') + '</div>';
  }
  function acEnd(a) {
    var fx = a.fixes.length ? a.fixes.map(function (f) {
      return '<div class="acfix sm"><div class="acfix-l">내가 한 말 · ' + esc(f.mine) + '</div><button class="acfix-n" data-act="say" data-text="' + esc(f.natural) + '"><span class="zh">' + esc(f.natural) + '</span>' + (f.pinyin ? '<span class="py">' + esc(f.pinyin) + '</span>' : '') + '</button>' +
        (f.ko ? '<div class="acfix-k">' + esc(f.ko) + '</div>' : '') +
        (f.why ? '<div class="acfix-w">' + esc(f.why) + '</div>' : '') + '</div>';
    }).join('') : '<p class="sub-title" style="margin:0">고칠 곳 없이 잘 말했어요!</p>';
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="ac-leave-yes" aria-label="닫기">' + I.close + '</button></div>' +
      '<div class="scroll" style="padding-top:4px"><h1 class="big-title" style="margin-top:0">대화 끝! 수고했어요</h1>' +
      '<p class="sub-title">' + esc(a.scenario.title) + '</p>' +
      '<div class="ac-settle"><div><span>주고받은 횟수</span><b>' + a.turns + '번</b></div><div><span>사용한 크레딧</span><b>' + (a.turns * AI_CHAT_COST) + '</b></div><div><span>남은 크레딧</span><b>' + aiBal() + '</b></div></div>' +
      '<div class="section-title" style="margin-top:8px">이렇게 고쳐 보세요</div>' + (a.fixes.length ? '<p class="hsk-note under-title">AI 대화 탭에도 모아 뒀어요.</p>' : '') + fx + acWrapHtml(a) + '<div style="height:150px"></div></div>' +
      '<div class="footer fc-foot"><button class="btn gray" data-act="ac-leave-yes">닫기</button><button class="btn" data-act="ac-again">한 번 더 하기</button></div></div>';
  }
  async function acCall(body) {
    var r = await sb.functions.invoke('ai-coach', { body: body });
    if (r.error) throw r.error;
    var d = r.data || {};
    if (typeof d.monthly === 'number' && typeof d.topup === 'number') { state.ai = state.ai || { monthly: 0, topup: 0, grant: 15 }; state.ai.monthly = d.monthly; state.ai.topup = d.topup; }
    return d;
  }
  // 대화를 마칠 때: 이번 대화에서 자주 묻고 답할 만한 표현을 골라 복습 탭에 모아 둬요(크레딧 없음)
  async function acWrap(a) {
    if (!a || a.wrap || !aiOn() || !a.sid || !(a.turns >= 1)) return;
    a.wrap = { busy: true }; render();
    try {
      var d = await acCall({ action: 'chat_wrap', sid: a.sid });
      if (d.ok && d.result && d.result.items && d.result.items.length) {
        a.wrap = { items: d.result.items };
        d.result.items.slice().reverse().forEach(function (x) { aiFixAdd({ natural: x.zh, pinyin: x.py, ko: x.ko, kind: x.kind === 'ask' ? 'ask' : 'say' }); });
      } else a.wrap = { err: true };
    } catch (e) { if (window.console) console.error(e); a.wrap = { err: true }; }
    chatSave(a);
    if (state.ac === a && a.mode === 'end' && state.screen === 'aichat') render();
  }

  /* ---------- AI 대화 기록: 끝난 대화를 말한 그대로 저장해요 ---------- */
  function chatsKey() { return 'pangpang.chats.' + (state.user ? state.user.id : 'x'); }
  function chatsLocal() { try { return JSON.parse(localStorage.getItem(chatsKey()) || '[]'); } catch (e) { return []; } }
  function chatsPersist() { try { localStorage.setItem(chatsKey(), JSON.stringify((state.chats || []).slice(0, 60))); } catch (e) { /* 무시 */ } }
  function chatSnap(a) {
    return {
      id: String(a.sid || ('c' + Date.now())), at: a.startAt || new Date().toISOString(), title: a.scenario.title, turns: a.turns,
      msgs: a.msgs.map(function (m) {
        var o = { who: m.who, zh: m.zh };
        if (m.py) o.py = m.py;
        if (m.ko) o.ko = m.ko;
        if (m.corrected) o.corrected = 1;
        if (m.fix) o.fix = { natural: m.fix.natural, pinyin: m.fix.pinyin || '', ko: m.fix.ko || '', why: m.fix.why || '' };
        return o;
      }),
      wrap: a.wrap && a.wrap.items ? a.wrap.items.map(function (x) { return { zh: x.zh, py: x.py || '', ko: x.ko || '', kind: x.kind }; }) : []
    };
  }
  function chatSave(a) {
    if (!a || !a.msgs || !(a.turns >= 1) || !state.user) return;
    var snap = chatSnap(a);
    if (!state.chats || state.chatsUid !== state.user.id) { state.chatsUid = state.user.id; state.chats = chatsLocal(); }
    state.chats = [snap].concat(state.chats.filter(function (c) { return c.id !== snap.id; }))
      .sort(function (x, y) { return String(y.at).localeCompare(String(x.at)); }).slice(0, 60);
    chatsPersist();
    if (sb && !isGuest()) {
      Promise.resolve(sb.from('ai_chats').upsert({ user_id: state.user.id, id: snap.id, data: snap, created_at: snap.at }, { onConflict: 'user_id,id' }))
        .then(function (r) { if (r && r.error && window.console) console.warn(r.error); }, function () { /* 무시 */ });   // 표가 없어도 이 기기에는 저장돼요
    }
  }
  async function chatsInit() {
    state.chatsUid = state.user && state.user.id;
    state.chats = chatsLocal();
    if (!sb || isGuest() || !state.user) return;
    try {
      var res = await sb.from('ai_chats').select('id,data,created_at').order('created_at', { ascending: false }).limit(60);
      var rows = (res && res.data) || [];
      if (rows.length) {
        var map = {};
        state.chats.forEach(function (c) { map[c.id] = c; });
        rows.forEach(function (r) { if (r.data && r.data.id && (!map[r.data.id] || (r.data.msgs || []).length >= (map[r.data.id].msgs || []).length)) map[r.data.id] = r.data; });
        state.chats = Object.keys(map).map(function (k) { return map[k]; }).sort(function (x, y) { return String(y.at).localeCompare(String(x.at)); }).slice(0, 60);
        chatsPersist();
      }
    } catch (e) { /* 무시 */ }
  }
  function chatDel(id) {
    state.chats = (state.chats || chatsLocal()).filter(function (c) { return c.id !== id; });
    chatsPersist();
    if (sb && !isGuest() && state.user) {
      Promise.resolve(sb.from('ai_chats').delete().eq('user_id', state.user.id).eq('id', id)).then(function () {}, function () {});
    }
  }
  function chatWhen(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return (d.getMonth() + 1) + '.' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function chatRow(c) {
    return '<li><button class="item" data-act="chat-open" data-id="' + esc(c.id) + '"><span class="txt"><div class="t">' + esc(c.title || 'AI 대화') + '</div>' +
      '<div class="s">' + chatWhen(c.at) + ' · ' + c.turns + '번 주고받았어요</div></span><span class="chip soft">보기</span></button></li>';
  }
  function aiHistorySection() {
    var list = state.chats || [];
    var head = '<div class="section-title" style="margin-top:28px">지난 대화</div>';
    if (!list.length) return head + '<div class="chat-empty">대화를 하면 말한 그대로<br>여기에 저장돼요.</div>';
    return head + '<ul class="list">' + list.slice(0, 3).map(chatRow).join('') + '</ul>' +
      (list.length > 3 ? '<button class="more-btn" data-act="chat-all">전체 보기 (' + list.length + '개)</button>' : '');
  }
  function viewChatAll() {
    var list = state.chats || [];
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll" style="padding-top:4px"><h1 class="big-title" style="margin-top:0">지난 대화</h1>' +
      '<p class="sub-title">대화한 내용이 말한 그대로 저장돼요.</p>' +
      (list.length ? '<ul class="list">' + list.map(chatRow).join('') + '</ul>' : '<p class="hsk-note">아직 저장된 대화가 없어요.</p>') + '<div style="height:40px"></div></div></div>';
  }
  function viewChatLog() {
    var c = (state.chats || []).filter(function (x) { return x.id === state.chatId; })[0];
    var back = '<div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>';
    if (!c) return '<div class="screen">' + back + '<div class="scroll"><p class="sub-title">기록을 찾지 못했어요.</p></div></div>';
    var log = (c.msgs || []).map(function (m) {
      if (m.who === 'me') {
        return '<div class="acb me' + (m.corrected ? ' fixed' : '') + '">' + (m.corrected ? '<div class="acb-tag">고친 문장으로 다시 말했어요</div>' : '') + '<div class="zh">' + esc(m.zh) + '</div></div>' +
          (m.fix ? '<div class="acfix"><div class="acfix-l">이렇게 말하면 더 자연스러워요</div>' +
            '<button class="acfix-n" data-act="say" data-text="' + esc(m.fix.natural) + '"><span class="zh">' + esc(m.fix.natural) + '</span>' + (m.fix.pinyin ? '<span class="py">' + esc(m.fix.pinyin) + '</span>' : '') + '</button>' +
            (m.fix.ko ? '<div class="acfix-k">' + esc(m.fix.ko) + '</div>' : '') + (m.fix.why ? '<div class="acfix-w">' + esc(m.fix.why) + '</div>' : '') + '</div>' : '');
      }
      return '<div class="acb them"><div class="acb-main"><div class="zh">' + esc(m.zh) + '</div>' + (m.py ? '<div class="py">' + esc(m.py) + '</div><div class="kr">' + esc(kr(m.py)) + '</div>' : '') +
        (m.ko ? '<div class="ko">' + esc(m.ko) + '</div>' : '') + '</div>' +
        '<button class="round-btn" data-act="say" data-text="' + esc(m.zh) + '" aria-label="듣기">' + I.spk + '</button></div>';
    }).join('');
    var wrap = (c.wrap && c.wrap.length) ? '<div class="section-title" style="margin-top:20px">자주 쓸 만한 표현</div><div class="fixlist">' + c.wrap.map(function (x) {
      return '<div class="fixrow"><button class="fixrow-main" data-act="say" data-text="' + esc(x.zh) + '"><span class="xchip ' + (x.kind === 'ask' ? 'ask' : 'say') + '">' + (x.kind === 'ask' ? '질문' : '대답') + '</span><span class="zh">' + esc(x.zh) + '</span>' +
        (x.py ? '<span class="py">' + esc(x.py) + '</span>' : '') + (x.ko ? '<span class="why">' + esc(x.ko) + '</span>' : '') + '</button></div>';
    }).join('') + '</div>' : '';
    return '<div class="screen">' + back + '<div class="scroll" style="padding-top:4px"><h1 class="big-title" style="margin-top:0">' + esc(c.title || 'AI 대화') + '</h1>' +
      '<p class="sub-title">' + chatWhen(c.at) + ' · ' + c.turns + '번 주고받았어요</p>' +
      '<div class="ac-log chat-log">' + log + '</div>' + wrap +
      '<button class="link-btn chat-del" data-act="chat-del" data-id="' + esc(c.id) + '">이 기록 지우기</button><div style="height:40px"></div></div></div>';
  }
  function acFailRender(a) { if (a.direct && state.ac === a) { state.ac = null; go('tab'); } else render(); }
  async function acStart() {
    var a = state.ac;
    var topic = String((a && a.topic) || '').trim().slice(0, 30), intro = '';
    if (!a || a.busy || !aiOn() || aiBal() < AI_CHAT_COST) return;
    if (topic.length < 2) {   // 주제를 안 골랐으면 인사와 함께 아무 이야기나 먼저 걸어 줘요
      var pool = AC_TOPICS.concat(['오늘 하루', '날씨', '좋아하는 음식', '여행 가고 싶은 곳']);
      topic = pool[Math.floor(Math.random() * pool.length)];
      intro = '학습자가 주제를 정하지 않았어요. 먼저 밝게 인사하고, 이 주제로 쉬운 질문 하나를 가볍게 건네 주세요.';
    }
    a.busy = true; render();
    try {
      var d = await acCall({ action: 'chat_start', scenario: { id: 'free', title: topic, intro: intro } });
      a.busy = false;
      if (!d.ok) { toast(AI_ERR[d.error] || '대화를 시작하지 못했어요. 잠시 후 다시 해 주세요'); acFailRender(a); return; }
      try { localStorage.setItem(aiUsedKey(), '1'); } catch (e) { /* 무시 */ }
      tdMark('ai');
      state.ac = { mode: 'chat', startAt: new Date().toISOString(), scenario: { id: 'free', title: topic }, sid: d.sid, msgs: [Object.assign({ who: 'them' }, d.turn.reply)], sug: d.turn.suggestions || [], turns: 0, input: '', busy: false, ended: false, fixes: [], wait: true };
      render(); acScroll();
      acReveal(state.ac, d.turn.reply.zh);
    } catch (e) {
      if (window.console) console.error(e);
      a.busy = false; toast('연결하지 못했어요. 잠시 후 다시 해 주세요');
      if (a.direct && state.ac === a) { state.ac = null; go('tab'); }
      loadAi().then(function () { if (state.ac === a || state.screen === 'tab') render(); });
    }
  }
  // AI의 다음 말을 대화에 올려요
  // 선생님 말(음성)이 끝나면 추천 답변 목록이 슥 펼쳐져요. 대화창(마이크·입력)은 처음부터 떠 있어요
  function acReveal(a, text) {
    a.wait = true;
    var done = false;
    function show() {
      if (done) return; done = true;
      setTimeout(function () {
        if (state.ac !== a) return;
        a.wait = false;
        var els = document.querySelectorAll('.acsug.hide');
        for (var k = 0; k < els.length; k++) { els[k].classList.add('go'); els[k].classList.remove('hide'); }
        [80, 250, 450, 700].forEach(function (ms) { setTimeout(function () { if (state.ac === a && state.screen === 'aichat') { try { window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }); } catch (e) { acScroll(); } } }, ms); });
      }, 350);
    }
    setTimeout(function () { if (state.screen === 'aichat' && state.ac === a) speak(text, 0.85, show); else show(); }, 300);
    setTimeout(show, 7000);   // 음성이 없거나 늦어져도 보여 줘요
  }
  function acRelease(a, p) {
    a.msgs.push(Object.assign({ who: 'them' }, p.reply));
    if (a.turns >= 1) chatSave(a);   // 한 턴마다 이 기기에 남겨 두면, 중간에 앱이 꺼져도 대화가 남아요
    a.sug = p.sug; a.lastSug = a.sug; a.shown = {}; a.ended = !!p.end; a.pending = null; a.rep = null;
    if (!a.ended) a.wait = true;
    render(); acScroll();
    if (a.ended) setTimeout(function () { if (state.screen === 'aichat' && state.ac === a) speak(p.reply.zh, 0.85); }, 250);
    else acReveal(a, p.reply.zh);
  }
  async function acSend(said) {
    var a = state.ac;
    if (!a || a.mode !== 'chat' || a.busy || a.ended) return;
    var inp = document.getElementById('ac-in');
    var text = String(typeof said === 'string' ? said : ((inp && inp.value) || a.input || '')).trim().slice(0, 120);
    if (a.rep) { acRepDone(text); return; }
    if (!text) { toast('말하거나 입력해 주세요'); return; }
    acStop();
    var mine = { who: 'me', zh: text };
    a.msgs.push(mine); a.input = ''; a.sug = []; a.shown = {}; a.live = ''; a.busy = true; a.listening = false; render(); acScroll();
    try {
      var d = await acCall({ action: 'chat_turn', sid: a.sid, answer: text });
      a.busy = false;
      if (!d.ok) {
        a.msgs.pop(); a.input = text; a.sug = a.lastSug || []; a.shown = {};
        toast(d.error === 'bad_session' ? '이 대화는 이미 끝났어요' : (AI_ERR[d.error] || 'AI가 응답하지 못했어요. 한 번 더 보내 주세요'));
        if (d.error === 'bad_session') a.ended = true;
        if (d.error === 'no_credit') a.low = true;
        render(); return;
      }
      var t = d.turn;
      if (d.retry) {
        // AI가 알아듣지 못했어요: 대화를 끊지 않고 '다시 말해 달라'는 말만 보여 줘요(크레딧은 돌려받았어요)
        a.msgs.push(Object.assign({ who: 'them' }, t.reply)); a.sug = a.lastSug || []; a.shown = {};
        render(); acScroll();
        setTimeout(function () { if (state.screen === 'aichat' && state.ac === a) speak(t.reply.zh, 0.85); }, 250);
        return;
      }
      a.turns = d.turns;
      if (t.fix) {
        // 고칠 말이 있으면 AI의 다음 말은 잠시 붙잡아 두고, 고친 문장을 먼저 따라 말해 본 뒤에 이어 가요
        mine.fix = t.fix; a.fixes.push({ mine: text, natural: t.fix.natural, pinyin: t.fix.pinyin, ko: t.fix.ko, why: t.fix.why }); aiFixAdd({ mine: text, natural: t.fix.natural, pinyin: t.fix.pinyin, ko: t.fix.ko, why: t.fix.why });
        a.pending = { reply: t.reply, sug: t.suggestions || [], end: !!d.end };
        a.rep = { zh: t.fix.natural, py: t.fix.pinyin, ko: t.fix.ko, heard: '', res: null };
        render(); acScroll();
        setTimeout(function () { if (state.screen === 'aichat' && state.ac === a && a.rep) speak(t.fix.natural, 0.8); }, 250);
        return;
      }
      acRelease(a, { reply: t.reply, sug: t.suggestions || [], end: !!d.end });
    } catch (e) {
      if (window.console) console.error(e);
      a.busy = false; a.msgs.pop(); a.input = text; a.sug = a.lastSug || [];
      toast('연결하지 못했어요. 한 번 더 보내 주세요'); render();
    }
  }
  var acHolding = false;
  function acRepDone(text) {
    var a = state.ac;
    if (!a || !a.rep) return;
    var alts = Array.isArray(text) ? text : [text], best = null, k;
    for (k = 0; k < alts.length; k++) {   // 인식기가 후보를 여러 개 주면 가장 잘 맞는 걸로 봐요
      var d = acDiff(a.rep.zh, alts[k]);
      if (!best || d.ratio > best.d.ratio) best = { d: d, t: alts[k] };
    }
    var T = Grade.normalize(a.rep.zh), n = T.length, need = n >= 6 ? 0.7 : 0.8;
    var ok = n > 0 && best.d.ratio >= need && Grade.normalize(best.t).length <= n * 1.6;
    a.rep.heard = best.t; a.rep.res = ok ? 'ok' : 'no'; a.rep.marks = best.d.marks; a.rep.tries = ok ? 0 : (a.rep.tries || 0) + 1; a.live = '';
    render(); acScroll();
  }
  // 목표 문장과 들린 말을 글자 단위로 비교해요(어디가 달랐는지 보여 주려고)
  function acDiff(target, heard) {
    var T = Grade.normalize(target), H = Grade.normalize(heard), L = [], i, j;
    for (i = 0; i <= T.length; i++) { L.push([]); for (j = 0; j <= H.length; j++) L[i].push(0); }
    for (i = T.length - 1; i >= 0; i--) for (j = H.length - 1; j >= 0; j--) L[i][j] = T.charAt(i) === H.charAt(j) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var marks = []; i = 0; j = 0;
    while (i < T.length) {
      if (j < H.length && T.charAt(i) === H.charAt(j) && L[i][j] === L[i + 1][j + 1] + 1) { marks.push(true); i++; j++; }
      else if (j < H.length && L[i][j + 1] >= L[i + 1][j]) j++;
      else { marks.push(false); i++; }
    }
    return { ratio: T.length ? L[0][0] / T.length : 0, marks: marks };
  }
  var TONE_TIP = { 1: '1성 · 높고 평평하게', 2: '2성 · 쭉 올려요', 3: '3성 · 푹 내렸다 올려요', 4: '4성 · 위에서 뚝 떨어져요', 5: '경성 · 가볍고 짧게' };
  function pyTone(syl) {
    if (/[āēīōūǖ]/i.test(syl)) return 1;
    if (/[áéíóúǘ]/i.test(syl)) return 2;
    if (/[ǎěǐǒǔǚ]/i.test(syl)) return 3;
    if (/[àèìòùǜ]/i.test(syl)) return 4;
    return 5;
  }
  // 놓친 글자를 색으로 보여 주고, 그 글자의 병음과 성조 요령을 알려 줘요
  function acRepDiffHtml(r) {
    var chars = [], k = 0, miss = [];
    var syl = String(r.py || '').replace(/[，。！？、,.!?;；:：…—\-]/g, ' ').split(/\s+/).filter(Boolean);
    var hz = [];
    String(r.zh).split('').forEach(function (ch) { if (Grade.normalize(ch).length) hz.push(ch); });
    var map = syl.length === hz.length;
    var hi = 0;
    String(r.zh).split('').forEach(function (ch) {
      var nl = Grade.normalize(ch).length;
      if (!nl) { chars.push('<span>' + esc(ch) + '</span>'); return; }
      var good = true, q;
      for (q = 0; q < nl; q++) { if (r.marks && r.marks[k + q] === false) good = false; }
      k += nl;
      if (!good) miss.push({ ch: ch, py: map ? syl[hi] : '' });
      hi++;
      chars.push('<span class="' + (good ? 'dg' : 'db') + '">' + esc(ch) + '</span>');
    });
    var tips = miss.slice(0, 3).map(function (m) {
      return '<li><b class="zh">' + esc(m.ch) + '</b>' + (m.py ? ' <span class="py">' + esc(m.py) + '</span> <em>' + TONE_TIP[pyTone(m.py)] + '</em>' : '') + '</li>';
    }).join('');
    return '<div class="rep-diff"><div class="rd-t zh">' + chars.join('') + '</div>' +
      (miss.length ? '<div class="rd-l">빨간 글자를 다시 말해 보세요</div><ul class="rd-tips">' + tips + '</ul>' : '') + '</div>';
  }
  function acMicDown(kind, prev) {
    prev = prev || '';
    kind = kind === 'ko' ? 'ko' : 'zh';
    var a = state.ac;
    if (!a || a.mode !== 'chat' || a.busy || a.ended || acRec || (a.ko && a.ko.busy)) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    stopSpeak();
    acHolding = true;
    var r = new SR(), got = '', errCode = '', alts = [];
    if (kind === 'ko' && a.rep) { acHolding = false; return; }
    a.lk = kind; acRec = r; r.lang = kind === 'ko' ? 'ko-KR' : 'zh-CN'; r.interimResults = true; r.continuous = false; r.maxAlternatives = a.rep ? 5 : 1;
    var live = function () { var m = document.getElementById(kind === 'ko' ? 'ac-mic-ko' : 'ac-mic'), lv = document.getElementById('ac-live'); if (m) m.classList.toggle('on', !!a.listening); if (lv) { lv.textContent = a.listening ? (a.live || '듣고 있어요…') : ''; lv.classList.remove('hint'); lv.classList.toggle('wait', !a.live); } };
    r.onstart = function () { a.listening = true; a.live = ''; live(); if (!acHolding) { try { r.stop(); } catch (e) { /* 무시 */ } } };
    r.onresult = function (e) { var rs = e.results[e.results.length - 1]; got = rs[0].transcript; alts = []; for (var z = 0; z < rs.length; z++) alts.push(rs[z].transcript); };   // 듣는 동안엔 인식 중인 글자를 보여 주지 않고 '듣고 있어요…'만 보여요
    r.onerror = function (e) { errCode = e.error || 'error'; };
    r.onend = function () {
      if (acRec === r) acRec = null;
      if (state.ac !== a || state.screen !== 'aichat') { a.listening = false; acHolding = false; return; }
      // 손가락이 아직 눌려 있는데 브라우저가 알아서 끊었다면, 이어서 계속 들어요
      var fatal = errCode === 'not-allowed' || errCode === 'service-not-allowed' || errCode === 'audio-capture' || errCode === 'network';
      if (acHolding && !fatal) {
        var carry = prev + got;
        acRec = null;
        try { acMicDown(kind, carry); if (acRec) return; } catch (e) { /* 아래에서 마무리 */ }
      }
      a.listening = false; acHolding = false;
      if (prev) { got = prev + got; alts = alts.length ? alts.map(function (t) { return prev + t; }) : []; }
      if (got) { a.live = ''; if (kind === 'ko') { if (!a.ko) a.ko = { opts: null, heard: '', busy: false }; acKoRun(got); } else if (a.rep) acRepDone(alts.length ? alts : got); else acSend(got); return; }
      a.live = '';
      if (errCode === 'not-allowed' || errCode === 'service-not-allowed') toast('마이크 권한을 허용해 주세요');
      else if (errCode === 'network') toast('음성 인식 서버에 연결하지 못했어요');
      else if (errCode !== 'aborted') toast('목소리가 잘 안 들렸어요. 버튼을 누른 채로 말해 보세요');
      render();
    };
    try { r.start(); } catch (e) { acRec = null; acHolding = false; }
  }
  function acMicUp() {
    acHolding = false;
    if (acRec) { try { acRec.stop(); } catch (e) { /* 무시 */ } }
  }
  document.addEventListener('pointerdown', function (e) {
    var t = e.target && e.target.closest ? e.target.closest('[data-achold]') : null;
    if (t) { e.preventDefault(); acMicDown(t.getAttribute('data-achold')); }
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) { document.addEventListener(ev, acMicUp); });
  function viewAiCharge() {
    if (!aiOn()) return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div><div class="scroll"><p class="sub-title">멤버십이 있을 때 쓸 수 있어요.</p></div></div>';
    var packs = AI_PACKS.map(function (k) {
      return '<div class="pack"><div class="pk-n">' + k.credits + '<small>크레딧</small></div><div class="pk-s">호출 ' + k.credits + '회 · 크레딧당 약 ' + (Math.round(k.price / k.credits * 10) / 10) + '원</div>' +
        '<button class="btn" data-act="buy-pack" data-id="' + k.id + '">' + won(k.price) + '</button></div>';
    }).join('');
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll" style="padding-top:4px"><h1 class="big-title" style="margin-top:0">AI 대화</h1>' +
      '<p class="sub-title">AI 선생님과 대화하고, 말한 문장을 자연스럽게 고쳐 받는 데 쓰는 크레딧이에요. 대화는 한 번 주고받을 때 2크레딧, 문장 교정은 1크레딧이 들어요.</p>' +
      '<div class="ai-wallet plain"><div class="aw-top"><span>남은 크레딧</span><b>' + aiBal() + '</b></div><div class="aw-s">이번 달 지급 ' + state.ai.monthly + ' · 충전분 ' + state.ai.topup + '</div></div>' +
      '<ul class="perks"><li>' + I.check + '멤버십이면 매달 ' + ((state.ai && state.ai.grant) || 15) + '크레딧을 드려요 (남아도 다음 달로 넘어가지 않아요)</li>' +
      '<li>' + I.check + '충전한 크레딧은 매달 지급분을 다 쓴 뒤에 쓰고, 사라지지 않아요</li></ul>' +
      '<div class="packs">' + packs + '</div>' +
      '<div class="notice pay-test"><span>지금은 테스트모드입니다. 결제가 되지 않아요.</span></div><div style="height:24px"></div></div></div>';
  }
  async function buyPack(id) {
    try {
      var res = await sb.rpc('test_topup', { p_pack: id });
      if (res.error) throw res.error;
      var d = res.data || {};
      if (!d.ok) { toast(d.error === 'not_member' ? '멤버십이 있어야 충전할 수 있어요' : '충전하지 못했어요'); return; }
      await loadAi(); render();
      toast('크레딧이 충전됐어요 (테스트)');
    } catch (e) { if (window.console) console.error(e); toast('처리하지 못했어요. 잠시 후 다시 시도해 주세요'); }
  }
  function memberCard() {
    if (!sb) return '';
    var ai = aiOn();
    if (isLifetime() && !ai) return '';   // 평생 회원은 아래 메뉴 목록에서 확인해요
    var m = memberLabel(), pro = isPro();
    var aiRow = ai ? '<button class="mc-ai" data-act="open-aicharge"><span class="mc-ai-t">AI 대화</span><span class="mc-ai-n">남은 크레딧 <b>' + aiBal() + '</b></span><span class="mc-ai-go">충전</span></button>' : '';
    var head = isLifetime()
      ? '<div class="mc-main"><span class="mc-t">' + esc(m.t) + '</span><span class="mc-s">' + esc(m.s) + '</span></div>'
      : '<button class="mc-main" data-act="open-pay"><span class="mc-t">' + esc(m.t) + '</span><span class="mc-s">' + esc(m.s) + '</span>' +
        '<span class="mc-go">' + (pro ? '멤버십 관리' : '멤버십 보기') + '</span></button>';
    return '<div class="member-card' + (pro ? ' on' : '') + '">' + head + aiRow + '</div>';
  }
  function meCard(initial, email) {
    var nick = nickname();
    var sub = sb ? email : '기록이 이 기기에만 저장돼요';
    if (state.editNick) {
      return '<div class="me-card edit" style="margin-top:16px"><div class="ava">' + esc(initial) + '</div><div class="who">' +
        '<label class="lab" for="nick">닉네임</label>' +
        '<input id="nick" class="nick-input" maxlength="12" autocomplete="off" placeholder="예: 헬로웅" value="' + esc(nick) + '">' +
        '<div class="nick-btns"><button class="btn sm" data-act="nick-save">저장</button><button class="btn sm gray" data-act="nick-cancel">취소</button></div>' +
        '</div></div>';
    }
    return '<div class="me-card" style="margin-top:16px"><div class="ava">' + esc(initial) + '</div><div class="who"><b>' +
      (nick ? esc(nick) : '닉네임을 정해 보세요') + '</b><span>' + esc(sub) + '</span></div>' +
      '<button class="pill-sm" data-act="nick-edit">수정</button></div>';
  }

  function seg(act, cur, opts) {
    return '<div class="seg" role="group">' + opts.map(function (o) {
      return '<button data-act="' + act + '" data-v="' + o[0] + '" class="' + (String(cur) === String(o[0]) ? 'on' : '') + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function inputOpt(v, t, sub) {
    var on = state.profile.input === v;
    return '<button class="radio-o' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" data-act="set-input" data-v="' + v + '"><i></i><span><b>' + t + '</b><small>' + sub + '</small></span></button>';
  }
  // 마이페이지에는 자주 바꾸는 세 가지만 두고, 나머지는 '환경 설정' 화면에서 관리해요
  function settingsCard() {
    var p = state.profile;
    return '<div class="section-title" style="margin-top:24px">학습 설정</div><div class="set-card">' +
      '<div class="set-row"><div class="set-t">하루 목표</div>' + seg('set-goal', p.goal, [[20, '20'], [50, '50'], [100, '100']]) + '</div>' +
      '<div class="set-row col"><div class="set-t">답하는 방법</div><div class="radio-list" role="radiogroup" aria-label="답하는 방법">' +
        inputOpt('voice', '말로 답하기', '마이크에 대고 말해요 · 기본') + inputOpt('type', '키보드로 답하기 · 야외 모드', '소리 내기 어려운 곳에서 글자로 입력해요') + '</div></div>' +
      '<div class="set-row"><div class="set-t">한국어 발음 표기</div>' + seg('set-kr', p.kr ? 'on' : 'off', [['on', '켜짐'], ['off', '꺼짐']]) + '</div>' +
      '</div>';
  }
  // 마이페이지 메뉴 영역: 팽팽이 소개 · 자문위원 소개 · 환경 설정
  function menuCard() {
    function row(act, t) { return '<button class="set-row set-link" data-act="' + act + '"><span class="set-t">' + t + '</span><span class="set-arrow" aria-hidden="true">›</span></button>'; }
    return '<div class="set-card" style="margin-top:24px">' + row('open-about', '팽팽이 소개') + row('open-advisor', '자문위원 소개') + row('open-prefs', '환경 설정') + '</div>';
  }
  // (임시 내용) 나중에 실제 소개 문구로 바꿔요
  function viewAbout() {
    var feats = [['말로 하는 연습', '읽기만 하지 않고, 직접 소리 내어 말하며 입을 열어요.'], ['작은 걸음, 매일', '하루 한 문장부터. 부담 없이 이어 갈 수 있게 짧게 나눴어요.'], ['AI 선생님', '틀려도 괜찮아요. 대화하며 자연스럽게 고쳐 줘요.']];
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll legal" style="padding-top:4px"><div style="text-align:center;margin:4px 0 8px">' + ppm('hello', 120) + '</div>' +
      '<h1 class="big-title" style="margin-top:0;text-align:center">팽팽이</h1>' +
      '<p class="sub-title" style="text-align:center">천천히, 하지만 꾸준히 중국어로 말해요.</p>' +
      '<p>팽팽이는 중국어를 처음 시작하는 분들이 부담 없이 말문을 트도록 돕는 앱이에요. (임시 소개 글)</p>' +
      feats.map(function (f) { return '<h2>' + esc(f[0]) + '</h2><p>' + esc(f[1]) + '</p>'; }).join('') +
      '<h2>문의</h2><p>설정 → 환경 설정 → 의견 보내기로 남겨 주세요.</p><div style="height:40px"></div></div></div>';
  }
  function viewAdvisor() {
    var chips = ['레슨 문장', 'HSK 단어', '발음·병음'];
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll legal" style="padding-top:4px"><h1 class="big-title" style="margin-top:0">자문위원 소개</h1>' +
      '<p class="sub-title">팽팽이의 중국어 콘텐츠를 함께 살펴 주세요. (임시 내용)</p>' +
      '<div class="set-card adv-card"><div class="adv-av" aria-hidden="true">师</div><div class="adv-t"><b>OOO 선생님</b><span>중국어 교육 전문가 · 경력 N년</span></div></div>' +
      '<h2>소개</h2><p>중국어 교육 현장에서 오랫동안 학습자를 가르쳐 왔어요. 초급 학습자가 자주 헷갈리는 표현을 중심으로 살펴 주고 있어요. (임시 소개 글)</p>' +
      '<h2>검수 범위</h2><div class="adv-chips">' + chips.map(function (c) { return '<span class="chip soft">' + c + '</span>'; }).join('') + '</div>' +
      '<h2>한마디</h2><p>“틀려도 괜찮아요. 입으로 말해 보는 게 가장 빠른 길이에요.” (임시 문구)</p><div style="height:40px"></div></div></div>';
  }
  function viewPrefs() {
    var p = state.profile;
    var extra = typeof settingsExtra === 'function' ? settingsExtra() : '';
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll" style="padding-top:4px"><h1 class="big-title" style="margin-top:0">환경 설정</h1>' +
      '<div class="section-title" style="margin-top:8px">소리 · 화면</div><div class="set-card">' +
        '<div class="set-row"><div class="set-t">효과음·진동</div>' + seg('set-sound', p.sound ? 'on' : 'off', [['on', '켜짐'], ['off', '꺼짐']]) + '</div>' +
        '<div class="set-row"><div class="set-t">중국어 음성' + (function () { var z = zhVoiceState(); return '<div class="set-sub">' + (z === 'yes' ? '사용할 수 있어요' : z === 'no' ? '이 폰에 없어요' : '확인 중이에요') + '</div>'; })() + '</div><button class="pill-sm" data-act="zh-guide">설치 방법</button></div>' +
        '<div class="set-row"><div class="set-t">화면</div>' + seg('set-theme', p.theme, [['auto', '자동'], ['light', '라이트'], ['dark', '다크']]) + '</div></div>' +
      (extra ? '<div class="section-title" style="margin-top:24px">알림 · 앱 설치</div><div class="set-card">' + extra + '</div>' : '') +
      ((sb ? 1 : 0) ? '<div class="section-title" style="margin-top:24px">이용권 · 계정</div><div class="set-card">' +
        '<div class="set-row"><div class="set-t">쿠폰 등록</div><button class="pill-sm" data-act="open-coupon">입력</button></div>' +
        (!isGuest() ? '<div class="set-row"><div class="set-t">계정 관리</div><button class="pill-sm" data-act="open-account">열기</button></div>' : '') + '</div>' : '') +
      '<div class="section-title" style="margin-top:24px">도움말</div><div class="set-card">' +
        '<button class="set-row set-link" data-act="open-review"><span class="set-t">콘텐츠 검수 도구</span><span class="set-arrow">›</span></button>' +
        '<div class="set-row"><div class="set-t">의견 보내기</div><button class="pill-sm" data-act="open-feedback">보내기</button></div>' +
        '<div class="set-row"><div class="set-t">앱 버전</div><div class="set-v">' + APP_VERSION + '</div></div></div>' +
      '<div style="height:40px"></div></div></div>';
  }
  function viewMe() {
    var learned = learnedLessons();
    var wordCount = learned.reduce(function (n, l) { return n + l.words.length; }, 0);
    var email = state.user && state.user.email ? state.user.email : '';
    var initial = (nickname() ? nickname()[0] : (email ? email[0] : '팽')).toUpperCase();
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    var dots = '';
    for (var i = 6; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var r = state.daily[dayStr(d)];
      dots += '<div class="d' + (r && r.answers > 0 ? ' on' : '') + (i === 0 ? ' today-d' : '') + '">' + days[d.getDay()] + '<i></i></div>';
    }
    var hskTotal = [1, 2, 3, 4].reduce(function (s, l) { return s + (HSKW[l] ? hskCount(l) : 0); }, 0);
    return '<div class="screen"><div class="scroll with-nav">' +
      '<div class="tab-head"><div><h1 class="big-title">' + (nickname() ? esc(nickname()) + '님,<br>' : '') + '오늘도 화이팅!</h1>' +
      '<p class="sub-title" style="margin-bottom:0">내 학습 기록이에요.</p></div>' + ppm('hello', 100) + '</div>' +
      meCard(initial, email) + memberCard() +
      '<div class="sec-head"><h2 class="section-title">학습 통계</h2><button class="sec-more" data-act="open-stats">전체 보기<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg></button></div>' +
      '<div class="stats">' +
        '<div class="stat"><b>' + streak() + '일</b><span>연속 학습</span></div>' +
        '<div class="stat"><b>' + hskTotal + '</b><span>익힌 단어</span></div>' +
        '<div class="stat"><b>' + (dueRows().length + hskDue(0).length) + '</b><span>복습할 것</span></div>' +
      '</div>' +
      '<p class="week-lab">최근 7일</p><div class="week">' + dots + '</div>' +
      settingsCard() + menuCard() +
      '<div class="me-actions">' +
        (sb ? '<button class="btn gray" data-act="logout">로그아웃</button>'
            : '<button class="btn gray" data-act="reset-local">기록 모두 지우기</button>') +
      '<div class="me-links">' + (isLifetime() ? '<button data-act="open-pay">평생 회원 · 멤버십 정보</button>' : '') + '<button data-act="open-privacy">개인정보처리방침</button></div>' +
      '</div>' +
      '</div>' + navHtml() + '</div>';
  }

  /* ---------- 렌더 ---------- */
  /* ---------- 효과음 (파일 없이 소리를 직접 만들어요) + 진동 ---------- */
  var actx = null;
  function audioCtx() {
    if (actx) return actx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { actx = new AC(); } catch (e) { actx = null; }
    return actx;
  }
  function unlockAudio() {
    var c = audioCtx();
    if (c && c.state === 'suspended') { try { c.resume(); } catch (e) { /* 무시 */ } }
  }
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (ev) {
    document.addEventListener(ev, unlockAudio, { passive: true });
  });
  function tone(freq, start, dur, type, vol) {
    var c = audioCtx();
    if (!c) return;
    var t0 = c.currentTime + start;
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.18, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.03);
  }
  function buzz(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* 무시 */ }
  }
  var NOTE = function (n) { return 440 * Math.pow(2, (n - 9) / 12); }; // n: C4=0
  // kind: tap | pop | right | wrong | done | goal | chime
  function sfx(kind, combo) {
    if (!state.profile || state.profile.sound === false) return;
    try {
      if (kind === 'tap') { tone(NOTE(19), 0, 0.05, 'triangle', 0.06); return; }
      if (kind === 'pop') { tone(NOTE(12), 0, 0.07, 'sine', 0.12); tone(NOTE(19), 0.06, 0.09, 'sine', 0.12); return; }
      if (kind === 'right') {
        var up = Math.min(Math.max(combo || 0, 0), 6) * 2;      // 연속 정답일수록 음이 올라가요
        tone(NOTE(12 + up), 0, 0.14, 'triangle', 0.2);
        tone(NOTE(16 + up), 0.1, 0.16, 'triangle', 0.2);
        tone(NOTE(19 + up), 0.2, 0.26, 'triangle', 0.2);
        buzz(25); return;
      }
      if (kind === 'wrong') {
        tone(NOTE(4), 0, 0.16, 'sawtooth', 0.09);
        tone(NOTE(0), 0.13, 0.26, 'sawtooth', 0.09);
        buzz([40, 50, 40]); return;
      }
      if (kind === 'chime') { [0, 4, 7, 12, 16, 19, 24].forEach(function (n, i) { tone(NOTE(12 + n), i * 0.055, 0.22, 'sine', 0.14); }); tone(NOTE(43), 0.4, 0.35, 'triangle', 0.08); buzz([10, 30, 14]); return; }
      if (kind === 'done') { [0, 4, 7, 12].forEach(function (n, i) { tone(NOTE(12 + n), i * 0.11, 0.3, 'triangle', 0.2); }); buzz([30, 40, 30]); return; }
      if (kind === 'goal') { [0, 4, 7, 12, 16, 19].forEach(function (n, i) { tone(NOTE(12 + n), i * 0.09, 0.34, 'triangle', 0.2); }); buzz([40, 40, 40, 40, 80]); }
    } catch (e) { /* 소리가 안 나도 앱은 계속 */ }
  }

  /* ---------- 확인 팝업 (앱 화면과 같은 시트 디자인) ---------- */
  function askConfirm(opts, onOk, onNo) {
    state.modal = { title: opts.title, body: opts.body, ok: opts.ok || '확인', cancel: opts.cancel || '취소', danger: !!opts.danger, left: !!opts.left, m: opts.m || 'ask', onOk: onOk, onNo: onNo };
    render();
  }
  function closeModal() { state.modal = null; render(); }
  function modalHtml() {
    var m = state.modal;
    if (!m) return '';
    return '<div class="scrim modal" data-act="modal-cancel" aria-hidden="true"></div>' +
      '<div class="dialog" role="alertdialog" aria-modal="true" aria-label="' + esc(m.title) + '">' + mascot(m.m, 'm') +
      '<h3>' + esc(m.title) + '</h3><p' + (m.left ? ' class="left"' : '') + '>' + esc(m.body) + '</p>' +
      '<div class="btns"><button class="btn' + (m.danger ? ' danger' : '') + '" data-act="modal-ok">' + esc(m.ok) + '</button>' +
      '<button class="btn gray" data-act="' + (m.onNo ? 'modal-no' : 'modal-cancel') + '">' + esc(m.cancel) + '</button></div></div>';
  }
  // 추천 주제 칩이 2줄을 넘을 때만 '더보기'를 보여요
  function fitChips() {
    var c = $app.querySelector && $app.querySelector('.ai-hero-chips'), b = $app.querySelector && $app.querySelector('.ai-chips-more');
    if (!c || !b) return;
    c.style.maxHeight = '';
    var top0 = c.getBoundingClientRect().top, kids = Array.prototype.slice.call(c.children).map(function (k) {
      var r = k.getBoundingClientRect(); return { t: Math.round(r.top - top0), b: r.bottom - top0 };
    }), tops = [];
    kids.forEach(function (k) { if (tops.indexOf(k.t) < 0) tops.push(k.t); });
    var many = tops.length > 2;
    if (state.aiChipsOpen) { b.hidden = !many; return; }
    if (many) {   // 정확히 2줄만 보이게 (2번째 줄 끝에서 자르고, 아래 여유 4px)
      var bottom = 0;
      kids.forEach(function (k) { if (k.t === tops[1]) bottom = Math.max(bottom, k.b); });
      c.style.maxHeight = Math.ceil(bottom + 4) + 'px';
    }
    b.hidden = !many;
  }
  window.addEventListener('resize', fitChips);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitChips);
  function fitGreet() {
    var h = $app.querySelector && $app.querySelector('.home-greet h1');
    if (!h) return;
    var box = h.parentElement, gls = h.querySelectorAll('.gl'), i, w = 0;
    h.style.fontSize = '';
    var base = parseFloat(getComputedStyle(h).fontSize) || 32;
    for (i = 0; i < gls.length; i++) w = Math.max(w, gls[i].getBoundingClientRect().width);
    var avail = box.clientWidth;
    if (w > avail && avail > 0) h.style.fontSize = (Math.floor(base * avail / w * 10) / 10 - 0.3) + 'px';
  }
  window.addEventListener('resize', fitGreet);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitGreet);
  // 탭 화면(홈·HSK 등)에서 아래에 가려진 게 없으면 위아래 스크롤을 막아요. 더 있으면 그대로 스크롤돼요
  var lockRaf = 0;
  function lockIfFits() {
    lockRaf = 0;
    var root = document.documentElement, s = document.querySelector('.scroll.with-nav'), nav = document.querySelector('.nav');
    var fit = false;
    if (s && nav && !document.querySelector('.td-bonus')) {
      var bottom = 0, i, r, ky = window.scrollY || 0;
      for (i = 0; i < s.children.length; i++) { r = s.children[i].getBoundingClientRect(); if (r.height) bottom = Math.max(bottom, r.bottom + ky); }
      fit = bottom + nav.offsetHeight + 12 <= window.innerHeight;
    }
    root.style.overflowY = fit ? 'hidden' : ''; document.body.style.overflowY = fit ? 'hidden' : '';
    if (fit && window.scrollY) window.scrollTo(0, 0);
  }
  function lockSoon() { if (!lockRaf) lockRaf = requestAnimationFrame(lockIfFits); }
  try {
    new MutationObserver(lockSoon).observe($app, { childList: true, subtree: true });
    window.addEventListener('resize', lockSoon);
    document.addEventListener('load', lockSoon, true);
  } catch (e) { /* 무시 */ }
  function render() {
    var html = '';
    if (state.screen === 'loading') html = viewLoading();
    else if (state.screen === 'login') html = viewLogin();
    else if (state.screen === 'tab') html = state.tab === 'lessons' ? viewLessons() : state.tab === 'review' ? viewAi() : (state.tab === 'words' ? viewWords() : (state.tab === 'me' ? viewMe() : viewHome()));
    else if (state.screen === 'intro') html = viewIntro();
    else if (state.screen === 'practice') html = viewPractice();
    else if (state.screen === 'quiz') html = viewQuiz();
    else if (state.screen === 'gram') html = viewGram();
    else if (state.screen === 'stats') html = viewStats();
    else if (state.screen === 'hsk') html = viewHsk();
    else if (state.screen === 'feedback') html = viewFeedback();
    else if (state.screen === 'privacy') html = viewPrivacy();
    else if (state.screen === 'about') html = viewAbout();
    else if (state.screen === 'advisor') html = viewAdvisor();
    else if (state.screen === 'account') html = viewAccount();
    else if (state.screen === 'coupon') html = viewCoupon();
    else if (state.screen === 'aicharge') html = viewAiCharge();
    else if (state.screen === 'aiall') html = viewAiAll();
    else if (state.screen === 'phrases') html = viewPhrases();
    else if (state.screen === 'aichats') html = viewChatAll();
    else if (state.screen === 'aichatlog') html = viewChatLog();
    else if (state.screen === 'prefs') html = viewPrefs();
    else if (state.screen === 'aichat') html = viewAiChat();
    else if (state.screen === 'pay') html = viewPay();
    else if (state.screen === 'speed') html = viewSpeed();
    else if (state.screen === 'hskstudy') html = viewHskStudy();
    else if (state.screen === 'tone') html = viewTone();
    else if (state.screen === 'scene') html = viewScene();
    else if (state.screen === 'chain') html = viewChain();
    else if (state.screen === 'scenes') html = viewScenes();
    else if (state.screen === 'rain') html = viewRain();
    else if (state.screen === 'done') html = viewDone();
    $app.innerHTML = html + modalHtml();
    if (state.screen === 'rain') rnAttach();
    fitGreet();
    fitChips();
    if (state.screen === 'aiall' && !state.aiallHint) {   // 처음 들어오면 첫 카드가 살짝 밀렸다 돌아와서 삭제 방법을 알려 줘요
      var fs = $app.querySelector('.fixswipe');
      if (fs) { state.aiallHint = true; fs.classList.add('hint'); fs.firstChild && fs.lastChild.addEventListener('animationend', function () { fs.classList.remove('hint'); }); }
    }
    if (backAnim) {
      backAnim = false;
      var scr = $app.querySelector && $app.querySelector('.screen');
      if (scr) scr.classList.add('slide-in-left');
    }
    if (state.screen === 'tab' && state.tab === 'me' && state.editNick) {
      var ni = document.getElementById('nick');
      if (ni) { ni.focus(); try { ni.setSelectionRange(ni.value.length, ni.value.length); } catch (e) { /* 무시 */ } }
    }
    if (state.screen === 'practice' && state.s.typing && state.s.phase === 'ask') {
      var inp = document.getElementById('typed');
      if (inp) inp.focus();
    }
  }

  /* ---------- 학습 통계 · 약점 분석 ---------- */
  // 문장 속 표현으로 문제 유형을 나눠요 (한 문제가 여러 유형에 속할 수 있어요)
  var TAGS = [
    { k: 'num', name: '숫자 · 시간 · 나이', re: /[二三四五六七八九十百千两]\s*(点|岁|块|个|月|号|分|年|层|楼|口|次|天|周)|星期|几点|几月|几号|几岁|多少|\d/ },
    { k: 'ask', name: '질문하기', re: /吗|呢|什么|哪|怎么|几|多少|谁|为什么|？|\?/, on: 'q' },
    { k: 'want', name: '바람 · 능력 · 허락 (想·要·会·能)', re: /想|要|会|能|可以|应该/ },
    { k: 'neg', name: '부정하기 (不·没)', re: /不|没/ },
    { k: 'asp', name: '완료 · 경험 · 진행 (了·过·着)', re: /了|过|着|正在/ },
    { k: 'cmp', name: '비교 · 把 · 被', re: /比|把|被|更|最|一样/ },
    { k: 'place', name: '장소 · 방향 · 교통', re: /在|去|到|左|右|前|后|旁边|对面|路|站|车|地铁|机场/ },
    { k: 'shop', name: '음식 · 쇼핑 · 돈', re: /吃|喝|菜|饭|钱|买|贵|便宜|杯|碗|块/ },
    { k: 'link', name: '이어 말하기 (因为·如果·然后)', re: /因为|所以|虽然|但是|如果|不但|而且|一边|然后|只要|先/ }
  ];
  var tagCache = {};
  function tagsOf(q) {
    if (tagCache[q.id]) return tagCache[q.id];
    var t = TAGS.filter(function (g) { return g.re.test(g.on === 'q' ? q.zh : q.zh + q.a.zh); }).map(function (g) { return g.k; });
    return (tagCache[q.id] = t);
  }
  function insight() {
    var rows = Object.keys(state.progress).filter(function (k) { return QMAP[k]; }).map(function (k) { return state.progress[k]; });
    var total = rows.reduce(function (n, r) { return n + r.correct + r.wrong; }, 0);
    var tags = TAGS.map(function (g) {
      var qs = rows.filter(function (r) { return tagsOf(QMAP[r.qid]).indexOf(g.k) >= 0; });
      var c = qs.reduce(function (n, r) { return n + r.correct; }, 0), w = qs.reduce(function (n, r) { return n + r.wrong; }, 0);
      return { k: g.k, name: g.name, n: qs.length, tries: c + w, wrong: w, rate: c + w ? w / (c + w) : 0 };
    }).filter(function (t) { return t.tries >= 6 && t.wrong > 0; }).sort(function (x, y) { return y.rate - x.rate; });
    var worst = rows.filter(function (r) { return r.wrong > 0; }).sort(function (x, y) { return y.wrong - x.wrong; }).slice(0, 5);
    return { total: total, tags: tags.slice(0, 3), worst: worst };
  }
  function startFocus(k) {
    var rows = Object.keys(state.progress).filter(function (id) { return QMAP[id] && tagsOf(QMAP[id]).indexOf(k) >= 0; }).map(function (id) { return state.progress[id]; });
    var weak = rows.filter(function (r) { return r.wrong > 0; });
    var pool = (weak.length >= 4 ? weak : rows).map(function (r) { return QMAP[r.qid]; });
    if (!pool.length) { toast('아직 연습한 문제가 없어요'); return; }
    beginSession('review', rounds(pool, 15));
  }
  function viewStats() {
    var learned = learnedLessons();
    var days = ['일', '월', '화', '수', '목', '금', '토'];
    var goal = state.profile.goal, vals = [], max = goal;
    for (var i = 6; i >= 0; i--) {
      var d = new Date(); d.setDate(d.getDate() - i);
      var r = state.daily[dayStr(d)], n = r ? r.answers : 0;
      vals.push({ n: n, label: days[d.getDay()], today: i === 0 });
      if (n > max) max = n;
    }
    var weekTotal = vals.reduce(function (s, v) { return s + v.n; }, 0);
    var activeDays = vals.filter(function (v) { return v.n > 0; }).length;
    var allAnswers = Object.keys(state.daily).reduce(function (s, k) { return s + (state.daily[k].answers || 0); }, 0);
    var ins = insight();
    var rows = Object.keys(state.progress).filter(function (k) { return QMAP[k]; }).map(function (k) { return state.progress[k]; });
    var correct = rows.reduce(function (s, r) { return s + r.correct; }, 0), wrong = rows.reduce(function (s, r) { return s + r.wrong; }, 0);
    var acc = correct + wrong ? Math.round(correct / (correct + wrong) * 100) : 0;
    var bars = vals.map(function (v) {
      var h = max ? Math.round(v.n / max * 100) : 0;
      return '<div class="bcol"><span class="bn">' + (v.n || '') + '</span><div class="btrack"><i class="' + (v.n >= goal ? 'hit' : '') + '" style="height:' + Math.max(h, v.n ? 6 : 0) + '%"></i></div><span class="bl' + (v.today ? ' t' : '') + '">' + v.label + '</span></div>';
    }).join('');
    var goalPos = max ? Math.round(goal / max * 100) : 0;
    var tagHtml;
    if (ins.total < 10 || !ins.tags.length) {
      tagHtml = emptyState('empty', { small: true, title: ins.total < 10 ? '조금 더 연습해 볼까요?' : '약한 유형이 없어요', desc: ins.total < 10 ? '문제를 10개 이상 풀면\n약한 유형을 알려 드려요' : '아직 눈에 띄게 약한 유형이 없어요.\n잘하고 있어요!' });
    } else {
      tagHtml = '<div class="ins">' + ins.tags.map(function (t) {
        var pct = Math.round(t.rate * 100);
        return '<div class="ins-row"><div class="ins-top"><b>' + esc(t.name) + '</b><span>' + pct + '% 틀렸어요</span></div>' +
          '<div class="meter"><i style="width:' + Math.max(pct, 4) + '%"></i></div>' +
          '<div class="ins-s">' + t.n + '문제 · ' + t.tries + '번 중 ' + t.wrong + '번 틀림</div>' +
          '<button class="pill-sm" data-act="focus-tag" data-id="' + t.k + '">이 유형 집중 연습</button></div>';
      }).join('') + '</div>';
    }
    var worstHtml = ins.worst.length ? '<div class="section-title" style="margin-top:24px">자주 틀린 문장 TOP ' + ins.worst.length + '</div><div class="words">' +
      ins.worst.map(function (r) {
        var q = QMAP[r.qid];
        return '<div class="prow"><button class="pmain" data-act="say" data-text="' + esc(q.a.zh) + '"><div class="zh p-zh2">' + esc(q.a.zh) + '</div><div class="py">' + esc(q.a.py) + '</div><div class="kr">' + esc(kr(q.a.py)) + '</div><div class="ko">' + esc(q.a.ko) + '</div></button>' +
          '<span class="chip soft">' + r.wrong + '번</span></div>';
      }).join('') + '</div>' : '';
    var hskHtml = HSKW[1] ? '<div class="section-title" style="margin-top:24px">HSK 급별 진도</div><div class="words">' + [1, 2, 3, 4].map(function (l) {
      var n = hskList(l).length, k = hskCount(l), pct = n ? Math.round(k / n * 100) : 0;
      return '<div class="lm"><div class="lm-top"><span>' + l + '급</span><b>' + k + '/' + n + '</b></div><div class="meter g"><i style="width:' + pct + '%"></i></div></div>';
    }).join('') + '</div>' : '';
    var weakLessons = learned.map(function (l) { return { l: l, pct: Math.round(mastered(l) / l.qs.length * 100) }; })
      .filter(function (x) { return x.pct < 100; }).sort(function (x, y) { return x.pct - y.pct; }).slice(0, 5);
    var lessonHtml = learned.length ? '<div class="section-title" style="margin-top:24px">다시 하면 좋은 레슨</div>' + (weakLessons.length
      ? '<p class="sub-title" style="margin:0 0 8px">익숙해진 문제가 적은 순서예요. 눌러서 다시 연습해요.</p><div class="words">' + weakLessons.map(function (x) {
        return '<button class="lm lm-btn" data-act="open-lesson" data-id="' + x.l.id + '"><div class="lm-top"><span>' + esc(x.l.title) + '</span><b>' + x.pct + '%</b></div><div class="meter g"><i style="width:' + Math.max(x.pct, 3) + '%"></i></div></button>';
      }).join('') + '</div>'
      : '<div class="chat-empty">끝낸 레슨의 문제를 모두 익혔어요!</div>') : '';
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll" style="padding-top:4px">' +
      '<h1 class="big-title" style="margin-top:0">학습 통계</h1><p class="sub-title">내 공부 흐름과 약한 부분이에요.</p>' +
      '<div class="stats" style="grid-template-columns:repeat(2,1fr)">' +
        '<div class="stat"><b>' + allAnswers + '</b><span>지금까지 푼 문제</span></div>' +
        '<div class="stat"><b>' + acc + '%</b><span>한 번에 맞힌 비율</span></div>' +
        '<div class="stat"><b>' + activeDays + '/7일</b><span>이번 주 공부한 날</span></div>' +
        '<div class="stat"><b>' + learned.length + '/' + LESSONS.length + '</b><span>배운 레슨</span></div>' +
      '</div>' +
      '<div class="section-title" style="margin-top:24px">최근 7일 푼 문제 · ' + weekTotal + '개</div>' +
      '<div class="chart"><div class="goalline" style="bottom:calc(' + goalPos + '% * 0.62 + 40px)"><span>목표 ' + goal + '</span></div><div class="bars">' + bars + '</div></div>' +
      hskHtml +
      '<div class="section-title" style="margin-top:24px">약점 분석</div>' + tagHtml + lessonHtml +
      '<div style="height:24px"></div></div></div>';
  }

  /* ---------- 스피드 퀴즈 (끝낸 레슨만, 5초 안에 대답하면 정답) ---------- */
  var SPEED_SIZE = 10, SPEED_SEC = 5;
  var spTimer = null, spWait = null, spRec = null, spLastIds = [];
  function stopSpeed() {
    clearTimeout(spTimer); clearTimeout(spWait); spTimer = spWait = null;
    if (spRec) { var r = spRec; spRec = null; try { r.onend = null; r.abort(); } catch (e) { /* 이미 멈춤 */ } }
    stopSpeak();
  }
  function speedOptions(q) {
    var seen = {}, d = [];
    shuffle(learnedQs().filter(function (x) { return x.a && x.a.zh !== q.a.zh; })).forEach(function (x) {
      if (d.length < 3 && !seen[x.a.zh]) { seen[x.a.zh] = 1; d.push({ zh: x.a.zh, py: x.a.py, ok: false }); }
    });
    return shuffle(d.concat([{ zh: q.a.zh, py: q.a.py, ok: true }]));
  }
  function startSpeed(lid) {
    if (speedLocked()) { go('pay', { payWhy: '스피드 퀴즈 무료 체험(1회)을 모두 썼어요. 계속하려면 멤버십이 필요해요.' }); return; }
    var pool = lid && lessonById(lid) ? lessonById(lid).qs : learnedQs();
    if (pool.length < 5) { toast('레슨을 하나 끝내면 열려요'); return; }
    stopSpeed();
    var base = [];
    // 누를 때마다 새로 랜덤 10문제: 지난번에 나온 문제는 뒤로 미뤄서 최대한 겹치지 않게 해요
    var fresh = shuffle(pool.filter(function (q) { return spLastIds.indexOf(q.id) < 0; }));
    var seen = shuffle(pool.filter(function (q) { return spLastIds.indexOf(q.id) >= 0; }));
    var ordered = fresh.concat(seen);
    while (base.length < SPEED_SIZE) {   // 끝낸 레슨의 문제가 적어도 10문제를 채워요
      var more = mixLessons(base.length ? shuffle(pool) : ordered, SPEED_SIZE - base.length);
      if (base.length && more.length > 1 && more[0].id === base[base.length - 1].id) more.push(more.shift());
      base = base.concat(more);
    }
    spLastIds = base.map(function (q) { return q.id; });
    var items = base.map(function (q) {
      var vs = window.Variants ? Variants.all(q) : [q];
      return vs[Math.floor(Math.random() * vs.length)];
    });
    state.sp = { items: items, i: 0, right: 0, combo: 0, best: 0, phase: 'ready', showKo: false, marks: [], tok: 0, ok: false, heard: '', opts: null,
      voice: !!(window.SpeechRecognition || window.webkitSpeechRecognition) && state.profile.input !== 'type', before: todayAnswers(), lessons: learnedLessons().length, lid: lid || '' };
    go('speed');
  }
  function speedAsk() {
    var sp = state.sp, q = sp.items[sp.i];
    stopSpeed();
    sp.tok++; var tok = sp.tok;
    sp.phase = 'ask'; sp.ok = false; sp.heard = ''; sp.picked = null; sp.showKo = false;
    sp.opts = sp.voice ? null : speedOptions(q);
    render();
    var started = false;
    var begin = function () {
      if (started || state.sp !== sp || sp.tok !== tok || sp.phase !== 'ask') return;
      started = true; clearTimeout(spWait); speedRun();
    };
    spWait = setTimeout(begin, 4500);   // 읽어 주는 소리가 안 끝나도 이때는 시작해요
    speak(q.zh, 0.9, begin);
  }
  function speedRun() {
    var sp = state.sp, tok = sp.tok;
    sp.phase = 'run'; sp.end = Date.now() + SPEED_SEC * 1000;
    render();
    if (sp.voice) speedListen(sp, tok);
    speedTick(sp, tok);
  }
  function speedTick(sp, tok) {
    if (state.sp !== sp || sp.tok !== tok || sp.phase !== 'run') return;
    var left = Math.max(0, sp.end - Date.now());
    var bar = document.getElementById('sq-bar'), num = document.getElementById('sq-left');
    if (bar) bar.style.width = (left / (SPEED_SEC * 1000) * 100) + '%';
    if (num) num.textContent = Math.max(1, Math.ceil(left / 1000));
    if (left <= 0) { speedEnd(sp, false, ''); return; }
    spTimer = setTimeout(function () { speedTick(sp, tok); }, 80);
  }
  function speedListen(sp, tok) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition, q = sp.items[sp.i], denied = false;
    var alive = function () { return state.sp === sp && sp.tok === tok && sp.phase === 'run'; };
    var one = function () {
      if (!alive() || spRec) return;
      var r = new SR(); spRec = r;
      r.lang = 'zh-CN'; r.interimResults = true; r.maxAlternatives = 3; r.continuous = false;
      r.onresult = function (e) {
        if (!alive()) return;
        var res = e.results[e.results.length - 1], list = [];
        for (var i = 0; i < res.length; i++) list.push(res[i].transcript);
        sp.heard = list[0] || '';
        var el = document.getElementById('sq-heard'); if (el) el.textContent = sp.heard;
        var g = Grade.check(q, list);
        if (g.pass) speedEnd(sp, true, g.heard);
      };
      r.onerror = function (e) { if (e && (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture')) denied = true; };
      r.onend = function () {
        if (spRec === r) spRec = null;
        if (!alive()) return;
        if (denied) {   // 마이크를 못 쓰면 보기 고르기로 바꿔요
          sp.voice = false; sp.opts = speedOptions(q); render();
          toast('마이크를 쓸 수 없어 보기 고르기로 바꿨어요');
          return;
        }
        setTimeout(one, 120);
      };
      try { r.start(); } catch (err) { spRec = null; }
    };
    one();
  }
  function speedEnd(sp, ok, heard) {
    if (state.sp !== sp || sp.phase !== 'run') return;
    var q = sp.items[sp.i];
    clearTimeout(spTimer); spTimer = null;
    if (spRec) { var r = spRec; spRec = null; try { r.onend = null; r.abort(); } catch (e) { /* 이미 멈춤 */ } }
    sp.phase = 'result'; sp.ok = ok; sp.marks[sp.i] = !!ok; if (heard) sp.heard = heard;
    if (ok) { sp.right++; sp.combo++; sp.best = Math.max(sp.best, sp.combo); sfx('right', sp.combo); } else { sp.combo = 0; sfx('wrong'); }
    bumpAnswer();
    render();
    if (ok) setTimeout(function () { if (state.sp === sp && sp.phase === 'result') speak(q.a.zh); }, 250);
  }
  function speedNext() {
    var sp = state.sp;
    if (sp.i + 1 >= sp.items.length) { finishSpeed(); return; }
    sp.i++; speedAsk();
  }
  function finishSpeed() {
    if (!isPro()) { state.profile.speedUsed = (state.profile.speedUsed || 0) + 1; store.saveProfile(); }
    var sp = state.sp, goal = state.profile.goal, now = todayAnswers();
    var hit = sp.before < goal && now >= goal, n = sp.items.length;
    stopSpeed();
    sfx(hit ? 'goal' : 'done');
    var score = Math.round(sp.right / n * 100);
    var missed = [];
    sp.items.forEach(function (q, k) { if (!sp.marks[k]) missed.push({ zh: q.a.zh, py: q.a.py, ko: q.a.ko }); });
    go('done', { result: {
      kind: 'speed', title: score + '점!',
      score: score, total: n, right: sp.right, best: sp.best, marks: sp.items.map(function (q, k) { return !!sp.marks[k]; }), missed: missed,
      line: score === 100 ? '전부 ' + SPEED_SEC + '초 안에 답했어요. 대단해요!' : score >= 70 ? '반응이 빨라요. 조금만 더 하면 만점이에요!' : score >= 40 ? '절반 가까이 맞혔어요. 한 번 더 하면 더 빨라질 거예요.' : '아직 입에 붙는 중이에요. 천천히, 한 번 더 해 봐요.',
      answers: now, goal: goal, goalHit: hit, milestone: 0,
      again: { act: 'speed-start', id: sp.lid || '', label: '새 10문제 계속하기' }
    } });
  }
  function speedKo(sp, text, cls) {
    return sp.showKo ? '<div class="' + cls + '">' + esc(text) + '</div>' : '<button class="ko-peek" data-act="speed-ko">뜻 보기</button>';
  }
  function viewSpeed() {
    var sp = state.sp, q = sp.items[sp.i], n = sp.items.length;
    var answered = sp.i + (sp.phase === 'result' ? 1 : 0), pct = Math.round(answered / n * 100);
    var top = '<div class="topbar"><button class="icon-btn" data-act="speed-quit" aria-label="그만하기">' + I.close + '</button>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
      '<span class="chip" style="min-width:48px;justify-content:center">' + answered + '/' + n + '</span></div>';
    if (sp.phase === 'ready') {
      return '<div class="screen">' + top + '<div class="sq-intro">' + mascot('thumbs', 'sq-m') +
        '<h1 class="big-title">스피드 퀴즈</h1>' +
        '<p>끝낸 레슨에서 랜덤으로 질문이 나와요.<br>' + SPEED_SEC + '초 안에 바로 대답하면 정답이에요!</p>' +
        '<div class="chips"><span class="chip soft">' + sp.lessons + '개 레슨에서</span><span class="chip soft">' + n + '문제</span><span class="chip y">' + SPEED_SEC + '초</span></div>' +
        (sp.voice ? '' : '<p class="sq-note">' + (state.profile.input === 'type' ? '야외 모드라서 알맞은 대답을 고르는 방식으로 해요.' : '이 기기는 말하기 인식을 지원하지 않아서 알맞은 대답을 고르는 방식으로 해요.') + '</p>') +
        '</div><div class="footer"><button class="btn" data-act="speed-go">시작하기</button></div></div>';
    }
    var l = lessonById(q.lessonId);
    var running = sp.phase === 'run';
    var body = '<div class="q-wrap"><div class="q-head"><span class="chip soft">' + esc(l ? l.title : '') + '</span></div>' +
      '<div class="q-zh">' + esc(q.zh) + '</div><div class="q-py">' + esc(q.py) + '</div><div class="q-kr">' + esc(kr(q.py)) + '</div>' +
      speedKo(sp, q.ko, 'q-ko');
    if (sp.phase !== 'result') {
      body += '<div class="sq-timer" aria-hidden="true"><i id="sq-bar" style="width:100%"></i></div>' +
        '<div class="sq-status">' + (running ? '<b id="sq-left">' + SPEED_SEC + '</b>초 · 지금 대답하세요!' : '문장을 듣고 있어요…') + '</div>';
      if (running && sp.voice) body += '<div class="sq-mic"><span>' + I.mic + '</span></div><div id="sq-heard" class="sq-heard"></div>';
      if (running && !sp.voice && sp.opts) {
        body += '<div class="qz-opts">' + sp.opts.map(function (o, i) {
          return '<button class="opt" data-act="speed-pick" data-id="' + i + '"><span class="sq-ozh">' + esc(o.zh) + '</span><span class="sq-opy">' + esc(o.py) + '</span></button>';
        }).join('') + '</div>';
      }
    }
    body += '</div>';
    var sheet = '';
    if (sp.phase === 'result') {
      var last = sp.i + 1 >= n;
      var ans = '<div class="answer"><div class="body"><div class="py" style="margin-bottom:4px">예시 답안</div><div class="zh">' + esc(q.a.zh) + '</div><div class="py">' + esc(q.a.py) +
        '</div><div class="kr">' + esc(kr(q.a.py)) + '</div>' + (sp.showKo ? '<div class="ko a-ko">' + esc(q.a.ko) + '</div>' : '') + '</div><button class="round-btn" data-act="speed-hear" aria-label="정답 듣기">' + I.spk + '</button></div>';
      sheet = sp.ok
        ? '<div class="sheet ok" role="status">' + mascot('love', 'm') + '<div class="head"><span class="badge">' + I.check + '</span>' + SPEED_SEC + '초 안에 성공!' + (sp.combo >= 2 ? '<span class="combo">연속 ' + sp.combo + '번</span>' : '') + '</div>' +
          (sp.heard ? '<div class="heard">내가 한 말 <span class="zh">' + esc(sp.heard) + '</span></div>' : '') + ans +
          '<div class="btns"><button class="btn green" data-act="speed-next">' + (last ? '결과 보기' : '다음 문제') + '</button></div></div>'
        : '<div class="sheet no" role="status">' + mascot('cheer', 'm') + '<div class="head"><span class="badge">' + I.x + '</span>아쉬워요, 시간 끝!</div>' +
          '<div class="heard">' + (sp.heard ? '들린 말 <span class="zh">' + esc(sp.heard) + '</span>' : '대답이 들리지 않았어요') + '</div>' + ans +
          '<div class="btns"><button class="btn" data-act="speed-next">' + (last ? '결과 보기' : '다음 문제') + '</button></div></div>';
    }
    return '<div class="screen">' + top + body + sheet + '</div>';
  }

  /* ---------- 의견 보내기 (Supabase feedback — 관리자는 대시보드에서만 확인) ---------- */
  var FB_CATS = [['idea', '아이디어'], ['bug', '불편·오류'], ['praise', '칭찬'], ['etc', '기타']];
  var FB_MAX = 1000, fbLast = 0;
  function viewPay() {
    var m = memberLabel(), pro = isPro() && !state.entErr;
    var why = state.payWhy ? '<div class="pay-why">' + esc(state.payWhy) + '</div>' : '';
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll" style="padding-top:4px">' +
      '<h1 class="big-title" style="margin-top:0">팽팽이랑 오래 공부하기</h1>' +
      '<p class="sub-title">1~' + FREE_LESSONS + '강, HSK 1급은 무료예요. 멤버십이면 이렇게 쓸 수 있어요.</p>' + why +
      (pro ? '<div class="pay-status"><b>' + esc(m.t) + '</b><span>' + esc(m.s) + '</span></div>' : '') +
      '<ul class="perks">' +
        '<li>' + I.check + LESSONS.length + '강 전체 레슨 <em class="perk-tag">계속 업데이트돼요</em></li>' +
        '<li>' + I.check + '개정된 신 HSK 3.0 · 1~4급 단어 <em class="perk-tag">최신 개정판</em></li>' +
        '<li>' + I.check + '스피드 퀴즈 무제한</li>' +
        '<li>' + I.check + '복습 알림 · 1분 중국어 알림</li>' +
        '<li>' + I.check + 'AI 대화 · 매달 15크레딧 지급</li>' +
      '</ul>' +
      (pro ? '' : '<div class="plans">' +
        '<div class="plan best"><span class="pl-badge">가장 추천</span><div class="pl-n">1년 이용 + 2개월 무료</div>' +
          '<div class="pl-was"><s>' + won(WAS_YEAR) + '</s><span class="pl-off">' + offPct(WAS_YEAR, PRICE_LIFE) + '% 할인</span></div>' +
          '<div class="pl-p">' + won(PRICE_LIFE) + '<small>14개월 이용</small></div>' +
          '<div class="pl-s">월 구독 12개월 값보다 저렴하고, 2개월은 덤이에요.<br>한 번 결제로 14개월 쓰고, 자동 갱신은 없어요.</div>' +
          '<button class="btn pl-main" data-act="buy" data-id="yearly">1년 + 2개월 시작하기</button></div>' +
        '<div class="plan"><div class="pl-n">월 구독</div><div class="pl-was"><s>' + won(WAS_MONTH) + '</s><span class="pl-off">' + offPct(WAS_MONTH, PRICE_MONTH) + '% 할인</span></div><div class="pl-p">' + won(PRICE_MONTH) + '<small>/월</small></div><div class="pl-s">커피 한 잔보다 저렴하게, 한 달씩 언제든 그만둘 수 있어요</div>' +
          '<button class="btn soft" data-act="buy" data-id="monthly">월 구독 시작하기</button></div>' +
      '</div>') +
      '<div class="notice pay-test"><span>지금은 테스트모드입니다. 결제가 되지 않아요.</span>' +
        (state.ent ? '<button class="btn sm soft" data-act="test-reset">복구하기</button>' : '') + '</div>' +
      '<div style="height:24px"></div>' +
      '</div></div>';
  }
  function viewCoupon() {
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll" style="padding-top:4px"><h1 class="big-title" style="margin-top:0">쿠폰 등록</h1>' +
      '<p class="sub-title">쿠폰 번호를 입력하면 1개월 동안 모든 레슨을 쓸 수 있어요.</p>' +
      '<div class="coupon-row"><input id="coupon" class="coupon-in" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="쿠폰 번호 입력" aria-label="쿠폰 번호">' +
      '<button class="btn sm" data-act="coupon-redeem">등록</button></div>' +
      '<p class="coupon-help">이미 이용 중이면 남은 기간 뒤에 이어서 붙어요.</p>' +
      '</div></div>';
  }
  var COUPON_ERR = {
    invalid_coupon: '쿠폰 번호를 다시 확인해 주세요',
    already_used: '이미 사용한 쿠폰이에요',
    already_lifetime: '이미 평생 이용 중이라 쿠폰이 필요 없어요',
    too_many_attempts: '시도가 너무 많아요. 한 시간 뒤에 다시 해 주세요',
    test_mode_off: '아직 결제를 준비 중이에요'
  };
  function needLoginPay() {
    if (!isGuest()) return false;
    var back = state.screen === 'coupon' ? 'coupon' : 'pay';
    requireLogin('pay', function () { go(back); });
    return true;
  }
  async function buyPlan(plan) {
    if (needLoginPay()) return;
    if (isPro() && !state.entErr) { toast('이미 이용 중이에요'); render(); return; }
    try {
      var res = await sb.rpc('test_purchase', { p_plan: plan });
      if (res.error) throw res.error;
      var d = res.data || {};
      if (!d.ok) { toast(COUPON_ERR[d.error] || '결제하지 못했어요'); return; }
      await loadEnt();
      state.payWhy = null;
      render();
      toast(plan === 'yearly' ? '14개월 이용이 시작됐어요 (테스트)' : '월 구독이 시작됐어요 (테스트)');
    } catch (e) { if (window.console) console.error(e); toast('처리하지 못했어요. 잠시 후 다시 시도해 주세요'); }
  }
  // 테스트용: 이용권을 지우고 무료 상태로 되돌려요 (서버가 테스트 모드일 때만 허용)
  async function resetPlan() {
    if (needLoginPay()) return;
    try {
      var res = await sb.rpc('test_reset');
      if (res.error) throw res.error;
      var d = res.data || {};
      if (!d.ok) { toast(COUPON_ERR[d.error] || '복구하지 못했어요'); return; }
      await loadEnt();
      render();
      toast('무료 버전으로 돌아왔어요');
    } catch (e) { if (window.console) console.error(e); toast('복구하지 못했어요. 잠시 후 다시 시도해 주세요'); }
  }
  async function redeemCoupon() {
    if (needLoginPay()) return;
    var inp = document.getElementById('coupon');
    var code = inp ? inp.value.trim() : '';
    if (!code) { toast('쿠폰 번호를 입력해 주세요'); return; }
    try {
      var res = await sb.rpc('redeem_coupon', { p_code: code });
      if (res.error) throw res.error;
      var d = res.data || {};
      if (!d.ok) { toast(COUPON_ERR[d.error] || '쿠폰을 등록하지 못했어요'); return; }
      await loadEnt();
      state.payWhy = null;
      go('prefs');
      toast('쿠폰이 등록됐어요. ' + fmtDate(d.expires_at) + '까지 이용할 수 있어요');
    } catch (e) { if (window.console) console.error(e); toast('처리하지 못했어요. 잠시 후 다시 시도해 주세요'); }
  }
  var PRIVACY = [
    ['수집하는 정보', 'Google 로그인 시 이메일 주소와 계정 식별값을 받아요. 앱을 쓰는 동안 닉네임, 하루 목표, 화면·소리 설정, 즐겨찾기 같은 설정과 학습 기록(푼 문제, 완료한 레슨, 하루 학습량, 복습 일정, 이어하기 위치)이 저장돼요. 의견 보내기를 쓰면 내용·이메일·앱 버전이, 오류가 나면 오류 내용과 기기·브라우저 정보가 함께 저장될 수 있어요.'],
    ['이용 목적', '로그인 유지, 학습 기록 저장과 기기 간 동기화, 복습 알림 발송, 앱 개선과 오류 수정에만 써요. 광고에 쓰거나 다른 곳에 팔지 않아요.'],
    ['마이크와 음성', '말하기 연습은 마이크와 기기(브라우저)의 음성 인식 기능을 써요. 팽팽이는 녹음 파일을 저장하지 않아요. 다만 음성 인식은 기기 제조사나 브라우저 회사(예: Google)의 서버에서 처리될 수 있어요.'],
    ['알림', '복습 알림을 켜면 알림을 보내기 위한 기기 주소(푸시 구독 정보)와 알림 시간이 저장돼요. 설정에서 언제든 끌 수 있어요.'],
    ['이 기기에 저장되는 정보', '로그인 전에 한 학습, 이어하기 기록, 설정은 이 기기의 브라우저 저장공간에 보관돼요. 로그인하면 계정으로 옮겨져요.'],
    ['맡겨 두는 곳', '로그인과 데이터 저장은 Supabase, 앱 배포는 GitHub Pages, 로그인 인증은 Google을 이용해요. 각 서비스의 서버는 해외에 있을 수 있어요.'],
    ['보관과 삭제', '정보는 계정을 유지하는 동안 보관해요. 마이 화면의 “계정 삭제”를 누르면 계정과 학습 기록, 설정, 알림 구독이 바로 삭제되고 되돌릴 수 없어요. 이미 보낸 의견·오류 기록은 개인을 알아볼 수 없는 상태로 남을 수 있어요.'],
    ['문의', '궁금한 점이나 삭제·정정 요청은 마이 화면의 “의견 보내기”로 남겨 주세요.']
  ];
  function viewAccount() {
    var email = state.user && state.user.email ? state.user.email : '';
    var m = memberLabel();
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll" style="padding-top:4px"><h1 class="big-title" style="margin-top:0">계정 관리</h1>' +
      '<p class="sub-title">내 계정 정보예요.</p>' +
      '<div class="set-card">' +
        '<div class="set-row"><div class="set-t">로그인 계정</div><div class="set-v acc-v">' + esc(email || 'Google 계정') + '</div></div>' +
        '<div class="set-row"><div class="set-t">멤버십</div><div class="set-v acc-v">' + esc(m.t) + '</div></div>' +
      '</div>' +
      '<div class="acc-danger"><div class="acc-t">계정 삭제</div>' +
        '<p>계정과 모든 학습 기록, 설정, 알림 구독이 바로 삭제돼요. 삭제한 뒤에는 되돌릴 수 없어요.' + (isPro() && !state.entErr && state.ent ? ' 이용 중인 멤버십도 함께 사라져요.' : '') + '</p>' +
        '<button class="btn gray acc-del" data-act="delete-account">계정 삭제하기</button></div>' +
      '</div></div>';
  }
  function viewPrivacy() {
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll legal" style="padding-top:4px"><h1 class="big-title" style="margin-top:0">개인정보처리방침</h1>' +
      '<p class="sub-title">시행일 2026년 10월 18일</p>' +
      PRIVACY.map(function (x, i) { return '<h2>' + (i + 1) + '. ' + esc(x[0]) + '</h2><p>' + esc(x[1]) + '</p>'; }).join('') +
      '</div></div>';
  }
  async function deleteAccount() {
    var uid = state.user && state.user.id;
    var res = await sb.rpc('delete_my_account');
    if (res.error) { toast('삭제하지 못했어요. 잠시 후 다시 시도해 주세요'); return; }
    stopSpeak();
    try {
      if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistration) {
        var reg = await navigator.serviceWorker.getRegistration();
        var sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
        if (sub) await sub.unsubscribe();
      }
    } catch (e) { /* 알림 구독 해제는 못 해도 넘어가요 */ }
    try { await sb.auth.signOut({ scope: 'local' }); } catch (e) { /* 이미 지워진 계정이라 실패할 수 있어요 */ }
    try {
      localStorage.removeItem(LOCAL_KEY); localStorage.removeItem(GUEST_KEY);
      var m = readResume();
      Object.keys(m).forEach(function (k) { if (k.indexOf(uid + '|') === 0) delete m[k]; });
      writeResume(m);
    } catch (e) {}
    state.user = { id: 'guest', email: '' }; state.ent = null;
    await store.load();
    state.tab = 'home';
    go('tab', { tab: 'home' });
    toast('계정을 삭제했어요');
  }
  function viewFeedback() {
    var f = state.fb || (state.fb = { cat: 'idea', text: '', sending: false, sent: false });
    var top = '<div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>';
    if (f.sent) {
      return '<div class="screen">' + top + '<div class="scroll" style="padding-top:4px">' +
        emptyState('empty', { title: '의견 고마워요!', desc: '보내 주신 이야기를 꼼꼼히 읽고\\n앱에 반영해 볼게요.', badge: null, cta: { act: 'fb-done', label: '확인' } }) +
        '</div></div>';
    }
    var can = !!sb && !f.sending && f.text.trim().length >= 5;
    return '<div class="screen">' + top + '<div class="scroll" style="padding-top:4px">' +
      '<h1 class="big-title" style="margin-top:0">의견 보내기</h1>' +
      '<p class="sub-title">불편한 점이나 바라는 점을 편하게 남겨 주세요.</p>' +
      (sb ? '' : '<div class="notice" style="margin-bottom:12px">미리보기 모드에서는 의견을 보낼 수 없어요. Google 로그인 후 이용해 주세요.</div>') +
      seg('fb-cat', f.cat, FB_CATS) +
      '<textarea id="fb-text" class="fb-text" maxlength="' + FB_MAX + '" placeholder="예: 이런 레슨이 있으면 좋겠어요 / 이 화면에서 이런 점이 불편했어요" aria-label="의견 내용">' + esc(f.text) + '</textarea>' +
      '<div class="fb-meta"><span id="fb-count">' + f.text.length + '/' + FB_MAX + '</span><span>앱 버전 ' + APP_VERSION + '이 함께 전달돼요</span></div>' +
      '<button id="fb-send" class="btn" data-act="fb-send"' + (can ? '' : ' disabled') + '>' + (f.sending ? '보내는 중…' : '보내기') + '</button>' +
      '<p style="margin:10px 4px 0;font-size:13px;color:var(--ink-3)">계정 이메일과 닉네임이 함께 저장되며, 운영자만 볼 수 있어요.</p>' +
      '<div style="height:24px"></div></div></div>';
  }
  async function sendFeedback() {
    var f = state.fb;
    if (!f || f.sending || !sb || !state.user) return;
    var msg = f.text.trim();
    if (msg.length < 5) { toast('조금만 더 자세히 적어 주세요'); return; }
    if (Date.now() - fbLast < 20000) { toast('잠시 후 다시 보내 주세요'); return; }
    f.sending = true; render();
    try {
      var res = await sb.from('feedback').insert({
        category: f.cat, message: msg.slice(0, FB_MAX), nickname: nickname() || null,
        email: state.user.email || null, version: APP_VERSION
      });
      if (res && res.error) throw res.error;
      fbLast = Date.now(); f.sending = false; f.sent = true; f.text = '';
      render();
    } catch (err) {
      f.sending = false; render();
      toast('보내지 못했어요. 네트워크를 확인하고 다시 시도해 주세요');
      reportError('feedback: ' + (err && err.message), err && err.stack);
    }
  }
  // 키보드로 입력할 때: 위쪽 내용은 그대로 보이게 하고, 부가 버튼은 숨겨요
  var KB_IDS = { 'ai-topic': 1, 'ai-fu-in': 1, typed: 1, 'ac-in': 1, 'ac-ko-in': 1, 'ac-topic': 1 };
  document.addEventListener('focusin', function (e) {
    var id = e.target && e.target.id;
    if (!id || !KB_IDS[id]) return;
    document.body.classList.add('kb');
    if (id === 'typed') [0, 250, 600].forEach(function (ms) { setTimeout(function () { if (document.activeElement && document.activeElement.id === 'typed') window.scrollTo(0, 0); }, ms); });
  });
  // 키보드가 올라오면 화면 높이를 '보이는 영역'에 맞춰요 (안 그러면 위쪽 내용이 화면 밖으로 밀려요)
  (function () {
    var vv = window.visualViewport; if (!vv) return;
    function fit() {
      document.documentElement.style.setProperty('--vvh', Math.round(vv.height) + 'px');
      if (document.body.classList.contains('kb')) { window.scrollTo(0, 0); }
    }
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', function () { if (document.body.classList.contains('kb') && vv.offsetTop > 0) window.scrollTo(0, 0); });
    fit();
  })();
  document.addEventListener('focusout', function () {
    setTimeout(function () { var ae = document.activeElement; if (!ae || !KB_IDS[ae.id]) document.body.classList.remove('kb'); }, 150);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.isComposing !== true) {
      if (e.target.id === 'ac-in') { e.preventDefault(); acSend(); }
      else if (e.target.id === 'ac-topic') { e.preventDefault(); acStart(); }
      else if (e.target.id === 'ai-topic') { e.preventDefault(); var gb = document.querySelector('[data-act="ai-go"]'); if (gb && !gb.disabled) gb.click(); }
      else if (e.target.id === 'ac-ko-in') { e.preventDefault(); var kb = document.querySelector('[data-act="ac-ko-send"]'); if (kb) kb.click(); }
    }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t && t.id === 'ai-topic') {
      state.acTopic = String(t.value || '');
      var oc = document.querySelectorAll('.ai-chip.on');
      for (var oi = 0; oi < oc.length; oi++) oc[oi].classList.toggle('on', oc[oi].textContent === state.acTopic);
      return;
    }
    if (t && t.id === 'ac-topic' && state.ac) {
      state.ac.topic = String(t.value || '');
      var go1 = document.getElementById('ac-go');
      if (go1) go1.disabled = !(aiBal() >= AI_CHAT_COST && state.ac.topic.trim().length >= 2 && !state.ac.busy);
      var chipsOn = document.querySelectorAll ? document.querySelectorAll('.ac-chip.on') : [];
      for (var ci = 0; ci < chipsOn.length; ci++) chipsOn[ci].classList.remove('on');
      return;
    }
    if (t && t.id === 'ac-ko-in' && state.ac) { state.ac.koIn = String(t.value || ''); return; }
    if (t && t.id === 'ai-fu-in') { var fr2 = aiFuCur(); if (fr2) fr2.fuText = String(t.value || ''); return; }
    if (t && t.id === 'ac-in' && state.ac) { state.ac.input = String(t.value || ''); return; }
    if (t && t.id === 'w-search') { wordsUi.q = String(t.value || ''); refreshWordsList(); return; }
    if (!t || t.id !== 'fb-text' || !state.fb) return;
    state.fb.text = String(t.value || '');
    var c = document.getElementById('fb-count'), b = document.getElementById('fb-send');
    if (c) c.textContent = state.fb.text.length + '/' + FB_MAX;
    if (b) b.disabled = !(sb && !state.fb.sending && state.fb.text.trim().length >= 5);
  });

  /* ---------- HSK 1~4급 단어 ---------- */
  var HSKW = window.HSK || {};
  var HSK_STUDY = 20;
  var HSK_NOTE = '신(新) HSK 3.0 기준 단어 (26년 12월 13일부로 전면 개편)';
  function hskList(lv) { return HSKW[lv] || []; }
  function hskKnown(lv, i) { return (state.profile.hsk3[lv] || '').charAt(i) === '1'; }
  function hskCount(lv) {
    var s = state.profile.hsk3[lv] || '', n = 0;
    for (var i = 0; i < s.length; i++) if (s.charAt(i) === '1') n++;
    return n;
  }
  var hskTimer = null;
  function setHskKnown(lv, i, on) {
    var s = state.profile.hsk3[lv] || '';
    while (s.length < hskList(lv).length) s += '0';
    state.profile.hsk3[lv] = s.slice(0, i) + (on ? '1' : '0') + s.slice(i + 1);
    clearTimeout(hskTimer);
    hskTimer = setTimeout(function () { store.saveProfile(); }, 900);   // 연달아 누를 땐 한 번만 저장
  }

  /* ---------- HSK 단어 복습 주기 (간격 반복) ---------- */
  // 맞히면 1일 → 3일 → 7일 → 14일 → 30일 뒤에 다시, 틀리면 다음 날 다시 나와요
  var SRS_INT = [1, 1, 3, 7, 14, 30];
  function dayNum() { return Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 864e5); }
  function srsKey(lv, i) { return lv + '.' + i; }
  var srsTimer = null;
  function srsGrade(lv, i, ok) {
    var k = srsKey(lv, i), e = state.srs[k] || [0, 0, 0, 0], t = dayNum();
    var box = ok ? Math.min(5, e[0] + 1) : 0;
    state.srs[k] = [box, t + (ok ? SRS_INT[box] : 1), t, (e[3] || 0) + (ok ? 0 : 1)];
    persistLocal();
    clearTimeout(srsTimer);
    srsTimer = setTimeout(srsRemoteSave, 1500);
  }
  async function srsRemoteSave() {
    if (!sb || isGuest() || !state.user) return;
    try {
      var res = await sb.from('user_srs').upsert({ user_id: state.user.id, data: state.srs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (res && res.error && window.console) console.warn(res.error);   // 표가 아직 없어도 이 기기에는 저장돼요
    } catch (e) { /* 무시 */ }
  }
  async function srsLoadRemote() {
    try {
      var local = {};
      try {
        var raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
        if (raw.srs && (!raw.srsUid || (state.user && raw.srsUid === state.user.id))) local = raw.srs;
      } catch (e) { /* 무시 */ }
      state.srs = local;
      var res = await sb.from('user_srs').select('data').maybeSingle();
      var rd = res && res.data && res.data.data;
      if (rd) Object.keys(rd).forEach(function (k) {
        var a = state.srs[k], b = rd[k];
        if (!a || (b[2] || 0) >= (a[2] || 0)) state.srs[k] = b;
      });
    } catch (e) { /* 무시 */ }
  }
  // 오늘 복습할 단어 (상자가 낮고 자주 틀린 단어부터)
  function hskDue(onlyLv) {
    var t = dayNum(), out = [];
    Object.keys(state.srs).forEach(function (k) {
      var p = k.split('.'), lv = parseInt(p[0], 10), i = parseInt(p[1], 10), e = state.srs[k];
      if (onlyLv && lv !== onlyLv) return;
      if (!HSKW[lv] || !HSKW[lv][i] || hskLocked(lv) || e[1] > t) return;
      out.push({ lv: lv, i: i, box: e[0], w: e[3] || 0, due: e[1] });
    });
    out.sort(function (a, b) { return a.box - b.box || b.w - a.w || a.due - b.due; });
    return out;
  }
  // 학습·퀴즈에 넣을 단어: 복습할 단어(몰랐던 것 먼저) → 아직 안 본 단어 → 나머지
  function hskPick(lv, n) {
    var list = hskList(lv), due = hskDue(lv), fresh = [], used = {};
    list.forEach(function (w, i) { if (!state.srs[srsKey(lv, i)] && !hskKnown(lv, i)) fresh.push({ lv: lv, i: i }); });
    fresh = shuffle(fresh);
    var takeDue = due.slice(0, fresh.length ? Math.min(due.length, Math.ceil(n * 0.7)) : n);
    var out = takeDue.map(function (q) { return { lv: q.lv, i: q.i }; }).concat(fresh.slice(0, n - takeDue.length));
    out.forEach(function (q) { used[q.i] = 1; });
    if (out.length < n) {
      var rest = [];
      list.forEach(function (w, i) { if (!used[i]) rest.push({ lv: lv, i: i }); });
      out = out.concat(shuffle(rest).slice(0, n - out.length));
    }
    return out.slice(0, n);
  }
  function startHskDue() {
    var q = hskDue(0).slice(0, HSK_STUDY).map(function (x) { return { lv: x.lv, i: x.i }; });
    if (!q.length) { toast('지금 복습할 단어가 없어요'); return; }
    state.hc = { lv: 0, mode: 'due', queue: q, i: 0, flip: false, known: 0, before: todayAnswers() };
    go('hskstudy');
    speakCard();
  }
  function startTodayReview() {
    if (dueRows().length) startReview(); else startHskDue();
  }
  function bumpAnswer() {
    var day = dayStr(new Date());
    var d0 = state.daily[day] || { day: day, lessons: 0, answers: 0 };
    var d = { day: day, lessons: d0.lessons, answers: d0.answers + 1 };
    state.daily[day] = d; store.saveDaily(d);
  }

  /* ---------- 성조 연습: 소리를 듣고 각 글자의 성조를 맞혀요 ---------- */
  var TN_V = 'aeiouüāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ';
  var TN_MAP = { 'ā': 1, 'á': 2, 'ǎ': 3, 'à': 4, 'ē': 1, 'é': 2, 'ě': 3, 'è': 4, 'ī': 1, 'í': 2, 'ǐ': 3, 'ì': 4, 'ō': 1, 'ó': 2, 'ǒ': 3, 'ò': 4, 'ū': 1, 'ú': 2, 'ǔ': 3, 'ù': 4, 'ǖ': 1, 'ǘ': 2, 'ǚ': 3, 'ǜ': 4 };
  var TN_RE = new RegExp('(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?[' + TN_V + ']+(?:ng(?![' + TN_V + '])|n(?![' + TN_V + '])|r(?![' + TN_V + ']))?', 'g');
  var TN_SYM = ['a', 'ā', 'á', 'ǎ', 'à'], TN_NAME = ['경성', '1성', '2성', '3성', '4성'];
  function toneOf(py) {
    var segs = String(py).toLowerCase().split(/[\s'’\-·\/]+/), out = [];
    for (var a = 0; a < segs.length; a++) {
      if (!segs[a]) continue;
      var t = segs[a].match(TN_RE);
      if (!t || t.join('') !== segs[a]) return null;
      for (var b = 0; b < t.length; b++) {
        var n = 0, c = 0;
        for (var k = 0; k < t[b].length; k++) { var m = TN_MAP[t[b].charAt(k)]; if (m) { n = m; c++; } }
        if (c > 1) return null;
        out.push(n);
      }
    }
    return out.length ? out : null;
  }
  function startTone(lv) {
    var pool = [];
    hskList(lv).forEach(function (w, i) {
      var t = toneOf(w[1]);
      if (t && t.length <= 4) pool.push({ zh: w[0], py: w[1], ko: w[2], tones: t, hi: i });
    });
    if (!pool.length) return;
    state.tn = { lv: lv, items: shuffle(pool).slice(0, QUIZ_SIZE), i: 0, right: 0, combo: 0, cur: [], res: null, before: todayAnswers() };
    go('tone');
    speakTone();
  }
  function speakTone() {
    var t = state.tn;
    setTimeout(function () { if (state.screen === 'tone' && state.tn === t && !t.res) speak(t.items[t.i].zh); }, 300);
  }
  function tonePick(v) {
    var tn = state.tn, it = tn.items[tn.i];
    if (!tn || tn.res || tn.cur.length >= it.tones.length) return;
    tn.cur.push(v);
    if (tn.cur.length < it.tones.length) { sfx('tap'); render(); return; }
    var ok = tn.cur.every(function (x, k) { return x === it.tones[k]; });
    tn.res = { ok: ok };
    if (ok) { tn.right++; tn.combo++; sfx('right', tn.combo); } else { tn.combo = 0; sfx('wrong'); }
    bumpAnswer();
    render();
  }
  function toneNext() {
    var tn = state.tn;
    if (!tn.res) return;
    tn.i++; tn.cur = []; tn.res = null;
    if (tn.i >= tn.items.length) { finishTone(); return; }
    render(); speakTone();
  }
  function finishTone() {
    tdMark('tone-start');
    var tn = state.tn, goal = state.profile.goal, now = todayAnswers();
    var hit = tn.before < goal && now >= goal;
    stopSpeak(); sfx(hit ? 'goal' : 'done');
    go('done', { result: {
      kind: 'quiz', title: '성조 연습 끝!',
      line: tn.items.length + '문제 중 ' + tn.right + '개 맞혔어요' + (tn.right === tn.items.length ? '. 전부 정답이에요!' : '.'),
      answers: now, goal: goal, goalHit: hit, milestone: 0,
      again: { act: 'tone-start', id: String(tn.lv), label: '한 번 더 하기' }
    } });
  }
  function viewTone() {
    var tn = state.tn, it = tn.items[tn.i], n = it.tones.length, res = tn.res;
    var answered = tn.i + (res ? 1 : 0), pct = Math.round(answered / tn.items.length * 100);
    var len = Math.max(1, Array.from(it.zh).length);
    var top = '<div class="topbar"><button class="icon-btn" data-act="tone-quit" aria-label="그만하기">' + I.close + '</button>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
      '<span class="chip" style="min-width:48px;justify-content:center">' + answered + '/' + tn.items.length + '</span></div>';
    var prompt = '<div class="qz-prompt qz-word">' +
      '<button class="round-btn qz-spk" data-act="say" data-text="' + esc(it.zh) + '" aria-label="듣기">' + I.spk + '</button>' +
      '<div class="q-zh big" style="font-size:min(104px, calc((100vw - 64px) / ' + len + '))">' + esc(it.zh) + '</div>' +
      '<div class="q-peek' + (res ? ' on' : '') + '">' + (res ? '<div class="q-py">' + esc(it.py) + '</div><div class="q-kr">' + esc(kr(it.py)) + '</div><div class="q-ko">' + esc(it.ko) + '</div>' : '<div class="q-hint">소리를 듣고 성조를 차례로 골라요</div>') + '</div></div>';
    var slots = '<div class="tn-slots">';
    for (var k = 0; k < n; k++) {
      var filled = tn.cur[k] !== undefined, cls = 'tn-slot' + (!res && k === tn.cur.length ? ' cur' : '') + (filled ? ' fill' : '');
      if (res) cls += tn.cur[k] === it.tones[k] ? ' ok' : ' no';
      slots += '<button class="' + cls + '" data-act="tone-slot" data-id="' + k + '"' + (res || !filled ? ' disabled' : '') + ' aria-label="' + (k + 1) + '번째 글자 성조">' +
        '<b>' + (filled ? TN_SYM[tn.cur[k]] : '?') + '</b>' + (res && tn.cur[k] !== it.tones[k] ? '<i>' + TN_SYM[it.tones[k]] + '</i>' : '') + '</button>';
    }
    slots += '</div>';
    var pad = '<div class="tn-pad">' + [1, 2, 3, 4, 0].map(function (v) {
      return '<button class="tn-btn t' + v + '" data-act="tone-pick" data-id="' + v + '"' + (res ? ' disabled' : '') + '><b>' + TN_SYM[v] + '</b><span>' + TN_NAME[v] + '</span></button>';
    }).join('') + '</div>';
    var foot = qzFoot(!!res, res && res.ok, res ? (res.ok ? (tn.combo >= 2 ? '연속 ' + tn.combo + '번 정답' : '귀가 좋아요') : '빨간 칸의 작은 글자가 정답이에요') : '', 'tone-next', tn.i + 1 >= tn.items.length ? '결과 보기' : '다음');
    return '<div class="screen qz-fit">' + top + '<div class="qz-wrap qz-ctr tn-fit">' + prompt + slots + pad + '</div>' + foot + '</div>';
  }
  // 단어장 탭의 HSK 영역: 급을 고르면 학습 방식 4가지가 바로 보여요
  function hskGate(id) {
    var lv = parseInt(id, 10);
    if (!hskLocked(lv)) return false;
    go('pay', { payWhy: 'HSK ' + lv + '급은 멤버십이 필요해요. 1급은 무료예요.' });
    return true;
  }
  function hskLvSel() {
    var v = state.hskLv;
    if (!v) { try { v = parseInt(localStorage.getItem('pangpang.hsklv'), 10); } catch (e) { /* 무시 */ } }
    return [1, 2, 3, 4].indexOf(v) >= 0 && !hskLocked(v) ? v : 1;
  }
  function hmi(n) { return '<img class="hm-img" src="img/hm-' + n + '.webp" alt="" draggable="false">'; }
  function hskSection() {
    if (!Object.keys(HSKW).length) return '';
    var lv = hskLvSel(), n = hskList(lv).length, k = hskCount(lv), pct = n ? Math.round(k / n * 100) : 0;
    var wd = hskDue(0).length, rec = chRec(lv), locked = hskLocked(lv);
    var dueCard = wd ? '<button class="hsk-due" data-act="hsk-due"><span class="hd-t">오늘 복습할 단어 <b>' + wd + '개</b></span><span class="chip y">복습</span></button>' : '';
    var chips = '<div class="hsk-chips" role="tablist" aria-label="HSK 급 선택">' + [1, 2, 3, 4].map(function (l) {
      return '<button role="tab" class="hsk-chip' + (l === lv ? ' on' : '') + '" data-act="hsk-lv" data-id="' + l + '" aria-selected="' + (l === lv) + '"' + (hskLocked(l) ? ' disabled aria-disabled="true"' : '') + '>' + (hskLocked(l) ? '<i class="hc-lock">' + I.lock + '</i>' : '') + l + '급</button>';
    }).join('') + '</div>';
    function mode(act, ico, title, sub, tag, cls) {
      return '<button class="hsk-mode' + (locked ? ' lk' : '') + (cls ? ' ' + cls : '') + '" data-act="' + act + '" data-id="' + lv + '"><span class="hm-ico">' + ico + '</span>' +
        '<b>' + title + '</b><span class="hm-sub">' + sub + '</span>' + (tag ? '<em class="hm-tag">' + tag + '</em>' : '') + '</button>';
    }
    var listCard = '<button class="hsk-list-link" data-act="hsk-open" data-id="' + lv + '"><span class="hl-t">' + lv + '급 단어 목록</span>' +
      '<span class="hl-s">' + n + '개 중 ' + k + '개 익혔어요</span><span class="hl-chev"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg></span>' +
      '<span class="meter g hl-m"><i style="width:' + pct + '%"></i></span></button>';
    return '<div class="hsk-main">' + dueCard + chips +
      (locked ? '<p class="hsk-lock-note">' + I.lock + ' ' + lv + '급은 멤버십이 필요해요. 1급은 무료예요.</p>' : '') +
      listCard +
      '<div class="hsk-modes">' +
      mode('hsk-study', hmi('game'), '카드 학습', '밀어서 외우기', '') +
      mode('hsk-quiz', hmi('quiz'), '퀴즈', '소리·뜻 고르기', '') +
      mode('ch-start', hmi('kisa'), '기억 사슬', rec.best ? '최고 ' + rec.best + '단계' : '몇 단계까지 갈까?', rec.plays ? '' : 'NEW') +
      mode('tone-start', hmi('sungjo'), '성조 연습', '소리로 성조 맞히기', '') +
      mode('rain-start', hmi('sonagi'), '소나기 퀴즈', '떨어지는 한자를 잡아요', rnBest(lv) ? '' : 'NEW', 'wide') + '</div>' +
      '<p class="hsk-note hsk-foot">' + HSK_NOTE + '</p></div>';
  }
  function hskRow(lv, w, i) {
    var on = hskKnown(lv, i);
    return '<div class="wrow' + (on ? ' on' : '') + '" data-i="' + i + '"><button class="wmain" data-act="say" data-text="' + esc(w[0]) + '">' +
      '<span class="zh w-zh">' + esc(w[0]) + '</span><span class="py">' + esc(w[1]) + '</span> <span class="kr">' + esc(kr(w[1])) + '</span><div class="ko">' + esc(w[2]) + '</div></button>' +
      '<button class="chk' + (on ? ' on' : '') + '" data-act="hsk-toggle" data-id="' + i + '" aria-pressed="' + (on ? 'true' : 'false') + '" aria-label="알아요 표시">' + I.check + '</button></div>';
  }
  function viewHsk() {
    var h = state.hsk, lv = h.lv, list = hskList(lv), k = hskCount(lv);
    var rows = list.map(function (w, i) { return !h.unknownOnly || !hskKnown(lv, i) ? hskRow(lv, w, i) : ''; }).join('');
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll" style="padding-top:4px">' +
      '<h1 class="big-title" style="margin-top:0">HSK ' + lv + '급 단어</h1>' +
      '<p class="sub-title" id="hsk-prog">' + list.length + '개 중 ' + k + '개 익혔어요</p>' +
      '<div class="hsk-new"><em class="perk-tag" style="margin:0">개정된 신 HSK 3.0</em> 새 시험 기준 단어예요</div>' +
      '<div class="seg-row"><button class="seg-b' + (!h.unknownOnly ? ' on' : '') + '" data-act="hsk-filter" data-v="all">전체</button>' +
      '<button class="seg-b' + (h.unknownOnly ? ' on' : '') + '" data-act="hsk-filter" data-v="unknown">모르는 단어만</button></div>' +
      '<div class="words">' + (rows || emptyState('search', { title: '모르는 단어가 없어요', desc: '전부 익혔어요. 대단해요!', badge: { text: '0개', dot: '#0e9f63' }, cta: { act: 'hsk-filter', v: 'all', label: '전체 보기' } })) + '</div>' +
      '<div style="height:24px"></div></div></div>';
  }
  function startHskStudy(lv) {
    var list = hskList(lv);
    if (!list.length) return;
    state.hc = { lv: lv, mode: 'study', queue: hskPick(lv, HSK_STUDY), i: 0, flip: false, known: 0, before: todayAnswers() };
    go('hskstudy');
    speakCard();
  }
  function hcWord(c) { var q = c.queue[c.i]; return hskList(q.lv)[q.i]; }
  function speakCard() {
    var c = state.hc;
    setTimeout(function () { if (state.screen === 'hskstudy' && state.hc === c) speak(hcWord(c)[0]); }, 300);
  }
  function viewHskStudy() {
    var c = state.hc, q = c.queue[c.i], w = hcWord(c), pct = Math.round(c.i / c.queue.length * 100);
    var top = '<div class="topbar"><button class="icon-btn" data-act="back" aria-label="그만하기">' + I.close + '</button>' +
      '<div class="progress"><i style="width:' + pct + '%"></i></div><span class="chip" style="min-width:48px;justify-content:center">' + c.i + '/' + c.queue.length + '</span></div>';
    var len = Math.max(1, Array.from(w[0]).length);
    var card = '<div class="fc-stage"><div class="fc fc-swipe" id="fc-card" role="button" tabindex="0" aria-label="카드 뒤집기">' +
      '<span class="fc-tag no">몰라요</span><span class="fc-tag yes">알아요</span>' +
      '<button class="round-btn fc-spk-tr" data-act="say" data-text="' + esc(w[0]) + '" aria-label="듣기">' + I.spk + '</button>' +
      '<div class="fc-lv">HSK ' + q.lv + '급' + (c.mode === 'due' ? ' · 복습' : '') + '</div>' +
      '<div class="fc-zh" style="font-size:min(112px, calc((100vw - 90px) / ' + len + '))">' + esc(w[0]) + '</div>' +
      '<div class="fc-back' + (c.flip ? ' on' : '') + '">' + (c.flip ? '<div class="fc-py">' + esc(w[1]) + '</div><div class="fc-kr">' + esc(kr(w[1])) + '</div><div class="fc-ko">' + esc(w[2]) + '</div>' : '<div class="fc-hint">카드를 누르면 뜻이 보여요</div>') + '</div></div></div>' +
      '<div class="fc-guide"><span>← 몰라요</span><span>알아요 →</span></div>';
    var foot = '<div class="footer fc-foot"><button class="btn gray" data-act="hsk-mark" data-v="no">몰라요</button><button class="btn green" data-act="hsk-mark" data-v="yes">알아요</button></div>';
    return '<div class="screen fc-screen">' + top + '<div class="qz-wrap fc-wrap">' + card + '</div>' + foot + '</div>';
  }
  function hskMark(yes) {
    var c = state.hc;
    var q = c.queue[c.i];
    setHskKnown(q.lv, q.i, yes);
    srsGrade(q.lv, q.i, yes);
    if (yes) { c.known++; sfx('right', c.known); } else sfx('tap');
    bumpAnswer();
    c.i++; c.flip = false;
    if (c.i >= c.queue.length) { finishHskStudy(); return; }
    render(); speakCard();
  }
  function finishHskStudy() {
    tdMark('hsk-study');
    var c = state.hc, goal = state.profile.goal, now = todayAnswers();
    var hit = c.before < goal && now >= goal;
    clearTimeout(hskTimer); store.saveProfile();
    stopSpeak(); sfx(hit ? 'goal' : 'done');
    go('done', { result: {
      kind: 'quiz', title: c.mode === 'due' ? '단어 복습 끝!' : 'HSK ' + c.lv + '급 카드 학습 끝!',
      line: c.queue.length + '개 중 ' + c.known + '개를 알아요.' + (c.mode === 'due' ? (hskDue(0).length ? ' 아직 복습할 단어가 ' + hskDue(0).length + '개 남았어요.' : ' 오늘 단어 복습은 모두 끝났어요.') : ' 지금까지 ' + hskCount(c.lv) + '/' + hskList(c.lv).length + '개 익혔어요.'),
      answers: now, goal: goal, goalHit: hit, milestone: 0,
      again: c.mode === 'due'
        ? (hskDue(0).length ? { act: 'hsk-due', label: '이어서 단어 복습' } : (dueRows().length ? { act: 'review-start', label: '이어서 문장 복습' } : null))
        : { act: 'hsk-study', id: String(c.lv), label: '다음 카드 학습' }
    } });
  }
  function startHskQuiz(lv) {
    var list = hskList(lv);
    var kos = list.map(function (w) { return w[2]; });
    var items = shuffle(hskPick(lv, QUIZ_SIZE)).map(function (q) {
      var i = q.i, w = list[i];
      return { id: null, lessonId: null, zh: w[0], py: w[1], ko: w[2], hi: i, options: quizOptions(w[2], kos) };
    });
    state.z = { kind: 'word', hsk: lv, items: items, i: 0, right: 0, combo: 0, picked: null, before: todayAnswers() };
    go('quiz');
    speakQuiz();
  }

  /* ---------- 퀴즈: 듣기 · 단어 ---------- */
  var QUIZ_SIZE = 10;
  function learnedQs() {
    return learnedLessons().reduce(function (acc, l) { return acc.concat(l.qs); }, []);
  }
  function learnedWords() {
    var seen = {}, out = [];
    learnedLessons().forEach(function (l) {
      l.words.forEach(function (w) { if (!seen[w[0]]) { seen[w[0]] = 1; out.push({ zh: w[0], py: w[1], ko: w[2], lessonId: l.id }); } });
    });
    return out;
  }
  function quizOptions(correct, kos) {
    var seen = {}, d = [];
    seen[correct] = 1;
    shuffle(kos).forEach(function (k) { if (d.length < 3 && !seen[k]) { seen[k] = 1; d.push(k); } });
    return shuffle([correct].concat(d)).map(function (k) { return { ko: k, ok: k === correct }; });
  }
  function startQuiz(kind, lid) {
    var items;
    if (kind === 'listen') {
      var qs = lid && lessonById(lid) ? lessonById(lid).qs : learnedQs(), kos = qs.concat(learnedQs()).map(function (q) { return q.ko; });
      items = shuffle(qs).slice(0, QUIZ_SIZE).map(function (q) {
        return { id: q.id, lessonId: q.lessonId, zh: q.zh, py: q.py, ko: q.ko, options: quizOptions(q.ko, kos) };
      });
    } else {
      var ws = learnedWords(), wk = ws.map(function (w) { return w.ko; });
      items = shuffle(ws).slice(0, QUIZ_SIZE).map(function (w) {
        return { id: null, lessonId: w.lessonId, zh: w.zh, py: w.py, ko: w.ko, options: quizOptions(w.ko, wk) };
      });
    }
    if (!items.length || items[0].options.length < 3) { toast('조금 더 배우면 퀴즈를 풀 수 있어요'); return; }
    state.z = { kind: kind, items: items, i: 0, right: 0, combo: 0, picked: null, before: todayAnswers(), lid: lid || '' };
    go('quiz');
    speakQuiz();
  }
  function speakQuiz() {
    var z = state.z;
    setTimeout(function () { if (state.screen === 'quiz' && state.z === z && z.picked === null) speak(z.items[z.i].zh); }, 300);
  }
  function quizPick(idx) {
    var z = state.z, it = z.items[z.i];
    if (z.picked !== null) return;
    z.picked = idx;
    var ok = it.options[idx].ok;
    if (ok) { z.right++; z.combo++; sfx('right', z.combo); } else { z.combo = 0; sfx('wrong'); }
    // 풀자마자 오늘 푼 문제 수에 더하고, 틀린 듣기 문제는 약한 문제로 보내요
    bumpAnswer();
    if (z.hsk && it.hi != null) { setHskKnown(z.hsk, it.hi, ok); srsGrade(z.hsk, it.hi, ok); }
    if (!ok && it.id && state.progress[it.id]) {
      var prev = state.progress[it.id];
      var row = { qid: it.id, lesson_id: it.lessonId, box: 1, due_at: dueISO(1), correct: prev.correct, wrong: prev.wrong + 1, updated_at: new Date().toISOString() };
      state.progress[it.id] = row; store.saveProgress([row]);
    }
    render();
  }
  function quizNext() {
    var z = state.z;
    if (z.picked === null) return;
    z.i++; z.picked = null; z.peek = false;
    if (z.i >= z.items.length) { finishQuiz(); return; }
    render(); speakQuiz();
  }
  function finishQuiz() {
    if (state.z && state.z.hsk) tdMark('hsk-quiz');
    var z = state.z, goal = state.profile.goal, now = todayAnswers();
    var hit = z.before < goal && now >= goal;
    var label = z.kind === 'listen' ? '듣기 연습' : (z.hsk ? 'HSK ' + z.hsk + '급 퀴즈' : '단어 퀴즈');
    var perfect = z.right === z.items.length;
    stopSpeak();
    sfx(hit ? 'goal' : 'done');
    go('done', { result: {
      kind: 'quiz', title: label + ' 끝!',
      line: z.items.length + '문제 중 ' + z.right + '개 맞혔어요' + (perfect ? '. 전부 정답이에요!' : '.'),
      answers: now, goal: goal, goalHit: hit, milestone: 0,
      again: z.hsk ? { act: 'hsk-quiz', id: String(z.hsk), label: '한 번 더 풀기' } : { act: z.kind === 'listen' ? 'quiz-listen' : 'quiz-word', id: z.lid || '', label: '한 번 더 풀기' }
    } });
  }
  // 퀴즈 하단: 결과(캐릭터+문구)와 '다음' 버튼을 한 자리에 두어, 답을 골라도 위쪽 버튼 위치가 움직이지 않아요
  function qzFoot(ans, ok, sub, act, label) {
    var t = ans ? '<div class="qz-fb ' + (ok ? 'ok' : 'no') + '" role="status"><img src="img/' + (ok ? 'qz-ok' : 'qz-no') + '.webp" alt="" draggable="false"><div class="qv-t"><b>' + (ok ? '맞았어요!' : '틀렸어요!') + '</b><span>' + esc(sub) + '</span></div></div>' : '<div class="qz-fb idle"></div>';
    return '<div class="footer qz-foot2' + (ans ? '' : ' idle') + '">' + t + '<button class="btn ' + (ans && ok ? 'green' : '') + '" data-act="' + act + '"' + (ans ? '' : ' disabled tabindex="-1"') + '>' + label + '</button></div>';
  }
  function viewQuiz() {
    var z = state.z, it = z.items[z.i], answered = z.i + (z.picked !== null ? 1 : 0);
    var pct = Math.round(answered / z.items.length * 100);
    var top = '<div class="topbar"><button class="icon-btn" data-act="quiz-quit" aria-label="그만하기">' + I.close + '</button>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
      '<span class="chip" style="min-width:48px;justify-content:center">' + answered + '/' + z.items.length + '</span></div>';
    var prompt;
    if (z.kind === 'listen') {
      prompt = '<div class="qz-prompt"><button class="listen-btn" data-act="say" data-text="' + esc(it.zh) + '" aria-label="다시 듣기">' + I.spk + '</button>' +
        '<div class="qz-cap">소리를 듣고 알맞은 뜻을 골라요</div></div>';
    } else {
      // 한자를 크게 보여 주고, 발음(병음·한글)은 한자를 누르거나 답을 고르면 보여요. 듣기 버튼은 오른쪽 위
      var peek = !!z.peek || z.picked !== null, len = Math.max(1, Array.from(it.zh).length);
      prompt = '<div class="qz-prompt qz-word">' +
        '<button class="round-btn qz-spk" data-act="say" data-text="' + esc(it.zh) + '" aria-label="듣기">' + I.spk + '</button>' +
        '<button class="q-zh-btn" data-act="qz-peek" aria-label="한자 발음 보기" aria-expanded="' + peek + '"><span class="q-zh big" style="font-size:min(104px, 11.5dvh, calc((100vw - 64px) / ' + len + '))">' + esc(it.zh) + '</span></button>' +
        '<div class="q-peek' + (peek ? ' on' : '') + '">' + (peek ? '<div class="q-py">' + esc(it.py) + '</div><div class="q-kr">' + esc(kr(it.py)) + '</div>' : '<div class="q-hint">한자를 누르면 발음이 보여요</div>') + '</div></div>';
    }
    var opts = '<div class="qz-opts">' + it.options.map(function (o, i) {
      var cls = 'opt';
      if (z.picked !== null) cls += o.ok ? ' ok' : (i === z.picked ? ' no' : ' dim');
      return '<button class="' + cls + '" data-act="quiz-pick" data-id="' + i + '"' + (z.picked !== null ? ' disabled' : '') + '>' + esc(o.ko) + '</button>';
    }).join('') + '</div>';
    var reveal = '';
    if (z.kind === 'listen') {
      reveal = '<div class="qz-reveal-slot">' + (z.picked !== null ? '<div class="qz-reveal"><div class="zh">' + esc(it.zh) + '</div><div class="py">' + esc(it.py) + '</div><div class="kr">' + esc(kr(it.py)) + '</div></div>' : '') + '</div>';
    }
    var vok = z.picked !== null && it.options[z.picked].ok;
    var foot = qzFoot(z.picked !== null, vok, vok ? (z.combo >= 2 ? '연속 ' + z.combo + '번 정답' : '잘했어요') : '괜찮아요, 다시 해봐요', 'quiz-next', z.i + 1 >= z.items.length ? '결과 보기' : '다음');
    return '<div class="screen qz-fit">' + top + '<div class="qz-wrap qz-ctr">' + prompt + reveal + opts + '</div>' + foot + '</div>';
  }

  /* ---------- 연습 세션 ---------- */
  /* ---------- 중간에 나가도 이어서 하기 ---------- */
  var RESUME_KEY = 'pangpang.resume';
  function resumeKey(kind, lessonId) { return (state.user ? state.user.id : 'x') + '|' + kind + '|' + lessonId; }
  function readResume() { try { return JSON.parse(localStorage.getItem(RESUME_KEY) || '{}'); } catch (e) { return {}; } }
  function writeResume(m) { try { localStorage.setItem(RESUME_KEY, JSON.stringify(m)); } catch (e) { /* 무시 */ } }
  function packQ(q) {
    var base = QMAP[q.id], list = base ? Variants.all(base) : [q], vi = 0;
    for (var i = 0; i < list.length; i++) { if (list[i].zh === q.zh) { vi = i; break; } }
    return { id: q.id, vi: vi };
  }
  function unpackQ(p) {
    var base = QMAP[p.id];
    if (!base) return null;
    var list = Variants.all(base);
    return list[p.vi] || base;
  }
  function saveResume(s) {
    if (!s || !s.lessonId || !s.queue.length) return;
    var m = readResume();
    m[resumeKey(s.kind, s.lessonId)] = {
      queue: s.queue.map(packQ), total: s.total, solved: s.solved, first: s.first, wrong: s.wrong,
      committed: s.committed, solvedCommitted: s.solvedCommitted, cleared: !!s.cleared, doneMarked: !!s.doneMarked, at: Date.now()
    };
    writeResume(m);
    pushResume(s.kind, s.lessonId, m[resumeKey(s.kind, s.lessonId)]);
  }
  function clearResume(kind, lessonId) {
    if (!lessonId) return;
    var m = readResume(), k = resumeKey(kind, lessonId);
    if (m[k]) { delete m[k]; writeResume(m); }
    dropResume(kind, lessonId);
  }
  // 이어하기 기록을 서버에도 저장해서 다른 기기에서도 같은 진행도가 보이게 해요 (로그인한 경우만)
  function remoteOk() { return !!sb && !!state.user && state.user.id !== 'local' && !isGuest(); }
  var resumeTimers = {};
  function pushResume(kind, lessonId, data) {
    if (!remoteOk()) return;
    var rk = kind + '|' + lessonId, uid = state.user.id;
    clearTimeout(resumeTimers[rk]);
    resumeTimers[rk] = setTimeout(function () {
      try {
        Promise.resolve(sb.from('resume_state').upsert({ user_id: uid, rkey: rk, data: data, updated_at: new Date().toISOString() }, { onConflict: 'user_id,rkey' })).catch(function () {});
      } catch (e) { /* 표가 아직 없어도 앱은 그대로 써요 */ }
    }, 1500);
  }
  function dropResume(kind, lessonId) {
    if (!remoteOk()) return;
    var rk = kind + '|' + lessonId;
    clearTimeout(resumeTimers[rk]);
    try { Promise.resolve(sb.from('resume_state').delete().eq('user_id', state.user.id).eq('rkey', rk)).catch(function () {}); } catch (e) {}
  }
  // 서버 기록을 가져와 이 기기 기록과 합쳐요 (더 최근 것을 사용). 바뀐 게 있으면 true
  async function pullResume() {
    if (!remoteOk()) return false;
    try {
      var res = await sb.from('resume_state').select('rkey,data');
      if (res.error || !res.data) return false;
      var m = readResume(), changed = false, uid = state.user.id;
      res.data.forEach(function (r) {
        var k = uid + '|' + r.rkey, cur = m[k];
        if (r.data && (!cur || (r.data.at || 0) > (cur.at || 0))) { m[k] = r.data; changed = true; }
      });
      if (changed) writeResume(m);
      return changed;
    } catch (e) { return false; }
  }
  function startLessonSession(kind, lessonId) {
    if (kind === 'lesson' && lessonLocked(lessonId)) { go('pay', { payWhy: '‘' + lessonById(lessonId).title + '’ 레슨은 멤버십이 필요해요.' }); return; }
    var snap = readResume()[resumeKey(kind, lessonId)];
    var fresh = function () { clearResume(kind, lessonId); beginSession(kind, rounds(lessonById(lessonId).qs, PRACTICE_SIZE), lessonId); };
    if (snap && snap.queue && snap.queue.length && snap.solved > 0) {
      askConfirm({ title: '이어서 할까요?', body: snap.solved + ' / ' + snap.total + '문제까지 했어요. 이어서 하거나 처음부터 다시 할 수 있어요.', ok: '이어서 하기', cancel: '처음부터', m: 'ask' },
        function () {
          var qs = snap.queue.map(unpackQ).filter(Boolean);
          if (!qs.length) { fresh(); return; }
          beginSession(kind, qs, lessonId);
          var s = state.s;
          s.total = snap.total; s.solved = snap.solved; s.first = snap.first || {}; s.wrong = snap.wrong || {};
          s.committed = snap.committed || {}; s.solvedCommitted = snap.solvedCommitted || 0;
          s.cleared = !!snap.cleared; s.doneMarked = !!snap.doneMarked;
          render();
        }, fresh);
      return;
    }
    fresh();
  }
  // 나갈 때: 풀어 본 문제까지의 기록을 저장해요 (복습·약한 문제에 바로 반영)
  function savePartial() {
    var s = state.s, now = new Date().toISOString(), rows = [];
    Object.keys(s.first).forEach(function (id) {
      var q = QMAP[id];
      if (!q || s.committed[id]) return;
      var ft = s.first[id] === true;
      var prev = state.progress[id];
      var box = prev ? (ft ? Math.min(5, prev.box + 1) : 1) : (ft ? 2 : 1);
      var row = { qid: id, lesson_id: q.lessonId, box: box, due_at: dueISO(box), correct: (prev ? prev.correct : 0) + (ft ? 1 : 0), wrong: (prev ? prev.wrong : 0) + (s.wrong[id] || 0), updated_at: now };
      state.progress[id] = row; rows.push(row); s.committed[id] = true;
    });
    var add = s.solved - s.solvedCommitted;
    if (add > 0) {
      var day = dayStr(new Date());
      var d0 = state.daily[day] || { day: day, lessons: 0, answers: 0 };
      var d = { day: day, lessons: d0.lessons, answers: d0.answers + add };
      state.daily[day] = d; s.solvedCommitted = s.solved;
      store.saveDaily(d);
    }
    if (rows.length) store.saveProgress(rows);
    saveResume(s);
  }

  function beginSession(kind, qs, lessonId, extra) {
    state.s = {
      kind: kind, lessonId: lessonId || null,
      queue: qs.slice(), cur: qs[0], total: qs.length, solved: 0,
      first: {}, wrong: {}, tries: 0, revealed: false, combo: 0, committed: {}, solvedCommitted: 0,
      phase: 'ask', heard: '', pass: false, listening: false,
      typing: state.profile.input === 'type', live: '', msg: '', showKo: false
    };
    if (extra) Object.keys(extra).forEach(function (k) { state.s[k] = extra[k]; });
    go('practice');
    sayCurrentQuestion();
  }
  function quitPractice() {
    var s = state.s;
    if (s.solved > 0 || Object.keys(s.first).length) {
      var body = s.kind === 'dialog' ? '푼 ' + s.solved + '번까지는 학습 기록에 더해져요.'
        : s.kind === 'review' ? '푼 ' + s.solved + '문제는 이미 복습으로 인정됐어요. 남은 문제는 다음에 이어서 할 수 있어요.'
        : '푼 ' + s.solved + '문제까지는 저장돼요.' + (s.kind === 'lesson' && !s.cleared ? ' ' + CLEAR_COUNT + '문제를 채우면 레슨이 완료돼요.' : '') + ' 다음에 이어서 할 수 있어요.';
      askConfirm({ title: '연습을 그만할까요?', body: body, ok: '저장하고 나가기', cancel: '계속하기', m: 'ask' }, function () { savePartial(); stopRec(); stopSpeak(); go('tab'); });
    } else {
      stopRec(); stopSpeak(); go('tab');
    }
  }

  /* ---------- 상황 레슨 (v128): 따라 말하기 → 빈칸 → 듣고 고르기 → AI 미션 ---------- */
  var SCENES = window.SCENES || [];
  var SC_STAGE = { speak: '따라 말하기', blank: '빈칸 채우기', listen: '듣고 고르기', mission: 'AI 미션' };
  function scKey() { return 'pangpang.scenes.' + (state.user ? state.user.id : 'x'); }
  function scProg() { try { return JSON.parse(localStorage.getItem(scKey()) || '{}'); } catch (e) { return {}; } }
  function scMark(id, mission) {
    var m = scProg(), o = m[id] || {};
    o.done = true; o.at = o.at || new Date().toISOString(); if (mission) o.mission = true;
    m[id] = o;
    try { localStorage.setItem(scKey(), JSON.stringify(m)); } catch (e) { /* 무시 */ }
  }
  function sceneById(id) { return SCENES.filter(function (s) { return s.id === id; })[0]; }
  function scDone(pg, s) { return !!(pg[s.id] && pg[s.id].done); }
  function scItemRow(s, pg) {
    return '<li><button class="item" data-act="sc-open" data-id="' + s.id + '"><span class="num sc-ico">' + s.icon + '</span>' +
      '<span class="txt"><div class="t">' + esc(s.title) + '</div><div class="s">' + esc(s.sub) + '</div></span>' +
      (scDone(pg, s) ? '<span class="chip green">' + I.check + '완료</span>' : '<span class="chip soft">시작</span>') + '</button></li>';
  }
  // 레슨 탭: 이어서 할 상황 2개만 보여 주고, 전체는 '전체 보기'에서 분류별로 봐요
  function scenesSection() {
    if (!SCENES.length) return '';
    var pg = scProg(), av = scAvail(), todo = av.filter(function (s) { return !scDone(pg, s); }), full = av.length === SCENES.length;
    var show = (todo.length ? todo : av).slice(0, 2);
    return '<div class="sc-head"><div class="section-title" style="margin:0">상황 레슨</div><span class="chip y">NEW</span>' +
      (full ? '<button class="sec-more sc-all" data-act="sc-all">전체 보기<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="9 6 15 12 9 18"/></svg></button>' : '') + '</div>' +
      '<p class="hsk-note under-title">하나의 상황에서 쓸 수 있는 중국어 문장을 익혀서 연습해요.</p>' +
      '<ul class="list" style="margin-top:0">' + show.map(function (s) { return scItemRow(s, pg); }).join('') + '</ul>';
  }
  var SC_CATS = ['전체', '일상', '여행', '대화'];
  function viewScenes() {
    var pg = scProg(), cat = state.scCat || '전체';
    var chips = '<div class="hsk-chips sc-cats" role="tablist" aria-label="상황 분류">' + SC_CATS.map(function (c) {
      var cnt = SCENES.filter(function (s) { return c === '전체' || s.cat === c; }).length;
      return '<button role="tab" class="hsk-chip' + (c === cat ? ' on' : '') + '" data-act="sc-cat" data-id="' + c + '" aria-selected="' + (c === cat) + '">' + c + ' ' + cnt + '</button>';
    }).join('') + '</div>';
    var list = SCENES.filter(function (s) { return cat === '전체' || s.cat === cat; });
    var lvCls = { '쉬움': 'e', '보통': 'm', '어려움': 'h' };
    var grid = '<div class="sc-grid">' + list.map(function (s) {
      return '<button class="sc-card" data-act="sc-open" data-id="' + s.id + '"><span class="sc-ci">' + s.icon + '</span>' +
        '<b>' + esc(s.title) + '</b><span class="sc-cs">' + esc(s.sub) + '</span>' +
        '<em class="sc-lv ' + (lvCls[s.lv] || 'm') + '">' + esc(s.lv || '보통') + '</em></button>';
    }).join('') + '</div>';
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll" style="padding-top:4px"><h1 class="big-title" style="margin-top:0">상황 레슨</h1>' +
      chips + grid + '<div style="height:32px"></div></div></div>';
  }
  function scLcs(a, b) {
    var L = [], i, j;
    for (i = 0; i <= a.length; i++) { L.push([]); for (j = 0; j <= b.length; j++) L[i].push(0); }
    for (i = a.length - 1; i >= 0; i--) for (j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    return L[0][0];
  }
  function scScore(zh, heard) {
    var A = Array.from(Grade.normalize(zh)), B = Array.from(Grade.normalize(heard));
    return A.length ? scLcs(A, B) / A.length : 0;
  }
  function scReset(c) { c.tries = 0; c.heard = ''; c.pass = false; c.picked = null; c.msg = ''; c.listening = false; c.noSR = false; c.gloss = -1; }
  function startScene(id) {
    var sc = sceneById(id);
    if (!sc) return;
    var L = sc.lines, all = L.map(function (_, i) { return i; });
    var blank = shuffle(all.slice()).slice(0, 4).map(function (i) {
      var others = shuffle(all.filter(function (j) { return j !== i; })).slice(0, 2).map(function (j) { return L[j][3]; });
      return { i: i, ans: L[i][3], opts: shuffle([L[i][3]].concat(others)) };
    });
    var listen = shuffle(all.slice()).slice(0, 4).map(function (i) {
      var others = shuffle(all.filter(function (j) { return j !== i; })).slice(0, 2).map(function (j) { return { ko: L[j][2], ok: false }; });
      return { i: i, opts: shuffle([{ ko: L[i][2], ok: true }].concat(others)) };
    });
    state.sc = { id: id, stage: 'speak', i: 0, blank: blank, listen: listen, right: 0, spoke: 0, combo: 0 };
    scReset(state.sc);
    go('scene');
    scAuto();
  }
  function scLen(c, st) { var sc = sceneById(c.id); return st === 'speak' ? sc.lines.length : c[st].length; }
  function scAuto() {
    var c = state.sc;
    if (!c) return;
    setTimeout(function () {
      if (state.screen !== 'scene' || state.sc !== c) return;
      var sc = sceneById(c.id);
      if (c.stage === 'speak' && !c.pass && !c.listening) speak(sc.lines[c.i][0], 0.8);
      else if (c.stage === 'listen' && c.picked === null) speak(sc.lines[c.listen[c.i].i][0], 0.85);
    }, 400);
  }
  function scAdvance() {
    var c = state.sc;
    if (!c) return;
    stopSpeak(); scStopRec();
    c.i++;
    if (c.i >= scLen(c, c.stage)) {
      c.i = 0;
      c.stage = c.stage === 'speak' ? 'blank' : c.stage === 'blank' ? 'listen' : 'mission';
    }
    scReset(c);
    render(); window.scrollTo(0, 0);
    scAuto();
  }
  function scPick(idx) {
    var c = state.sc;
    if (!c || c.picked !== null) return;
    var sc = sceneById(c.id);
    var it = c[c.stage][c.i], ok = c.stage === 'blank' ? it.opts[idx] === it.ans : it.opts[idx].ok;
    c.picked = idx;
    if (ok) { c.right++; c.combo++; } else c.combo = 0;
    sfx(ok ? 'right' : 'wrong', c.combo);
    render();
    if (c.stage === 'blank') setTimeout(function () { if (state.sc === c && c.picked === idx) speak(sc.lines[it.i][0], 0.85); }, 250);
  }
  function scTop(c) {
    var total = scLen(c, 'speak') + scLen(c, 'blank') + scLen(c, 'listen');
    var base = c.stage === 'speak' ? 0 : c.stage === 'blank' ? scLen(c, 'speak') : scLen(c, 'speak') + scLen(c, 'blank');
    var resolved = c.pass || c.picked !== null;
    var done = c.stage === 'mission' ? total : base + c.i + (resolved ? 1 : 0), pct = Math.round(done / total * 100);
    return '<div class="topbar"><button class="icon-btn" data-act="sc-quit" aria-label="그만하기">' + I.close + '</button>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
      '<span class="chip" style="min-width:48px;justify-content:center">' + (c.stage === 'mission' ? total : Math.min(done + (resolved ? 0 : 1), total)) + '/' + total + '</span></div>';
  }
  function scStageTag(c) {
    if (c.stage === 'mission') return '<div class="sc-stage"><b>' + I.check + '</b>' + SC_STAGE.mission + '</div>';
    var order = ['speak', 'blank', 'listen'], cur = order.indexOf(c.stage);
    return '<ol class="sc-steps" aria-label="진행 단계">' + order.map(function (k, i) {
      var st = i < cur ? 'done' : i === cur ? 'on' : '';
      return '<li class="' + st + '"' + (i === cur ? ' aria-current="step"' : '') + '><b>' + (i < cur ? I.check : i + 1) + '</b><span>' + SC_STAGE[k] + '</span></li>';
    }).join('') + '</ol>';
  }
  // 상황 제목과 단계를 한 덩어리로: 위에 제목·몇 번째, 아래에 1-2-3 단계
  function scHead(c, sc, label) {
    return '<div class="sc-head2"><div class="sc-ctx"><span>' + sc.icon + ' ' + esc(sc.title) + '</span><em>' + (c.i + 1) + '번째 ' + label + '</em></div>' + scStageTag(c) + '</div>';
  }
  function scVerdict(ok, c) {
    if (ok === null) return '<div class="qz-slot"></div>';
    return '<div class="qz-slot"><div class="qz-verdict ' + (ok ? 'ok' : 'no') + '" role="status"><img src="img/' + (ok ? 'qz-ok' : 'qz-no') + '.webp" alt="" draggable="false">' +
      '<div class="qv-t"><b>' + (ok ? '맞았어요!' : '틀렸어요!') + '</b><span>' + (ok ? (c.combo >= 2 ? '연속 ' + c.combo + '번 정답' : '잘했어요') : '괜찮아요, 정답을 확인해 봐요') + '</span></div></div></div>';
  }
  function scCurLine(c) {
    var sc = sceneById(c.id);
    return c.stage === 'speak' ? sc.lines[c.i] : sc.lines[c[c.stage][c.i].i];
  }
  function scChunks(l, key) {
    var c = state.sc;
    return '<div class="sc-chunks">' + l[4].map(function (ch, i) {
      return '<button class="sc-chunk' + (key && ch[0].indexOf(key) >= 0 ? ' key' : '') + (c.gloss === i ? ' on' : '') + '" data-act="sc-chunk" data-i="' + i + '">' +
        '<span class="sc-cz">' + esc(ch[0]) + '</span><span class="sc-cp">' + esc(ch[1]) + '</span></button>';
    }).join('') + '</div>';
  }
  function scLineView(l, key) {
    var c = state.sc, g = c.gloss >= 0 ? l[4][c.gloss] : null;
    return '<div class="sc-line">' + scChunks(l, key) +
      '<div class="sc-gloss' + (g ? ' on' : '') + '">' + (g ? '<b>' + esc(g[0].replace(/[，。？！]/g, '')) + '</b> ' + esc(g[2]) : '덩어리를 누르면 소리와 뜻이 나와요') + '</div>' +
      '<div class="sc-ko">' + esc(l[2]) + '</div></div>';
  }
  // 한글 발음은 기본으로 숨겨요. 눌러서 보거나, 따라 말하기를 통과하면 보여요
  function scKrRow(l) {
    var c = state.sc, k = kr(l[1]);
    if (!k) return '';
    var show = state.scKr || c.pass || c.picked !== null;
    return '<button class="sc-krtog' + (show ? ' on' : '') + '" data-act="sc-kr">' + (show ? esc(k) : '한글 발음 보기') + '</button>';
  }
  function viewScene() {
    var c = state.sc, sc = sceneById(c.id);
    if (c.stage === 'mission') return viewSceneMission();
    var top = scTop(c), last = c.i + 1 >= scLen(c, c.stage) && c.stage === 'listen';
    if (c.stage === 'speak') {
      var l = sc.lines[c.i], canSkip = c.pass || c.tries >= 2 || c.noSR;
      var live = c.pass ? '' : c.msg ? esc(c.msg) : c.tries ? '다시 한번 말해 보세요' : '버튼을 누른 채로 따라 말해요';
      var body = '<div class="qz-wrap sc-fit">' + scHead(c, sc, '문장') + '<div class="sc-main">' +
        '<div class="sc-box"><div class="sc-card"><button class="round-btn sc-spk" data-act="say" data-text="' + esc(l[0]) + '" aria-label="듣기">' + I.spk + '</button>' + scLineView(l) + '</div>' + scKrRow(l) + '</div>' +
        '<div class="sc-heard-slot">' + (!c.pass && c.heard ? '<div class="sc-heard">들린 말: ' + esc(c.heard) + '</div>' : '') + '</div></div></div>';
      var foot;
      if (c.pass) foot = qzFoot(true, true, c.combo >= 2 ? '연속 ' + c.combo + '번 정답' : '잘했어요', 'sc-next', '다음');
      else foot = '<div class="mic-area"><div id="live" class="live hint">' + live + '</div>' +
        (c.noSR ? '' : '<button id="scmic" class="mic' + (c.listening ? ' on' : '') + '" data-hold="scmic" aria-label="누른 채로 따라 말하기">' + I.mic + '</button>') +
        (canSkip ? '<button class="link-btn" data-act="sc-skip">' + (c.noSR ? '따라 말했어요' : '넘어가기') + '</button>' : '<div style="height:20px"></div>') + '</div>';
      return '<div class="screen qz-fit">' + top + body + foot + '</div>';
    }
    var it = c[c.stage][c.i], l2 = sc.lines[it.i], answered = c.picked !== null, prompt, opts, ok = false;
    if (c.stage === 'blank') {
      var parts = l2[0].split(l2[3]).map(esc);
      var shown = answered ? parts.join('<mark class="sc-key">' + esc(l2[3]) + '</mark>') : parts.join('<span class="sc-blank">＿＿</span>');
      prompt = '<div class="sc-box">' + (answered ? '<div class="sc-card">' + scLineView(l2, l2[3]) + '</div>' + scKrRow(l2)
        : '<div class="sc-card sc-q"><div class="sc-zh big">' + shown + '</div><div class="sc-ko">' + esc(l2[2]) + '</div></div>') + '</div>';
      ok = answered && it.opts[c.picked] === it.ans;
      opts = '<div class="qz-opts">' + it.opts.map(function (o, i) {
        var cls = 'opt zh-opt';
        if (answered) cls += o === it.ans ? ' ok' : (i === c.picked ? ' no' : ' dim');
        return '<button class="' + cls + '" data-act="sc-pick" data-id="' + i + '"' + (answered ? ' disabled' : '') + '>' + esc(o) + '</button>';
      }).join('') + '</div>';
    } else {
      prompt = '<div class="sc-box">' + (answered ? '<div class="sc-card sc-reveal"><button class="round-btn sc-spk" data-act="say" data-text="' + esc(l2[0]) + '" aria-label="듣기">' + I.spk + '</button>' + scLineView(l2) + '</div>' + scKrRow(l2)
        : '<div class="qz-prompt sc-listen"><button class="listen-btn" data-act="say" data-text="' + esc(l2[0]) + '" aria-label="다시 듣기">' + I.spk + '</button><div class="qz-cap">소리를 듣고 알맞은 뜻을 골라요</div></div>') + '</div>';
      ok = answered && it.opts[c.picked].ok;
      opts = '<div class="qz-opts">' + it.opts.map(function (o, i) {
        var cls = 'opt';
        if (answered) cls += o.ok ? ' ok' : (i === c.picked ? ' no' : ' dim');
        return '<button class="' + cls + '" data-act="sc-pick" data-id="' + i + '"' + (answered ? ' disabled' : '') + '>' + esc(o.ko) + '</button>';
      }).join('') + '</div>';
    }
    var foot2 = qzFoot(answered, ok, ok ? (c.combo >= 2 ? '연속 ' + c.combo + '번 정답' : '잘했어요') : '괜찮아요, 정답을 확인해 봐요', 'sc-next', last ? 'AI 미션으로' : '다음');
    return '<div class="screen qz-fit">' + top + '<div class="qz-wrap sc-fit">' + scHead(c, sc, '문제') + '<div class="sc-main">' + prompt + opts + '</div></div>' + foot2 + '</div>';
  }
  function viewSceneMission() {
    var c = state.sc, sc = sceneById(c.id), on = aiOn(), enough = on && aiBal() >= AI_CHAT_COST;
    var note = !on ? 'AI 대화는 멤버십에서 쓸 수 있어요. 지금은 건너뛰고 마칠 수 있어요.' : (enough ? '대화 한 번에 ' + AI_CHAT_COST + ' 크레딧이 소모돼요.' : '크레딧이 부족해요. 지금은 건너뛰고 마칠 수 있어요.');
    return '<div class="screen">' + scTop(c) + '<div class="qz-wrap sc-pad sc-mis">' + scStageTag(c) +
      '<div class="sc-mis-ico">' + sc.icon + '</div><h1 class="big-title" style="margin:6px 0 4px">배운 말로 직접 해 봐요</h1>' +
      '<p class="sub-title" style="margin:0 0 16px">방금 익힌 문장을 AI 선생님과 실제처럼 써 보는 미션이에요.</p>' +
      '<div class="sc-mis-card"><span>오늘의 미션</span><b>' + esc(sc.mission) + '</b></div>' +
      '<p class="hsk-note" style="text-align:center">' + note + '</p></div>' +
      '<div class="footer"><button class="btn" data-act="sc-mission"' + (enough ? '' : ' disabled') + '>AI와 해 보기</button>' +
      '<button class="btn gray" data-act="sc-finish">다음에 할게요</button></div></div>';
  }
  function scFinish(withMission) {
    var c = state.sc;
    if (!c) return;
    tdMark('scene');
    var sc = sceneById(c.id);
    stopSpeak(); scStopRec();
    var day = dayStr(new Date());
    var d0 = state.daily[day] || { day: day, lessons: 0, answers: 0 };
    var before = d0.answers, goal = state.profile.goal;
    var d = { day: day, lessons: d0.lessons, answers: d0.answers + c.spoke + c.right };
    state.daily[day] = d; store.saveDaily(d);
    scMark(c.id, withMission);
    if (withMission) {
      state.ac = { mode: 'pick', topic: sc.mission, direct: true, busy: false };
      state.sc = null;
      go('aichat'); acStart();
      return;
    }
    var stNow = streak();
    var result = {
      kind: 'scene', title: sc.title + ' 완료!',
      line: '따라 말하기 ' + c.spoke + '문장, 퀴즈 ' + c.right + '/' + (c.blank.length + c.listen.length) + '개 정답이에요.',
      answers: d.answers, goal: goal, goalHit: before < goal && d.answers >= goal,
      milestone: (before === 0 && d.answers > 0 && MILESTONES.indexOf(stNow) >= 0) ? stNow : 0,
      again: { act: 'sc-open', id: sc.id, label: '한 번 더 해보기' }
    };
    state.sc = null;
    sfx(result.goalHit || result.milestone ? 'goal' : 'done');
    go('done', { result: result });
  }
  // 따라 말하기: 누르고 있는 동안만 들어요 (연습 화면과 같은 방식)
  var scRec = null, scHolding = false, scHoldTimer = null;
  function scStopRec() {
    scHolding = false; clearTimeout(scHoldTimer);
    if (scRec) { try { scRec.abort(); } catch (e) { /* 이미 멈춤 */ } scRec = null; }
  }
  function scGrade(list) {
    var c = state.sc, l = sceneById(c.id).lines[c.i], best = 0;
    list.forEach(function (t) { best = Math.max(best, scScore(l[0], t)); });
    c.heard = list[0];
    if (best >= 0.6) { c.pass = true; c.spoke++; c.combo++; c.msg = ''; sfx('right', c.combo); setTimeout(function () { if (state.sc === c && c.pass) speak(l[0], 0.85); }, 250); }
    else { c.tries++; c.combo = 0; c.msg = ''; sfx('wrong'); }
    render();
  }
  function scListen(prev) {
    prev = prev || '';
    var c = state.sc;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!c) return;
    if (!SR) { c.noSR = true; render(); toast('이 브라우저는 음성 인식을 지원하지 않아요'); return; }
    if (scRec) return;
    stopSpeak();
    var finals = [], lastInterim = '', err = '', r = new SR();
    scRec = r;
    r.lang = 'zh-CN'; r.interimResults = true; r.maxAlternatives = 3; r.continuous = false;
    r.onstart = function () {
      if (state.sc !== c) return;
      c.listening = true;
      var m = document.getElementById('scmic'), lv = document.getElementById('live');
      if (m) m.classList.add('on');
      if (lv) { lv.textContent = '듣고 있어요…'; lv.classList.remove('hint'); lv.classList.add('wait'); }
      if (!scHolding) { try { r.stop(); } catch (e) { /* noop */ } }
    };
    r.onresult = function (e) {
      var res = e.results[e.results.length - 1];
      lastInterim = res[0].transcript;
      if (res.isFinal) { finals = []; for (var i = 0; i < res.length; i++) finals.push(res[i].transcript); }
    };
    r.onerror = function (e) { err = e.error || 'error'; };
    r.onend = function () {
      if (scRec === r) scRec = null;
      if (state.sc !== c || state.screen !== 'scene' || c.stage !== 'speak' || c.pass) return;
      var fatal = err === 'not-allowed' || err === 'service-not-allowed' || err === 'audio-capture' || err === 'network';
      if (scHolding && !fatal) {
        var carry = prev + (finals.length ? finals[0] : lastInterim);
        try { scListen(carry); return; } catch (e) { /* 아래에서 마무리 */ }
      }
      c.listening = false;
      var list = finals.length ? finals : (lastInterim ? [lastInterim] : []);
      if (prev) list = list.length ? list.map(function (t) { return prev + t; }) : [prev];
      if (list.length) { scGrade(list); return; }
      c.tries++;
      c.msg = err === 'not-allowed' || err === 'service-not-allowed' ? '마이크 권한을 허용해 주세요'
        : err === 'audio-capture' ? '마이크를 찾지 못했어요'
        : err === 'network' ? '음성 인식 서버에 연결하지 못했어요' : err === 'aborted' ? '' : '목소리가 잘 안 들렸어요. 버튼을 누른 채로 말해 보세요';
      render();
    };
    try { r.start(); } catch (e) { scRec = null; c.msg = '음성 인식을 시작하지 못했어요. 다시 눌러 주세요'; render(); }
  }
  document.addEventListener('pointerdown', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[data-hold="scmic"]');
    var c = state.sc;
    if (!t || state.screen !== 'scene' || !c || c.stage !== 'speak' || c.pass || scRec || state.modal) return;
    e.preventDefault();
    scHolding = true; clearTimeout(scHoldTimer);
    sfx('pop');
    scListen();
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      if (!scHolding) return;
      scHolding = false; clearTimeout(scHoldTimer);
      scHoldTimer = setTimeout(function () { if (scRec && !scHolding) { try { scRec.stop(); } catch (e) { /* noop */ } } }, 450);
    });
  });

  /* ---------- 기억 사슬 (v130): 한자 카드를 쌓아 가며 몇 단계까지 기억하는지 ---------- */
  var CH_LIVES = 3, CH_GRID = 12, CH_SIM_MAX = 5, CH_OLD_MS = 2000, CH_ACTIVE = 10, CH_Q_MAX = 10, CH_GRAD = 2, CH_NEW_MAX = 3;
  var CH_HEART = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3 5 6.4 5c2 0 3.8 1.1 5.6 3.2C13.8 6.100 15.600 5 17.600 5 21 5 23.100 8.300 21.600 11.800 19.500 16.400 12 21 12 21z" fill="currentColor"/></svg>';
  function icn(name, cls) { return '<img class="ic ic-' + name + (cls ? ' ' + cls : '') + '" src="img/ic-' + name + '.webp" alt="" draggable="false">'; }
  function chImg(n, cls) { return '<img class="chr ' + (cls || '') + '" src="img/ch-' + n + '.webp" alt="" draggable="false">'; }
  function chKey() { return 'pangpang.chain.' + (state.user ? state.user.id : 'x'); }
  function chRecAll() { try { return JSON.parse(localStorage.getItem(chKey()) || '{}'); } catch (e) { return {}; } }
  function chRec(lv) { var r = chRecAll()[lv] || {}; return { best: r.best || 0, grads: r.grads || 0, plays: r.plays || 0 }; }
  function chSaveRec(c) {
    var all = chRecAll(), r = all[c.lv] || { best: 0, grads: 0, plays: 0 };
    var isBest = c.stage > r.best;
    r.best = Math.max(r.best, c.stage); r.grads = Math.max(r.grads, c.grads.length); r.plays = (r.plays || 0) + 1;
    all[c.lv] = r;
    try { localStorage.setItem(chKey(), JSON.stringify(all)); } catch (e) { /* 무시 */ }
    return isBest;
  }
  function chPy(w) { return String(w[1]).replace(/[\s'’]/g, '').toLowerCase(); }
  function chAlive(c, tok) { return state.screen === 'chain' && state.ch === c && c.tok === tok; }
  function chStop() { var c = state.ch; if (c) { c.tok++; clearTimeout(c.timer); clearTimeout(c.qt); } stopSpeak(); }
  function startChain(lv) {
    var list = hskList(lv);
    if (!list.length) return;
    if (hskLocked(lv)) { go('pay', { payWhy: 'HSK ' + lv + '급은 멤버십이 필요해요. 1급은 무료예요.' }); return; }
    var idx = list.map(function (_, i) { return i; }), unk = shuffle(idx.filter(function (i) { return !hskKnown(lv, i); })), kn = shuffle(idx.filter(function (i) { return hskKnown(lv, i); }));
    state.ch = { lv: lv, order: unk.concat(kn), next: 0, stage: 0, active: [], grads: [], lives: CH_LIVES, combo: 0, maxCombo: 0, right: 0, tok: 0, phase: 'intro', seq: [], si: 0, qs: [], qi: 0, grid: [], pick: -1, stageGrads: 0 };
    go('chain');
    chNextStage();
  }
  function chNextStage() {
    var c = state.ch, oldList = c.active.slice(0, CH_ACTIVE);
    c.stage++;
    var want = c.stage <= CH_ACTIVE ? 1 : Math.min(CH_NEW_MAX, Math.max(1, CH_ACTIVE - c.active.length)), fresh = [];
    while (fresh.length < want && c.next < c.order.length) fresh.push({ i: c.order[c.next++], streak: 0 });
    if (!fresh.length && !c.active.length) { c.stage--; chOver(true); return; }
    c.active = c.active.concat(fresh);
    c.stageGrads = 0;
    var oldMs = CH_OLD_MS;
    c.seq = shuffle(oldList.slice()).map(function (a) { return { i: a.i, kind: 'old', ms: oldMs }; })
      .concat(fresh.map(function (a) { return { i: a.i, kind: 'new', ms: 3200 }; }));
    c.si = 0; c.phase = 'intro'; c.tok++;
    chShowSeq();
  }
  function chShowSeq() {
    var c = state.ch, tok = c.tok;
    if (c.si >= c.seq.length) { chStartAsk(); return; }
    var it = c.seq[c.si], w = hskList(c.lv)[it.i];
    c.phase = 'intro';
    render();
    speak(w[0], it.kind === 'new' ? 0.8 : 0.9);
    clearTimeout(c.timer);
    c.timer = setTimeout(function () { if (chAlive(c, tok) && c.phase === 'intro') { c.si++; chShowSeq(); } }, it.ms);
  }
  function chSkip() {
    var c = state.ch;
    if (!c || c.phase !== 'intro') return;
    clearTimeout(c.timer); c.si++; chShowSeq();
  }
  var CH_LOOK = ["己已巳", "未末", "土士", "人入八", "大太犬天夫", "日目白百自", "午牛", "力刀九几", "木本禾", "玉王主", "买卖", "休体", "请清情晴青", "间问闻", "现视观", "妈吗马码骂", "我找或", "那哪都部", "他她它", "喝渴", "住往注", "做作", "到倒", "在左右有", "说谁讲", "字学", "河可何", "两雨", "时对", "晚免", "理里", "钱线", "园圆", "常掌", "待持", "万方", "汉汗", "师帅", "球求", "经轻", "机几", "极级", "忙忘", "完元", "病痛", "近远", "进过", "床庆", "但担", "候侯", "午干千", "了子", "乐药", "发友", "看着", "想相", "样洋", "么公", "坐座", "房访", "睡垂", "饭饮饿", "钟种", "张长", "头买", "雪雪雨", "姐组", "爸爷", "哥歌", "弟第", "妹味", "脚脸", "病满", "块快", "坏环", "办务", "边过", "先老", "北比", "白的", "吧把", "被披", "没设", "只贝见", "难谁", "错借", "知和", "知如", "刚钢", "岁多", "冷今", "热热然", "影景", "音意", "因困", "同问", "听所", "吃乞", "给络", "算管", "笑笔", "第茶", "蓝篮", "累果", "课果", "票栗", "穿空", "牙芽", "药约", "药乐", "再冉", "百面", "面西", "要西", "西四", "四回", "回国", "国图", "图团", "医区", "所听", "新亲", "商高", "京凉", "京就", "吃吗", "晴睛", "睛情", "球理", "周用", "用月", "月明", "明朋", "朋服", "服报", "报很", "很得", "得待", "往主", "中申甲由", "古右石", "且具真", "开井并共", "无元兄先充", "少小水米", "买头实", "司同问间", "向回问", "开关", "干于平", "千于子", "土上王", "工土干", "士土工", "口日曰", "目且自", "门问间", "字字宇", "守字完安宅", "安案", "家象", "写与", "考老", "孝教", "找我戏", "成城盛", "功攻", "识试", "话活舌", "语说话", "读卖续", "诉说", "该这", "还不环", "过边迈", "进近远运", "送迎", "道首", "选洗", "张帐长", "站占", "点店", "电雷", "雨雪", "云去会", "会合", "令今冷", "食良", "七匕", "六大", "十千", "二三", "三王", "五吾", "四西", "八人", "九丸", "万历", "百白", "零雾", "元完", "角用", "分份", "公么", "为办", "办力", "多夕", "夜夕", "名多", "外夕", "岁山", "出击", "生主", "性姓", "姓性", "她姐", "妹姐", "妻妾", "娘良", "儿几", "几九", "孩该", "校较", "样羊", "养羊", "美姜", "着看", "着差", "差羞", "算第", "等待", "笔毛", "笑夭", "第弟", "简间", "管馆", "馆饭", "饿我", "饱包", "包胞", "跑泡", "跳桃", "路各", "客各", "落洛", "着著", "影京", "京景", "凉京", "就京", "高亮", "亮高", "低底", "低纸", "纸低", "报服", "假段", "健建", "键建", "信言", "语话", "记已", "已己", "讲进", "课谁", "谁难", "准谁", "推谁"];
  var CH_LOOK_MAP = {};
  CH_LOOK.forEach(function (g, gi) { Array.from(g).forEach(function (ch) { (CH_LOOK_MAP[ch] = CH_LOOK_MAP[ch] || []).push(gi); }); });
  // 두 한자가 같거나 모양이 비슷하면 점수 (같은 글자 2점, 비슷한 글자 3점)
  function chCharSim(a, b) {
    if (a === b) return 2;
    var A = CH_LOOK_MAP[a], B = CH_LOOK_MAP[b];
    return A && B && A.some(function (x) { return B.indexOf(x) >= 0; }) ? 3 : 0;
  }
  function chSim(t, w) {
    var T = Array.from(t), W = Array.from(w), s = 0;
    T.forEach(function (x) { var m = 0; W.forEach(function (y) { m = Math.max(m, chCharSim(x, y)); }); s += m; });
    return s ? s + (T.length === W.length ? 1 : 0) : 0;
  }
  function chGridFor(c, ti) {
    var list = hskList(c.lv), t = list[ti], used = {}, pick = [ti];
    used[chPy(t)] = 1;
    function add(i) {
      if (pick.length >= CH_GRID || pick.indexOf(i) >= 0) return;
      var k = chPy(list[i]);
      if (used[k]) return;
      used[k] = 1; pick.push(i);
    }
    // 1) 모양이 비슷한 단어를 먼저 몇 개 섞어요 (소리는 다른 것만)
    var sims = [];
    list.forEach(function (w, i) { if (i !== ti) { var s = chSim(t[0], w[0]); if (s > 0) sims.push({ i: i, s: s + Math.random() * 0.9 }); } });
    sims.sort(function (x, y) { return y.s - x.s; });
    sims.slice(0, 24).forEach(function (x) { if (pick.length < 1 + CH_SIM_MAX) add(x.i); });
    shuffle(c.active.map(function (a) { return a.i; })).forEach(add);
    shuffle(c.grads.slice()).forEach(add);
    shuffle(list.map(function (_, i) { return i; })).forEach(add);
    return shuffle(pick);
  }
  function chStartAsk() {
    var c = state.ch;
    var pool = c.active.slice(), n = Math.min(pool.length, CH_Q_MAX);
    var newIds = c.seq.filter(function (s) { return s.kind === 'new'; }).map(function (s) { return s.i; });
    var must = pool.filter(function (a) { return newIds.indexOf(a.i) >= 0; });
    var weak = shuffle(pool.filter(function (a) { return newIds.indexOf(a.i) < 0 && a.streak === 0; }));
    var rest = shuffle(pool.filter(function (a) { return newIds.indexOf(a.i) < 0 && a.streak > 0; }));
    c.qs = shuffle(must.concat(weak, rest).slice(0, n)).map(function (a) { return a.i; });
    c.qi = 0;
    chAsk();
  }
  function chSecs(c) { return Math.max(4, Math.min(6, 6 - c.stage * 0.08)); }
  function chAsk() {
    var c = state.ch, tok = ++c.tok, ti = c.qs[c.qi];
    c.phase = 'ask'; c.pick = -1; c.grid = chGridFor(c, ti); c.secs = chSecs(c);
    render();
    setTimeout(function () { if (chAlive(c, tok) && c.phase === 'ask') speak(hskList(c.lv)[ti][0], 0.85); }, 250);
    clearTimeout(c.qt);
    c.qt = setTimeout(function () { if (chAlive(c, tok) && c.phase === 'ask') chAnswer(-1); }, c.secs * 1000 + 300);
  }
  function chAnswer(pos) {
    var c = state.ch;
    if (!c || c.phase !== 'ask') return;
    clearTimeout(c.qt);
    var ti = c.qs[c.qi], tok = ++c.tok, ok = pos >= 0 && c.grid[pos] === ti, a = c.active.filter(function (x) { return x.i === ti; })[0], grad = false;
    c.phase = 'fb'; c.pick = pos; c.ok = ok; c.timeout = pos < 0;
    if (ok) {
      c.right++; c.combo++; c.maxCombo = Math.max(c.maxCombo, c.combo); a.streak++;
      sfx('right', c.combo);
      if (c.stage >= CH_ACTIVE && a.streak >= CH_GRAD) {
        grad = true; c.active = c.active.filter(function (x) { return x !== a; });
        c.grads.push(ti); c.stageGrads++;
        setHskKnown(c.lv, ti, true); srsGrade(c.lv, ti, true);
      }
    } else {
      c.lives--; c.combo = 0; a.streak = 0;
      srsGrade(c.lv, ti, false);
      sfx('wrong');
    }
    c.grad = grad;
    render();
    var fbEl = document.querySelector('.ch-fb');
    if (fbEl && fbEl.scrollIntoView) fbEl.scrollIntoView({ block: 'nearest' });
    speak(hskList(c.lv)[ti][0], 0.9);
    clearTimeout(c.timer);
    c.timer = setTimeout(function () {
      if (!chAlive(c, tok)) return;
      if (c.lives <= 0) { chOver(false); return; }
      c.qi++;
      if (c.qi >= c.qs.length) chClear(); else chAsk();
    }, ok ? 1000 : 1700);
  }
  function chClear() {
    var c = state.ch, tok = ++c.tok;
    c.phase = 'clear';
    sfx('goal');
    render();
    clearTimeout(c.timer);
    c.timer = setTimeout(function () { if (chAlive(c, tok)) chNextStage(); }, 1600);
  }
  function chOver(all) {
    var c = state.ch;
    tdMark('ch-start');
    chStop();
    var best0 = chRec(c.lv).best, isBest = chSaveRec(c);
    var result = { kind: 'chain', lv: c.lv, stage: c.stage, grads: c.grads.length, right: c.right, maxCombo: c.maxCombo, isBest: isBest && c.stage > 1, best: Math.max(best0, c.stage), all: !!all };
    sfx(isBest ? 'goal' : 'done');
    go('done', { result: result });
  }
  function chainDone(r) {
    return '<div class="screen done-screen">' + (r.isBest ? confetti() : '') + '<div class="hero ch-done">' +
      '<div class="stage">' + chImg(r.isBest || r.all ? 'trophy' : r.stage >= 5 ? 'love' : r.stage >= 3 ? 'cheer' : 'focus', 'chr-done') + '</div>' +
      '<div class="ch-big"><span>' + icn('stage-flag') + (r.all ? 'ALL CLEAR' : 'STAGE') + '</span><b>' + r.stage + '</b></div>' +
      '<h1>' + (r.all ? '이 급의 단어를 모두 만났어요!' : r.stage + '단계까지 기억했어요') + '</h1>' +
      '<p>' + (r.isBest ? icn('trophy') + ' 최고 기록을 새로 세웠어요!' : 'HSK ' + r.lv + '급 최고 기록은 ' + r.best + '단계예요') + '</p>' +
      '<div class="ch-stats"><div>' + icn('grad-cap') + '<b>' + r.grads + '</b><span>졸업한 카드</span></div><div>' + icn('medal') + '<b>' + r.right + '</b><span>맞힌 문제</span></div><div>' + icn('flame') + '<b>' + r.maxCombo + '</b><span>최고 연속</span></div></div>' +
      '<p class="hsk-note" style="text-align:center;margin:12px 0 0">틀린 단어는 내일 복습에 나와요</p>' +
      '</div><div class="footer" style="padding-left:0;padding-right:0">' +
      '<button class="btn" data-act="ch-start" data-id="' + r.lv + '">다시 도전</button>' +
      '<button class="btn gray" data-act="ch-back" data-id="' + r.lv + '">HSK ' + r.lv + '급으로</button></div></div>';
  }
  function chTop(c) {
    var hearts = '';
    for (var k = 0; k < CH_LIVES; k++) hearts += '<span class="ch-heart' + (k < c.lives ? ' on' : '') + (c.phase === 'fb' && !c.ok && k === c.lives ? ' pop' : '') + '">' + icn(k < c.lives ? 'heart' : 'heart-empty') + '</span>';
    return '<div class="topbar ch-top"><button class="icon-btn" data-act="ch-quit" aria-label="그만하기">' + I.close + '</button>' +
      '<div class="ch-hearts" aria-label="남은 목숨 ' + c.lives + '개">' + hearts + '</div>' +
      '<span class="chip y ch-stage">' + icn('stage-flag') + 'STAGE ' + c.stage + '</span></div>';
  }
  function chStrip(c) {
    return '<div class="ch-strip"><span>' + icn('chain') + ' 기억 중 <b>' + c.active.length + '</b></span><span>' + icn('grad-cap') + ' 졸업 <b>' + c.grads.length + '</b></span>' +
      (c.combo >= 2 ? '<span class="ch-combo">' + icn('flame') + ' ' + c.combo + '연속</span>' : '') + '</div>';
  }
  function chFit(zh, big) {
    var n = Array.from(zh).length;
    return big ? 'min(' + (n === 1 ? 120 : n === 2 ? 96 : 72) + 'px, calc((100vw - 96px) / ' + n + '))' : (n === 1 ? 40 : n === 2 ? 30 : 22) + 'px';
  }
  function viewChain() {
    var c = state.ch, list = hskList(c.lv), top = chTop(c);
    if (c.phase === 'intro') {
      if (!c.seq[c.si]) return '<div class="screen"></div>';
      var it = c.seq[c.si], w = list[it.i], isNew = it.kind === 'new';
      var dots = c.seq.map(function (s, k) { return '<i class="' + (k < c.si ? 'done' : k === c.si ? 'cur' : '') + (s.kind === 'new' ? ' nw' : '') + '"></i>'; }).join('');
      return '<div class="screen qz-fit">' + top + '<div class="qz-wrap ch-wrap ch-intro">' + chStrip(c) +
        '<button class="ch-card ' + (isNew ? 'new' : 'old') + '" data-act="ch-skip" aria-label="다음으로">' +
        '<span class="ch-tag">' + (isNew ? '✨ 새 카드' : '다시 보기') + '</span>' +
        '<span class="ch-zh" style="font-size:' + chFit(w[0], true) + '">' + esc(w[0]) + '</span><span class="ch-py">' + esc(w[1]) + '</span>' +
        (isNew ? '<span class="ch-ko">' + esc(w[2]) + '</span><span class="ch-tap">화면을 누르면 넘어가요</span>' : '<span class="ch-ko ch-ghost">&nbsp;</span>') + '</button>' +
        '<div class="ch-dots">' + dots + '</div></div></div>';
    }
    if (c.phase === 'clear') {
      var nx = Math.min(CH_NEW_MAX, Math.max(1, CH_ACTIVE - c.active.length));
      return '<div class="screen">' + top + '<div class="ch-clear">' + confetti() + '<div class="ch-clear-ico">' + chImg(c.stageGrads ? 'grad' : c.combo >= 5 ? 'fire' : 'clear', 'chr-clear') + '</div><h1>STAGE ' + c.stage + ' CLEAR!</h1>' +
        '<p>' + (c.stageGrads ? icn('grad-cap') + ' 카드 ' + c.stageGrads + '장 졸업' : '다음 단계로 가요') + '</p>' +
        '<div class="ch-clear-sum"><span>' + icn('chain') + ' 기억 중 <b>' + c.active.length + '</b></span><span>' + icn('grad-cap') + ' 졸업 <b>' + c.grads.length + '</b></span></div></div></div>';
    }
    var ti = c.qs[c.qi], t = list[ti], fb = c.phase === 'fb';
    var tiles = c.grid.map(function (i, pos) {
      var w = list[i], cls = 'ch-tile';
      if (fb) cls += i === ti ? ' ok' : (pos === c.pick ? ' no' : ' dim');
      return '<button class="' + cls + '" data-act="ch-pick" data-id="' + pos + '"' + (fb ? ' disabled' : '') + ' style="font-size:' + chFit(w[0], false) + '"><span>' + esc(w[0]) + '</span></button>';
    }).join('');
    var fbHtml = fb ? '<div class="ch-fb ' + (c.ok ? 'ok' : 'no') + '">' + chImg(!c.ok ? 'sad' : c.grad ? 'grad' : c.combo >= 3 ? 'fire' : 'cheer', 'chr-fb') + '<b class="zh">' + esc(t[0]) + '</b><span>' + esc(t[1]) + ' · ' + esc(t[2].split(',')[0]) + '</span>' +
      (c.ok ? '<em>' + (c.grad ? icn('grad-cap') + ' 졸업!' : '+1') + '</em>' : '<em>' + (c.timeout ? '시간 초과' : '아쉬워요') + '</em>') + '</div>' : '<div class="ch-fb ghost"></div>';
    var bar = fb ? '<div class="ch-timer"><i style="width:0"></i></div>' : '<div class="ch-timer run"><i style="animation-duration:' + c.secs + 's"></i></div>';
    return '<div class="screen qz-fit">' + top + '<div class="qz-wrap ch-wrap ch-ask">' + chStrip(c) +
      '<div class="ch-q"><button class="listen-btn' + (fb ? '' : ' ping') + '" data-act="ch-hear" aria-label="다시 듣기">' + I.spk + '</button>' +
      '<div class="qz-cap">소리를 듣고 한자를 찾아요 · ' + (c.qi + 1) + '/' + c.qs.length + '</div></div>' +
      bar + '<div class="ch-grid">' + tiles + '</div>' + fbHtml + '</div></div>';
  }

  /* ---------- 소나기 퀴즈 (v148): 소리를 듣고 하늘에서 떨어지는 한자를 눌러 잡아요 ---------- */
  var RN_LIVES = 3, RN_WAVES = 10, RN_DROPS = 6, RN_LANES = [0.2, 0.5, 0.8];
  function rnKey() { return 'pangpang.rain.' + (state.user ? state.user.id : 'x'); }
  function rnRecAll() { try { return JSON.parse(localStorage.getItem(rnKey()) || '{}'); } catch (e) { return {}; } }
  function rnBest(lv) { var r = rnRecAll()[lv]; return r ? (r.best || 0) : 0; }
  function rnSaveBest(lv, score) {
    var all = rnRecAll(), r = all[lv] || { best: 0, plays: 0 }, nb = score > r.best;
    r.best = Math.max(r.best, score); r.plays = (r.plays || 0) + 1; all[lv] = r;
    try { localStorage.setItem(rnKey(), JSON.stringify(all)); } catch (e) { /* 무시 */ }
    return nb;
  }
  function rnPyOn() { try { return localStorage.getItem('pangpang.rain.py') === '1'; } catch (e) { return false; } }
  function rnStop() { var r = state.rn; if (r) { r.tok++; cancelAnimationFrame(r.raf); clearTimeout(r.tm); } stopSpeak(); }
  function rnAlive(r, tok) { return state.screen === 'rain' && state.rn === r && r.tok === tok; }
  function startRain(lv) {
    var list = hskList(lv);
    if (list.length < RN_DROPS + 2) { toast('단어가 부족해요'); return; }
    if (hskLocked(lv)) { go('pay', { payWhy: 'HSK ' + lv + '급은 멤버십이 필요해요. 1급은 무료예요.' }); return; }
    var targets = shuffle(hskPick(lv, RN_WAVES)).map(function (q) { return q.i; });
    state.rn = { lv: lv, phase: 'ready', py: rnPyOn(), targets: targets, wave: 0, lives: RN_LIVES, score: 0, combo: 0, maxCombo: 0, right: 0,
      missed: [], drops: [], cur: null, fb: '', tok: 0, raf: 0, tm: 0, H: 0, uid: 0, before: todayAnswers() };
    go('rain');
  }
  function rnBegin() {
    var r = state.rn; if (!r || r.phase !== 'ready') return;
    r.phase = 'play'; r.tok++; r.last = performance.now();
    render();
    r.raf = requestAnimationFrame(function () { rnLoop(r, r.tok); });
    rnWave();
  }
  function rnWave() {
    var r = state.rn, tok = r.tok;
    if (!rnAlive(r, tok)) return;
    if (r.wave >= r.targets.length) { rnFinish(); return; }
    var list = hskList(r.lv), ti = r.targets[r.wave], tw = list[ti], tlen = Array.from(tw[0]).length;
    // 소리가 같은 다른 한자는 구분할 수 없으니 빼고, 글자 수가 비슷한 한자를 헷갈리는 보기로 써요
    var pool = shuffle(list.map(function (_, i) { return i; })).filter(function (i) { return i !== ti && list[i][0] !== tw[0] && chPy(list[i]) !== chPy(tw); });
    pool.sort(function (a, b) { return Math.abs(Array.from(list[a][0]).length - tlen) - Math.abs(Array.from(list[b][0]).length - tlen); });
    var seq = shuffle([ti].concat(pool.slice(0, RN_DROPS - 1)));
    var dur = Math.max(5.5, 10 - r.wave * 0.45), lane = -1, prev = -1, lanes = [];
    r.drops = seq.map(function (wi, k) {
      do { lane = Math.floor(Math.random() * RN_LANES.length); } while (lane === prev);
      prev = lane;
      return { id: ++r.uid, i: wi, isT: wi === ti, x: RN_LANES[lane] + (Math.random() - 0.5) * 0.1, delay: 0.25 + k * 0.7 + Math.random() * 0.2, dur: dur, y: 0, live: false, dead: false, el: null };
    });
    r.cur = { ti: ti, t: 0, done: false, err: false };
    r.fb = '';
    var fbEl = document.querySelector('.rn-fb'); if (fbEl) fbEl.innerHTML = '';
    var wv = document.querySelector('.rn-wave'); if (wv) wv.textContent = '웨이브 ' + (r.wave + 1) + '/' + r.targets.length;
    var field = document.querySelector('.rn-field'); if (field) field.innerHTML = '';
    clearTimeout(r.tm);
    r.tm = setTimeout(function () { if (rnAlive(r, tok) && r.cur && !r.cur.done) speak(tw[0], 0.85); }, 250);
  }
  function rnPosY(r, d) { return -72 + d.y * (r.H + 8); }
  function rnMakeEl(r, d) {
    var list = hskList(r.lv), w = list[d.i], n = Array.from(w[0]).length;
    var b = document.createElement('button');
    b.className = 'rn-drop'; b.setAttribute('data-rid', d.id); b.type = 'button';
    b.style.left = (d.x * 100) + '%';
    b.style.fontSize = (n === 1 ? 34 : n === 2 ? 28 : n === 3 ? 23 : 19) + 'px';
    b.innerHTML = '<span class="zh">' + esc(w[0]) + '</span>' + (r.py ? '<small>' + esc(w[1]) + '</small>' : '');
    b.style.transform = 'translate(-50%,' + rnPosY(r, d) + 'px)';
    d.el = b;
    return b;
  }
  function rnAttach() {
    var r = state.rn; if (!r || r.phase !== 'play') return;
    var field = document.querySelector('.rn-field'); if (!field) return;
    r.H = field.clientHeight;
    r.drops.forEach(function (d) { if (d.live && !d.dead) field.appendChild(rnMakeEl(r, d)); else d.el = null; });
    field.addEventListener('pointerdown', function (e) {
      var b = e.target.closest ? e.target.closest('.rn-drop') : null;
      if (!b) return;
      e.preventDefault();
      rnTap(parseInt(b.getAttribute('data-rid'), 10));
    });
  }
  function rnLoop(r, tok) {
    if (!rnAlive(r, tok)) return;
    var now = performance.now(), dt = Math.min((now - r.last) / 1000, 0.1);
    r.last = now;
    var field = document.querySelector('.rn-field');
    if (field && !state.modal && r.cur && !r.cur.done) {
      if (!r.H) r.H = field.clientHeight;
      r.cur.t += dt;
      r.drops.forEach(function (d) {
        if (d.dead) return;
        if (!d.live) {
          if (r.cur.t < d.delay) return;
          d.live = true; field.appendChild(rnMakeEl(r, d));
        }
        d.y += dt / d.dur;
        if (d.el) d.el.style.transform = 'translate(-50%,' + rnPosY(r, d) + 'px)';
        if (d.y >= 1) {
          if (d.isT) rnMiss(r, d);
          else { d.dead = true; if (d.el) { var le = d.el; le.classList.add('gone'); setTimeout(function () { le.remove(); }, 450); d.el = null; } }
        }
      });
    }
    r.raf = requestAnimationFrame(function () { rnLoop(r, tok); });
  }
  function rnHearts(r) {
    var h = '';
    for (var k = 0; k < RN_LIVES; k++) h += '<span class="ch-heart' + (k < r.lives ? ' on' : '') + '">' + icn(k < r.lives ? 'heart' : 'heart-empty') + '</span>';
    return h;
  }
  function rnUpdateHud() {
    var r = state.rn, h = document.querySelector('.rn-hearts'), s = document.querySelector('.rn-score'), c = document.querySelector('.rn-combo');
    if (h) h.innerHTML = rnHearts(r);
    if (s) s.textContent = r.score + '점';
    if (c) c.innerHTML = r.combo >= 2 ? icn('flame') + ' ' + r.combo + '연속' : '';
  }
  function rnShowFb(r, ok, text) {
    var w = hskList(r.lv)[r.cur.ti];
    r.fb = '<div class="rn-fbc ' + (ok ? 'ok' : 'no') + '">' + chImg(ok ? (r.combo >= 3 ? 'fire' : 'cheer') : 'sad', 'chr-fb') +
      '<div><b class="zh">' + esc(w[0]) + '</b> <span>' + esc(w[1]) + '</span><em>' + esc(w[2].split(',')[0].split(';')[0]) + ' · ' + text + '</em></div></div>';
    var el = document.querySelector('.rn-fb'); if (el) el.innerHTML = r.fb;
  }
  function rnEndWave(r, ok) {
    var tok = r.tok, ti = r.cur.ti;
    r.cur.done = true;
    bumpAnswer();
    setHskKnown(r.lv, ti, ok); srsGrade(r.lv, ti, ok);
    if (!ok) r.missed.push(hskList(r.lv)[ti][0]);
    r.wave++;
    rnUpdateHud();
    // 남은 한자는 부드럽게 사라져요
    r.drops.forEach(function (d) { if (d.el && !d.isT) { d.el.classList.add('gone'); } });
    clearTimeout(r.tm);
    r.tm = setTimeout(function () {
      if (!rnAlive(r, tok)) return;
      if (r.lives <= 0 || r.wave >= r.targets.length) rnFinish(); else rnWave();
    }, ok ? 1100 : 1500);
  }
  function rnTap(id) {
    var r = state.rn;
    if (!r || r.phase !== 'play' || !r.cur || r.cur.done || state.modal) return;
    var d = r.drops.filter(function (x) { return x.id === id; })[0];
    if (!d || d.dead) return;
    if (d.isT) {
      r.combo++; r.maxCombo = Math.max(r.maxCombo, r.combo); r.right++;
      r.score += 100 + Math.min(r.combo, 5) * 10 + Math.round(Math.max(0, 1 - d.y) * 50);
      sfx('right', r.combo);
      if (d.el) d.el.classList.add('ok');
      d.dead = true;
      rnShowFb(r, true, r.cur.err ? '잡았어요' : '정답!');
      rnEndWave(r, !r.cur.err);
    } else {
      r.cur.err = true; r.combo = 0; r.lives--;
      sfx('wrong');
      d.dead = true;
      if (d.el) { var el = d.el; el.classList.add('no'); setTimeout(function () { el.remove(); }, 350); d.el = null; }
      if (r.lives <= 0) { rnShowFb(r, false, '아쉬워요'); rnEndWave(r, false); }
      else rnUpdateHud();
    }
  }
  function rnMiss(r, d) {
    if (r.cur.done) return;
    d.dead = true;
    r.combo = 0; r.lives--;
    sfx('wrong');
    if (d.el) d.el.classList.add('miss');
    rnShowFb(r, false, '놓쳤어요');
    rnEndWave(r, false);
  }
  function rnFinish() {
    var r = state.rn; if (!r) return;
    tdMark('rain-start');
    var lv = r.lv, goal = state.profile.goal, now = todayAnswers(), hit = r.before < goal && now >= goal;
    var nb = rnSaveBest(lv, r.score), cleared = r.lives > 0;
    rnStop();
    sfx(hit ? 'goal' : 'done');
    go('done', { result: {
      kind: 'rain', title: cleared ? '소나기가 그쳤어요!' : '소나기 퀴즈 끝!',
      line: r.targets.length + '개 중 ' + r.right + '개 잡았어요. ' + r.score + '점' + (nb ? ' (최고 기록!)' : '') + '.',
      answers: now, goal: goal, goalHit: hit, milestone: 0,
      again: { act: 'rain-start', id: String(lv), label: '한 번 더 하기' }
    } });
  }
  function viewRain() {
    var r = state.rn, close = '<button class="icon-btn" data-act="rn-quit" aria-label="그만하기">' + I.close + '</button>';
    if (r.phase === 'ready') {
      var best = rnBest(r.lv);
      return '<div class="screen qz-fit"><div class="topbar">' + close + '<span class="chip y">HSK ' + r.lv + '급</span></div>' +
        '<div class="qz-wrap qz-ctr rn-ready">' + chImg('cheer', 'chr-rn') +
        '<h1 class="rn-title">소나기 퀴즈</h1>' +
        '<ul class="rn-rules"><li>' + icn('flame') + ' 소리를 듣고 떨어지는 한자 중에서 맞는 걸 눌러요</li>' +
        '<li>' + icn('heart') + ' 틀리게 누르거나 놓치면 목숨이 하나씩 줄어요</li>' +
        '<li>' + icn('trophy') + ' 빨리 잡을수록, 연속으로 맞출수록 점수가 높아요</li></ul>' +
        '<button class="rn-pytog' + (r.py ? ' on' : '') + '" data-act="rn-py" aria-pressed="' + (r.py ? 'true' : 'false') + '"><i></i> 병음 힌트 ' + (r.py ? '켜짐' : '꺼짐') + '</button>' +
        (best ? '<p class="rn-best">내 최고 기록 <b>' + best + '점</b></p>' : '') + '</div>' +
        '<div class="footer"><button class="btn" data-act="rn-go">시작하기</button></div></div>';
    }
    return '<div class="screen qz-fit"><div class="topbar ch-top">' + close + '<div class="ch-hearts rn-hearts">' + rnHearts(r) + '</div><span class="chip y rn-score">' + r.score + '점</span></div>' +
      '<div class="rn-wrap"><div class="rn-hud"><span class="rn-wave">웨이브 ' + Math.min(r.wave + 1, r.targets.length) + '/' + r.targets.length + '</span><span class="rn-combo">' + (r.combo >= 2 ? icn('flame') + ' ' + r.combo + '연속' : '') + '</span></div>' +
      '<div class="rn-field" aria-label="떨어지는 한자"></div>' +
      '<div class="rn-ctl"><button class="listen-btn" data-act="rn-hear" aria-label="다시 듣기">' + I.spk + '</button><div class="rn-fb" role="status">' + r.fb + '</div></div></div></div>';
  }

  function startDialog(id) {
    var d = (window.DIALOGS || []).filter(function (x) { return x.id === id; })[0];
    if (!d) return;
    if (dialogLocked(id)) { go('pay', { payWhy: '이 상황 대화는 멤버십이 필요해요. 첫 번째 대화는 무료예요.' }); return; }
    var qs = d.turns.map(function (t, i) {
      return { id: 'dlg-' + d.id + '-' + (i + 1), lessonId: null, zh: t.zh, py: t.py, ko: t.ko, a: t.a, must: t.must };
    });
    beginSession('dialog', qs, null, { dlg: { id: d.id, title: d.title }, log: [] });
  }
  function finishDialog() {
    var s = state.s, day = dayStr(new Date());
    tdMark('dialog');
    var d0 = state.daily[day] || { day: day, lessons: 0, answers: 0 };
    var before = d0.answers, goal = state.profile.goal;
    var d = { day: day, lessons: d0.lessons, answers: d0.answers + Math.max(s.solved - s.solvedCommitted, 0) };
    state.daily[day] = d; store.saveDaily(d);
    var ft = Object.keys(s.first).filter(function (k) { return s.first[k] === true; }).length;
    if (state.profile.dlg.indexOf(s.dlg.id) < 0) { state.profile.dlg = state.profile.dlg.concat([s.dlg.id]); store.saveProfile(); }
    var stNow = streak();
    var result = {
      kind: 'dialog', title: s.dlg.title + ' 대화 완료!',
      line: s.total + '번 주고받으며 ' + ft + '번은 한 번에 말했어요.',
      answers: d.answers, goal: goal, goalHit: before < goal && d.answers >= goal,
      milestone: (before === 0 && d.answers > 0 && MILESTONES.indexOf(stNow) >= 0) ? stNow : 0,
      again: { act: 'dialog-start', id: s.dlg.id, label: '한 번 더 해보기' }
    };
    stopSpeak();
    sfx(result.goalHit || result.milestone ? 'goal' : 'done');
    go('done', { result: result });
  }
  function sayCurrentQuestion() {
    var s = state.s;
    setTimeout(function () {
      if (state.screen === 'practice' && state.s === s && s.phase === 'ask' && !s.listening && s.cur) {
        var q0 = s.cur;
        if (s.kind === 'dialog' && !s.guideOn) {
          var shown = false;
          var show = function () {
            if (shown) return; shown = true;
            if (state.s !== s || s.cur !== q0 || s.phase !== 'ask') return;
            setTimeout(function () {
              if (state.s !== s || s.cur !== q0 || s.phase !== 'ask') return;
              s.guideOn = true;
              var g = document.getElementById('dlg-guide');
              if (g) { g.classList.add('on'); g.removeAttribute('aria-hidden'); }
            }, 250);
          };
          setTimeout(show, 9000);          // 음성이 안 끝나는 기기를 위한 안전장치
          speak(q0.zh, undefined, show);
        } else speak(q0.zh);
      }
    }, 350);
  }

  var rec = null;
  function stopRec() {
    if (rec) { try { rec.abort(); } catch (e) { /* 이미 멈춤 */ } rec = null; }
  }

  function submit(transcripts) {
    var s = state.s;
    var q = s.cur;
    var r = Grade.check(q, transcripts);
    s.heard = r.heard;
    s.msg = '';
    if (r.pass) {
      if (s.first[q.id] === undefined) s.first[q.id] = (s.tries === 0 && !s.revealed);
      s.queue.shift();
      s.solved++;
      if (s.kind === 'lesson') tdLessonQ(1);
      s.pass = true;
      if (s.log) s.log.push({ npc: q.zh, me: r.heard });
      s.mood = pick(['love', 'thumbs', 'wink']);
      s.combo = (s.tries === 0 && !s.revealed) ? s.combo + 1 : 0;
      sfx('right', s.combo);
    } else {
      s.tries++;
      s.wrong[q.id] = (s.wrong[q.id] || 0) + 1;
      s.first[q.id] = false;
      s.pass = false;
      s.combo = 0;
      sfx('wrong');
      if (s.tries >= 2) s.revealed = true;
    }
    s.phase = 'result';
    s.listening = false;
    render();
    if (r.pass) setTimeout(function () { if (state.s === s) speak(q.a.zh); }, 250);
  }

  function startListening(prev) {
    prev = prev || '';
    var s = state.s;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      s.typing = true;
      render();
      toast('이 브라우저는 음성 인식을 지원하지 않아 입력으로 바꿨어요');
      return;
    }
    if (rec) return;
    stopSpeak();

    var finals = [];
    var lastInterim = '';
    var errCode = '';
    var r = new SR();
    rec = r;
    r.lang = 'zh-CN';
    r.interimResults = true;
    r.maxAlternatives = 3;
    r.continuous = false;

    r.onstart = function () {
      if (state.s !== s) return;
      s.listening = true; s.live = ''; s.msg = '';
      // 손가락이 눌려 있는 동안 화면을 다시 그리면 버튼이 바뀌어 끊기므로, 필요한 부분만 바꿔요
      var m = document.getElementById('mic'), lv = document.getElementById('live');
      if (m) m.classList.add('on');
      if (lv) { lv.textContent = '듣고 있어요…'; lv.classList.remove('hint'); lv.classList.add('wait'); }
      if (!holding) { try { r.stop(); } catch (e) { /* noop */ } }
    };
    r.onresult = function (e) {
      var res = e.results[e.results.length - 1];
      lastInterim = res[0].transcript;
      // 듣는 동안엔 인식 중인 글자를 보여 주지 않고 '듣고 있어요…'만 보여요
      if (res.isFinal) {
        finals = [];
        for (var i = 0; i < res.length; i++) finals.push(res[i].transcript);
      }
    };
    r.onerror = function (e) { errCode = e.error || 'error'; };
    r.onend = function () {
      if (rec === r) rec = null;
      if (state.s !== s || state.screen !== 'practice' || s.phase !== 'ask') return;
      // 손가락이 아직 눌려 있는데 브라우저가 알아서 끊었다면, 이어서 계속 들어요
      var fatal = errCode === 'not-allowed' || errCode === 'service-not-allowed' || errCode === 'audio-capture' || errCode === 'network';
      if (holding && !fatal) {
        var carry = prev + (finals.length ? finals[0] : lastInterim);
        try { startListening(carry); return; } catch (e) { /* 아래에서 마무리 */ }
      }
      s.listening = false;
      var list = finals.length ? finals : (lastInterim ? [lastInterim] : []);
      if (prev) list = list.length ? list.map(function (t) { return prev + t; }) : [prev];
      if (list.length) { submit(list); return; }
      if (errCode === 'not-allowed' || errCode === 'service-not-allowed') {
        s.msg = '마이크 권한을 허용해 주세요. 브라우저·폰 설정에서 마이크를 켜면 돼요';
      } else if (errCode === 'audio-capture') {
        s.msg = '마이크를 찾지 못했어요. 마이크 연결을 확인해 주세요';
      } else if (errCode === 'network') {
        s.msg = '음성 인식 서버에 연결하지 못했어요. 잠시 뒤 다시 해 보세요';
      } else if (errCode === 'aborted') {
        s.msg = '';
      } else {
        s.msg = '목소리가 잘 안 들렸어요. 버튼을 누른 채로 말해 보세요';
      }
      render();
    };
    try {
      r.start();
      var m0 = document.getElementById('mic'); if (m0) m0.classList.add('on');
    } catch (e) { rec = null; s.msg = '음성 인식을 시작하지 못했어요. 다시 눌러 주세요'; render(); }
  }

  // 누르고 있는 동안만 듣고, 손을 떼면 마무리해요 (말끝이 잘리지 않게 잠깐 더 들어요)
  var holding = false, holdTimer = null;
  function micDown(e) {
    var s = state.s;
    if (state.screen !== 'practice' || !s || s.phase !== 'ask' || s.typing || state.modal || rec) return;
    if (e && e.preventDefault) e.preventDefault();
    holding = true; clearTimeout(holdTimer);
    sfx('pop');
    startListening();
  }
  function micUp() {
    if (!holding) return;
    holding = false;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(function () { if (rec && !holding) { try { rec.stop(); } catch (e) { /* noop */ } } }, 450);
  }
  document.addEventListener('pointerdown', function (e) {
    var t = e.target && e.target.closest && e.target.closest('[data-hold="mic"]');
    if (t) micDown(e);
  });
  ['pointerup', 'pointercancel'].forEach(function (ev) { document.addEventListener(ev, micUp); });
  window.addEventListener('blur', micUp);
  document.addEventListener('keydown', function (e) {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat && e.target && e.target.id === 'mic') micDown(e);
  });
  document.addEventListener('keyup', function (e) {
    if ((e.key === ' ' || e.key === 'Enter') && e.target && e.target.id === 'mic') micUp();
  });

  function nextQuestion() {
    var s = state.s;
    if (!s.queue.length) { finishSession(); return; }
    if (s.kind === 'lesson' && !s.cleared && s.solved >= CLEAR_COUNT) {
      s.cleared = true;
      markLessonDone(s);
      stopRec(); stopSpeak();
      var more = Math.max(s.total - s.solved, 0);
      askConfirm({ title: '레슨 완료!', body: CLEAR_COUNT + '문제를 모두 풀어서 완료했어요. 더 연습하시겠어요? ' + more + '문제를 더 할 수 있어요.', ok: more + '문제 더 하기', cancel: '여기까지 할래요', m: 'cheer' },
        function () { nextQuestion(); }, function () { finishSession(); });
      return;
    }
    s.cur = s.queue[0];
    if (s.kind === 'review') savePartial(); else saveResume(s);   // 복습은 한 문제 풀 때마다 바로 인정돼요
    s.tries = 0; s.revealed = false; s.showKo = false; s.phase = 'ask'; s.heard = ''; s.pass = false; s.msg = ''; s.live = ''; s.guideOn = false; s.wordsOpen = false; s.hint = false;
    render();
    sayCurrentQuestion();
  }

  // 레슨 완료 기록 (20문제를 채운 순간 한 번만)
  function markLessonDone(s) {
    if (s.doneMarked || s.kind !== 'lesson') return;
    var now = new Date().toISOString();
    var prevDone = state.done[s.lessonId];
    var drow = { lesson_id: s.lessonId, done_at: now, times: (prevDone ? prevDone.times : 0) + 1 };
    state.done[s.lessonId] = drow;
    store.saveDone(drow);
    var day = dayStr(new Date());
    var d0 = state.daily[day] || { day: day, lessons: 0, answers: 0 };
    var d = { day: day, lessons: d0.lessons + 1, answers: d0.answers };
    state.daily[day] = d; store.saveDaily(d);
    s.doneMarked = true;
    saveResume(s);
  }

  function finishSession() {
    var s = state.s;
    if (s.kind === 'dialog') { finishDialog(); return; }
    var now = new Date().toISOString();
    var pool = s.kind === 'lesson' ? lessonById(s.lessonId).qs
      : Object.keys(s.first).map(function (id) { return QMAP[id]; });
    var rows = [];
    var firstTry = 0;
    pool.forEach(function (q) {
      var ft = s.first[q.id] === true;
      if (ft) firstTry++;
      if (s.committed[q.id]) return;
      var prev = state.progress[q.id];
      var box = prev ? (ft ? Math.min(5, prev.box + 1) : 1) : (ft ? 2 : 1);
      var row = {
        qid: q.id, lesson_id: q.lessonId, box: box, due_at: dueISO(box),
        correct: (prev ? prev.correct : 0) + (ft ? 1 : 0),
        wrong: (prev ? prev.wrong : 0) + (s.wrong[q.id] || 0),
        updated_at: now
      };
      state.progress[q.id] = row;
      rows.push(row);
    });

    var day = dayStr(new Date());
    var d = state.daily[day] || { day: day, lessons: 0, answers: 0 };
    var before = d.answers;
    var goal = state.profile.goal;
    d = { day: day, lessons: d.lessons + (s.kind === 'lesson' && !s.doneMarked ? 1 : 0), answers: d.answers + Math.max(s.solved - s.solvedCommitted, 0) };
    state.daily[day] = d;
    store.saveProgress(rows);
    store.saveDaily(d);

    var result;
    if (s.kind === 'lesson') {
      if (!s.doneMarked) {
        var prevDone = state.done[s.lessonId];
        var drow = { lesson_id: s.lessonId, done_at: now, times: (prevDone ? prevDone.times : 0) + 1 };
        state.done[s.lessonId] = drow;
        store.saveDone(drow);
      }
      var l = lessonById(s.lessonId);
      var nxt = nextLesson();
      result = {
        kind: 'lesson', title: l.title + ' 레슨 완료!',
        line: '내일 복습 문제로 다시 만나요.',
        firstTry: firstTry, total: pool.length,
        again: nxt ? { act: 'open-lesson', id: nxt.id, label: '다음 레슨 미리 보기' } : null
      };
    } else {
      var left = dueRows().length;
      result = {
        kind: 'review', title: '복습 끝!',
        line: left > 0 ? '아직 복습할 문제가 ' + left + '개 남았어요.' : (hskDue(0).length ? '문장 복습은 끝났어요. 복습할 단어가 ' + hskDue(0).length + '개 있어요.' : '오늘 복습은 모두 끝났어요.'),
        firstTry: firstTry, total: pool.length,
        again: left > 0 ? { act: 'review-start', label: '이어서 복습하기' } : (hskDue(0).length ? { act: 'hsk-due', label: '이어서 단어 복습 (' + hskDue(0).length + '개)' } : null)
      };
    }
    clearResume(s.kind, s.lessonId);
    result.goalHit = before < goal && d.answers >= goal;
    result.answers = d.answers;
    result.goal = goal;
    var stNow = streak();
    result.milestone = (before === 0 && d.answers > 0 && MILESTONES.indexOf(stNow) >= 0) ? stNow : 0;
    stopSpeak();
    sfx(result.goalHit || result.milestone ? 'goal' : 'done');
    go('done', { result: result });
  }

  // 여러 레슨의 문제를 번갈아 골라서, 한 레슨에 치우치지 않게 섞어요 (순서는 입력 순서 우선)
  function mixLessons(list, n) {
    var order = [], by = {};
    list.forEach(function (q) {
      if (!by[q.lessonId]) { by[q.lessonId] = []; order.push(q.lessonId); }
      by[q.lessonId].push(q);
    });
    var out = [];
    while (out.length < n && order.some(function (id) { return by[id].length; })) {
      order.forEach(function (id) { if (out.length < n && by[id].length) out.push(by[id].shift()); });
    }
    return out;
  }

  /* ---------- 시작 함수 ---------- */
  function startReview() {
    var qs = mixLessons(dueRows().map(function (r) { return QMAP[r.qid]; }), REVIEW_SIZE);
    if (!qs.length) { toast('지금 복습할 문제가 없어요'); return; }
    beginSession('review', shuffle(qs));
  }
  function startWeak() {
    var qs = weakRows().map(function (r) { return QMAP[r.qid]; });
    if (!qs.length) { toast('약한 문제가 아직 없어요'); return; }
    beginSession('review', rounds(qs, WEAK_SIZE));
  }
  /* ---------- 로그인/로그아웃 ---------- */
  async function signIn() {
    state.loginBusy = true;
    if (state.screen === 'login') render();
    var res = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (res.error) { state.loginBusy = false; if (state.screen === 'login') render(); toast('로그인을 시작하지 못했어요: ' + res.error.message); }
  }
  async function handleSession(session) {
    var u = session && session.user;
    if (u) {
      if (state.user && state.user.id === u.id) return;
      state.user = u;
      await store.load();
      await pullResume();
      await loadEnt();
      var moved = mergeGuest();
      if (window.location.search || window.location.hash) {
        history.replaceState(null, '', window.location.pathname);
      }
      state.loginReason = null; state.loginLater = null; state.loginBusy = false;
      afterSplash(function () {
        go('tab', { tab: 'home' });
        if (moved) toast('로그인 전에 한 학습도 저장했어요');
      });
    } else {
      if (isGuest()) return;
      // 로그인 전: 손님으로 둘러볼 수 있어요
      state.user = { id: 'guest', email: '' }; state.ent = null;
      await store.load();
      afterSplash(function () { go('tab', { tab: 'home' }); });
    }
  }

  /* ---------- 이벤트 ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el) return;
    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id');
    var s = state.s;

    switch (act) {
      case 'splash-tap': splashTap(el); break;
      case 'pp-wake': ppWake(el); break;
      case 'pp-retry':
        ppWake(el.closest('.pp-empty').querySelector('img'));
        el.disabled = true; el.textContent = '연결 중…';
        setTimeout(function () { if (navigator.onLine === false) { el.disabled = false; el.textContent = '다시 시도'; toast('아직 연결되지 않았어요'); } else render(); }, 1400);
        break;
      case 'google': signIn(); break;
      case 'lg-later': loginLater(); break;
      case 'open-pay': go('pay', { payWhy: null }); break;
      case 'ai-login': requireLogin('ai', null); break;
      case 'buy': buyPlan(id); break;
      case 'coupon-redeem': redeemCoupon(); break;
      case 'test-reset': resetPlan(); break;
      case 'open-account': go('account'); break;
      case 'open-coupon': go('coupon'); break;
      case 'open-aicharge': go('aicharge'); break;
      case 'open-phrases': go('phrases'); break;
      case 'open-aiall': state.aiallHint = false; go('aiall'); break;
      case 'open-prefs': go('prefs'); break;
      case 'zh-guide': askConfirm({ title: '중국어 음성 설치 방법', body: ZH_GUIDE, ok: '알겠어요', cancel: '닫기', m: 'sleep', left: true }); break;
      case 'open-about': go('about'); break;
      case 'open-advisor': go('advisor'); break;
      case 'open-review': location.href = 'review.html'; break;
      case 'ai-why': aiWhyLoad(); break;
      case 'ai-chips-more': {
        state.aiChipsOpen = !state.aiChipsOpen;
        var ch = document.querySelector('.ai-hero-chips'); if (ch) ch.classList.toggle('open', !!state.aiChipsOpen);
        el.textContent = state.aiChipsOpen ? '접기' : '더보기';
        fitChips();   // 닫혀 있을 때 정해 둔 높이 제한을 풀거나(펼침) 다시 2줄로 자름(접기)
        break;
      }
      case 'ai-chip': {
        state.acTopic = AC_TOPICS[+el.getAttribute('data-i')] || '';
        var inp0 = document.getElementById('ai-topic'); if (inp0) inp0.value = state.acTopic;
        var cs = document.querySelectorAll('.ai-chip');
        for (var q = 0; q < cs.length; q++) cs[q].classList.toggle('on', cs[q] === el);
        break;
      }
      case 'ai-go':
        if (aiBal() < AI_CHAT_COST) { toast('크레딧이 부족해요. 충전해 주세요'); break; }
        state.ac = { mode: 'pick', topic: String(state.acTopic || '').trim(), direct: true, busy: false };
        go('aichat'); acStart(); break;
      case 'ac-open': state.ac = { mode: 'pick', topic: '' }; go('aichat'); break;
      case 'ac-topic': if (state.ac) { state.ac.topic = AC_TOPICS[+el.getAttribute('data-i')] || ''; render(); } break;
      case 'ac-start': acStart(); break;
      case 'ac-send': acSend(); break;
      case 'ac-sug':
        if (state.ac && state.ac.sug[+el.getAttribute('data-i')]) {
          var sg = state.ac.sug[+el.getAttribute('data-i')];
          if (acHasSR() && state.profile.input !== 'type') { var ai = document.getElementById('ac-in'); if (ai) ai.value = sg.zh; state.ac.input = sg.zh; }
          speak(sg.zh, 0.8);
        }
        break;
      case 'ac-sug-show':
        if (state.ac) { var si = +el.getAttribute('data-i'); state.ac.shown = state.ac.shown || {}; state.ac.shown[si] = !state.ac.shown[si]; renderKeep(); }
        break;
      case 'ac-rep':
        if (state.ac) {
          var fm = state.ac.msgs[+el.getAttribute('data-i')];
          if (fm && fm.fix) { state.ac.rep = { zh: fm.fix.natural, py: fm.fix.pinyin, ko: fm.fix.ko, heard: '', res: null }; render(); acScroll(); setTimeout(function () { speak(fm.fix.natural, 0.8); }, 200); }
        }
        break;
      case 'ai-fix-del': aiFixDel(el.getAttribute('data-t')); render(); break;
      case 'ai-fix-more': var fk = el.getAttribute('data-k') || 'expr'; fixUi.n[fk] = (fixUi.n[fk] || 7) + 7; renderKeep(); break;
      case 'ai-seg': fixUi.seg = el.getAttribute('data-k') === 'fix' ? 'fix' : 'expr'; render(); break;
      case 'gm-group': lessonUi.go[id] = !gmOpen(+id); sfx('tap'); renderKeep(); break;
      case 'gm-start': startGrammar(id); break;
      case 'gm-pick': gmPick(+id); break;
      case 'gm-put': gmPut(+id); break;
      case 'gm-take': gmTake(+id); break;
      case 'gm-next': gmNext(); break;
      case 'gm-quit': stopSpeak(); go('intro', { lessonId: state.gm.l.id }); break;
      case 'lessons-more': lessonUi.n = (lessonUi.n || lessonInitN()) + 7; renderKeep(); break;
      case 'ac-showko': if (state.ac) { var sk = state.ac.msgs[+el.getAttribute('data-i')]; if (sk) { sk.showKo = !sk.showKo; render(); } } break;
      case 'ac-ko': if (state.ac && state.ac.mode === 'chat' && !state.ac.busy && !state.ac.ended) { state.ac.ko = { opts: null, heard: '', busy: false }; render(); acScroll(); } break;
      case 'ac-ko-send': if (state.ac && state.ac.ko && !state.ac.ko.busy) { var kv = String(state.ac.koIn || '').trim(); if (kv) { state.ac.koIn = ''; acKoRun(kv); } } break;
      case 'set-input': setProfile({ input: el.getAttribute('data-v') === 'type' ? 'type' : 'voice' }); break;
      case 'ac-ko-close': if (state.ac) { acStop(); state.ac.ko = null; state.ac.koSend = false; state.ac.live = ''; render(); acScroll(); } break;
      case 'ac-ko-pick':
        if (state.ac && state.ac.ko && state.ac.ko.opts) {
          var ko_o = state.ac.ko.opts[+el.getAttribute('data-i')];
          if (ko_o) { acStop(); state.ac.koOpts = state.ac.ko.opts; state.ac.koHeard = state.ac.ko.heard; state.ac.ko = null; state.ac.koSend = true; state.ac.rep = { zh: ko_o.zh, py: ko_o.py, ko: ko_o.ko, heard: '', res: null }; render(); acScroll(); setTimeout(function () { speak(ko_o.zh, 0.8); }, 200); }
        }
        break;
      case 'say-slow': speak(el.getAttribute('data-text'), 0.55); break;
      case 'ac-rep-again': if (state.ac && state.ac.rep) { state.ac.rep.res = null; state.ac.rep.heard = ''; render(); acScroll(); } break;
      case 'ac-rep-close':
        if (state.ac && state.ac.koSend) {
          // 한국어로 고른 문장: 잘 따라 말했으면 그 말로 대화를 이어 가고, 아니면 고르던 화면으로 돌아가요
          acStop();
          var kz = state.ac.rep, kok = kz && kz.res === 'ok';
          state.ac.koSend = false; state.ac.rep = null;
          if (kok) { state.ac.ko = null; acSend(kz.zh); }
          else { state.ac.ko = { opts: state.ac.koOpts || [], heard: state.ac.koHeard || '', busy: false }; render(); acScroll(); }
        } else if (state.ac) {
          acStop();
          if (state.ac.pending) {
            // 따라 말을 잘했으면, 고친 문장이 내 말로 대화에 올라간 뒤 AI가 다시 질문해요
            if (state.ac.rep && state.ac.rep.res === 'ok') state.ac.msgs.push({ who: 'me', zh: state.ac.rep.zh, corrected: true });
            acRelease(state.ac, state.ac.pending);
          }
          else { state.ac.rep = null; render(); acScroll(); }
        }
        break;
      case 'ac-leave':
        if (state.ac) {
          if (state.ac.mode === 'chat' && state.ac.turns > 0 && !state.ac.ended) { state.ac.leave = true; render(); }
          else { acStop(); state.ac = null; go('tab', { tab: 'review' }); }
        }
        break;
      case 'ac-leave-no': if (state.ac) { state.ac.leave = false; render(); } break;
      case 'ac-leave-yes':
        if (state.ac && state.ac.mode === 'chat' && state.ac.turns > 0) { state.ac.mode = 'end'; state.ac.leave = false; acStop(); chatSave(state.ac); render(); window.scrollTo(0, 0); acWrap(state.ac); }
        else { acStop(); state.ac = null; go('tab', { tab: 'review' }); }
        break;
      case 'ac-finish': if (state.ac) { state.ac.mode = 'end'; acStop(); chatSave(state.ac); render(); window.scrollTo(0, 0); acWrap(state.ac); } break;
      case 'ac-again': state.ac = { mode: 'pick', topic: '' }; render(); window.scrollTo(0, 0); break;
      case 'buy-pack': buyPack(id); break;
      case 'open-privacy': go('privacy', { privFrom: state.screen === 'login' ? 'login' : 'tab' }); break;
      case 'delete-account':
        askConfirm({ title: '계정을 삭제할까요?', body: '계정과 모든 학습 기록, 설정이 사라지고 되돌릴 수 없어요.', ok: '계속하기', cancel: '취소', danger: true, m: 'shy' }, function () {
          askConfirm({ title: '정말 삭제할까요?', body: '삭제하면 복구할 수 없어요. 그래도 삭제할까요?', ok: '계정 삭제', cancel: '그만둘게요', danger: true, m: 'shy' }, deleteAccount);
        });
        break;
      case 'lg-tap':
        el.classList.remove('tap'); void el.offsetWidth; el.classList.add('tap');
        try { if (navigator.vibrate) navigator.vibrate(8); } catch (e2) {}
        break;
      case 'start-local':
        state.user = { id: 'local', email: '' };
        store.load().then(function () { go('tab', { tab: 'home' }); });
        break;
      case 'tab':
        if (id === 'me' && isGuest()) { requireLogin('me', function () { go('tab'); }); break; }
        if (id === 'home' && state.tab !== 'home') refreshGreet();
        state.editNick = false; state.tab = id; render(); window.scrollTo(0, 0);
        refreshQuiet();
        break;
      case 'logout':
        stopSpeak();
        sb.auth.signOut().then(function () { state.user = { id: 'guest', email: '' }; state.ent = null; return store.load(); }).then(function () { state.tab = 'home'; go('tab', { tab: 'home' }); });
        break;
      case 'reset-local':
        askConfirm({ title: '학습 기록을 모두 지울까요?', body: '이 기기에 저장된 진도와 복습 기록이 사라지고, 되돌릴 수 없어요.', ok: '모두 지우기', cancel: '취소', danger: true, m: 'shy' }, function () {
          state.progress = {}; state.done = {}; state.daily = {}; persistLocal();
          go('tab', { tab: 'home' });
        });
        break;
      case 'open-lesson': go('intro', { lessonId: id }); break;
      case 'back': goBack(); break;
      case 'home': go('tab', { tab: 'home' }); break;
      case 'say':
        speak(el.getAttribute('data-text'), 0.8);
        if (state.screen === 'tab' && state.tab === 'home' && todayPhrase() && el.getAttribute('data-text') === todayPhrase()[0] && !tdLoad().done.phrase) { tdMark('phrase'); sfx('pop'); renderKeep(); }
        break;
      case 'words-open': if (state.s) { state.s.wordsOpen = true; render(); } break;
      case 'words-close': if (state.s) { state.s.wordsOpen = false; render(); } break;
      case 'practice-lesson': startLessonSession('lesson', id); break;
      case 'review-start': startReview(); break;
      case 'today-review': startTodayReview(); break;
      case 'hsk-due': startHskDue(); break;
      case 'review-weak': startWeak(); break;
      case 'dialog-start': startDialog(id); break;
      case 'open-stats': go('stats'); break;
      case 'speed-start': startSpeed(id); break;
      case 'speed-go': if (state.sp && state.sp.phase === 'ready') { sfx('pop'); speedAsk(); } break;
      case 'speed-pick':
        if (state.sp && state.sp.phase === 'run' && state.sp.opts) { var spo = state.sp.opts[parseInt(id, 10)]; state.sp.picked = parseInt(id, 10); speedEnd(state.sp, !!(spo && spo.ok), ''); }
        break;
      case 'speed-next': if (state.sp && state.sp.phase === 'result') speedNext(); break;
      case 'w-toggle': {
        var om = wordsOpenMap(); om[id] = !om[id]; refreshWordsList(); break;
      }
      case 'w-all': {
        var om2 = wordsOpenMap(), anyOpen = Object.keys(om2).some(function (k) { return om2[k]; });
        wordsUi.open = {};
        if (!anyOpen) learnedLessons().forEach(function (l) { wordsUi.open[l.id] = true; });
        refreshWordsList();
        el.textContent = anyOpen ? '모두 펼치기' : '모두 접기';
        break;
      }
      case 'speed-ko':
        if (state.sp) {
          state.sp.showKo = true;
          if (state.sp.phase === 'result') render();
          else { var q0 = state.sp.items[state.sp.i], d0 = document.createElement('div'); d0.className = 'q-ko'; d0.textContent = q0.ko; if (el.parentNode) el.parentNode.replaceChild(d0, el); }
        }
        break;
      case 'speed-hear': if (state.sp) speak(state.sp.items[state.sp.i].a.zh); break;
      case 'speed-quit': stopSpeed(); go('tab'); break;
      case 'open-feedback': go('feedback', { fb: { cat: 'idea', text: '', sending: false, sent: false } }); break;
      case 'fb-cat': if (state.fb) { state.fb.cat = el.getAttribute('data-v'); render(); } break;
      case 'fb-send': sendFeedback(); break;
      case 'fb-done': go('prefs'); break;
      case 'focus-tag': startFocus(id); break;

      case 'quit': quitPractice(); break;
      case 'modal-ok':
        var fn = state.modal && state.modal.onOk;
        state.modal = null;
        if (fn) fn(); else render();
        break;
      case 'modal-no':
        var fno = state.modal && state.modal.onNo;
        state.modal = null;
        if (fno) fno(); else render();
        break;
      case 'modal-cancel': closeModal(); break;
      case 'install':
        if (installEvt) { installEvt.prompt(); installEvt.userChoice.then(function () { installEvt = null; render(); }); }
        break;
      case 'minute-toggle':
        if (!state.profile.minuteOn && !isPro()) { go('pay', { payWhy: '알림은 멤버십 기능이에요.' }); break; }
        toggleMinute(); break;
      case 'remind-toggle':
        if (pushOn) { disableReminder(); break; }
        if (!isPro()) { go('pay', { payWhy: '알림은 멤버십 기능이에요.' }); break; }
        enableReminder(); break;
      case 'hsk-open':
        if (hskLocked(parseInt(id, 10))) { go('pay', { payWhy: 'HSK ' + id + '급은 멤버십이 필요해요. 1급은 무료예요.' }); break; }
        state.hsk = { lv: parseInt(id, 10), unknownOnly: false }; go('hsk'); break;
      case 'hsk-lv': state.hskLv = parseInt(id, 10); try { localStorage.setItem('pangpang.hsklv', String(state.hskLv)); } catch (e) { /* 무시 */ } sfx('tap'); renderKeep(); break;
      case 'hsk-study': if (hskGate(id)) break; startHskStudy(parseInt(id, 10)); break;
      case 'hsk-quiz': if (hskGate(id)) break; startHskQuiz(parseInt(id, 10)); break;
      case 'chat-open': state.chatFrom = state.screen === 'aichats' ? 'all' : 'tab'; go('aichatlog', { chatId: id }); break;
      case 'chat-all': go('aichats'); break;
      case 'chat-del': askConfirm({ title: '이 기록을 지울까요?', body: '지운 대화는 되돌릴 수 없어요.', ok: '지우기', cancel: '취소', danger: true }, function () { chatDel(id); goBack(); toast('기록을 지웠어요'); }); break;
      case 'ch-start': startChain(parseInt(id, 10)); break;
      case 'rain-start': if (hskGate(id)) break; startRain(parseInt(id, 10)); break;
      case 'rn-go': rnBegin(); break;
      case 'rn-quit': rnStop(); go('tab', { tab: 'words' }); break;
      case 'rn-py': if (state.rn) { state.rn.py = !state.rn.py; try { localStorage.setItem('pangpang.rain.py', state.rn.py ? '1' : '0'); } catch (e) { /* 무시 */ } sfx('tap'); render(); } break;
      case 'rn-hear': if (state.rn && state.rn.cur && !state.rn.cur.done) speak(hskList(state.rn.lv)[state.rn.cur.ti][0], 0.85); break;
      case 'ch-skip': chSkip(); break;
      case 'ch-pick': chAnswer(+id); break;
      case 'ch-hear': if (state.ch && state.ch.phase === 'ask') speak(hskList(state.ch.lv)[state.ch.qs[state.ch.qi]][0], 0.85); break;
      case 'td-bonus-go': if (!state.tdMoved) tdBonusGo(); break;
      case 'ch-quit': if (state.ch && state.ch.stage > 1) { chSaveRec(state.ch); tdMark('ch-start'); } chStop(); go('tab', { tab: 'words' }); break;
      case 'ch-back': go('tab', { tab: 'words' }); break;
      case 'tone-start': if (hskGate(id)) break; startTone(parseInt(id, 10)); break;
      case 'tone-pick': tonePick(parseInt(id, 10)); break;
      case 'tone-slot': if (state.tn && !state.tn.res) { state.tn.cur = state.tn.cur.slice(0, parseInt(id, 10)); sfx('tap'); render(); } break;
      case 'tone-next': toneNext(); break;
      case 'sc-open': state.scFrom = state.screen === 'scenes' ? 'scenes' : ''; startScene(id); break;
      case 'sc-all': go('scenes'); break;
      case 'sc-cat': state.scCat = id; sfx('tap'); render(); break;
      case 'sc-next': scAdvance(); break;
      case 'sc-skip': if (state.sc) { state.sc.combo = 0; scAdvance(); } break;
      case 'sc-pick': scPick(+id); break;
      case 'sc-kr': state.scKr = !state.scKr; render(); break;
      case 'sc-chunk': if (state.sc) {
        var scl = scCurLine(state.sc), sci = +el.getAttribute('data-i');
        state.sc.gloss = sci; speak(scl[4][sci][0].replace(/[，。？！]/g, ''), 0.75); render();
      } break;
      case 'sc-quit': stopSpeak(); scStopRec(); state.sc = null; go(state.scFrom === 'scenes' ? 'scenes' : 'tab'); break;
      case 'sc-mission': scFinish(true); break;
      case 'sc-finish': scFinish(false); break;
      case 'tone-quit': stopSpeak(); go('tab', { tab: 'words' }); break;
      case 'hsk-flip': if (state.hc) { state.hc.flip = !state.hc.flip; sfx('tap'); render(); } break;
      case 'hsk-mark': window.flyCard(el.getAttribute('data-v') === 'yes'); break;
      case 'hsk-filter': state.hsk.unknownOnly = el.getAttribute('data-v') === 'unknown'; render(); break;
      case 'hsk-toggle':
        var hi = parseInt(id, 10), hv = state.hsk.lv, nowOn = !hskKnown(hv, hi);
        setHskKnown(hv, hi, nowOn); sfx(nowOn ? 'pop' : 'tap');
        if (state.hsk.unknownOnly) { render(); break; }
        var rowEl = el.closest ? el.closest('.wrow') : null;
        if (rowEl && rowEl.classList) { rowEl.classList.toggle('on', nowOn); el.classList.toggle('on', nowOn); el.setAttribute('aria-pressed', nowOn ? 'true' : 'false'); }
        var pg = document.getElementById('hsk-prog');
        if (pg) pg.textContent = hskList(hv).length + '개 중 ' + hskCount(hv) + '개 익혔어요';
        break;
      case 'quiz-listen': startQuiz('listen', id); break;
      case 'intro-tab': state.introTab = id === 'qs' ? 'qs' : 'words'; sfx('tap'); renderKeep(); break;
      case 'quiz-pick': quizPick(parseInt(id, 10)); break;
      case 'qz-peek': if (state.z) { state.z.peek = !state.z.peek; render(); } break;
      case 'quiz-next': quizNext(); break;
      case 'quiz-quit': stopSpeak(); go('tab', { tab: 'words' }); break;
      case 'fav': toggleFav(el.getAttribute('data-text')); break;
      case 'set-kr': setProfile({ kr: el.getAttribute('data-v') === 'on' }); break;
      case 'set-sound': setProfile({ sound: el.getAttribute('data-v') === 'on' }); sfx('pop'); break;
      case 'set-goal': setProfile({ goal: parseInt(el.getAttribute('data-v'), 10) }); break;
      case 'set-theme': setProfile({ theme: el.getAttribute('data-v') }); break;
      case 'nick-edit': state.editNick = true; render(); break;
      case 'nick-cancel': state.editNick = false; render(); break;
      case 'nick-save': saveNick(); break;
      case 'ko': s.showKo = !s.showKo; render(); break;
      case 'hear-q': speak(s.cur.zh); break;
      case 'hear-a': speak(s.cur.a.zh); break;
      case 'ai-correct': aiCorrect(); break;
      case 'ai-fu-open':
        if (state.s && state.s.heard) {
          var fk = state.s.cur.id + '|' + state.s.heard, fr = state.s.aiRes && state.s.aiRes[fk];
          if (fr && fr.res && !(fr.fu && fr.fu.ans)) { state.s.aiFuKey = fk; fr.fuOpen = true; render(); setTimeout(function () { var ti = document.getElementById('ai-fu-in'); if (ti) { try { ti.focus(); ti.scrollIntoView({ block: 'center' }); } catch (e) { /* 무시 */ } } }, 120); }
        }
        break;
      case 'ai-fu-close': { var fc = aiFuCur(); if (fc) { fc.fuOpen = false; fc.fu = null; render(); } break; }
      case 'ai-fu-send': aiFuSend(); break;
      case 'hint': s.hint = true; render(); break;
      case 'reveal': s.revealed = true; render(); break;
      case 'reveal-result': s.revealed = true; render(); break;
      case 'type-mode': stopRec(); s.typing = true; s.listening = false; render(); break;
      case 'voice-mode': s.typing = false; render(); break;
      case 'submit-typed':
        var inp = document.getElementById('typed');
        if (inp && inp.value.trim()) submit([inp.value]);
        break;
      case 'retry': s.phase = 'ask'; s.heard = ''; s.msg = ''; s.live = ''; render(); break;
      case 'skip':
        var cur = s.queue.shift();
        s.first[cur.id] = false;
        if (s.kind === 'dialog') { s.solved++; s.log.push({ npc: cur.zh, me: cur.a.zh, skipped: true }); }
        else s.queue.push(cur);
        nextQuestion();
        break;
      case 'next': nextQuestion(); break;
    }
  });

  function saveNick() {
    var inp = document.getElementById('nick');
    var v = inp ? inp.value.trim().slice(0, 12) : nickname();
    state.profile.nickname = v;
    state.editNick = false;
    render();
    store.saveProfile();
    toast(v ? '닉네임을 저장했어요' : '닉네임을 지웠어요');
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && state.modal) { closeModal(); return; }
    if (e.key === 'Enter' && e.target && e.target.id === 'nick') { e.preventDefault(); saveNick(); return; }
    if (e.key === 'Enter' && e.target && e.target.id === 'typed') {
      e.preventDefault();
      var v = e.target.value.trim();
      if (v) submit([v]);
    }
  });

  document.addEventListener('change', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('time-in') && /^\d\d:\d\d$/.test(e.target.value)) updateReminderTime(e.target.value);
  });

  // 화면 안에서 이미지·글자를 끌거나 길게 눌러 고르는 동작을 막아요
  document.addEventListener('dragstart', function (e) { e.preventDefault(); });
  document.addEventListener('contextmenu', function (e) {
    if (!(e.target && e.target.closest && e.target.closest('input, textarea'))) e.preventDefault();
  });

  window.addEventListener('pagehide', function () { stopRec(); stopSpeak(); });

  /* ---------- 앱 설치 · 복습 알림 (PWA) ---------- */
  var installEvt = null;
  var swReg = null;
  var pushOn = false;
  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  }
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); installEvt = e;
    if (state.screen === 'tab' && state.tab === 'me') render();
  });
  window.addEventListener('appinstalled', function () { installEvt = null; if (state.screen === 'tab' && state.tab === 'me') render(); });

  function registerSW() {
    try {
      if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
      var hadCtl = !!navigator.serviceWorker.controller;
      navigator.serviceWorker.addEventListener('controllerchange', function () { if (hadCtl) showUpdateBar(); hadCtl = true; });
      document.addEventListener('visibilitychange', function () { if (!document.hidden && swReg) swReg.update().catch(function () { /* 무시 */ }); });
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        swReg = reg;
        reg.update().catch(function () { /* 무시 */ });
        if (!reg.pushManager) return;
        return reg.pushManager.getSubscription().then(function (sub) {
          pushOn = !!sub && state.profile.remindOn;
          if (!sub) { state.profile.minuteOn = false; }
          if (state.screen === 'tab' && state.tab === 'me') render();
        });
      }).catch(function () { /* 미리보기 등에서는 조용히 건너뜀 */ });
    } catch (e) { /* 무시 */ }
  }
  // 새 버전을 받으면 화면 아래에 알려 줘요 (누르면 새로고침)
  function showUpdateBar() {
    if (document.getElementById('updbar')) return;
    var b = document.createElement('button');
    b.id = 'updbar'; b.className = 'upd-bar'; b.type = 'button';
    b.innerHTML = '<b>새 버전이 있어요</b><span>눌러서 업데이트</span>';
    b.addEventListener('click', function () { location.reload(); });
    document.body.appendChild(b);
  }
  function pushReady() {
    return !!(sb && cfg.VAPID_PUBLIC_KEY && 'PushManager' in window && 'Notification' in window && 'serviceWorker' in navigator);
  }
  function b64ToBytes(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var s = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function bufToB64(buf) {
    var b = new Uint8Array(buf), s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s);
  }
  // 알림은 두 가지가 따로 켜고 꺼져요: 복습 알림(매일 정한 시간) / 1분 중국어(낮 동안 한 시간에 한 번)
  function pushRow(sub, daily, minute) {
    var j = sub.toJSON();
    var row = {
      user_id: state.user.id, endpoint: sub.endpoint,
      p256dh: j.keys.p256dh, auth: j.keys.auth,
      remind_time: state.profile.remind,
      tz: (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'Asia/Seoul'
    };
    if (!daily) row.daily_on = false;     // 표에 daily_on / minute_on 칸을 만든 뒤에만 보내요
    if (minute) row.minute_on = true;
    return row;
  }
  async function getPushSub() {
    if (!swReg) swReg = await navigator.serviceWorker.ready;
    var perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('알림 권한이 꺼져 있어요. 브라우저 설정에서 허용해 주세요'); return null; }
    var sub = await swReg.pushManager.getSubscription();
    if (!sub) sub = await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.VAPID_PUBLIC_KEY) });
    return sub;
  }
  // 두 알림의 켜짐 상태를 서버에 맞춰요. 둘 다 꺼지면 구독을 지워요.
  async function syncPush(daily, minute) {
    var sub = swReg ? await swReg.pushManager.getSubscription() : null;
    if (!daily && !minute) {
      if (sub) {
        await sb.from('push_subscriptions').delete().eq('user_id', state.user.id).eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
      }
      return;
    }
    if (!sub) sub = await getPushSub();
    if (!sub) throw new Error('no-sub');
    var res = await sb.from('push_subscriptions').upsert(pushRow(sub, daily, minute), { onConflict: 'user_id,endpoint' });
    if (res.error) throw res.error;
  }
  async function enableReminder() {
    try {
      if (!(await getPushSub())) return;
      await syncPush(true, !!state.profile.minuteOn);
      pushOn = true;
      setProfile({ remindOn: true });
      toast('매일 ' + state.profile.remind + '에 알려 드릴게요');
    } catch (err) {
      if (window.console) console.error(err);
      toast('알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요');
    }
  }
  async function disableReminder() {
    try { await syncPush(false, !!state.profile.minuteOn); } catch (err) { if (window.console) console.error(err); }
    pushOn = false;
    setProfile({ remindOn: false });
    toast('복습 알림을 껐어요');
  }
  async function toggleMinute() {
    var on = !state.profile.minuteOn;
    try {
      if (on && !(await getPushSub())) return;
      await syncPush(!!state.profile.remindOn, on);
      setProfile({ minuteOn: on });
      toast(on ? '낮 동안 한 시간에 한 번 1분 중국어를 보내 드려요' : '1분 중국어를 껐어요');
    } catch (err) {
      if (window.console) console.error(err);
      toast('바꾸지 못했어요. 잠시 후 다시 시도해 주세요');
    }
  }
  async function updateReminderTime(v) {
    setProfile({ remind: v });
    if (!pushOn || !swReg || !sb) return;
    try {
      var sub = await swReg.pushManager.getSubscription();
      if (sub) await sb.from('push_subscriptions').update({ remind_time: v }).eq('user_id', state.user.id).eq('endpoint', sub.endpoint);
      toast('알림 시간을 ' + v + '로 바꿨어요');
    } catch (err) { saveFailed(err); }
  }
  function settingsExtra() {
    var p = state.profile, h = '';
    if (!isStandalone()) {
      if (installEvt) {
        h += '<div class="set-row"><div><div class="set-t">앱으로 설치</div><div class="set-s">홈 화면에서 바로 열어요</div></div>' +
          '<button class="pill-sm" data-act="install">설치</button></div>';
      } else if (isIOS) {
        h += '<div class="set-row"><div><div class="set-t">앱으로 설치</div><div class="set-s">Safari 공유 버튼 → “홈 화면에 추가”</div></div></div>';
      }
    }
    if (pushReady()) {
      h += '<div class="set-row"><div><div class="set-t">복습 알림</div><div class="set-s">' +
        (pushOn ? '오늘 공부 전이면 ' + esc(p.remind) + '에 알려 드려요' : '정해 둔 시간에 알려 드려요') + '</div></div>' +
        '<button class="pill-sm' + (!pushOn && !isPro() ? ' pro' : '') + '" data-act="remind-toggle">' + (pushOn ? '끄기' : (isPro() ? '켜기' : I.lock + 'PRO')) + '</button></div>';
      if (pushOn) {
        h += '<div class="set-row"><div class="set-t">알림 시간</div><input class="time-in" type="time" value="' + esc(p.remind) + '" aria-label="알림 시간"></div>';
      }
      h += '<div class="set-row"><div><div class="set-t">1분 중국어</div><div class="set-s">' +
        (p.minuteOn ? '오전 9시~밤 9시, 한 시간에 한 번 알림으로 바로 공부해요' : '낮 동안 한 시간에 한 번, 알림에서 바로 배워요') + '</div></div>' +
        '<button class="pill-sm' + (!p.minuteOn && !isPro() ? ' pro' : '') + '" data-act="minute-toggle">' + (p.minuteOn ? '끄기' : (isPro() ? '켜기' : I.lock + 'PRO')) + '</button></div>';
    } else {
      h += '<div class="set-row"><div><div class="set-t">복습 알림</div><div class="set-s">' +
        (sb ? (cfg.VAPID_PUBLIC_KEY ? '이 브라우저는 알림을 지원하지 않아요' + (isIOS ? ' (홈 화면에 추가한 뒤 켤 수 있어요)' : '') : '관리자 설정(VAPID 키)이 필요해요')
            : 'Google 로그인을 연결하면 쓸 수 있어요') + '</div></div></div>';
    }
    return h;
  }

  /* ---------- 시작 ---------- */
  /* ---------- 오류 기록 (Supabase app_errors) ---------- */
  var errCount = 0, lastErr = '';
  function reportError(msg, stack) {
    try {
      msg = String(msg || '').slice(0, 500);
      if (!msg || msg === lastErr || errCount >= 5) return;
      lastErr = msg; errCount++;
      try {
        var log = JSON.parse(localStorage.getItem('pangpang.errors') || '[]');
        log.push({ t: new Date().toISOString(), m: msg });
        localStorage.setItem('pangpang.errors', JSON.stringify(log.slice(-10)));
      } catch (e) {}
      if (!sb || !state.user || state.user.id === 'local' || isGuest()) return;
      Promise.resolve(sb.from('app_errors').insert({
        message: msg, stack: String(stack || '').slice(0, 2000),
        url: String(location.href).slice(0, 300), ua: String(navigator.userAgent || '').slice(0, 300), version: APP_VERSION
      })).catch(function () {});
    } catch (e) {}
  }
  window.addEventListener('error', function (e) { reportError(e.message, e.error && e.error.stack); });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason; reportError(r && r.message ? r.message : r, r && r.stack);
  });

  async function boot() {
    render();
    registerSW();
    if (sb) {
      sb.auth.onAuthStateChange(function (event, session) {
        // 콜백 안에서 바로 supabase를 호출하면 멈출 수 있어 한 박자 늦춰 처리
        setTimeout(function () { handleSession(session); }, 0);
      });
      var res = await sb.auth.getSession();
      handleSession(res.data.session);
    } else {
      // 미리보기 모드: 로그인 없이 바로 홈으로
      state.user = { id: 'local', email: '' };
      await store.load();
      afterSplash(function () { go('tab', { tab: 'home' }); });
    }
  }
  // 모은 문장 전체 보기: 카드를 왼쪽으로 밀면 휴지통이 보여요
  (function () {
    var d = null, openRow = null, SW = 76;
    function closeOpen(except) { if (openRow && openRow !== except) { openRow.style.transform = ''; openRow.parentNode.classList.remove('open'); openRow = null; } }
    document.addEventListener('pointerdown', function (e) {
      if (state.screen !== 'aiall') return;
      var row = e.target.closest && e.target.closest('.fixswipe .fixrow');
      if (!row) { if (!(e.target.closest && e.target.closest('.fixdel'))) closeOpen(null); return; }
      closeOpen(row);
      var base = row.parentNode.classList.contains('open') ? -SW : 0;
      d = { row: row, x: e.clientX, y: e.clientY, base: base, dx: 0, moved: false, id: e.pointerId, lock: null };
    });
    document.addEventListener('pointermove', function (e) {
      if (!d || e.pointerId !== d.id) return;
      var dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (d.lock === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) d.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (d.lock !== 'x') return;
      d.moved = true; d.dx = dx;
      d.row.classList.add('drag');
      d.row.parentNode.classList.remove('hint'); d.row.parentNode.classList.add('sw-drag');
      var t = Math.max(-SW - 16, Math.min(0, d.base + dx));
      d.row.style.transform = 'translateX(' + t + 'px)';
    });
    function end(e) {
      if (!d || e.pointerId !== d.id) return;
      var me = d; d = null;
      me.row.classList.remove('drag'); me.row.parentNode.classList.remove('sw-drag');
      if (!me.moved) return;
      var t = me.base + me.dx, opened = t < -SW / 2;
      me.row.style.transform = opened ? 'translateX(' + (-SW) + 'px)' : '';
      me.row.parentNode.classList.toggle('open', opened);
      openRow = opened ? me.row : null;
      me.row.setAttribute('data-sw', '1');
      setTimeout(function () { me.row.removeAttribute('data-sw'); }, 60);   // 민 직후에는 '듣기'가 눌리지 않게
    }
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
    document.addEventListener('click', function (e) {
      var r = e.target.closest && e.target.closest('.fixswipe .fixrow');
      if (r && (r.getAttribute('data-sw') || r.parentNode.classList.contains('open'))) { e.stopPropagation(); e.preventDefault(); if (!r.getAttribute('data-sw')) closeOpen(null); }
    }, true);
  })();
  // 카드 학습: 틴더처럼 오른쪽=알아요, 왼쪽=몰라요, 탭=뜻 보기
  (function () {
    var d = null;
    function card() { return document.getElementById('fc-card'); }
    document.addEventListener('pointerdown', function (e) {
      var c = card();
      if (!c || state.screen !== 'hskstudy' || !c.contains(e.target) || e.target.closest('[data-act]')) return;
      d = { x: e.clientX, y: e.clientY, dx: 0, id: e.pointerId, busy: false };
      c.classList.add('drag');
    });
    document.addEventListener('pointermove', function (e) {
      var c = card();
      if (!d || !c || d.busy || e.pointerId !== d.id) return;
      d.dx = e.clientX - d.x;
      c.style.transform = 'translateX(' + d.dx + 'px) rotate(' + (d.dx / 18) + 'deg)';
      var p = Math.min(1, Math.abs(d.dx) / 110);
      c.classList.toggle('lean-yes', d.dx > 12); c.classList.toggle('lean-no', d.dx < -12);
      c.style.setProperty('--lean', p);
    });
    function end(e) {
      var c = card();
      if (!d || !c || e.pointerId !== d.id) return;
      var dx = d.dx, me = d; d = null;
      c.classList.remove('drag');
      if (Math.abs(dx) < 8) { c.style.transform = ''; c.classList.remove('lean-yes', 'lean-no'); if (e.type === 'pointerup') { state.hc.flip = !state.hc.flip; sfx('tap'); render(); } return; }
      if (Math.abs(dx) > 90) {
        me.busy = true; flyCard(dx > 0);
      } else { c.style.transform = ''; c.classList.remove('lean-yes', 'lean-no'); }
    }
    document.addEventListener('pointerup', end);
    document.addEventListener('pointercancel', end);
    window.flyCard = flyCard;
    function flyCard(yes) {
      var c = card();
      if (!c) return hskMark(yes);
      c.classList.add('fly', yes ? 'lean-yes' : 'lean-no'); c.style.setProperty('--lean', 1);
      c.style.transform = 'translateX(' + (yes ? 1 : -1) * (window.innerWidth + 120) + 'px) rotate(' + (yes ? 24 : -24) + 'deg)';
      setTimeout(function () { hskMark(yes); }, 220);
    }
    document.addEventListener('keydown', function (e) {
      if (state.screen !== 'hskstudy' || !card()) return;
      if (e.key === 'ArrowRight') flyCard(true); else if (e.key === 'ArrowLeft') flyCard(false);
    });
  })();
  boot();
})();
