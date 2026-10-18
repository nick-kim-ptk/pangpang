/* 팽팽이 — 말하면서 익히는 중국어 */
(function () {
  'use strict';

  var LESSONS = window.LESSONS;
  var Grade = window.Grade;
  var Hangul = window.Hangul;
  var PHRASES = window.PHRASES || [];
  function kr(py) { return Hangul ? Hangul.fromPinyin(py) : ''; }
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

  var APP_VERSION = 'v39';

  var QMAP = {};
  LESSONS.forEach(function (l) { l.qs.forEach(function (q) { QMAP[q.id] = q; }); });

  var INTERVALS = [0, 1, 3, 7, 14, 30]; // 박스별 복습 간격(일)
  var REVIEW_SIZE = 8;
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
      sound: p.sound !== false,
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
    progress: {},      // qid -> row
    done: {},          // lessonId -> row
    daily: {},         // 'YYYY-MM-DD' -> {lessons, answers}
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
  function lessonById(id) { return LESSONS.filter(function (l) { return l.id === id; })[0]; }
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
    mic: '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    spk: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    close: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    back: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    check: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    home: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8z"/></svg>',
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
  function speak(text, rate) {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(String(text).replace(/[“”"]/g, ''));
    u.lang = 'zh-CN';
    u.rate = rate || 0.85;
    var v = voices.filter(function (x) { return /zh[-_]CN/i.test(x.lang); })[0] ||
            voices.filter(function (x) { return /^zh/i.test(x.lang); })[0];
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
  }
  function stopSpeak() { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); }

  /* ---------- 저장소 (Supabase / 미리보기 모드) ---------- */
  var LOCAL_KEY = 'pangpang.v1';
  function persistLocal() {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ progress: state.progress, done: state.done, daily: state.daily, profile: state.profile }));
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
      state.profile = normProfile({ nickname: meta.nickname, goal: meta.goal, theme: meta.theme, remind: meta.remind, remindOn: meta.remindOn, sound: meta.sound, favs: meta.favs, dlg: meta.dlg, hsk3: meta.hsk3 });
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
    if (!sb || !state.user || state.user.id === 'local' || pendingSaves > 0) return;
    if (Date.now() - lastRefresh < 4000) return;
    lastRefresh = Date.now();
    var gen = saveGen;
    try {
      var d = await fetchRemote();
      if (d.err || pendingSaves > 0 || gen !== saveGen || state.screen !== 'tab') return;
      var before = JSON.stringify([state.progress, state.done, state.daily]);
      applyRemote(d, true);
      if (JSON.stringify([state.progress, state.done, state.daily]) === before) return;
      var sc = document.querySelector ? document.querySelector('.scroll') : null;
      var top = sc ? sc.scrollTop : 0;
      render();
      var sc2 = document.querySelector ? document.querySelector('.scroll') : null;
      if (sc2) sc2.scrollTop = top;
    } catch (e) { /* 네트워크가 안 되면 조용히 넘어가요 */ }
  }

  var store = {
    load: async function () {
      if (!sb) {
        try {
          var raw = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
          state.progress = raw.progress || {};
          state.done = raw.done || {};
          state.daily = raw.daily || {};
          state.profile = normProfile(raw.profile);
        } catch (e) { state.progress = {}; state.done = {}; state.daily = {}; state.profile = normProfile({}); }
        applyTheme();
        return;
      }
      var d = await fetchRemote();
      if (d.err) saveFailed(d.err);
      applyRemote(d);
    },
    saveProgress: tracked(async function (rows) {
      persistLocal();
      if (!sb || !rows.length) return;
      var out = rows.map(function (r) { return Object.assign({ user_id: state.user.id }, r); });
      var res = await sb.from('progress').upsert(out, { onConflict: 'user_id,qid' });
      if (res.error) saveFailed(res.error);
    }),
    saveDone: tracked(async function (row) {
      persistLocal();
      if (!sb) return;
      var res = await sb.from('lesson_done').upsert(Object.assign({ user_id: state.user.id }, row), { onConflict: 'user_id,lesson_id' });
      if (res.error) saveFailed(res.error);
    }),
    saveProfile: tracked(async function () {
      persistLocal();
      if (!sb) return;
      var p = state.profile;
      var res = await sb.auth.updateUser({ data: { nickname: p.nickname, goal: p.goal, theme: p.theme, remind: p.remind, remindOn: p.remindOn, sound: p.sound, favs: p.favs, dlg: p.dlg, hsk3: p.hsk3 } });
      if (res.error) saveFailed(res.error); else if (res.data && res.data.user) state.user = res.data.user;
    }),
    saveDaily: tracked(async function (row) {
      persistLocal();
      if (!sb) return;
      var res = await sb.from('daily_log').upsert(Object.assign({ user_id: state.user.id }, row), { onConflict: 'user_id,day' });
      if (res.error) saveFailed(res.error);
    })
  };

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
  function phraseRow(ph) {
    return '<div class="prow"><button class="pmain" data-act="say" data-text="' + esc(ph[0]) + '" aria-label="듣기">' +
      '<div class="zh p-zh2">' + esc(ph[0]) + '</div><div class="py">' + esc(ph[1]) + '</div><div class="kr">' + esc(kr(ph[1])) + '</div><div class="ko">' + esc(ph[2]) + '</div></button>' +
      '<button class="star' + (isFav(ph[0]) ? ' on' : '') + '" data-act="fav" data-text="' + esc(ph[0]) + '" aria-pressed="' + (isFav(ph[0]) ? 'true' : 'false') + '" aria-label="문장 저장">' + I.star + '</button></div>';
  }
  function nickname() { return (state.profile && state.profile.nickname || '').trim(); }

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
  var SUBSCREEN = { intro: 1, practice: 1, quiz: 1, stats: 1, done: 1, hsk: 1, hskstudy: 1, feedback: 1 };
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
    if (sc === 'practice') quitPractice();
    else if (sc === 'quiz') { stopSpeak(); go(state.z && state.z.hsk ? 'hsk' : 'tab'); }
    else if (sc === 'hskstudy') { stopSpeak(); clearTimeout(hskTimer); store.saveProfile(); go('hsk'); }
    else if (sc === 'hsk') go('tab');
    else if (sc === 'done') go('tab', { tab: 'home' });
    else if (sc === 'intro' || sc === 'stats' || sc === 'feedback') go('tab');
  }
  window.addEventListener('popstate', function () {
    if (ignorePop > 0) { ignorePop--; return; }
    if (!inSub) return;
    if (state.modal || state.screen === 'practice' || state.screen === 'quiz' || state.screen === 'hskstudy') {
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

  function go(screen, extra) {
    state.screen = screen;
    syncHistory(screen);
    if (extra) Object.keys(extra).forEach(function (k) { state[k] = extra[k]; });
    render();
    window.scrollTo(0, 0);
    if (screen === 'done') maybeCelebrate(); else if (celEl) closeCelebration(true);
  }

  /* ---------- 캐릭터 ---------- */
  function ms(name) { return (window.MASCOT && window.MASCOT[name]) || 'img/' + name + '.webp'; }
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
    return '<div class="screen sp" role="progressbar" aria-label="불러오는 중" style="--k:' + spScale() + '"><div class="sp-stage"><div class="sp-dots"></div><div class="sp-glow"></div><div class="sp-spiral"><svg viewBox="0 0 640 640" aria-hidden="true"><path d="M323.5 321.5 L324.1 322.1 L324.6 322.9 L324.9 323.7 L325.2 324.6 L325.4 325.5 L325.4 326.5 L325.3 327.5 L325.1 328.6 L324.7 329.7 L324.2 330.7 L323.5 331.8 L322.7 332.8 L321.8 333.7 L320.7 334.6 L319.6 335.4 L318.2 336.0 L316.8 336.6 L315.3 337.0 L313.7 337.3 L312.0 337.5 L310.3 337.4 L308.5 337.2 L306.7 336.9 L304.8 336.3 L303.0 335.6 L301.2 334.6 L299.5 333.5 L297.8 332.2 L296.2 330.7 L294.7 329.0 L293.3 327.2 L292.1 325.1 L291.0 323.0 L290.1 320.6 L289.3 318.2 L288.8 315.7 L288.5 313.0 L288.4 310.3 L288.6 307.5 L289.0 304.7 L289.7 301.9 L290.6 299.1 L291.8 296.3 L293.2 293.6 L294.9 290.9 L296.8 288.4 L299.0 286.0 L301.5 283.8 L304.1 281.7 L307.0 279.8 L310.1 278.1 L313.4 276.7 L316.8 275.6 L320.3 274.7 L324.0 274.1 L327.8 273.8 L331.7 273.8 L335.6 274.2 L339.5 274.9 L343.4 275.9 L347.3 277.3 L351.0 279.0 L354.7 281.0 L358.3 283.4 L361.7 286.1 L364.9 289.1 L367.9 292.4 L370.6 296.0 L373.1 299.8 L375.3 303.9 L377.2 308.2 L378.7 312.7 L379.8 317.4 L380.6 322.2 L381.0 327.2 L381.0 332.2 L380.6 337.2 L379.7 342.3 L378.5 347.3 L376.8 352.3 L374.6 357.1 L372.1 361.8 L369.1 366.4 L365.8 370.8 L362.0 374.9 L357.9 378.7 L353.5 382.2 L348.7 385.4 L343.7 388.2 L338.3 390.6 L332.8 392.6 L327.0 394.2 L321.1 395.3 L315.0 395.9 L308.8 396.0 L302.6 395.6 L296.4 394.7 L290.2 393.3 L284.1 391.4 L278.1 388.9 L272.3 386.0 L266.7 382.5 L261.3 378.6 L256.2 374.2 L251.5 369.4 L247.1 364.2 L243.1 358.6 L239.6 352.6 L236.5 346.3 L233.9 339.7 L231.8 332.9 L230.3 325.8 L229.4 318.6 L229.0 311.3 L229.3 303.9 L230.1 296.5 L231.5 289.2 L233.6 281.9 L236.2 274.7 L239.4 267.8 L243.3 261.0 L247.7 254.6 L252.6 248.4 L258.0 242.7 L264.0 237.3 L270.4 232.5 L277.2 228.1 L284.4 224.2 L292.0 221.0 L299.9 218.3 L308.0 216.2 L316.3 214.9 L324.7 214.1 L333.2 214.1 L341.8 214.7 L350.4 216.1 L358.9 218.1 L367.2 220.8 L375.4 224.3 L383.3 228.4 L390.9 233.1 L398.1 238.5 L405.0 244.5 L411.3 251.1 L417.2 258.2 L422.5 265.8 L427.2 273.9 L431.3 282.3 L434.7 291.2 L437.4 300.3 L439.4 309.7 L440.6 319.2 L441.0 328.9 L440.7 338.7 L439.5 348.4 L437.6 358.1 L434.9 367.7 L431.4 377.1 L427.1 386.2 L422.1 395.0 L416.4 403.5 L409.9 411.4 L402.8 418.9 L395.1 425.8 L386.8 432.2 L378.0 437.8 L368.6 442.8 L358.9 447.0 L348.8 450.5 L338.4 453.1 L327.7 454.9 L316.9 455.9 L306.0 456.0 L295.0 455.2 L284.1 453.5 L273.3 450.9 L262.6 447.5 L252.3 443.1 L242.2 438.0 L232.6 432.0 L223.4 425.2 L214.7 417.7 L206.6 409.4 L199.2 400.5 L192.5 391.0 L186.5 380.9 L181.4 370.3 L177.1 359.2 L173.6 347.8 L171.1 336.1 L169.5 324.2 L168.9 312.1 L169.3 300.0 L170.6 287.8 L172.9 275.8 L176.2 263.9 L180.4 252.2 L185.6 240.9 L191.8 230.0 L198.8 219.5 L206.6 209.6 L215.3 200.4 L224.8 191.8 L234.9 183.9 L245.7 176.9 L257.1 170.7 L269.0 165.4 L281.3 161.1 L294.0 157.7 L307.0 155.4 L320.2 154.1 L333.5 153.9 L346.9 154.7 L360.2 156.7 L373.3 159.7 L386.3 163.8 L398.9 168.9 L411.2 175.0 L422.9 182.1 L434.1 190.2 L444.7 199.2 L454.5 209.1 L463.6 219.8 L471.8 231.2 L479.1 243.2 L485.4 255.9 L490.8 269.1 L495.0 282.8 L498.2 296.8 L500.3 311.1 L501.2 325.5 L500.9 340.1 L499.5 354.6 L496.9 369.0 L493.1 383.3 L488.2 397.2 L482.2 410.8 L475.0 423.9 L466.8 436.4 L457.6 448.3 L447.4 459.5 L436.4 469.8 L424.4 479.3 L411.7 487.8 L398.4 495.3 L384.3 501.7 L369.8 507.0 L354.9 511.2 L339.5 514.1 L324.0 515.8 L308.3 516.3 L292.5 515.5 L276.8 513.4 L261.3 510.0 L246.0 505.5 L231.1 499.6 L216.6 492.6 L202.7 484.4 L189.4 475.1 L176.9 464.7 L165.2 453.3 L154.4 441.0 L144.7 427.8 L135.9 413.8 L128.3 399.1 L121.9 383.7 L116.7 367.9 L112.7 351.6 L110.1 335.0 L108.8 318.1 L108.9 301.2 L110.3 284.2 L113.1 267.4 L117.2 250.8 L122.7 234.5 L129.5 218.7 L137.5 203.3 L146.8 188.7 L157.3 174.7 L168.9 161.6 L181.6 149.5 L195.2 138.3 L209.7 128.3 L225.1 119.4 L241.1 111.7 L257.8 105.3 L275.0 100.3 L292.6 96.6 L310.5 94.4 L328.6 93.6 L346.8 94.3 L364.9 96.4 L382.8 99.9 L400.5 104.9 L417.7 111.4 L434.5 119.2 L450.6 128.3 L466.0 138.8 L480.5 150.5 L494.1 163.3 L506.7 177.3 L518.2 192.2 L528.4 208.1 L537.4 224.8 L545.0 242.2 L551.3 260.3 L556.0 278.8 L559.4 297.7 L561.1 316.9 L561.4 336.3 L560.1 355.6 L557.2 374.9 L552.8 393.9 L546.8 412.5 L539.4 430.7 L530.5 448.3 L520.2 465.1 L508.6 481.2 L495.6 496.3 L481.5 510.3 L466.2 523.3 L449.9 534.9 L432.6 545.3 L414.6 554.3 L395.8 561.9 L376.4 567.9 L356.5 572.4 L336.2 575.2 L315.8 576.5 L295.2 576.1 L274.7 574.0 L254.3 570.4 L234.3 565.0 L214.7 558.1 L195.6 549.6 L177.3 539.6 L159.7 528.1 L143.1 515.2 L127.5 500.9 L113.0 485.4 L99.8 468.8 L88.0 451.1 L77.6 432.5 L68.6 413.0 L61.3 392.8 L55.5 372.1 L51.4 350.8 L49.1 329.3 L48.4 307.6 L49.5 285.8 L52.4 264.2 L56.9 242.7 L63.2 221.7 L71.2 201.2 L80.8 181.3 L92.1 162.2 L104.8 144.0 L119.0 126.8 L134.6 110.8 L151.4 96.0 L169.5 82.6 L188.6 70.7 L208.6 60.3 L229.5 51.5 L251.0 44.3 L273.2 38.9 L295.7 35.3 L318.5 33.5 L341.5 33.6 L364.4 35.4 L387.2 39.2 L409.7 44.7 L431.7 52.0 L453.1 61.1 L473.8 71.9 L493.5 84.4 L512.3 98.4 L530.0 114.0 L546.3 130.9 L561.3 149.2 L574.9 168.6 L586.9 189.1 L597.2 210.6 L605.8 232.9 L612.6 255.8 L617.5 279.3 L620.6 303.2 L621.7 327.3 L621.0 351.4 L618.2 375.5 L613.6 399.4 L607.0 422.8 L598.6 445.8 L588.3 468.0 L576.3 489.4 L562.5 509.8 L547.1 529.1 L530.2 547.2 L511.9 563.8 L492.2 579.0 L471.3 592.6 L449.4 604.5 L426.5 614.7"/></svg></div><i class="sp-bubble" style="left:40px;top:640px;width:26px;height:26px;--dur:6.5s;--delay:1.2s;--sway:18px"></i><i class="sp-bubble" style="left:318px;top:520px;width:18px;height:18px;--dur:5.5s;--delay:2.0s;--sway:-14px"></i><i class="sp-bubble" style="left:300px;top:700px;width:34px;height:34px;--dur:7.5s;--delay:1.6s;--sway:-22px"></i><i class="sp-bubble" style="left:70px;top:420px;width:14px;height:14px;--dur:5s;--delay:2.6s;--sway:12px"></i><i class="sp-bubble" style="left:200px;top:760px;width:12px;height:12px;--dur:6s;--delay:3.1s;--sway:10px"></i><div class="sp-pop"><i class="sp-ring" style="--d:.72s;--sz:300px"></i><i class="sp-ring" style="--d:.82s;--sz:460px"></i><i class="sp-ring" style="--d:.95s;--sz:620px"></i><i class="sp-ray" style="--a:15deg"></i><i class="sp-ray" style="--a:45deg"></i><i class="sp-ray" style="--a:75deg"></i><i class="sp-ray" style="--a:105deg"></i><i class="sp-ray" style="--a:135deg"></i><i class="sp-ray" style="--a:165deg"></i><i class="sp-ray" style="--a:195deg"></i><i class="sp-ray" style="--a:225deg"></i><i class="sp-ray" style="--a:255deg"></i><i class="sp-ray" style="--a:285deg"></i><i class="sp-ray" style="--a:315deg"></i><i class="sp-ray" style="--a:345deg"></i><i class="sp-conf" style="--dx:120px;--dy:30px;--s:6px;--r:50%;--c:#FFD45E;--rot:-270deg"></i><i class="sp-conf" style="--dx:139px;--dy:103px;--s:11px;--r:2px;--c:#FF8FA3;--rot:-187deg"></i><i class="sp-conf" style="--dx:109px;--dy:190px;--s:9px;--r:2px;--c:#7FD8C6;--rot:-104deg"></i><i class="sp-conf" style="--dx:92px;--dy:137px;--s:7px;--r:50%;--c:#FFFFFF;--rot:-21deg"></i><i class="sp-conf" style="--dx:40px;--dy:203px;--s:12px;--r:2px;--c:#B9A4FF;--rot:62deg"></i><i class="sp-conf" style="--dx:-32px;--dy:151px;--s:10px;--r:2px;--c:#FFB24A;--rot:145deg"></i><i class="sp-conf" style="--dx:-23px;--dy:190px;--s:8px;--r:50%;--c:#FFD45E;--rot:228deg"></i><i class="sp-conf" style="--dx:-117px;--dy:191px;--s:6px;--r:2px;--c:#FF8FA3;--rot:-229deg"></i><i class="sp-conf" style="--dx:-131px;--dy:94px;--s:11px;--r:2px;--c:#7FD8C6;--rot:-146deg"></i><i class="sp-conf" style="--dx:-154px;--dy:129px;--s:9px;--r:50%;--c:#FFFFFF;--rot:-63deg"></i><i class="sp-conf" style="--dx:-130px;--dy:41px;--s:7px;--r:2px;--c:#B9A4FF;--rot:20deg"></i><i class="sp-conf" style="--dx:-154px;--dy:-35px;--s:12px;--r:2px;--c:#FFB24A;--rot:103deg"></i><i class="sp-conf" style="--dx:-196px;--dy:-27px;--s:10px;--r:50%;--c:#FFD45E;--rot:186deg"></i><i class="sp-conf" style="--dx:-108px;--dy:-75px;--s:8px;--r:2px;--c:#FF8FA3;--rot:269deg"></i><i class="sp-conf" style="--dx:-58px;--dy:-149px;--s:6px;--r:2px;--c:#7FD8C6;--rot:-188deg"></i><i class="sp-conf" style="--dx:-56px;--dy:-93px;--s:11px;--r:50%;--c:#FFFFFF;--rot:-105deg"></i><i class="sp-conf" style="--dx:10px;--dy:-142px;--s:9px;--r:2px;--c:#B9A4FF;--rot:-22deg"></i><i class="sp-conf" style="--dx:108px;--dy:-149px;--s:7px;--r:2px;--c:#FFB24A;--rot:61deg"></i><i class="sp-conf" style="--dx:65px;--dy:-112px;--s:12px;--r:50%;--c:#FFD45E;--rot:144deg"></i><i class="sp-conf" style="--dx:153px;--dy:-88px;--s:10px;--r:2px;--c:#FF8FA3;--rot:227deg"></i><i class="sp-conf" style="--dx:138px;--dy:6px;--s:8px;--r:2px;--c:#7FD8C6;--rot:-230deg"></i><i class="sp-conf" style="--dx:170px;--dy:-20px;--s:6px;--r:50%;--c:#FFFFFF;--rot:-147deg"></i><i class="sp-ball"></i></div><div class="sp-floor"></div><div class="sp-snailwrap"><div class="sp-snailpop"><div class="sp-snailidle"><img class="sp-snail" data-act="splash-tap" src="' + ms('snail-cheer') + '" alt="" draggable="false"></div></div></div><div class="sp-sfx" style="left:30px;top:196px;font-size:46px;--rot:-14deg;--d:.95s">嘭!</div><div class="sp-sfx" style="right:26px;top:262px;font-size:34px;--rot:12deg;--d:1.08s">嘭!</div><div class="sp-brand"><div class="sp-word"><span class="sp-ch" style="--d:1.25s">嘭</span><span class="sp-ch" style="--d:1.39s">嘭</span></div><div class="sp-sub">PĒNG · PĒNG</div></div><div class="sp-tag">' + esc(splashTag) + '</div><div class="sp-loader"><div class="sp-track"></div><div class="sp-trail"></div><i class="sp-mini"></i></div></div></div>';
  }
  function viewLogin() {
    var local = !sb;
    return '<div class="screen login">' +
      '<div class="hero">' +
        '<div class="stage">' + mascot('wink') + '</div>' +
        '<h1 class="brand">팽팽이</h1>' +
        '<p>천천히, 그래도 매일.<br>말하면서 익히는 중국어예요.</p>' +
      '</div>' +
      '<div class="actions">' +
        (!local && navigator.onLine === false
          ? emptyState('offline', { small: true, cta: { act: 'pp-retry', label: '다시 시도' } })
          : local
          ? '<div class="notice">Supabase 설정 전이라 미리보기 모드예요. 학습 기록은 이 기기에만 저장돼요.</div>' +
            '<button class="btn" data-act="start-local">미리보기로 시작하기</button>'
          : '<button class="btn g-btn" data-act="google">' + I.google + 'Google로 시작하기</button>') +
      '</div>' +
    '</div>';
  }

  /* ---------- 화면: 탭(홈/복습/단어장) ---------- */
  function navHtml() {
    function b(id, label, icon) {
      return '<button data-act="tab" data-id="' + id + '"' + (state.tab === id ? ' aria-current="page"' : '') + '>' + icon + '<span>' + label + '</span></button>';
    }
    return '<nav class="nav" aria-label="메뉴">' + b('home', '홈', I.home) + b('lessons', '레슨', I.list) + b('review', '복습', I.review) + b('words', '단어장', I.book) + b('me', '마이', I.user) + '</nav>';
  }

  // 소개글의 첫 문장까지만 (예: "오늘은 … 배워볼 거예요.")
  function firstSentence(t) { var m = String(t || '').match(/^.*?[.!?](?=\s|$)/); return m ? m[0] : t; }
  function viewHome() {
    var next = nextLesson();
    var due = dueRows().length;
    var done = todayDone();
    var st = streak();

    var nick = nickname();
    var head = '<div class="home-greet"><h1>팽팽,<br>느려도 괜찮아, 너만의 속도로.' +
      (st > 0 ? ' <span class="chip y streak-chip">' + st + '일 연속</span>' : '') + '</h1></div>';

    var ans = todayAnswers(), goal = state.profile.goal;
    var goalPct = Math.min(100, Math.round(ans / goal * 100));
    var goalCard = '<div class="goal-card' + (ans >= goal ? ' hit' : '') + '"><div class="goal-top"><span>오늘 목표</span><b>' +
      (ans >= goal ? '달성! ' : '') + Math.min(ans, 9999) + ' / ' + goal + '문제</b></div><div class="goal-bar"><i style="width:' + goalPct + '%"></i></div></div>';

    var todayCard;
    if (!next) {
      todayCard = '<div class="today hero done">' + mascot('love', 'hero-m') + '<span class="chip green">모든 레슨 완료</span>' +
        '<h2>전부 배웠어요!</h2><p class="explain">' + LESSONS.length + '개 레슨을 모두 마쳤어요. 이제 복습으로 입에 붙여 볼까요?</p>' +
        '<button class="btn soft" data-act="review-start">복습하기</button></div>';
    } else if (done) {
      todayCard = '<div class="today hero done">' + mascot('thumbs', 'hero-m') + '<span class="chip green">오늘 레슨 완료</span>' +
        '<h2>오늘 분량 끝!</h2><p class="explain">다음 레슨은 “' + esc(next.title) + '”이에요. 더 하고 싶다면 미리 배워 봐도 좋아요.</p>' +
        '<button class="btn soft" data-act="open-lesson" data-id="' + next.id + '">한 과 더 배우기</button></div>';
    } else {
      todayCard = '<div class="today hero">' + mascot('snail-reading', 'hero-m reading') + '<span class="chip y">오늘의 중국어</span>' +
        '<h2>' + esc(next.title) + '</h2><p class="explain">' + esc(firstSentence(next.intro)) + '</p>' +
        '<button class="btn" data-act="open-lesson" data-id="' + next.id + '">학습하기</button></div>';
    }

    var reviewCard = due > 0 ? '<div class="review-card"><div class="lead">' + mascot('laptop') +
      '<div><b>복습할 문제 ' + due + '개</b><div class="s">잊기 전에 한 번 더 말해요</div></div></div>' +
      '<button class="btn sm" data-act="review-start">복습</button></div>' : '';

    var ph = todayPhrase();
    var phraseCard = ph ? '<div class="phrase-card"><div class="lab">오늘의 한 문장</div>' +
      '<div class="row"><div class="txt"><div class="zh p-zh">' + esc(ph[0]) + '</div><div class="py p-py">' + esc(ph[1]) + '</div>' +
      '<div class="kr p-kr">' + esc(kr(ph[1])) + '</div><div class="ko p-ko">' + esc(ph[2]) + '</div></div>' +
      '<div class="p-btns"><button class="round-btn" data-act="say" data-text="' + esc(ph[0]) + '" aria-label="오늘의 한 문장 듣기">' + I.spk + '</button>' +
      '<button class="star' + (isFav(ph[0]) ? ' on' : '') + '" data-act="fav" data-text="' + esc(ph[0]) + '" aria-pressed="' + (isFav(ph[0]) ? 'true' : 'false') + '" aria-label="문장 저장">' + I.star + '</button></div></div></div>' : '';
    return '<div class="screen"><div class="scroll with-nav home-scroll">' + head + goalCard + todayCard + phraseCard + reviewCard + '</div>' + navHtml() + '</div>';
  }

  function viewLessons() {
    var next = nextLesson();
    var n = learnedLessons().length;
    var pct = Math.round(n / LESSONS.length * 100);
    var list = LESSONS.map(function (l, i) {
      var isDone = !!state.done[l.id];
      return '<li><button class="item' + (isDone ? '' : ' off') + '" data-act="open-lesson" data-id="' + l.id + '">' +
        '<span class="num">' + (i + 1) + '</span><span class="txt"><div class="t">' + esc(l.title) + '</div><div class="s">' + esc(l.sub) + '</div></span>' +
        (isDone ? '<span class="chip green">' + I.check + '완료</span>' : (next && next.id === l.id ? '<span class="chip y">NEW</span>' : '')) +
        '</button></li>';
    }).join('');
    return '<div class="screen"><div class="scroll with-nav" style="padding-top:28px">' +
      '<h1 class="big-title">전체 레슨</h1>' +
      '<p class="sub-title">원하는 레슨을 골라 미리 배우거나 다시 연습할 수 있어요.</p>' +
      '<div class="lesson-progress"><div class="row"><b>' + n + ' / ' + LESSONS.length + '</b><span>레슨 완료</span></div>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div></div>' +
      '<ul class="list" style="margin-top:16px">' + list + '</ul></div>' + navHtml() + '</div>';
  }

  function dialogSection() {
    var ds = window.DIALOGS || [];
    if (!ds.length) return '';
    return '<div class="section-title" style="margin-top:28px">상황 대화 연습</div><ul class="list">' + ds.map(function (d) {
      var done = state.profile.dlg.indexOf(d.id) >= 0;
      return '<li><button class="item" data-act="dialog-start" data-id="' + d.id + '"><span class="txt"><div class="t">' + esc(d.title) + '</div>' +
        '<div class="s">' + esc(d.intro) + ' · ' + d.turns.length + '번 주고받기</div></span>' +
        '<span class="chip ' + (done ? 'green' : 'soft') + '">' + (done ? '완료' : '시작') + '</span></button></li>';
    }).join('') + '</ul>';
  }
  function listenCard() {
    var n = learnedQs().length;
    return '<div class="weak-card"><div class="weak-txt"><div class="t">듣기 연습</div>' +
      '<div class="s">' + (n >= 4 ? '소리를 듣고 뜻을 골라요 · ' + QUIZ_SIZE + '문제' : '레슨을 하나 끝내면 열려요') + '</div></div>' +
      '<button class="pill-sm" data-act="quiz-listen"' + (n >= 4 ? '' : ' disabled') + '>시작</button></div>';
  }
  function weakCard() {
    var n = weakRows().length;
    return '<div class="weak-card"><div class="weak-txt"><div class="t">약한 문제 집중 연습</div>' +
      '<div class="s">' + (n ? '자주 틀린 문제 ' + n + '개를 모아서 풀어요' : '아직 약한 문제가 없어요. 잘하고 있어요!') + '</div></div>' +
      '<button class="pill-sm" data-act="review-weak"' + (n ? '' : ' disabled') + '>시작</button></div>';
  }
  function viewReview() {
    var due = dueRows().length;
    var learned = learnedLessons();
    var rows = learned.map(function (l) {
      var m = mastered(l);
      var no = LESSONS.indexOf(l) + 1;
      return '<li><button class="item" data-act="review-lesson" data-id="' + l.id + '">' +
        '<span class="num">' + no + '</span><span class="txt"><div class="t">' + esc(l.title) + '</div><div class="s">익숙해진 문제 ' + m + ' / ' + l.qs.length + '</div></span>' +
        '<span class="chip soft">복습</span></button></li>';
    }).join('');

    return '<div class="screen"><div class="scroll with-nav" style="padding-top:28px">' +
      '<h1 class="big-title">복습하기</h1>' +
      '<p class="sub-title">배운 문장을 다시 말하면서 오래 기억해요.</p>' +
      '<div class="today' + (due > 0 ? '' : ' done') + '" style="margin-top:0">' +
        '<div class="today-top"><span class="chip ' + (due > 0 ? 'y' : 'green') + '">' + (due > 0 ? '지금 복습할 문제' : '오늘 복습 완료') + '</span>' +
        '<h2 style="font-size:34px">' + due + '개</h2></div>' +
        '<p class="explain">' + (due > 0 ? '한 번에 최대 ' + REVIEW_SIZE + '문제씩 해요' : '내일 다시 만나요') + '</p>' +
        mascot(due > 0 ? 'laptop' : 'sleep', 'today-m') +
        (due > 0
          ? '<button class="btn" data-act="review-start">복습 시작</button>'
          : '<button class="btn soft" data-act="review-random"' + (learned.length ? '' : ' disabled') + '>랜덤 복습하기</button>') +
      '</div>' +
      weakCard() +
      listenCard() +
      dialogSection() +
      '<div class="section-title">레슨별로 복습하기</div>' +
      (learned.length ? '<ul class="list">' + rows + '</ul>' : emptyState('empty', { title: '아직 복습할 게 없어요', desc: '첫 레슨을 끝내면\n여기서 복습할 수 있어요', cta: { act: 'tab', id: 'lessons', label: '레슨 보러 가기' } })) +
      '</div>' + navHtml() + '</div>';
  }

  function phraseSections() {
    var favs = state.profile.favs.map(function (zh) { return PHRASES.filter(function (p) { return p[0] === zh; })[0]; }).filter(Boolean);
    var h = '';
    if (favs.length) h += '<div class="section-title" style="margin-top:28px">저장한 문장 ' + favs.length + '</div><div class="words">' + favs.map(phraseRow).join('') + '</div>';
    var past = [];
    for (var i = 1; i <= 6; i++) { var p = phraseAt(i); if (p && past.indexOf(p) < 0) past.push(p); }
    if (past.length) h += '<div class="section-title" style="margin-top:28px">지난 오늘의 한 문장</div><div class="words">' + past.map(phraseRow).join('') + '</div>';
    return h;
  }
  function viewWords() {
    var learned = learnedLessons();
    var wordCount = learned.reduce(function (n, l) { return n + l.words.length; }, 0);
    var body = learned.map(function (l) {
      return '<div class="section-title" style="margin-top:28px">' + esc(l.title) + '</div>' +
        '<div class="words">' + l.words.map(function (w) { return wordRow(w); }).join('') + '</div>';
    }).join('');

    return '<div class="screen"><div class="scroll with-nav">' +
      '<div class="tab-head"><div><h1 class="big-title">단어장</h1>' +
      '<p class="sub-title" style="margin-bottom:0">배운 단어가 쌓여요.<br>눌러서 들어 보세요.</p></div>' + mascot('book') + '</div>' +
      '<div class="stats">' +
        '<div class="stat"><b>' + learned.length + '/' + LESSONS.length + '</b><span>배운 레슨</span></div>' +
        '<div class="stat"><b>' + wordCount + '</b><span>배운 단어</span></div>' +
        '<div class="stat"><b>' + streak() + '일</b><span>연속 학습</span></div>' +
      '</div>' +
      (wordCount >= 4 ? '<button class="btn quiz-btn" data-act="quiz-word">단어 퀴즈 풀기</button>' : '') +
      hskSection() +
      phraseSections() +
      (learned.length ? body : emptyState('empty', { title: '아직 쌓인 단어가 없어요', desc: '첫 레슨을 끝내면\n단어가 여기에 쌓여요', cta: { act: 'tab', id: 'lessons', label: '레슨 보러 가기' } })) +
      '</div>' + navHtml() + '</div>';
  }

  function wordRow(w) {
    return '<button class="word" data-act="say" data-text="' + esc(w[0]) + '" aria-label="' + esc(w[0]) + ' 듣기">' +
      '<span class="zhw">' + esc(w[0]) + '</span>' +
      '<span class="mid"><div><span class="py">' + esc(w[1]) + '</span> <b class="kr">' + esc(kr(w[1])) + '</b></div><div class="ko">' + esc(w[2]) + '</div></span>' +
      '<span class="spk">' + I.spk + '</span></button>';
  }

  /* ---------- 화면: 레슨 소개 ---------- */
  function viewIntro() {
    var l = lessonById(state.lessonId);
    var learned = !!state.done[l.id];
    return '<div class="screen">' +
      '<div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll" style="padding-bottom:8px">' +
        '<div class="intro-head"><div><h1 class="big-title" style="margin-top:0">' + esc(l.title) + '</h1>' +
        '<p class="sub-title" style="margin-bottom:0">' + esc(l.intro) + '</p></div></div>' +
        '<div class="pattern" style="margin-top:16px"><div class="zh">' + esc(l.pattern.zh) + '</div><div class="py" style="margin-top:2px">' + esc(l.pattern.py) + '</div><div class="kr">' + esc(kr(l.pattern.py)) + '</div><div class="ko" style="margin-top:2px">' + esc(l.pattern.ko) + '</div></div>' +
        '<div class="section-title" style="margin-top:24px">오늘 배울 말</div>' +
        '<div class="words">' + l.words.map(wordRow).join('') + '</div>' +
      '</div>' +
      '<div class="footer"><button class="btn" data-act="practice-lesson" data-id="' + l.id + '">' + (learned ? '다시 연습하기' : '말하기 연습 시작') + '</button></div>' +
    '</div>';
  }

  /* ---------- 화면: 말하기 연습 ---------- */
  function viewPractice() {
    var s = state.s;
    var q = s.cur;
    var l = s.kind === 'dialog' ? { title: s.dlg.title, tip: '' } : lessonById(q.lessonId);
    var pct = Math.round((s.solved / s.total) * 100);

    var top = '<div class="topbar"><button class="icon-btn" data-act="quit" aria-label="그만하기">' + I.close + '</button>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + pct + '%"></i></div>' +
      '<span class="chip" style="min-width:48px;justify-content:center">' + s.solved + '/' + s.total + '</span></div>';

    var showAnswer = s.revealed && s.phase === 'ask';
    var body = '<div class="q-wrap">' +
      '<div class="q-head"><span class="chip soft">' + esc(l.title) + '</span></div>' +
      (s.kind === 'dialog' ? transcriptHtml(s) : '') +
      '<div class="q-zh">' + esc(q.zh) + '</div>' +
      '<div class="q-py">' + esc(q.py) + '</div>' +
      '<div class="q-kr">' + esc(kr(q.py)) + '</div>' +
      koBlock(s, q.ko, 'q-ko') +
      '<div class="q-actions">' +
        '<button class="round-btn" data-act="hear-q" aria-label="질문 다시 듣기">' + I.spk + '</button>' +
        (l.tip ? '<span class="tip">' + esc(l.tip) + '</span>' : '') +
        (!s.revealed && s.phase === 'ask' ? '<button class="link-btn" data-act="reveal">힌트 보기</button>' : '') +
      '</div>' +
      (showAnswer ? answerCard(q, '따라 말해 보세요') : '') +
    '</div>';

    var bottom = s.phase === 'ask' ? micArea() : resultSheet(q);
    return '<div class="screen">' + top + body + bottom + '</div>';
  }

  function transcriptHtml(s) {
    if (!s.log || !s.log.length) return '';
    return '<div class="tr">' + s.log.map(function (t) {
      return '<div class="tr-b them">' + esc(t.npc) + '</div><div class="tr-b me' + (t.skipped ? ' sk' : '') + '">' + esc(t.me) + '</div>';
    }).join('') + '</div>';
  }
  function koBlock(s, text, cls) {
    return s.showKo
      ? '<div class="' + cls + '" data-act="ko" role="button" tabindex="0">' + esc(text) + '</div>'
      : '<button class="ko-peek" data-act="ko">뜻 보기</button>';
  }

  function answerCard(q, label) {
    return '<div class="answer" style="margin-top:20px"><div class="body">' +
      '<div class="py" style="margin-bottom:4px">' + esc(label) + '</div>' +
      '<div class="zh">' + esc(q.a.zh) + '</div><div class="py">' + esc(q.a.py) + '</div><div class="kr">' + esc(kr(q.a.py)) + '</div>' + koBlock(state.s, q.a.ko, 'ko a-ko') + '</div>' +
      '<button class="round-btn" data-act="hear-a" aria-label="정답 듣기">' + I.spk + '</button></div>';
  }

  function micArea() {
    var s = state.s;
    var hint = s.msg || '버튼을 누른 채로 중국어로 말하고, 끝나면 손을 떼세요';
    if (s.typing) {
      return '<div class="mic-area">' +
        '<div class="type-row"><input id="typed" class="zh" lang="zh-CN" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="중국어로 입력" aria-label="중국어로 답 입력">' +
        '<button class="btn" data-act="submit-typed">확인</button></div>' +
        (window.SpeechRecognition || window.webkitSpeechRecognition ? '<button class="link-btn" data-act="voice-mode">음성으로 답하기</button>' : '') + '</div>';
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
  function resultSheet(q) {
    var s = state.s;
    var last = s.pass && s.queue.length === 0;
    if (s.pass) {
      return '<div class="sheet ok" role="status">' + mascot(s.mood || 'love', 'm') +
        '<div class="head"><span class="badge">' + I.check + '</span>잘했어요!' + (s.combo >= 2 ? '<span class="combo">연속 ' + s.combo + '번</span>' : '') + '</div>' +
        (s.heard ? '<div class="heard">내가 한 말 <span class="zh">' + esc(s.heard) + '</span></div>' : '') +
        answerCard(q, '예시 답안').replace('style="margin-top:20px"', '') +
        '<div class="btns"><button class="btn green" data-act="next">' + (last ? '끝내기' : '다음 문제') + '</button></div></div>';
    }
    return '<div class="sheet no" role="status">' + mascot('cheer', 'm') +
      '<div class="head"><span class="badge">' + I.x + '</span>다시 해볼까요?</div>' +
      '<div class="heard">' + (s.heard ? '들린 말 <span class="zh">' + esc(s.heard) + '</span>' : '소리가 잘 들리지 않았어요') + '</div>' +
      diagHtml(q) +
      (s.revealed ? answerCard(q, '정답을 따라 말해 보세요').replace('style="margin-top:20px"', '') : '<div style="height:14px"></div>') +
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

  function viewDone() {
    var r = state.result;
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
  function settingsCard() {
    var p = state.profile;
    return '<div class="section-title" style="margin-top:24px">설정</div><div class="set-card">' +
      '<div class="set-row"><div class="set-t">하루 목표</div>' + seg('set-goal', p.goal, [[20, '20'], [50, '50'], [100, '100']]) + '</div>' +
      '<div class="set-row"><div class="set-t">효과음·진동</div>' + seg('set-sound', p.sound ? 'on' : 'off', [['on', '켜짐'], ['off', '꺼짐']]) + '</div>' +
      '<div class="set-row"><div class="set-t">화면</div>' + seg('set-theme', p.theme, [['auto', '자동'], ['light', '라이트'], ['dark', '다크']]) + '</div>' +
      (typeof settingsExtra === 'function' ? settingsExtra() : '') +
      '<div class="set-row"><div class="set-t">의견 보내기</div><button class="pill-sm" data-act="open-feedback">보내기</button></div>' +
      '<div class="set-row"><div class="set-t">앱 버전</div><div class="set-v">' + APP_VERSION + '</div></div></div>';
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
    var solved = Object.keys(state.progress).filter(function (k) { return QMAP[k] && state.progress[k].box >= 4; }).length;
    return '<div class="screen"><div class="scroll with-nav">' +
      '<div class="tab-head"><div><h1 class="big-title">' + (nickname() ? esc(nickname()) + '님,<br>' : '') + '오늘도 화이팅!</h1>' +
      '<p class="sub-title" style="margin-bottom:0">내 학습 기록이에요.</p></div>' + mascot('wink') + '</div>' +
      meCard(initial, email) +
      '<div class="stats">' +
        '<div class="stat"><b>' + learned.length + '/' + LESSONS.length + '</b><span>배운 레슨</span></div>' +
        '<div class="stat"><b>' + wordCount + '</b><span>배운 단어</span></div>' +
        '<div class="stat"><b>' + streak() + '일</b><span>연속 학습</span></div>' +
      '</div>' +
      '<div class="section-title" style="margin-top:24px">최근 7일</div><div class="week">' + dots + '</div>' +
      '<div class="stats" style="grid-template-columns:repeat(2,1fr)">' +
        '<div class="stat"><b>' + solved + '</b><span>익숙해진 문제</span></div>' +
        '<div class="stat"><b>' + dueRows().length + '</b><span>복습할 문제</span></div>' +
      '</div>' +
      '<button class="btn soft quiz-btn" data-act="open-stats">학습 통계 · 약점 분석 보기</button>' +
      settingsCard() +
      '<div class="me-actions">' +
        (sb ? '<button class="btn gray" data-act="logout">로그아웃</button>'
            : '<button class="btn gray" data-act="reset-local">기록 모두 지우기</button>') +
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
  // kind: tap | pop | right | wrong | done | goal
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
      if (kind === 'done') { [0, 4, 7, 12].forEach(function (n, i) { tone(NOTE(12 + n), i * 0.11, 0.3, 'triangle', 0.2); }); buzz([30, 40, 30]); return; }
      if (kind === 'goal') { [0, 4, 7, 12, 16, 19].forEach(function (n, i) { tone(NOTE(12 + n), i * 0.09, 0.34, 'triangle', 0.2); }); buzz([40, 40, 40, 40, 80]); }
    } catch (e) { /* 소리가 안 나도 앱은 계속 */ }
  }

  /* ---------- 확인 팝업 (앱 화면과 같은 시트 디자인) ---------- */
  function askConfirm(opts, onOk, onNo) {
    state.modal = { title: opts.title, body: opts.body, ok: opts.ok || '확인', cancel: opts.cancel || '취소', danger: !!opts.danger, m: opts.m || 'ask', onOk: onOk, onNo: onNo };
    render();
  }
  function closeModal() { state.modal = null; render(); }
  function modalHtml() {
    var m = state.modal;
    if (!m) return '';
    return '<div class="scrim modal" data-act="modal-cancel" aria-hidden="true"></div>' +
      '<div class="dialog" role="alertdialog" aria-modal="true" aria-label="' + esc(m.title) + '">' + mascot(m.m, 'm') +
      '<h3>' + esc(m.title) + '</h3><p>' + esc(m.body) + '</p>' +
      '<div class="btns"><button class="btn' + (m.danger ? ' danger' : '') + '" data-act="modal-ok">' + esc(m.ok) + '</button>' +
      '<button class="btn gray" data-act="' + (m.onNo ? 'modal-no' : 'modal-cancel') + '">' + esc(m.cancel) + '</button></div></div>';
  }
  function render() {
    var html = '';
    if (state.screen === 'loading') html = viewLoading();
    else if (state.screen === 'login') html = viewLogin();
    else if (state.screen === 'tab') html = state.tab === 'lessons' ? viewLessons() : state.tab === 'review' ? viewReview() : (state.tab === 'words' ? viewWords() : (state.tab === 'me' ? viewMe() : viewHome()));
    else if (state.screen === 'intro') html = viewIntro();
    else if (state.screen === 'practice') html = viewPractice();
    else if (state.screen === 'quiz') html = viewQuiz();
    else if (state.screen === 'stats') html = viewStats();
    else if (state.screen === 'hsk') html = viewHsk();
    else if (state.screen === 'feedback') html = viewFeedback();
    else if (state.screen === 'hskstudy') html = viewHskStudy();
    else if (state.screen === 'done') html = viewDone();
    $app.innerHTML = html + modalHtml();
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
    var lessonHtml = learned.length ? '<div class="section-title" style="margin-top:24px">레슨별 숙련도</div><div class="words">' + learned.map(function (l) {
      var m = mastered(l), pct = Math.round(m / l.qs.length * 100);
      return '<div class="lm"><div class="lm-top"><span>' + esc(l.title) + '</span><b>' + pct + '%</b></div><div class="meter g"><i style="width:' + pct + '%"></i></div></div>';
    }).join('') + '</div>' : '';
    return '<div class="screen"><div class="topbar"><button class="icon-btn" data-act="back" aria-label="뒤로">' + I.back + '</button></div>' +
      '<div class="scroll" style="padding-top:4px">' +
      '<h1 class="big-title" style="margin-top:0">학습 통계</h1><p class="sub-title">내 공부 흐름과 약한 부분이에요.</p>' +
      '<div class="stats" style="grid-template-columns:repeat(2,1fr)">' +
        '<div class="stat"><b>' + allAnswers + '</b><span>지금까지 푼 문제</span></div>' +
        '<div class="stat"><b>' + streak() + '일</b><span>연속 학습</span></div>' +
        '<div class="stat"><b>' + acc + '%</b><span>한 번에 맞힌 비율</span></div>' +
        '<div class="stat"><b>' + activeDays + '/7일</b><span>이번 주 공부한 날</span></div>' +
      '</div>' +
      '<div class="section-title" style="margin-top:24px">최근 7일 푼 문제 · ' + weekTotal + '개</div>' +
      '<div class="chart"><div class="goalline" style="bottom:calc(' + goalPos + '% * 0.62 + 40px)"><span>목표 ' + goal + '</span></div><div class="bars">' + bars + '</div></div>' +
      '<div class="section-title" style="margin-top:24px">약점 분석</div>' + tagHtml + worstHtml + lessonHtml +
      '<div style="height:24px"></div></div></div>';
  }

  /* ---------- 의견 보내기 (Supabase feedback — 관리자는 대시보드에서만 확인) ---------- */
  var FB_CATS = [['idea', '아이디어'], ['bug', '불편·오류'], ['praise', '칭찬'], ['etc', '기타']];
  var FB_MAX = 1000, fbLast = 0;
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
  document.addEventListener('input', function (e) {
    var t = e.target;
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
  function bumpAnswer() {
    var day = dayStr(new Date());
    var d0 = state.daily[day] || { day: day, lessons: 0, answers: 0 };
    var d = { day: day, lessons: d0.lessons, answers: d0.answers + 1 };
    state.daily[day] = d; store.saveDaily(d);
  }
  function hskSection() {
    if (!Object.keys(HSKW).length) return '';
    return '<div class="section-title" style="margin-top:24px">HSK 단어</div><p class="hsk-note under-title">' + HSK_NOTE + '</p><ul class="list">' + [1, 2, 3, 4].map(function (lv) {
      var n = hskList(lv).length, k = hskCount(lv), pct = n ? Math.round(k / n * 100) : 0;
      return '<li><button class="item" data-act="hsk-open" data-id="' + lv + '"><span class="num">' + lv + '</span><span class="txt"><div class="t">HSK ' + lv + '급</div>' +
        '<div class="s">단어 ' + n + '개 · 익힌 ' + k + '개</div><div class="meter g" style="margin-top:6px"><i style="width:' + pct + '%"></i></div></span></button></li>';
    }).join('') + '</ul>';
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
      '<div class="hsk-btns"><button class="btn" data-act="hsk-study" data-id="' + lv + '">카드 학습</button>' +
      '<button class="btn gray" data-act="hsk-quiz" data-id="' + lv + '">퀴즈</button></div>' +
      '<div class="seg-row"><button class="seg-b' + (!h.unknownOnly ? ' on' : '') + '" data-act="hsk-filter" data-v="all">전체</button>' +
      '<button class="seg-b' + (h.unknownOnly ? ' on' : '') + '" data-act="hsk-filter" data-v="unknown">모르는 단어만</button></div>' +
      '<div class="words">' + (rows || emptyState('search', { title: '모르는 단어가 없어요', desc: '전부 익혔어요. 대단해요!', badge: { text: '0개', dot: '#0e9f63' }, cta: { act: 'hsk-filter', v: 'all', label: '전체 보기' } })) + '</div>' +
      '<div style="height:24px"></div></div></div>';
  }
  function startHskStudy(lv) {
    var list = hskList(lv);
    if (!list.length) return;
    var idx = list.map(function (w, i) { return i; });
    var unk = idx.filter(function (i) { return !hskKnown(lv, i); });
    var pool = unk.length ? unk : idx;
    state.hc = { lv: lv, queue: shuffle(pool).slice(0, HSK_STUDY), i: 0, flip: false, known: 0, before: todayAnswers() };
    go('hskstudy');
    speakCard();
  }
  function speakCard() {
    var c = state.hc;
    setTimeout(function () { if (state.screen === 'hskstudy' && state.hc === c) speak(hskList(c.lv)[c.queue[c.i]][0]); }, 300);
  }
  function viewHskStudy() {
    var c = state.hc, w = hskList(c.lv)[c.queue[c.i]], pct = Math.round(c.i / c.queue.length * 100);
    var top = '<div class="topbar"><button class="icon-btn" data-act="back" aria-label="그만하기">' + I.close + '</button>' +
      '<div class="progress"><i style="width:' + pct + '%"></i></div><span class="chip" style="min-width:48px;justify-content:center">' + c.i + '/' + c.queue.length + '</span></div>';
    var card = '<button class="fc" data-act="hsk-flip" aria-label="카드 뒤집기"><div class="fc-lv">HSK ' + c.lv + '급</div><div class="fc-zh">' + esc(w[0]) + '</div>' +
      (c.flip ? '<div class="fc-py">' + esc(w[1]) + '</div><div class="fc-kr">' + esc(kr(w[1])) + '</div><div class="fc-ko">' + esc(w[2]) + '</div>' : '<div class="fc-hint">눌러서 뜻 보기</div>') + '</button>' +
      '<div class="fc-spk"><button class="round-btn" data-act="say" data-text="' + esc(w[0]) + '" aria-label="듣기">' + I.spk + '</button></div>';
    var foot = c.flip
      ? '<div class="footer fc-foot"><button class="btn gray" data-act="hsk-mark" data-v="no">몰라요</button><button class="btn green" data-act="hsk-mark" data-v="yes">알아요</button></div>'
      : '<div class="footer"><button class="btn" data-act="hsk-flip">뜻 보기</button></div>';
    return '<div class="screen">' + top + '<div class="qz-wrap">' + card + '</div>' + foot + '</div>';
  }
  function hskMark(yes) {
    var c = state.hc;
    if (!c.flip) return;
    var i = c.queue[c.i];
    setHskKnown(c.lv, i, yes);
    if (yes) { c.known++; sfx('right', c.known); } else sfx('tap');
    bumpAnswer();
    c.i++; c.flip = false;
    if (c.i >= c.queue.length) { finishHskStudy(); return; }
    render(); speakCard();
  }
  function finishHskStudy() {
    var c = state.hc, goal = state.profile.goal, now = todayAnswers();
    var hit = c.before < goal && now >= goal;
    clearTimeout(hskTimer); store.saveProfile();
    stopSpeak(); sfx(hit ? 'goal' : 'done');
    go('done', { result: {
      kind: 'quiz', title: 'HSK ' + c.lv + '급 카드 학습 끝!',
      line: c.queue.length + '개 중 ' + c.known + '개를 알아요. 지금까지 ' + hskCount(c.lv) + '/' + hskList(c.lv).length + '개 익혔어요.',
      answers: now, goal: goal, goalHit: hit, milestone: 0,
      again: { act: 'hsk-study', id: String(c.lv), label: '다음 카드 학습' }
    } });
  }
  function startHskQuiz(lv) {
    var list = hskList(lv);
    var idx = list.map(function (w, i) { return i; });
    var unk = idx.filter(function (i) { return !hskKnown(lv, i); });
    var pool = unk.length >= QUIZ_SIZE ? unk : idx;
    var kos = list.map(function (w) { return w[2]; });
    var items = shuffle(pool).slice(0, QUIZ_SIZE).map(function (i) {
      var w = list[i];
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
  function startQuiz(kind) {
    var items;
    if (kind === 'listen') {
      var qs = learnedQs(), kos = qs.map(function (q) { return q.ko; });
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
    state.z = { kind: kind, items: items, i: 0, right: 0, combo: 0, picked: null, before: todayAnswers() };
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
    if (z.hsk && it.hi != null) setHskKnown(z.hsk, it.hi, ok);
    if (!ok && it.id && state.progress[it.id]) {
      var prev = state.progress[it.id];
      var row = { qid: it.id, lesson_id: it.lessonId, box: 1, due_at: dueISO(1), correct: prev.correct, wrong: prev.wrong + 1, updated_at: new Date().toISOString() };
      state.progress[it.id] = row; store.saveProgress([row]);
    }
    render();
    setTimeout(function () { if (state.z === z && state.screen === 'quiz') speak(it.zh); }, 250);
  }
  function quizNext() {
    var z = state.z;
    if (z.picked === null) return;
    z.i++; z.picked = null;
    if (z.i >= z.items.length) { finishQuiz(); return; }
    render(); speakQuiz();
  }
  function finishQuiz() {
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
      again: z.hsk ? { act: 'hsk-quiz', id: String(z.hsk), label: '한 번 더 풀기' } : { act: z.kind === 'listen' ? 'quiz-listen' : 'quiz-word', label: '한 번 더 풀기' }
    } });
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
      prompt = '<div class="qz-prompt"><div class="q-zh">' + esc(it.zh) + '</div><div class="q-py">' + esc(it.py) + '</div><div class="q-kr">' + esc(kr(it.py)) + '</div>' +
        '<button class="round-btn" data-act="say" data-text="' + esc(it.zh) + '" aria-label="듣기" style="margin-top:12px">' + I.spk + '</button>' +
        '<div class="qz-cap">알맞은 뜻을 골라요</div></div>';
    }
    var opts = '<div class="qz-opts">' + it.options.map(function (o, i) {
      var cls = 'opt';
      if (z.picked !== null) cls += o.ok ? ' ok' : (i === z.picked ? ' no' : ' dim');
      return '<button class="' + cls + '" data-act="quiz-pick" data-id="' + i + '"' + (z.picked !== null ? ' disabled' : '') + '>' + esc(o.ko) + '</button>';
    }).join('') + '</div>';
    var reveal = '';
    if (z.picked !== null && z.kind === 'listen') {
      reveal = '<div class="qz-reveal"><div class="zh">' + esc(it.zh) + '</div><div class="py">' + esc(it.py) + '</div><div class="kr">' + esc(kr(it.py)) + '</div></div>';
    }
    var foot = z.picked !== null
      ? '<div class="footer"><button class="btn ' + (it.options[z.picked].ok ? 'green' : '') + '" data-act="quiz-next">' + (z.i + 1 >= z.items.length ? '결과 보기' : '다음') + '</button></div>' : '';
    return '<div class="screen">' + top + '<div class="qz-wrap">' + prompt + opts + reveal +
      (z.picked !== null && z.combo >= 2 ? '<div class="qz-combo">연속 ' + z.combo + '번 정답</div>' : '') + '</div>' + foot + '</div>';
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
      committed: s.committed, solvedCommitted: s.solvedCommitted, at: Date.now()
    };
    writeResume(m);
  }
  function clearResume(kind, lessonId) {
    if (!lessonId) return;
    var m = readResume(), k = resumeKey(kind, lessonId);
    if (m[k]) { delete m[k]; writeResume(m); }
  }
  function startLessonSession(kind, lessonId) {
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
      typing: false, live: '', msg: '', showKo: false
    };
    if (extra) Object.keys(extra).forEach(function (k) { state.s[k] = extra[k]; });
    go('practice');
    sayCurrentQuestion();
  }
  function quitPractice() {
    var s = state.s;
    var pool0 = s.lessonId ? lessonById(s.lessonId).qs : [];
    var covered = pool0.length > 0 && pool0.every(function (x) { return s.first[x.id] !== undefined; });
    if (covered) {
      askConfirm({ title: '여기까지 하고 끝낼까요?', body: '레슨을 마친 걸로 기록하고, 지금까지의 결과는 저장돼요.', ok: '끝내고 저장', cancel: '계속하기', m: 'thumbs' }, function () { stopRec(); finishSession(); });
    } else if (s.solved > 0 || Object.keys(s.first).length) {
      askConfirm({ title: '연습을 그만할까요?', body: s.kind === 'dialog' ? '푼 ' + s.solved + '번까지는 학습 기록에 더해져요.' : '푼 ' + s.solved + '문제까지는 저장돼요. 다음에 이어서 할 수 있어요.', ok: '저장하고 나가기', cancel: '계속하기', m: 'ask' }, function () { savePartial(); stopRec(); stopSpeak(); go('tab'); });
    } else {
      stopRec(); stopSpeak(); go('tab');
    }
  }

  function startDialog(id) {
    var d = (window.DIALOGS || []).filter(function (x) { return x.id === id; })[0];
    if (!d) return;
    var qs = d.turns.map(function (t, i) {
      return { id: 'dlg-' + d.id + '-' + (i + 1), lessonId: null, zh: t.zh, py: t.py, ko: t.ko, a: t.a, must: t.must };
    });
    beginSession('dialog', qs, null, { dlg: { id: d.id, title: d.title }, log: [] });
  }
  function finishDialog() {
    var s = state.s, day = dayStr(new Date());
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
      if (state.screen === 'practice' && state.s === s && s.phase === 'ask' && !s.listening && s.cur) speak(s.cur.zh);
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

  function startListening() {
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
      s.live = lastInterim;
      var el = document.getElementById('live');
      if (el) { el.textContent = lastInterim; el.classList.remove('hint'); el.classList.remove('wait'); }
      if (res.isFinal) {
        finals = [];
        for (var i = 0; i < res.length; i++) finals.push(res[i].transcript);
      }
    };
    r.onerror = function (e) { errCode = e.error || 'error'; };
    r.onend = function () {
      if (rec === r) rec = null;
      if (state.s !== s || state.screen !== 'practice' || s.phase !== 'ask') return;
      s.listening = false;
      var list = finals.length ? finals : (lastInterim ? [lastInterim] : []);
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
    var r = rec;
    clearTimeout(holdTimer);
    holdTimer = setTimeout(function () { if (r && rec === r) { try { r.stop(); } catch (e) { /* noop */ } } }, 450);
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
    s.cur = s.queue[0];
    saveResume(s);
    s.tries = 0; s.revealed = false; s.showKo = false; s.phase = 'ask'; s.heard = ''; s.pass = false; s.msg = ''; s.live = '';
    render();
    sayCurrentQuestion();
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
    d = { day: day, lessons: d.lessons + (s.kind === 'lesson' ? 1 : 0), answers: d.answers + Math.max(s.solved - s.solvedCommitted, 0) };
    state.daily[day] = d;
    store.saveProgress(rows);
    store.saveDaily(d);

    var result;
    if (s.kind === 'lesson') {
      var prevDone = state.done[s.lessonId];
      var drow = { lesson_id: s.lessonId, done_at: now, times: (prevDone ? prevDone.times : 0) + 1 };
      state.done[s.lessonId] = drow;
      store.saveDone(drow);
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
        line: left > 0 ? '아직 복습할 문제가 ' + left + '개 남았어요.' : '오늘 복습은 모두 끝났어요.',
        firstTry: firstTry, total: pool.length,
        again: left > 0 ? { act: 'review-start', label: '이어서 복습하기' } : null
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
  function startRandomReview() {
    var pool = Object.keys(state.progress).map(function (id) { return QMAP[id]; }).filter(Boolean);
    if (!pool.length) { toast('먼저 레슨을 하나 끝내 주세요'); return; }
    beginSession('review', shuffle(mixLessons(shuffle(pool), REVIEW_SIZE)));
  }

  /* ---------- 로그인/로그아웃 ---------- */
  async function signIn() {
    var res = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (res.error) toast('로그인을 시작하지 못했어요: ' + res.error.message);
  }
  async function handleSession(session) {
    var u = session && session.user;
    if (u) {
      if (state.user && state.user.id === u.id) return;
      state.user = u;
      await store.load();
      if (window.location.search || window.location.hash) {
        history.replaceState(null, '', window.location.pathname);
      }
      afterSplash(function () { go('tab', { tab: 'home' }); });
    } else {
      if (state.screen === 'login') return;
      state.user = null;
      afterSplash(function () { go('login'); });
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
      case 'start-local':
        state.user = { id: 'local', email: '' };
        store.load().then(function () { go('tab', { tab: 'home' }); });
        break;
      case 'tab':
        state.editNick = false; state.tab = id; render(); window.scrollTo(0, 0);
        refreshQuiet();
        break;
      case 'logout':
        stopSpeak();
        sb.auth.signOut().then(function () { state.user = null; state.progress = {}; state.done = {}; state.daily = {}; state.profile = normProfile({}); applyTheme(); go('login'); });
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
      case 'say': speak(el.getAttribute('data-text'), 0.8); break;
      case 'practice-lesson': startLessonSession('lesson', id); break;
      case 'review-start': startReview(); break;
      case 'review-random': startRandomReview(); break;
      case 'review-weak': startWeak(); break;
      case 'dialog-start': startDialog(id); break;
      case 'open-stats': go('stats'); break;
      case 'open-feedback': go('feedback', { fb: { cat: 'idea', text: '', sending: false, sent: false } }); break;
      case 'fb-cat': if (state.fb) { state.fb.cat = el.getAttribute('data-v'); render(); } break;
      case 'fb-send': sendFeedback(); break;
      case 'fb-done': go('tab'); break;
      case 'focus-tag': startFocus(id); break;
      case 'review-lesson': startLessonSession('review', id); break;

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
      case 'remind-toggle': if (pushOn) disableReminder(); else enableReminder(); break;
      case 'hsk-open': state.hsk = { lv: parseInt(id, 10), unknownOnly: false }; go('hsk'); break;
      case 'hsk-study': startHskStudy(parseInt(id, 10)); break;
      case 'hsk-quiz': startHskQuiz(parseInt(id, 10)); break;
      case 'hsk-flip': if (state.hc && !state.hc.flip) { state.hc.flip = true; sfx('tap'); render(); } break;
      case 'hsk-mark': hskMark(el.getAttribute('data-v') === 'yes'); break;
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
      case 'quiz-listen': startQuiz('listen'); break;
      case 'quiz-word': startQuiz('word'); break;
      case 'quiz-pick': quizPick(parseInt(id, 10)); break;
      case 'quiz-next': quizNext(); break;
      case 'quiz-quit': stopSpeak(); go(state.z && state.z.hsk ? 'hsk' : 'tab'); break;
      case 'fav': toggleFav(el.getAttribute('data-text')); break;
      case 'set-sound': setProfile({ sound: el.getAttribute('data-v') === 'on' }); sfx('pop'); break;
      case 'set-goal': setProfile({ goal: parseInt(el.getAttribute('data-v'), 10) }); break;
      case 'set-theme': setProfile({ theme: el.getAttribute('data-v') }); break;
      case 'nick-edit': state.editNick = true; render(); break;
      case 'nick-cancel': state.editNick = false; render(); break;
      case 'nick-save': saveNick(); break;
      case 'ko': s.showKo = !s.showKo; render(); break;
      case 'hear-q': speak(s.cur.zh); break;
      case 'hear-a': speak(s.cur.a.zh); break;
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
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        swReg = reg;
        if (!reg.pushManager) return;
        return reg.pushManager.getSubscription().then(function (sub) {
          pushOn = !!sub && state.profile.remindOn;
          if (state.screen === 'tab' && state.tab === 'me') render();
        });
      }).catch(function () { /* 미리보기 등에서는 조용히 건너뜀 */ });
    } catch (e) { /* 무시 */ }
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
  function pushRow(sub) {
    var j = sub.toJSON();
    return {
      user_id: state.user.id, endpoint: sub.endpoint,
      p256dh: j.keys.p256dh, auth: j.keys.auth,
      remind_time: state.profile.remind,
      tz: (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'Asia/Seoul'
    };
  }
  async function enableReminder() {
    try {
      if (!swReg) swReg = await navigator.serviceWorker.ready;
      var perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('알림 권한이 꺼져 있어요. 브라우저 설정에서 허용해 주세요'); return; }
      var sub = await swReg.pushManager.getSubscription();
      if (!sub) sub = await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(cfg.VAPID_PUBLIC_KEY) });
      var res = await sb.from('push_subscriptions').upsert(pushRow(sub), { onConflict: 'user_id,endpoint' });
      if (res.error) throw res.error;
      pushOn = true;
      setProfile({ remindOn: true });
      toast('매일 ' + state.profile.remind + '에 알려 드릴게요');
    } catch (err) {
      if (window.console) console.error(err);
      toast('알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요');
    }
  }
  async function disableReminder() {
    try {
      if (swReg) {
        var sub = await swReg.pushManager.getSubscription();
        if (sub) {
          await sb.from('push_subscriptions').delete().eq('user_id', state.user.id).eq('endpoint', sub.endpoint);
          await sub.unsubscribe();
        }
      }
    } catch (err) { if (window.console) console.error(err); }
    pushOn = false;
    setProfile({ remindOn: false });
    toast('알림을 껐어요');
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
        '<button class="pill-sm" data-act="remind-toggle">' + (pushOn ? '끄기' : '켜기') + '</button></div>';
      if (pushOn) {
        h += '<div class="set-row"><div class="set-t">알림 시간</div><input class="time-in" type="time" value="' + esc(p.remind) + '" aria-label="알림 시간"></div>';
      }
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
      if (!sb || !state.user || state.user.id === 'local') return;
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
  boot();
})();
