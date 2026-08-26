import assert from "node:assert/strict";
import { Miniflare } from "miniflare";

const baseUrl = "http://localhost";
const maxFileBytes = 100 * 1024 * 1024 * 1024;
const expectedPartBytes = 64 * 1024 * 1024;
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
  throw new Error(`Missing ${name} cookie`);
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("User-Agent", "xingyueji-upload-regression");
  return miniflare.dispatchFetch(`${baseUrl}${path}`, { ...init, headers });
}

async function jsonRequest(path, cookie, body, method = "POST") {
  return request(path, {
    method,
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

try {
  const database = await miniflare.getD1Database("DB");
  await database.prepare(`
    CREATE TABLE asset_uploads (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      variant_label TEXT NOT NULL DEFAULT '',
      upload_id TEXT NOT NULL,
      object_key TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      expected_size INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(asset_id, variant_label)
    )
  `).run();
  assert.equal((await request("/api/guest/config")).status, 200);
  const uploadColumns = await database.prepare("PRAGMA table_info(asset_uploads)").all();
  assert.equal(uploadColumns.results.some((column) => column.name === "part_size"), true);
  assert.equal(uploadColumns.results.some((column) => column.name === "file_name"), true);

  const anonymousCreate = await jsonRequest("/api/admin/asset-uploads", "", {
    filename: "blocked.zip",
    sizeBytes: 1,
  });
  assert.equal(anonymousCreate.status, 401);

  const login = await jsonRequest("/api/admin/login", "", { password: "regression-admin-password" });
  assert.equal(login.status, 200);
  const adminCookie = cookieValue(login, "xyj_admin");

  const oversized = await jsonRequest("/api/admin/asset-uploads", adminCookie, {
    filename: "too-large.zip",
    mimeType: "application/zip",
    sizeBytes: maxFileBytes + 1,
    scope: "library",
    visibility: "private",
  });
  assert.equal(oversized.status, 413);

  const maximum = await jsonRequest("/api/admin/asset-uploads", adminCookie, {
    filename: "maximum.zip",
    mimeType: "application/zip",
    sizeBytes: maxFileBytes,
    scope: "library",
    visibility: "private",
  });
  assert.equal(maximum.status, 200);
  const maximumSession = await maximum.json();
  assert.equal(maximumSession.expectedSize, maxFileBytes);
  assert.equal(maximumSession.maxFileBytes, maxFileBytes);
  assert.equal(maximumSession.partSize, expectedPartBytes);
  assert.equal(maximumSession.uploadedParts.length, 0);
  const lifetimeDays = (Date.parse(maximumSession.expiresAt) - Date.now()) / 86_400_000;
  assert.ok(lifetimeDays > 5.9 && lifetimeDays <= 6.01);

  const maximumState = await request(`/api/admin/asset-uploads/${maximumSession.sessionId}`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(maximumState.status, 200);
  assert.equal((await maximumState.json()).partSize, expectedPartBytes);
  const cancelMaximum = await request(`/api/admin/asset-uploads/${maximumSession.sessionId}`, {
    method: "DELETE",
    headers: { Cookie: adminCookie },
  });
  assert.equal(cancelMaximum.status, 200);
  const cancelledAsset = await database.prepare("SELECT id FROM assets WHERE id = ?")
    .bind(maximumSession.assetId).first();
  assert.equal(cancelledAsset, null);

  const tiny = await jsonRequest("/api/admin/asset-uploads", adminCookie, {
    filename: "tiny.zip",
    mimeType: "application/zip",
    sizeBytes: 1,
    scope: "library",
    visibility: "private",
  });
  assert.equal(tiny.status, 200);
  const tinySession = await tiny.json();
  const pendingAssets = await request("/api/admin/assets", { headers: { Cookie: adminCookie } });
  const pendingAsset = (await pendingAssets.json()).find((asset) => asset.id === tinySession.assetId);
  assert.equal(pendingAsset.size_bytes, 1);
  assert.deepEqual(
    pendingAsset.uploads.map((upload) => [upload.file_name, Number(upload.expected_size), Number(upload.uploaded_size)]),
    [["tiny.zip", 1, 0]],
  );

  const forgedCompletion = await jsonRequest(`/api/admin/asset-uploads/${tinySession.sessionId}/complete`, adminCookie, {
    parts: [{ partNumber: 1, etag: "browser-supplied-etag" }],
  });
  assert.equal(forgedCompletion.status, 400);

  const wrongPart = await request(`/api/admin/asset-uploads/${tinySession.sessionId}/part/1`, {
    method: "PUT",
    headers: { Cookie: adminCookie, "Content-Type": "application/octet-stream", "Content-Length": "2" },
    body: new Uint8Array([1, 2]),
  });
  assert.equal(wrongPart.status, 400);
  const stateAfterWrongPart = await request(`/api/admin/asset-uploads/${tinySession.sessionId}`, {
    headers: { Cookie: adminCookie },
  });
  assert.deepEqual((await stateAfterWrongPart.json()).uploadedParts, []);

  const uploadedPart = await request(`/api/admin/asset-uploads/${tinySession.sessionId}/part/1`, {
    method: "PUT",
    headers: { Cookie: adminCookie, "Content-Type": "application/octet-stream", "Content-Length": "1" },
    body: new Uint8Array([42]),
  });
  assert.equal(uploadedPart.status, 200);
  const uploadedPartData = await uploadedPart.json();
  assert.equal(uploadedPartData.partNumber, 1);
  assert.equal(uploadedPartData.sizeBytes, 1);
  assert.ok(uploadedPartData.etag);
  const assetsWithProgress = await request("/api/admin/assets", { headers: { Cookie: adminCookie } });
  const uploadProgress = (await assetsWithProgress.json())
    .find((asset) => asset.id === tinySession.assetId).uploads[0];
  assert.equal(Number(uploadProgress.uploaded_size), 1);
  assert.equal(Number(uploadProgress.uploaded_part_count), 1);

  const resumableState = await request(`/api/admin/asset-uploads/${tinySession.sessionId}`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(resumableState.status, 200);
  const resumableData = await resumableState.json();
  assert.deepEqual(resumableData.uploadedParts.map((part) => [part.partNumber, part.sizeBytes]), [[1, 1]]);

  const completed = await jsonRequest(`/api/admin/asset-uploads/${tinySession.sessionId}/complete`, adminCookie, {});
  assert.equal(completed.status, 200);
  const completedData = await completed.json();
  assert.equal(completedData.assetId, tinySession.assetId);
  assert.equal(completedData.sizeBytes, 1);

  const assets = await request("/api/admin/assets", { headers: { Cookie: adminCookie } });
  assert.equal(assets.status, 200);
  const uploadedAsset = (await assets.json()).find((asset) => asset.id === tinySession.assetId);
  assert.equal(uploadedAsset.status, "ready");
  assert.equal(uploadedAsset.size_bytes, 1);

  const remainingParts = await database.prepare("SELECT COUNT(*) AS count FROM asset_upload_parts WHERE upload_session_id = ?")
    .bind(tinySession.sessionId).first();
  const remainingSession = await database.prepare("SELECT COUNT(*) AS count FROM asset_uploads WHERE id = ?")
    .bind(tinySession.sessionId).first();
  assert.equal(Number(remainingParts.count), 0);
  assert.equal(Number(remainingSession.count), 0);

  console.log("resumable upload regression passed");
} finally {
  await miniflare.dispose();
}
