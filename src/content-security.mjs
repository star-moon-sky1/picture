// One permission graph for listings, original bytes, previews and one-use locks.
// A lock is additional to ordinary access; redemption never grants membership.
export const SECURITY_TABLES = Object.freeze({
  section: "portfolio_sections", subsection: "portfolio_subsections", content: "content",
  media: "media", asset: "assets", assetFolder: "asset_folders", album: "albums",
});
export const securityKey = (kind, id) => `${kind}:${id}`;

export async function initializeContentSecurity(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS download_rules (
      target_kind TEXT NOT NULL, target_id TEXT NOT NULL, mode TEXT NOT NULL,
      user_ids TEXT NOT NULL DEFAULT '[]', updated_at TEXT NOT NULL,
      PRIMARY KEY(target_kind, target_id))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS content_locks (
      target_kind TEXT NOT NULL, target_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
      version TEXT NOT NULL, password_hash TEXT, password_salt TEXT,
      password_iterations INTEGER, consumed_at TEXT, redemption_id TEXT,
      updated_at TEXT NOT NULL, PRIMARY KEY(target_kind, target_id))`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS content_grants (
      token_hash TEXT PRIMARY KEY, principal TEXT NOT NULL,
      target_kind TEXT NOT NULL, target_id TEXT NOT NULL, version TEXT NOT NULL,
      expires_at INTEGER NOT NULL)`),
    env.DB.prepare("CREATE INDEX IF NOT EXISTS idx_content_grants_expiry ON content_grants(expires_at)"),
  ]);
}

