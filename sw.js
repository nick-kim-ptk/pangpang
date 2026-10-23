/* 팽팽이 서비스 워커: 앱 파일을 저장해 두고(오프라인 열기), 복습 알림을 보여 줘요. */
var CACHE = 'pangpang-v209';   // 배포마다 APP_VERSION과 함께 올려요(이 파일이 바뀌어야 "새 버전이 있어요"가 떠요)
var SHELL = ['./', 'index.html', 'styles.css', 'config.js', 'lessons.js', 'scenes.js', 'grammar.js', 'phrases.js', 'grade.js', 'hangul.js', 'variants.js', 'hsk.js', 'app.js',
  'manifest.webmanifest', 'img/ic-heart.webp', 'img/ai-promo.webp', 'img/ic-heart-empty.webp', 'img/ic-grad-cap.webp', 'img/ic-chain.webp', 'img/ic-flame.webp', 'img/ic-medal.webp', 'img/ic-trophy.webp', 'img/ic-stage-flag.webp', 'img/ch-trophy.webp', 'img/ch-love.webp', 'img/ch-clear.webp', 'img/ch-grad.webp', 'img/ch-sad.webp', 'img/ch-cheer.webp', 'img/ch-focus.webp', 'img/ch-fire.webp', 'img/icon-192.png', 'img/icon-512.png', 'img/icon-maskable-512.png', 'img/snail-cheer.webp', 'img/pp-cheer.webp', 'img/pp-calm.webp', 'img/pp-wink.webp', 'img/snail-reading.webp', 'img/snail-phone-body.webp', 'img/snail-phone-blink.webp', 'img/snail-phone-marks.webp', 'img/pm/hello-body.webp', 'img/pm/hello-blink.webp', 'img/pm/hello-nihao.webp', 'img/pm/hello-annyeong.webp', 'img/pm/book-body.webp', 'img/pm/book-blink.webp', 'img/pm/ai-body.webp', 'img/pm/ai-blink.webp', 'img/pm/ai-marks.webp', 'img/pm/laptop-body.webp', 'img/pm/laptop-blink.webp', 'img/pm/laptop-desk.webp', 'img/qz-ok.webp', 'img/qz-no.webp', 'img/hm-sonagi.webp', 'img/hm-sungjo.webp', 'img/hm-kisa.webp', 'img/hm-quiz.webp', 'img/hm-game.webp', 'img/td-happy.webp', 'img/td-rest.webp', 'img/td-calm.webp', 'img/td-care.webp', 'img/td-restless.webp', 'img/td-beg.webp', 'img/td-cookie.webp'];

self.addEventListener('install', function (e) {
  // 브라우저에 저장된 옛 파일(GitHub Pages는 10분간 저장)을 거치지 않고 서버에서 새로 받아요
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return Promise.all(SHELL.map(function (u) {
      return fetch(u, { cache: 'reload' }).then(function (res) { if (res.ok) return c.put(u, res); }).catch(function () { /* 하나 실패해도 계속 */ });
    }));
  }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// 같은 출처 파일: 네트워크 먼저, 실패하면 저장본 (업데이트가 바로 반영돼요)
self.addEventListener('fetch', function (e) {
  var req = e.request;
  var url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // 이미지: 저장본을 바로 보여 주고(빠르게), 뒤에서 조용히 새로 받아 둬요
  if (/\/img\//.test(url.pathname)) {
    e.respondWith(caches.open(CACHE).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) { if (res.ok) c.put(req, res.clone()); return res; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
    return;
  }
  e.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () { return caches.match(req).then(function (r) { return r || caches.match('index.html'); }); })
  );
});

self.addEventListener('push', function (e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) { data = {}; }
  e.waitUntil(self.registration.showNotification(data.title || '팽팽이', {
    body: data.body || '오늘 중국어 한 문장만 말해 볼까요?',
    icon: 'img/icon-192.png',
    badge: 'img/icon-192.png',
    tag: data.tag || 'pangpang-daily'
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
    return self.clients.openWindow('./');
  }));
});
