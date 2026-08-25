import assert from "node:assert/strict";
import { Miniflare } from "miniflare";

const baseUrl = "http://localhost";
const userAgent = "xingyueji-access-regression";
const miniflare = new Miniflare({
  modules: true,
  scriptPath: "src/worker.js",
  compatibilityDate: "2026-08-06",
  d1Databases: ["DB"],
  r2Buckets: ["BUCKET"],
  bindings: {
    ADMIN_PASSWORD: "regression-admin-password",
    SESSION_SECRET: "regression-session-secret-at-least-32-bytes",
  },
});

function cookieValue(response, name) {
  const values = response.headers.getSetCookie?.() || [response.headers.get("set-cookie") || ""];
  for (const value of values) {
    const match = value.match(new RegExp(`(?:^|,\\s*)${name}=([^;,]*)`));
    if (match?.[1]) return `${name}=${match[1]}`;
  }
  throw new Error(`Missing ${name} cookie: ${JSON.stringify([...response.headers.entries()])}`);
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("User-Agent", userAgent);
  return miniflare.dispatchFetch(`${baseUrl}${path}`, { ...init, headers });
}

try {
  const configResponse = await request("/api/guest/config");
  assert.equal(configResponse.status, 200);

  const db = await miniflare.getD1Database("DB");
  const timestamp = new Date().toISOString();
  await db.batch([
    db.prepare(`
      INSERT INTO portfolio_sections
        (id, name, kind, description, sort_order, show_all, created_at, updated_at, visibility)
      VALUES (?, ?, 'content', '', 0, 1, ?, ?, 'public')
    `).bind("access-section", "权限测试", timestamp, timestamp),
    db.prepare(`
      INSERT INTO content
        (id, type, section_id, title, slug, excerpt, body_html, status, visibility,
         published_at, like_count, dislike_count, created_at, updated_at)
      VALUES (?, 'article', ?, ?, ?, '', '<p>selected</p>', 'published', 'selected',
              ?, 0, 0, ?, ?)
    `).bind("selected-article", "access-section", "指定用户文章", "selected-article", timestamp, timestamp, timestamp),
  ]);

  const adminResponse = await request("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "regression-admin-password" }),
  });
  assert.equal(adminResponse.status, 200);
  const adminCookie = cookieValue(adminResponse, "xyj_admin");

  const adminBootstrap = await request("/api/bootstrap", { headers: { Cookie: adminCookie } });
  assert.equal(adminBootstrap.status, 200);
  assert.equal((await adminBootstrap.json()).content.some((item) => item.id === "selected-article"), true);

  const guestResponse = await request("/api/guest/enter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visitorId: "guest-access-regression" }),
  });
  assert.equal(guestResponse.status, 200);
  const guestCookie = cookieValue(guestResponse, "xyj_guest");
  const mixedCookies = `${adminCookie}; ${guestCookie}`;

  const guestBootstrap = await request("/api/bootstrap", { headers: { Cookie: guestCookie } });
  assert.equal(guestBootstrap.status, 200);
  assert.equal((await guestBootstrap.json()).content.some((item) => item.id === "selected-article"), false);

  const mixedBootstrap = await request("/api/bootstrap", { headers: { Cookie: mixedCookies } });
  assert.equal(mixedBootstrap.status, 200);
  assert.equal((await mixedBootstrap.json()).content.some((item) => item.id === "selected-article"), false);

  const directRead = await request("/api/content/selected-article", { headers: { Cookie: mixedCookies } });
  assert.equal(directRead.status, 404);
  console.log("guest access regression passed");
} finally {
  await miniflare.dispose();
}
