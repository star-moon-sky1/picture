import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const mf = new Miniflare({ modules: true, cf: false, scriptPath: "src/worker.js", compatibilityDate: "2026-08-06", d1Databases: ["DB"], r2Buckets: ["BUCKET"],
  bindings: { ADMIN_PASSWORD: "content-test-admin", SESSION_SECRET: "content-test-secret-at-least-32-bytes" } });
// Match production HTTPS; the sanitizer deliberately rejects insecure absolute image URLs.
const base = "https://localhost";
let admin;
async function request(path, { cookie = admin, method = "GET", body, tokens = "", headers = {} } = {}) {
  const init = { method, headers: { "User-Agent": "content-organize-test", ...(cookie ? { Cookie: cookie } : {}), ...headers } };
  if (tokens) init.headers["X-Content-Grants"] = tokens;
  if (body !== undefined) { init.body = JSON.stringify(body); init.headers["Content-Type"] = "application/json"; }
  return mf.dispatchFetch(base + path, init);
}
function cookie(response, name) {
  const value = response.headers.getSetCookie().find(value => value.startsWith(name + "="));
  assert.ok(value); return value.split(";")[0];
}
async function ok(path, options) {
  const response = await request(path, options); const data = await response.json();
  assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(data)}`); return data;
}
async function status(expected, path, options) { const response = await request(path, options); assert.equal(response.status, expected, `${path}: ${await response.text()}`); }
async function user(name) {
  const registration = await ok("/api/auth/register", { cookie: "", method: "POST", body: { username: name, nickname: name, password: "Pass123456", displayName: name, contactType: "email", contact: `${name}@example.test` } });
  await ok(`/api/admin/users/${registration.user.id}`, { method: "PUT", body: { status: "approved" } });
  const login = await request("/api/auth/login", { cookie: "", method: "POST", body: { username: name, password: "Pass123456" } });
  assert.equal(login.status, 200); return { id: registration.user.id, cookie: cookie(login, "xyj_user") };
}
async function upload(name, data, options = {}) {
  const form = new FormData();
  form.append("file", new File([data], name, { type: options.type || "image/png" }));
  form.append("kind", options.kind || "photo"); form.append("sectionId", options.sectionId || "section-photos");
  form.append("subsectionId", options.subsectionId || ""); form.append("caption", name); form.append("visibility", options.visibility || "public");
  form.append("allowedUserIds", JSON.stringify(options.users || []));
  if (options.contentId) form.append("contentId", options.contentId);
  if (options.preview !== false) form.append("preview", new File(["PREVIEW-" + name], "preview.webp", { type: "image/webp" }));
  if (options.token) form.append("uploadToken", options.token);
  if (options.allowDuplicate) form.append("allowDuplicate", "1");
  const req = new Request(base + "/api/admin/media", { method: "POST", headers: { Cookie: admin, "User-Agent": "content-organize-test" }, body: form });
  return mf.dispatchFetch(req.url, { method: req.method, headers: req.headers, body: await req.arrayBuffer() });
}

try {
  await ok("/api/guest/config", { cookie: "" });
  const login = await request("/api/admin/login", { cookie: "", method: "POST", body: { password: "content-test-admin" } });
  admin = cookie(login, "xyj_admin");
  const db = await mf.getD1Database("DB"); const bucket = await mf.getR2Bucket("BUCKET");
  const alice = await user("organize_alice"); const bob = await user("organize_bob");
  const guest = cookie(await request("/api/guest/enter", { cookie: "", method: "POST", body: { visitorId: "organize-guest" } }), "xyj_guest");

  const gallery = await ok("/api/admin/sections", { method: "POST", body: { kind: "gallery", name: "Gallery", visibility: "public", showAll: false } });
  const parent = await ok("/api/admin/subsections", { method: "POST", body: { sectionId: gallery.id, name: "Parent", visibility: "selected", allowedUserIds: [alice.id] } });
  const child = await ok("/api/admin/subsections", { method: "POST", body: { sectionId: gallery.id, parentId: parent.id, name: "Child", visibility: "public" } });
  await status(400, "/api/admin/subsections", { method: "POST", body: { sectionId: gallery.id, parentId: child.id, name: "Too deep", visibility: "public" } });
  await status(400, "/api/admin/subsections", { method: "POST", body: { sectionId: "section-photos", parentId: parent.id, name: "Wrong tree", visibility: "public" } });
  await status(409, `/api/admin/subsections/${parent.id}`, { method: "DELETE" });
  assert.equal((await ok("/api/admin/sections")).find(item => item.id === gallery.id).show_all, 0);

  const firstResponse = await upload("one.png", "ORIGINAL-ONE", { token: "11111111-1111-4111-8111-111111111111" });
  assert.equal(firstResponse.status, 200); const first = await firstResponse.json();
  const secondResponse = await upload("two.png", "ORIGINAL-TWO"); const second = await secondResponse.json();
  await ok(`/api/admin/media/${first.id}`, { method: "PUT", body: { note: "记得这一天", visibility: "selected", allowedUserIds: [alice.id] } });
  const before = await db.prepare("SELECT * FROM media WHERE id=?").bind(first.id).first();
  await ok("/api/admin/media/batch-move", { method: "POST", body: { ids: [first.id, second.id], sectionId: gallery.id, subsectionId: child.id } });
  const after = await db.prepare("SELECT * FROM media WHERE id=?").bind(first.id).first();
  assert.equal(after.section_id, gallery.id); assert.equal(after.subsection_id, child.id);
  for (const key of ["object_key", "preview_object_key", "sha256", "note", "visibility", "filename", "caption"]) assert.equal(after[key], before[key], key);
  assert.equal(await (await bucket.get(after.object_key)).text(), "ORIGINAL-ONE");
  await status(409, "/api/admin/media/batch-move", { method: "POST", body: { ids: [first.id, "missing"], sectionId: gallery.id, subsectionId: null } });
  assert.equal((await db.prepare("SELECT subsection_id FROM media WHERE id=?").bind(first.id).first()).subsection_id, child.id);
  await status(401, "/api/admin/media/batch-move", { cookie: alice.cookie, method: "POST", body: { ids: [first.id], sectionId: gallery.id, subsectionId: null } });
  const bobList = await ok("/api/bootstrap", { cookie: bob.cookie });
  assert.ok(!bobList.subsections.some(item => item.id === child.id)); assert.ok(!bobList.media.some(item => item.id === second.id));
  await status(404, `/media/${second.id}?preview=1`, { cookie: bob.cookie });
  const aliceList = await ok("/api/bootstrap", { cookie: alice.cookie });
  assert.equal(aliceList.media.find(item => item.id === first.id).note, "记得这一天");
  assert.equal(aliceList.media.find(item => item.id === first.id).object_key, undefined);

  const securityPath = `/api/admin/security/media/${first.id}`;
  await ok(securityPath, { method: "PUT", body: { lock: { enabled: true, code: "001234" }, download: { mode: "none" } } });
  await status(400, securityPath, { method: "PUT", body: { lock: { enabled: true, code: "123" }, download: { mode: "public" } } });
  assert.equal((await db.prepare("SELECT mode FROM download_rules WHERE target_id=?").bind(first.id).first()).mode, "none", "invalid lock must not partially change download settings");
  const unauthorized = { method: "POST", body: { kind: "media", id: first.id, code: "001234" } };
  await status(404, "/api/content-unlock", { ...unauthorized, cookie: bob.cookie });
  await status(404, `/api/content-access/media/${first.id}`, { cookie: bob.cookie });
  assert.equal((await db.prepare("SELECT consumed_at FROM content_locks WHERE target_id=?").bind(first.id).first()).consumed_at, null);
  await status(403, "/api/content-unlock", { ...unauthorized, cookie: alice.cookie, body: { ...unauthorized.body, code: "999999" } });
  await status(423, `/media/${first.id}?preview=1`, { cookie: alice.cookie });
  await status(423, `/media/${first.id}?background=1`, { cookie: alice.cookie });
  const locked = (await ok("/api/bootstrap", { cookie: alice.cookie })).media.find(item => item.id === first.id);
  assert.equal(locked.locked, true); assert.match(locked.previewUrl, /mosaic=1/); assert.equal(locked.downloadUrl, undefined);
  const mosaic = await request(locked.previewUrl, { cookie: alice.cookie }); assert.equal(mosaic.status, 200); assert.ok(!(await mosaic.text()).includes("ORIGINAL"));
  await status(401, `/api/admin/media/${first.id}/source`, { cookie: alice.cookie });
  const adminSource = await request(`/api/admin/media/${first.id}/source`, { cookie: `${admin}; ${guest}` });
  assert.equal(adminSource.status, 200); assert.equal(await adminSource.text(), "ORIGINAL-ONE");
  const mosaicForm = new FormData(); mosaicForm.append("mosaic", new File(["SAFE-MOSAIC"], "mosaic.webp", { type: "image/webp" }));
  const mosaicRequest = new Request(base + `/api/admin/media/${first.id}/mosaic`, { method: "POST", headers: { Cookie: admin, "User-Agent": "content-organize-test" }, body: mosaicForm });
  const mosaicSaved = await mf.dispatchFetch(mosaicRequest.url, { method: "POST", headers: mosaicRequest.headers, body: await mosaicRequest.arrayBuffer() });
  assert.equal(mosaicSaved.status, 200);
  assert.equal(await (await request(locked.previewUrl, { cookie: alice.cookie })).text(), "SAFE-MOSAIC");
  const concurrent = await Promise.all([1, 2, 3].map(() => request("/api/content-unlock", { ...unauthorized, cookie: alice.cookie })));
  assert.equal(concurrent.filter(response => response.status === 200).length, 1, "code is consumed atomically");
  const grant = await concurrent.find(response => response.status === 200).json();
  assert.match(grant.token, /^[a-f0-9]{64}$/);
  await status(200, `/media/${first.id}?preview=1`, { cookie: alice.cookie, tokens: grant.token });
  await status(403, `/media/${first.id}?download=1`, { cookie: alice.cookie, tokens: grant.token });
  await status(404, `/media/${first.id}?preview=1&grants=${grant.token}`, { cookie: `${alice.cookie}; ${guest}` });
  const safeSettings = await ok("/api/admin/security");
  assert.ok(!JSON.stringify(safeSettings).includes("001234")); assert.ok(!JSON.stringify(safeSettings).includes("password_hash"));
  await ok("/api/content-release", { cookie: alice.cookie, method: "POST", tokens: grant.token, body: {} });
  await status(423, `/media/${first.id}?preview=1`, { cookie: alice.cookie, tokens: grant.token });
  await db.prepare("DELETE FROM rate_limits WHERE key LIKE 'unlock:%'").run();
  await status(409, "/api/content-unlock", { ...unauthorized, cookie: alice.cookie });

  // Ancestor lock must be redeemed before a child; bypassing it must not burn a child code.
  await ok(`/api/admin/security/subsection/${parent.id}`, { method: "PUT", body: { lock: { enabled: true, code: "222222" } } });
  await ok(securityPath, { method: "PUT", body: { lock: { enabled: true, code: "333333" } } });
  await status(423, "/api/content-unlock", { cookie: alice.cookie, method: "POST", body: { kind: "media", id: first.id, code: "333333" } });
  const parentGrant = await ok("/api/content-unlock", { cookie: alice.cookie, method: "POST", body: { kind: "subsection", id: parent.id, code: "222222" } });
  const childGrant = await ok("/api/content-unlock", { cookie: alice.cookie, method: "POST", tokens: parentGrant.token, body: { kind: "media", id: first.id, code: "333333" } });
  await status(200, `/media/${first.id}?preview=1`, { cookie: alice.cookie, tokens: `${parentGrant.token},${childGrant.token}` });
  await db.prepare("UPDATE content_grants SET expires_at=0 WHERE target_kind='subsection'").run();
  await status(423, `/media/${first.id}?preview=1`, { cookie: alice.cookie, tokens: `${parentGrant.token},${childGrant.token}` });

  // PDF permissions are independent from inline media download permissions.
  const inlineResponse = await upload("inline.png", "INLINE-ORIGINAL", { kind: "inline" }); const inline = await inlineResponse.json();
  const articlePayload = { sectionId: "section-essays", title: "Only Alice", visibility: "selected", allowedUserIds: [alice.id], status: "published", bodyHtml: `<p>PRIVATE-BODY</p><img src="/media/${inline.id}?preview=1" alt="embedded">` };
  await status(404, `/media/${inline.id}?preview=1`, { cookie: alice.cookie });
  const article = await ok("/api/admin/content", { method: "POST", body: articlePayload });
  await ok(`/api/admin/security/content/${article.id}`, { method: "PUT", body: { download: { mode: "none" } } });
  await status(404, `/media/${inline.id}?preview=1`, { cookie: bob.cookie });
  await status(200, `/media/${inline.id}?download=1`, { cookie: alice.cookie });
  await status(403, `/api/content/${article.id}?download=1`, { cookie: alice.cookie });
  await ok(`/api/admin/security/media/${inline.id}`, { method: "PUT", body: { lock: { enabled: true, code: "444444" }, download: { mode: "none" } } });
  const content = await ok(`/api/content/${article.id}`, { cookie: alice.cookie });
  assert.match(content.body_html, /mosaic=1/); assert.equal(content.inlineMedia[0].locked, true);
  await ok(`/api/admin/content/${article.id}`, { method: "PUT", body: { ...articlePayload, title: "Edited", bodyHtml: articlePayload.bodyHtml.replace('src="/media/', `src="${base}/media/`) } });
  const absoluteSourceBody = await ok(`/api/content/${article.id}`, { cookie: alice.cookie });
  assert.match(absoluteSourceBody.body_html, /mosaic=1/); assert.equal(absoluteSourceBody.inlineMedia[0].locked, true);
  assert.equal((await db.prepare("SELECT enabled FROM content_locks WHERE target_id=?").bind(inline.id).first()).enabled, 1);
  await ok(`/api/admin/security/content/${article.id}`, { method: "PUT", body: { lock: { enabled: true, code: "555555" } } });
  await status(423, `/api/content/${article.id}`, { cookie: alice.cookie });
  await status(423, `/api/comments?contentId=${article.id}`, { cookie: alice.cookie });
  const articleShell = (await ok("/api/bootstrap", { cookie: alice.cookie })).content.find(item => item.id === article.id);
  assert.equal(articleShell.locked, true); assert.ok(!JSON.stringify(articleShell).includes("PRIVATE-BODY"));
  const newInline = await (await upload("new-inline.png", "NEW-INLINE", { kind: "inline", contentId: article.id })).json();
  assert.equal(newInline.content_id, article.id);
  await status(423, `/media/${newInline.id}?preview=1`, { cookie: alice.cookie });
  await status(404, `/media/${newInline.id}?preview=1`, { cookie: bob.cookie });

  // Custom file sections, third-level inherited downloads, Range and HEAD gates.
  const resources = await ok("/api/admin/sections", { method: "POST", body: { kind: "resources", name: "Resources", visibility: "public", showAll: true } });
  const filesParent = await ok("/api/admin/subsections", { method: "POST", body: { sectionId: resources.id, name: "Files parent", visibility: "public" } });
  const filesChild = await ok("/api/admin/subsections", { method: "POST", body: { sectionId: resources.id, parentId: filesParent.id, name: "Files child", visibility: "public" } });
  const newFolder = await ok("/api/admin/asset-folders", { method: "POST", body: { sectionId: resources.id, name: "Folder", visibility: "public" } });
  const fileUpload = await ok("/api/admin/asset-uploads", { method: "POST", body: { filename: "video.mp4", sizeBytes: 5, kind: "video", mimeType: "video/mp4", sectionId: resources.id, subsectionId: filesChild.id, folderId: newFolder.id, scope: "library", visibility: "public", downloadPolicy: "public" } });
  const asset = await db.prepare("SELECT * FROM assets WHERE id=?").bind(fileUpload.assetId).first();
  await bucket.put(asset.object_key, "VIDEO"); await db.prepare("UPDATE assets SET status='ready' WHERE id=?").bind(asset.id).run();
  await ok(`/api/admin/security/subsection/${filesParent.id}`, { method: "PUT", body: { download: { mode: "selected", userIds: [alice.id] } } });
  await status(200, `/files/${asset.id}`, { cookie: bob.cookie });
  await status(403, `/files/${asset.id}?download=1`, { cookie: bob.cookie });
  await status(200, `/files/${asset.id}?download=1`, { cookie: alice.cookie });
  const accessCheck = await ok(`/api/content-access/asset/${asset.id}`, { cookie: alice.cookie });
  assert.deepEqual(Object.keys(accessCheck).sort(), ["canDownload", "id", "locked", "locks"], "access refresh must not erase quality variants or source URLs");
  const otherFolder = await ok("/api/admin/asset-folders", { method: "POST", body: { sectionId: "section-resources", name: "Other root", visibility: "public" } });
  await status(400, `/api/admin/assets/${asset.id}`, { method: "PUT", body: { folderId: otherFolder.id } });
  await ok(`/api/admin/security/asset/${asset.id}`, { method: "PUT", body: { lock: { enabled: true, code: "666666" } } });
  await status(423, `/files/${asset.id}`, { cookie: alice.cookie, method: "HEAD" });
  await status(423, `/files/${asset.id}`, { cookie: alice.cookie, headers: { Range: "bytes=0-1" } });
  const lockedAsset = (await ok("/api/bootstrap", { cookie: alice.cookie })).assets.find(item => item.id === asset.id);
  assert.equal(lockedAsset.url, ""); assert.equal(lockedAsset.canDownload, false);

  // Upload identity, duplicate warning, HEIC previews and cancellation cleanup.
  const retry = await upload("one.png", "ORIGINAL-ONE", { token: "11111111-1111-4111-8111-111111111111" });
  assert.equal(retry.status, 200); assert.equal((await retry.json()).id, first.id);
  assert.equal((await upload("renamed.png", "ORIGINAL-ONE")).status, 409);
  const allowedDuplicate = await upload("renamed.png", "ORIGINAL-ONE", { allowDuplicate: true }); assert.equal(allowedDuplicate.status, 200);
  const heicBytes = new Uint8Array([0,0,0,24,...new TextEncoder().encode("ftypheic0000mif1")]);
  assert.equal((await upload("phone.heic", heicBytes, { type: "application/octet-stream", preview: false })).status, 400);
  const heicResponse = await upload("phone.heic", heicBytes, { type: "application/octet-stream", token: "22222222-2222-4222-8222-222222222222" });
  assert.equal(heicResponse.status, 200); const heic = await heicResponse.json(); assert.equal(heic.mime_type, "image/heic");
  const storedHeic = await db.prepare("SELECT * FROM media WHERE id=?").bind(heic.id).first();
  assert.deepEqual(new Uint8Array(await (await bucket.get(storedHeic.object_key)).arrayBuffer()), heicBytes);
  await ok("/api/admin/photo-uploads/22222222-2222-4222-8222-222222222222", { method: "DELETE" });
  assert.equal(await db.prepare("SELECT id FROM media WHERE id=?").bind(heic.id).first(), null); assert.equal(await bucket.get(storedHeic.object_key), null);
  await ok("/api/admin/photo-uploads/33333333-3333-4333-8333-333333333333", { method: "DELETE" });
  assert.equal((await upload("cancelled.png", "CANCEL", { token: "33333333-3333-4333-8333-333333333333" })).status, 409);
  console.log("content hierarchy, one-use locks, downloads, photo batch/duplicates/HEIC/cancel regression passed");
} finally { await mf.dispose(); }

const organize = await readFile("public/portfolio-organize.js", "utf8");
const sandbox = { URL, location: { href: "https://example.test/", origin: "https://example.test" }, state: { data: { subsections: [{ id: "child", parent_id: "parent" }] } } };
vm.createContext(sandbox); vm.runInContext(organize, sandbox);
assert.equal(vm.runInContext('subsectionMatches("child","parent")', sandbox), true);
assert.equal(vm.runInContext('subsectionMatches("parent","child")', sandbox), false);
vm.runInContext(`contentViewGrants.set("media:photo",{token:"${"a".repeat(64)}",expiresAt:Date.now()+10000,owner:"media:photo"})`, sandbox);
assert.match(vm.runInContext('protectedMediaUrl("/media/photo?preview=1")', sandbox), /grants=/);
assert.equal(vm.runInContext('protectedMediaUrl("https://external.test/media/photo")', sandbox), "https://external.test/media/photo");
vm.runInContext('contentViewGrants.get("media:photo").expiresAt=0', sandbox);
assert.equal(vm.runInContext('contentGrantTokens()', sandbox), "");
assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(Object.values(categoryLabels))', sandbox)), ["文章", "图片", "文件与视频"]);
console.log("portfolio category / hierarchy / grant URL unit regression passed");
