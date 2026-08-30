import assert from "node:assert/strict";
import { Miniflare } from "miniflare";
import { readFile } from "node:fs/promises";
import { ENTRY_BACKGROUND_SETTING, normalizeEntryBackgroundConfig } from "../src/entry-background.mjs";

const mf = new Miniflare({ modules: true, cf: false, scriptPath: "src/worker.js", compatibilityDate: "2026-08-06",
  d1Databases: ["DB"], r2Buckets: ["BUCKET"], bindings: { ADMIN_PASSWORD: "background-test-admin", SESSION_SECRET: "background-test-secret-at-least-32-bytes" } });
const base = "https://localhost";
let admin = "";
async function request(path, { cookie = admin, method = "GET", body } = {}) {
  return mf.dispatchFetch(base + path, { method, headers: { "User-Agent": "entry-background-test", ...(cookie ? { Cookie: cookie } : {}),
    ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function ok(path, options) {
  const response = await request(path, options); const data = await response.json();
  assert.ok(response.ok, `${path}: ${response.status} ${JSON.stringify(data)}`); return data;
}
async function status(expected, path, options) {
  const response = await request(path, options); assert.equal(response.status, expected, `${path}: ${await response.text()}`);
}
const adminPath = "/api/admin/entry-background";
const publicPath = "/api/guest/entry-background";
const save = config => ok(adminPath, { method: "PUT", body: config });
async function photoIds() {
  const response = await request(publicPath, { cookie: "" });
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/);
  const data = await response.json(); assert.deepEqual(Object.keys(data), ["photos"]);
  for (const photo of data.photos) { assert.deepEqual(Object.keys(photo), ["url"]); assert.match(photo.url, /^\/media\/[\w-]+\?background=1&v=/); }
  return data.photos.map(photo => new URL(photo.url, base).pathname.split("/").pop());
}

try {
  await ok("/api/guest/config", { cookie: "" });
  const login = await request("/api/admin/login", { method: "POST", body: { password: "background-test-admin" } });
  assert.equal(login.status, 200);
  admin = login.headers.getSetCookie().find(value => value.startsWith("xyj_admin=")).split(";")[0];
  const db = await mf.getD1Database("DB"); const bucket = await mf.getR2Bucket("BUCKET");
  const createSection = name => ok("/api/admin/sections", { method: "POST", body: { name, kind: "gallery", visibility: "public" } });
  const gallery = await createSection("Backgrounds"); const other = await createSection("Other");
  const parent = await ok("/api/admin/subsections", { method: "POST", body: { name: "Parent", sectionId: gallery.id, visibility: "public" } });
  const child = await ok("/api/admin/subsections", { method: "POST", body: { name: "Child", sectionId: gallery.id, parentId: parent.id, visibility: "public" } });
  const sibling = await ok("/api/admin/subsections", { method: "POST", body: { name: "Sibling", sectionId: gallery.id, visibility: "public" } });
  async function seedPhoto(id, options = {}) {
    const timestamp = options.created || "2025-01-01T00:00:00.000Z";
    await db.prepare(`INSERT INTO media(id, object_key, preview_object_key, filename, mime_type, size_bytes,
      section_id, subsection_id, album_id, content_id, kind, visibility, caption, note, created_at, updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, `original/${id}`, options.preview === false ? null : `preview/${id}`,
      `${id}.jpg`, "image/jpeg", 30, options.sectionId || gallery.id, options.subsectionId || null, options.albumId || null,
      options.contentId || null, options.kind || "photo", options.visibility || "public", `TITLE-${id}`, "PRIVATE-ADMIN-NOTE", timestamp, timestamp).run();
  }
  await seedPhoto("old-photo"); await seedPhoto("parent-photo", { subsectionId: parent.id });
  await seedPhoto("child-photo", { subsectionId: child.id }); await seedPhoto("sibling-photo", { subsectionId: sibling.id });
  await seedPhoto("other-photo", { sectionId: other.id });
  for (let i = 0; i < 45; i++) await seedPhoto(`recent-${String(i).padStart(2, "0")}`, { sectionId: "section-photos", created: `2026-08-${String(i % 28 + 1).padStart(2, "0")}T00:00:00.000Z` });
  await seedPhoto("private-photo", { visibility: "private" }); await seedPhoto("member-photo", { visibility: "member" });
  await seedPhoto("excluded-photo", { visibility: "excluded" }); await seedPhoto("selected-photo", { visibility: "selected" });
  await seedPhoto("no-preview", { preview: false }); await seedPhoto("inline-photo", { kind: "inline" });
  await seedPhoto("article-photo", { contentId: "article-with-independent-permissions" });
  await bucket.put("original/old-photo", "ORIGINAL-SECRET");
  await bucket.put("preview/old-photo", "PUBLIC-COMPRESSED-PREVIEW");

  const originalSettings = await db.prepare("SELECT key, value FROM settings ORDER BY key").all();
  const originalLogs = await db.prepare("SELECT * FROM changelogs ORDER BY id").all();
  const initial = await ok(adminPath);
  assert.equal(initial.config.mode, "all"); assert.equal(initial.invalidConfig, false); assert.equal(initial.limit, 40);
  assert.equal(initial.photos.length, 50); assert.equal((await photoIds()).length, 40);
  assert.ok(!(await photoIds()).includes("old-photo"));
  for (const photo of initial.photos) {
    assert.ok(!photo.id.match(/private|member|excluded|selected|inline|article|no-preview/));
    assert.equal(photo.object_key, undefined); assert.equal(photo.note, undefined);
  }
  await status(401, adminPath, { cookie: "" });
  await status(401, adminPath, { cookie: "", method: "PUT", body: { mode: "off" } });
  await status(405, adminPath, { method: "POST", body: { mode: "off" } });

  await save({ mode: "photos", photoIds: ["old-photo", "old-photo", "child-photo"] });
  assert.deepEqual((await ok(adminPath)).config.photoIds, ["old-photo", "child-photo"]);
  assert.deepEqual(new Set(await photoIds()), new Set(["old-photo", "child-photo"]), "selection is applied before the latest-40 limit");
  const preview = await request("/media/old-photo?background=1", { cookie: "" });
  assert.equal(preview.status, 200); assert.equal(await preview.text(), "PUBLIC-COMPRESSED-PREVIEW");
  await status(404, "/media/parent-photo?background=1", { cookie: admin });
  await status(404, "/media/old-photo?background=1&download=1", { cookie: admin });

  for (const body of [null, [], { mode: "typo" }, { mode: "photos", photoIds: "old-photo" },
    { mode: "photos", photoIds: ["../old-photo"] }, { mode: "photos", photoIds: Array(41).fill("old-photo") },
    { mode: "sections", sectionIds: [1] }, { mode: "sections", subsectionIds: Array(201).fill(parent.id) }]) {
    await status(400, adminPath, { method: "PUT", body });
  }
  for (const id of ["private-photo", "member-photo", "no-preview", "inline-photo", "missing-photo"]) {
    await status(409, adminPath, { method: "PUT", body: { mode: "photos", photoIds: [id] } });
  }
  assert.deepEqual(new Set(await photoIds()), new Set(["old-photo", "child-photo"]), "invalid saves are atomic");

  await save({ mode: "sections", sectionIds: [gallery.id] });
  assert.deepEqual(new Set(await photoIds()), new Set(["old-photo", "parent-photo", "child-photo", "sibling-photo"]));
  await save({ mode: "sections", subsectionIds: [parent.id] });
  assert.deepEqual(new Set(await photoIds()), new Set(["parent-photo", "child-photo"]));
  await save({ mode: "sections", subsectionIds: [child.id] });
  assert.deepEqual(await photoIds(), ["child-photo"]);
  await save({ mode: "sections", sectionIds: [other.id], subsectionIds: [child.id, parent.id] });
  assert.deepEqual(new Set(await photoIds()), new Set(["other-photo", "child-photo", "parent-photo"]));
  await seedPhoto("new-in-range", { subsectionId: child.id, created: "2026-08-30T00:00:00.000Z" });
  assert.ok((await photoIds()).includes("new-in-range"), "new photos inherit the selected range");
  await db.prepare("DELETE FROM media WHERE id='new-in-range'").run();
  for (const mode of ["photos", "sections", "off"]) {
    await save({ mode }); assert.deepEqual(await photoIds(), [], "empty ranges never fall back to every photo");
    await status(404, "/media/old-photo?background=1", { cookie: admin });
    const ordinary = await request("/media/old-photo?preview=1", { cookie: "" });
    assert.equal(ordinary.status, 200, "carousel settings do not change ordinary photo access");
  }

  // Saved IDs are not grants. Restricting any level removes the photo on the
  // next public request, including when an administrator is visiting the page.
  await save({ mode: "photos", photoIds: ["child-photo"] });
  for (const [table, kind, id] of [["media", "media", "child-photo"], ["portfolio_subsections", "subsection", child.id],
    ["portfolio_subsections", "subsection", parent.id], ["portfolio_sections", "section", gallery.id]]) {
    await db.prepare(`UPDATE ${table} SET visibility='private' WHERE id=?`).bind(id).run();
    assert.deepEqual(await photoIds(), []);
    assert.ok(!(await ok(adminPath)).photos.some(photo => photo.id === "child-photo"));
    await status(404, "/media/child-photo?background=1", { cookie: admin });
    await db.prepare(`UPDATE ${table} SET visibility='public' WHERE id=?`).bind(id).run();
    await db.prepare("INSERT INTO content_locks(target_kind,target_id,enabled,version,consumed_at,updated_at) VALUES(?,?,1,'v1','consumed','now')").bind(kind, id).run();
    assert.deepEqual(await photoIds(), [], "consumed one-use codes still leave the content locked");
    await status(404, "/media/child-photo?background=1", { cookie: admin });
    await db.prepare("DELETE FROM content_locks WHERE target_kind=? AND target_id=?").bind(kind, id).run();
    assert.deepEqual(await photoIds(), ["child-photo"]);
  }

  await db.prepare("INSERT INTO albums(id,name,section_id,visibility,created_at,updated_at) VALUES('background-album','Album',?,'public','now','now')").bind(other.id).run();
  await seedPhoto("album-photo", { albumId: "background-album" });
  await save({ mode: "photos", photoIds: ["album-photo"] }); assert.deepEqual(await photoIds(), ["album-photo"]);
  await db.prepare("UPDATE albums SET visibility='private' WHERE id='background-album'").run(); assert.deepEqual(await photoIds(), []);
  await db.prepare("UPDATE albums SET visibility='public' WHERE id='background-album'").run();
  await db.prepare("INSERT INTO content_locks(target_kind,target_id,enabled,version,updated_at) VALUES('album','background-album',1,'v1','now')").run();
  assert.deepEqual(await photoIds(), []);
  await db.prepare("DELETE FROM content_locks WHERE target_kind='album'").run();
  await db.prepare("UPDATE portfolio_sections SET visibility='private' WHERE id=?").bind(other.id).run(); assert.deepEqual(await photoIds(), []);
  await db.prepare("UPDATE portfolio_sections SET visibility='public' WHERE id=?").bind(other.id).run();
  await db.prepare("UPDATE media SET section_id=? WHERE id='album-photo'").bind(other.id).run();
  await save({ mode: "sections", sectionIds: [gallery.id] });
  assert.ok(!(await photoIds()).includes("album-photo"), "moving a photo out of a chosen section removes it");

  await save({ mode: "photos", photoIds: ["old-photo"] });
  for (const broken of ["", "not json", '{"mode":"unknown"}', '{"mode":"photos","photoIds":"old-photo"}']) {
    await db.prepare("UPDATE settings SET value=? WHERE key=?").bind(broken, ENTRY_BACKGROUND_SETTING).run();
    assert.deepEqual(await photoIds(), []); assert.equal((await ok(adminPath)).invalidConfig, true);
    await status(404, "/media/old-photo?background=1", { cookie: admin });
  }
  await save({ mode: "photos", photoIds: ["old-photo"] });
  assert.equal((await ok(adminPath)).invalidConfig, false);
  await db.prepare("DELETE FROM media WHERE id='old-photo'").run();
  assert.deepEqual(await photoIds(), []); assert.deepEqual((await ok(adminPath)).config.photoIds, ["old-photo"]);
  await save({ mode: "off" });
  assert.deepEqual((await db.prepare("SELECT key, value FROM settings WHERE key<>? ORDER BY key").bind(ENTRY_BACKGROUND_SETTING).all()).results, originalSettings.results);
  assert.deepEqual((await db.prepare("SELECT * FROM changelogs ORDER BY id").all()).results, originalLogs.results);

  const guestResponse = await request("/api/guest/enter", { cookie: "", method: "POST", body: { visitorId: "background-test-guest" } });
  const guest = guestResponse.headers.getSetCookie().find(value => value.startsWith("xyj_guest=")).split(";")[0];
  await status(401, adminPath, { cookie: guest });
  const bootstrap = await ok("/api/bootstrap", { cookie: guest });
  assert.equal(bootstrap.settings[ENTRY_BACKGROUND_SETTING], undefined, "selection metadata is admin-only");
  await ok("/api/admin/settings", { method: "PUT", body: { site_title: "Unrelated settings save" } });
  assert.equal((await ok(adminPath)).config.mode, "off", "general settings saves cannot overwrite the carousel");

  for (const file of ["public/index.html", "public/login.html"]) {
    assert.match(await readFile(file, "utf8"), /api\("\/api\/guest\/entry-background"\)/, "both entry pages use the same server selection");
  }
  assert.deepEqual(normalizeEntryBackgroundConfig({ mode: "off", photoIds: ["unused"] }), { mode: "off", sectionIds: [], subsectionIds: [], photoIds: [] });
  console.log("entry background persistence, scope, hierarchy, locks, preview safety and access regressions passed");
} finally { await mf.dispose(); }