export async function createContentSecurity(request, env, context, hooks, seed = {}) {
  const { error, hash, visible, accessTables } = hooks;
  const entries = Object.entries(SECURITY_TABLES);
  // Object storage keys and article bodies are never needed in the graph.
  const columns = {
    section: "id,visibility,category,kind,download_policy",
    subsection: "id,section_id,parent_id,visibility,download_policy",
    content: "id,section_id,subsection_id,status,visibility",
    media: "id,section_id,subsection_id,album_id,content_id,kind,visibility",
    asset: "id,section_id,subsection_id,album_id,content_id,folder_id,scope,status,visibility,access_mode,download_policy",
    assetFolder: "id,section_id,parent_id,visibility,access_mode",
    album: "id,section_id,visibility",
  };
  const userId = context.user?.id || "";
  const accessEntries = Object.entries(accessTables).filter(([kind]) => SECURITY_TABLES[kind]);
  const results = await Promise.all([
    ...entries.map(([kind, table]) => seed.records?.[kind]
      ? Promise.resolve({ results: seed.records[kind] })
      : env.DB.prepare(`SELECT ${columns[kind]} FROM ${table}`).all()),
    env.DB.prepare("SELECT * FROM download_rules").all(),
    env.DB.prepare("SELECT target_kind,target_id,enabled,version,consumed_at FROM content_locks WHERE enabled = 1").all(),
    seed.access ? Promise.resolve([{ results: seed.access }])
      : Promise.all(accessEntries.map(([kind, cfg]) => env.DB.prepare(
        `SELECT '${kind}' AS kind, ${cfg.targetColumn} AS id FROM ${cfg.table} WHERE user_id = ?`).bind(userId).all())),
  ]);
  const records = new Map();
  entries.forEach(([kind], i) => results[i].results.forEach(row => records.set(securityKey(kind, row.id), { ...row, targetKind: kind })));
  const rules = new Map(results[entries.length].results.map(row => [securityKey(row.target_kind, row.target_id), row]));
  const locks = new Map(results[entries.length + 1].results.map(row => [securityKey(row.target_kind, row.target_id), row]));
  const listed = new Set(results[entries.length + 2].flatMap(result => result.results).map(row => securityKey(row.kind, row.id)));
  // Bind grants to the authenticated session (not simply the user ID). Guest mode
  // uses only its own cookie, so switching identity cannot reuse a grant.
  const cookieName = context.guestMode ? "xyj_guest" : context.adminAccess ? "xyj_admin" : "xyj_user";
  const session = request.headers.get("Cookie")?.match(new RegExp(`(?:^|;\\s*)${cookieName}=([^;]+)`))?.[1] || "";
  const principal = await hash(`${cookieName}:${userId}:${session}`);
  const url = new URL(request.url);
  const tokens = [...new Set(`${request.headers.get("X-Content-Grants") || ""},${url.searchParams.get("grants") || ""}`
    .split(",").filter(token => /^[a-f0-9]{64}$/.test(token)))].slice(0, 24);
  const tokenHashes = await Promise.all(tokens.map(hash));
  const grantRows = tokenHashes.length ? (await env.DB.prepare(`SELECT * FROM content_grants
    WHERE principal = ? AND expires_at > ? AND token_hash IN (SELECT value FROM json_each(?))`)
    .bind(principal, Date.now(), JSON.stringify(tokenHashes)).all()).results : [];
  const grants = new Set(grantRows.filter(g => locks.get(securityKey(g.target_kind, g.target_id))?.version === g.version)
    .map(g => securityKey(g.target_kind, g.target_id)));

  function chain(kind, id, trail = new Set()) {
    const key = securityKey(kind, id);
    const item = records.get(key);
    if (!item || trail.has(key)) return null;
    trail.add(key);
    const parents = [];
    if (item.section_id) parents.push(["section", item.section_id]);
    if (kind === "subsection" && item.parent_id) parents.push(["subsection", item.parent_id]);
    if (kind === "assetFolder" && item.parent_id) parents.push(["assetFolder", item.parent_id]);
    if (kind === "assetFolder" && !item.parent_id && !item.section_id) parents.push(["section", "section-resources"]);
    if (!["section", "subsection", "album"].includes(kind) && item.subsection_id) parents.push(["subsection", item.subsection_id]);
    if (item.album_id) parents.push(["album", item.album_id]);
    if (item.content_id) parents.push(["content", item.content_id]);
    if (item.folder_id) parents.push(["assetFolder", item.folder_id]);
    const output = [];
    for (const [pk, pid] of parents) {
      const ancestors = chain(pk, pid, new Set(trail));
      if (!ancestors) return null;
      output.push(...ancestors);
    }
    output.push(item);
    return [...new Map(output.map(node => [securityKey(node.targetKind, node.id), node])).values()];
  }
  function canView(kind, id) {
    const path = chain(kind, id);
    return Boolean(path && path.every(item => context.adminAccess || (
      (item.targetKind !== "content" || item.status === "published")
      && (item.targetKind !== "asset" || item.status === "ready")
      && (item.targetKind !== "media" || item.kind !== "inline" || Boolean(item.content_id))
      && visible(item.access_mode || item.visibility, context.fullAccess,
        listed.has(securityKey(item.targetKind, item.id)), context.ownerAccess)
    )));
  }
  function blockedLocks(kind, id) {
    if (context.adminAccess) return [];
    return (chain(kind, id) || []).map(node => locks.get(securityKey(node.targetKind, node.id)))
      .filter(lock => lock && !grants.has(securityKey(lock.target_kind, lock.target_id)))
      .map(lock => ({ kind: lock.target_kind, id: lock.target_id, needsNewCode: Boolean(lock.consumed_at) }));
  }
  function canDownload(kind, id) {
    if (!canView(kind, id) || blockedLocks(kind, id).length) return false;
    if (context.adminAccess || context.ownerAccess) return true;
    return chain(kind, id).every(item => {
      // An article's download rule controls its PDF, independently of each
      // embedded image/video. Its view permission and lock still inherit.
      if (item.targetKind === "content" && kind !== "content") return true;
      const rule = rules.get(securityKey(item.targetKind, item.id));
      const fallback = ["media", "content"].includes(item.targetKind) ? "member" : item.download_policy || "public";
      const mode = rule?.mode || fallback;
      if (mode === "none") return false;
      let ids = [];
      try { ids = JSON.parse(rule?.user_ids || "[]"); } catch { return false; }
      return visible(mode, context.fullAccess, ids.includes(userId), context.ownerAccess);
    });
  }
  function requireView(kind, id, { allowLocked = false, download = false } = {}) {
    if (!canView(kind, id)) throw error(404, "内容不存在或没有查看权限");
    if (!allowLocked && blockedLocks(kind, id).length) throw error(423, "此内容已上锁，请输入站长提供的一次性密码");
    if (download && !canDownload(kind, id)) throw error(context.fullAccess ? 403 : 401, "当前账号没有此内容的下载权限");
  }
  function decorate(kind, item) {
    const blocked = blockedLocks(kind, item.id);
    const output = { ...item, locked: Boolean(blocked.length), locks: blocked, canDownload: canDownload(kind, item.id) };
    if (output.canDownload && kind === "media") { output.originalUrl = `/media/${item.id}`; output.downloadUrl = `/media/${item.id}?download=1`; }
    if (kind === "asset") {
      if (output.canDownload) output.downloadUrl = `/files/${item.id}?download=1`;
      output.variants = (item.variants || []).map(variant => {
        const safe = { ...variant };
        if (output.canDownload) safe.downloadUrl = `${variant.url}&download=1`;
        else delete safe.downloadUrl;
        return safe;
      });
    }
    if (!output.canDownload) { delete output.downloadUrl; delete output.originalUrl; }
    if (output.locked) {
      delete output.body_html; delete output.stream_uid; delete output.stream_hls_url; delete output.stream_dash_url;
      output.excerpt = "内容已上锁";
      output.coverUrl = null;
      if (kind === "media") {
        output.url = output.previewUrl = `/media/${item.id}?mosaic=1`;
      } else if (kind === "asset") {
        output.url = ""; output.poster_url = ""; output.variants = [];
      }
    }
    // Restrict stream links to genuinely public, unlocked assets. Protected video
    // playback uses the authenticated R2 route, never a reusable external URL.
    if (kind === "asset" && (chain(kind, item.id) || []).some(node => locks.has(securityKey(node.targetKind, node.id))
      || (node.access_mode || node.visibility) !== "public")) {
      output.stream_uid = output.stream_hls_url = output.stream_dash_url = "";
    }
    return output;
  }
  return { records, rules, locks, principal, tokenHashes, chain, canView, canDownload, blockedLocks, requireView, decorate };
}
