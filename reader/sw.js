const VER = 'reader-v1'; // 같은 도메인의 다른 앱(pangpang) 캐시는 건드리지 않도록 reader- 접두사만 정리
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('reader-') && k !== VER).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // 공유하기로 넘어온 파일/텍스트 받기
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const fd = await req.formData();
        const cache = await caches.open('shared');
        await cache.delete('item');
        const f = fd.get('file');
        if (f && typeof f !== 'string' && f.size) {
          await cache.put('item', new Response(f, { headers: { 'x-name': encodeURIComponent(f.name || ''), 'x-kind': 'file' } }));
        } else {
          const text = [fd.get('text')].filter(Boolean).join('\n');
          const title = fd.get('title') || '';
          if (text) await cache.put('item', new Response(text, { headers: { 'x-name': encodeURIComponent(title), 'x-kind': 'text' } }));
        }
      } catch (err) {}
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }

  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VER).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
