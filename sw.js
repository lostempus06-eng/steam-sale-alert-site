/* Steam Sale Alert - 서비스 워커
 * 앱 셸은 캐시 우선, games.json은 네트워크 우선으로 처리한다.
 * 오프라인에서는 마지막으로 캐시된 games.json으로 목록과 필터가 동작한다.
 */
var SHELL = "ssa-shell-v1";
var DATA = "ssa-data-v1";

var SHELL_FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(SHELL).then(function (c) {
      // 하나가 실패해도 설치가 죽지 않도록 개별 처리
      return Promise.all(SHELL_FILES.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== SHELL && k !== DATA) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // Steam CDN 등 외부 요청은 통과

  // 데이터: 네트워크 우선, 실패 시 캐시
  if (url.pathname.indexOf("/games.json") !== -1) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(DATA).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || new Response("{\"games\":[]}", { headers: { "Content-Type": "application/json" } });
        });
      })
    );
    return;
  }

  // 셸: 캐시 우선
  e.respondWith(
    caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === "basic") {
          var copy = res.clone();
          caches.open(SHELL).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
