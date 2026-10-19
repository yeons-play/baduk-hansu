// 바둑한수 서비스워커 (https://yeons-play.github.io/baduk-hansu/)
// - 화면(index.html): 네트워크 우선, 3초 안에 응답이 없거나 오프라인이면 저장본
// - 빌드 파일(assets/, icons/): 저장본 우선, 처음 받을 때 저장
// - 새 버전은 바로 적용하되 열려 있는 화면을 강제로 새로고침하지 않음 → 대국 중 끊김 없음
// - 캐시 저장소는 같은 주소의 다른 앱과 공유되므로, 지울 때는 반드시 baduk- 접두어만
const CACHE_NAME = 'baduk-v2'; // 2026-10-19 어린이·아이패드 디자인
const MINE = (k) => k.startsWith('baduk-');
const SCOPE = new URL(self.registration.scope).pathname;
const PAGE = SCOPE + 'index.html';
const TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => Promise.allSettled([c.add(SCOPE), c.add(SCOPE + 'manifest.webmanifest')])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => MINE(k) && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        const net = fetch(req, { cache: 'no-cache' })
          .then((res) => {
            if (res && res.ok) cache.put(SCOPE, res.clone());
            return res;
          })
          .catch(() => null);
        const late = new Promise((r) => setTimeout(() => r(null), TIMEOUT_MS));
        const first = await Promise.race([net, late]);
        if (first) return first;
        const saved = (await cache.match(SCOPE)) || (await cache.match(PAGE));
        if (saved) {
          event.waitUntil(net);
          return saved;
        }
        return (await net) || new Response('오프라인 상태입니다. 인터넷에 연결한 뒤 다시 열어 주세요.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      })(),
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    }),
  );
});
