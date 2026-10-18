/* 팽팽이 서비스 워커: 앱 파일을 저장해 두고(오프라인 열기), 복습 알림을 보여 줘요. */
var CACHE = 'pangpang-v1';
var SHELL = ['./', 'index.html', 'styles.css', 'config.js', 'lessons.js', 'phrases.js', 'grade.js', 'hangul.js', 'variants.js', 'dialogs.js', 'hsk.js', 'app.js',
  'manifest.webmanifest', 'img/icon-192.png', 'img/icon-512.png', 'img/icon-maskable-512.png', 'img/snail-cheer.webp', 'img/pp-cheer.webp', 'img/pp-calm.webp', 'img/pp-wink.webp', 'img/snail-reading.webp', 'img/snail-phone-body.webp', 'img/snail-phone-blink.webp', 'img/snail-phone-marks.webp'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
// 같은 출처 파일: 네트워크 먼저, 실패하면 저장본 (업데이트가 바로 반영돼요)
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
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
    tag: 'pangpang-daily'
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { if ('focus' in list[i]) return list[i].focus(); }
    return self.clients.openWindow('./');
  }));
});
