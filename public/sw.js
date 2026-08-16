/*
 * 星月集 Service Worker
 * ------------------------------------------------------------------
 * 只为“可安装应用”和弱网下的静态外壳提供支持。API、用户媒体、原片和文件
 * 下载全部绕过缓存，防止账号内容或受限资源残留在浏览器公共缓存中。
 */
const CACHE_PREFIX = "xyj-static-shell-";
const STATIC_CACHE = `${CACHE_PREFIX}pwa-navigation-1`;
const APP_SHELL = [
  "/",
  "/theme.css",
  "/theme.js",
  "/pwa.js",
  "/manifest.webmanifest",
  "/assets/avatar-glass-192.png",
  "/assets/avatar-glass.png",
];
const CACHEABLE_PATHS = new Set(APP_SHELL.map((path) => new URL(path, self.location.origin).pathname));
const PRIVATE_PATH_PREFIXES = ["/api/", "/media/", "/files/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (PRIVATE_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;
  if (!CACHEABLE_PATHS.has(url.pathname)) return;

  /*
   * 网络优先保证网站更新后立即取得新 HTML/CSS/JS；断网时才回退到缓存。
   * 因为 /api、/media、/files 已在上方排除，这里不会缓存用户数据或私密资源。
   */
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        const cache = await caches.open(STATIC_CACHE);
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
      if (request.mode === "navigate") {
        return (await caches.match("/")) || new Response("星月集暂时无法连接网络。", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
      return Response.error();
    }
  })());
});
