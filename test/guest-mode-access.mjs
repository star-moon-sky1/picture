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
    db.prepare(`
      INSERT INTO portfolio_subsections
        (id, section_id, name, description, sort_order, visibility, download_policy, created_at, updated_at)
      VALUES (?, 'section-resources', ?, '', 0, 'public', 'member', ?, ?)
    `).bind("member-download-subsection", "仅用户下载", timestamp, timestamp),
    db.prepare(`
      INSERT INTO assets
        (id, filename, display_name, object_key, mime_type, size_bytes, kind, visibility, download_policy,
         relative_path, status, created_at, updated_at, section_id, subsection_id, access_mode, scope, note)
      VALUES (?, ?, ?, ?, 'application/octet-stream', 1, 'file', 'public', 'public', ?, 'ready', ?, ?,
              'section-resources', 'member-download-subsection', 'public', 'library', '')
    `).bind(
      "subsection-protected-file", "protected.bin", "小板块下载测试", "test/subsection-download.bin",
      "protected.bin", timestamp, timestamp,
    ),
    db.prepare(`
      INSERT INTO assets
        (id, filename, display_name, object_key, mime_type, size_bytes, kind, visibility, download_policy,
         relative_path, status, created_at, updated_at, section_id, subsection_id, access_mode, scope, note)
      VALUES (?, ?, ?, ?, 'application/pdf', 1, 'pdf', 'public', 'public', ?, 'ready', ?, ?,
              'section-resources', 'member-download-subsection', 'public', 'library', '')
    `).bind(
      "subsection-viewable-pdf", "viewable.pdf", "小板块查看测试", "test/subsection-viewable.pdf",
      "viewable.pdf", timestamp, timestamp,
    ),
  ]);
  const bucket = await miniflare.getR2Bucket("BUCKET");
  await bucket.put("test/subsection-download.bin", new Uint8Array([42]));
  await bucket.put("test/subsection-viewable.pdf", new Uint8Array([37]));

  const adminResponse = await request("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "regression-admin-password" }),
  });
  assert.equal(adminResponse.status, 200);
  const adminCookie = cookieValue(adminResponse, "xyj_admin");

  const adminBootstrap = await request("/api/bootstrap", { headers: { Cookie: adminCookie } });
  assert.equal(adminBootstrap.status, 200);
  const adminBootstrapData = await adminBootstrap.json();
  assert.equal(adminBootstrapData.content.some((item) => item.id === "selected-article"), true);
  assert.equal(adminBootstrapData.assets.find((item) => item.id === "subsection-protected-file")?.canDownload, true);

  const registration = await request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "access_user", nickname: "权限用户", password: "Access1234",
      displayName: "权限测试用户", contactType: "email", contact: "access@example.com",
    }),
  });
  assert.equal(registration.status, 201);
  const registeredUser = (await registration.json()).user;
  const approveUser = await request(`/api/admin/users/${registeredUser.id}`, {
    method: "PUT",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "approved", reviewNote: "回归测试账号" }),
  });
  assert.equal(approveUser.status, 200);
  const privateNote = await request(`/api/admin/users/${registeredUser.id}`, {
    method: "PUT",
    headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ adminNote: "仅站长可见的识别备注" }),
  });
  assert.equal(privateNote.status, 200);
  assert.equal((await privateNote.json()).status, "approved");
  const adminUsers = await request("/api/admin/users", { headers: { Cookie: adminCookie } });
  assert.equal(adminUsers.status, 200);
  assert.equal((await adminUsers.json()).find((item) => item.id === registeredUser.id)?.admin_note, "仅站长可见的识别备注");

  const userLogin = await request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "access_user", password: "Access1234" }),
  });
  assert.equal(userLogin.status, 200);
  const userCookie = cookieValue(userLogin, "xyj_user");
  const userLoginData = await userLogin.json();
  assert.equal(Object.prototype.hasOwnProperty.call(userLoginData.user, "admin_note"), false);

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
  const guestBootstrapData = await guestBootstrap.json();
  assert.equal(guestBootstrapData.content.some((item) => item.id === "selected-article"), false);
  assert.equal(guestBootstrapData.assets.find((item) => item.id === "subsection-protected-file")?.canDownload, false);
  assert.equal(guestBootstrapData.assets.find((item) => item.id === "subsection-viewable-pdf")?.canDownload, false);

  const blockedGuestDownload = await request("/files/subsection-protected-file", { headers: { Cookie: guestCookie } });
  assert.equal(blockedGuestDownload.status, 401);
  const guestPdfPreview = await request("/files/subsection-viewable-pdf", { headers: { Cookie: guestCookie } });
  assert.equal(guestPdfPreview.status, 200);
  const blockedPdfDownload = await request("/files/subsection-viewable-pdf?download=1", { headers: { Cookie: guestCookie } });
  assert.equal(blockedPdfDownload.status, 401);
  const approvedDownload = await request("/files/subsection-protected-file?download=1", { headers: { Cookie: userCookie } });
  assert.equal(approvedDownload.status, 200);
  assert.deepEqual(new Uint8Array(await approvedDownload.arrayBuffer()), new Uint8Array([42]));

  const mixedBootstrap = await request("/api/bootstrap", { headers: { Cookie: mixedCookies } });
  assert.equal(mixedBootstrap.status, 200);
  assert.equal((await mixedBootstrap.json()).content.some((item) => item.id === "selected-article"), false);

  const directRead = await request("/api/content/selected-article", { headers: { Cookie: mixedCookies } });
  assert.equal(directRead.status, 404);
  console.log("guest access regression passed");
} finally {
  await miniflare.dispose();
}
