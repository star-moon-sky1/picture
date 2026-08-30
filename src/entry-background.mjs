// Login and registration share a public-only carousel. A saved selection is
// never an access grant: eligibility is recalculated for both listings and bytes.
export const ENTRY_BACKGROUND_SETTING = "entry_background_config";
export const ENTRY_BACKGROUND_LIMIT = 40;
const MODES = new Set(["all", "sections", "photos", "off"]);

export function normalizeEntryBackgroundConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !MODES.has(input.mode)) {
    throw new TypeError("请选择有效的背景轮播范围");
  }
  const ids = (key, limit) => {
    const value = input[key] ?? [];
    if (!Array.isArray(value) || value.length > limit
      || value.some(id => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(id))) {
      throw new TypeError(key === "photoIds" ? "最多选择 40 张照片，照片 ID 必须有效" : "板块选择无效或超过 200 项");
    }
    return [...new Set(value)];
  };
  const sectionIds = ids("sectionIds", 200);
  const subsectionIds = ids("subsectionIds", 200);
  const photoIds = ids("photoIds", ENTRY_BACKGROUND_LIMIT);
  return { mode: input.mode, sectionIds: input.mode === "sections" ? sectionIds : [],
    subsectionIds: input.mode === "sections" ? subsectionIds : [], photoIds: input.mode === "photos" ? photoIds : [] };
}

export async function readEntryBackgroundConfig(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(ENTRY_BACKGROUND_SETTING).first();
  // Only an absent setting preserves the old default. A broken/empty setting
  // must not silently widen a carefully chosen scope to all public photographs.
  if (!row) return { config: normalizeEntryBackgroundConfig({ mode: "all" }), invalidConfig: false };
  try { return { config: normalizeEntryBackgroundConfig(JSON.parse(row.value)), invalidConfig: false }; }
  catch { return { config: normalizeEntryBackgroundConfig({ mode: "off" }), invalidConfig: true }; }
}

const PUBLIC_BACKGROUND_CTES = `WITH RECURSIVE
  bg_sections AS (
    SELECT id, name, sort_order FROM portfolio_sections s
    WHERE s.visibility = 'public' AND NOT EXISTS (
      SELECT 1 FROM content_locks l WHERE l.enabled = 1 AND l.target_kind = 'section' AND l.target_id = s.id)
  ),
  bg_subsections AS (
    SELECT ss.id, ss.section_id, ss.parent_id, ss.name, ss.sort_order, 1 AS depth
    FROM portfolio_subsections ss JOIN bg_sections s ON s.id = ss.section_id
    WHERE ss.parent_id IS NULL AND ss.visibility = 'public' AND NOT EXISTS (
      SELECT 1 FROM content_locks l WHERE l.enabled = 1 AND l.target_kind = 'subsection' AND l.target_id = ss.id)
    UNION ALL
    SELECT ss.id, ss.section_id, ss.parent_id, ss.name, ss.sort_order, parent.depth + 1
    FROM portfolio_subsections ss JOIN bg_subsections parent ON parent.id = ss.parent_id AND parent.section_id = ss.section_id
    WHERE parent.depth < 2 AND ss.visibility = 'public' AND NOT EXISTS (
      SELECT 1 FROM content_locks l WHERE l.enabled = 1 AND l.target_kind = 'subsection' AND l.target_id = ss.id)
  ),
  bg_photos AS (
    SELECT m.id, m.section_id, m.subsection_id, ss.parent_id AS subsection_parent_id,
           m.filename, m.caption, m.updated_at, m.created_at
    FROM media m JOIN bg_sections s ON s.id = m.section_id
    LEFT JOIN bg_subsections ss ON ss.id = m.subsection_id AND ss.section_id = m.section_id
    LEFT JOIN albums a ON a.id = m.album_id
    LEFT JOIN bg_sections album_section ON album_section.id = a.section_id
    WHERE m.kind = 'photo' AND m.visibility = 'public' AND m.content_id IS NULL
      AND m.preview_object_key IS NOT NULL AND TRIM(m.preview_object_key) <> ''
      AND (m.subsection_id IS NULL OR ss.id IS NOT NULL)
      AND (m.album_id IS NULL OR (a.visibility = 'public' AND album_section.id IS NOT NULL))
      AND NOT EXISTS (SELECT 1 FROM content_locks l WHERE l.enabled = 1 AND (
        (l.target_kind = 'media' AND l.target_id = m.id) OR (l.target_kind = 'album' AND l.target_id = m.album_id)))
  )`;

function scopeClause(config) {
  if (config.mode === "all") return { sql: "1 = 1", params: [] };
  if (config.mode === "photos") return { sql: "m.id IN (SELECT value FROM json_each(?))", params: [JSON.stringify(config.photoIds)] };
  if (config.mode === "sections") return {
    sql: `(m.section_id IN (SELECT value FROM json_each(?))
      OR m.subsection_id IN (SELECT value FROM json_each(?))
      OR m.subsection_parent_id IN (SELECT value FROM json_each(?)))`,
    params: [JSON.stringify(config.sectionIds), JSON.stringify(config.subsectionIds), JSON.stringify(config.subsectionIds)],
  };
  return { sql: "1 = 0", params: [] };
}

export async function entryBackgroundPhotos(env, config, { id = "", limit = ENTRY_BACKGROUND_LIMIT } = {}) {
  if (config.mode === "off") return [];
  const scope = scopeClause(config);
  // Apply the selected range BEFORE the limit, so an older chosen photo can
  // appear even when forty more recent, unselected photos exist.
  let query = env.DB.prepare(`${PUBLIC_BACKGROUND_CTES}
    SELECT m.* FROM bg_photos m WHERE ${scope.sql}${id ? " AND m.id = ?" : ""}
    ORDER BY m.created_at DESC, m.id DESC LIMIT ?`);
  query = query.bind(...scope.params, ...(id ? [id] : []), limit);
  return (await query.all()).results;
}

export async function entryBackgroundChoices(env) {
  const [saved, sections, subsections, photos] = await Promise.all([
    readEntryBackgroundConfig(env),
    env.DB.prepare(`${PUBLIC_BACKGROUND_CTES} SELECT * FROM bg_sections ORDER BY sort_order, name, id`).all(),
    env.DB.prepare(`${PUBLIC_BACKGROUND_CTES} SELECT * FROM bg_subsections ORDER BY depth, sort_order, name, id`).all(),
    env.DB.prepare(`${PUBLIC_BACKGROUND_CTES} SELECT * FROM bg_photos ORDER BY created_at DESC, id DESC`).all(),
  ]);
  return { ...saved, limit: ENTRY_BACKGROUND_LIMIT, sections: sections.results, subsections: subsections.results,
    photos: photos.results.map(photo => ({ ...photo, previewUrl: `/api/admin/media/${photo.id}/source?preview=1` })) };
}

export function entryBackgroundSelectionAvailable(config, choices) {
  return [[config.sectionIds, choices.sections], [config.subsectionIds, choices.subsections], [config.photoIds, choices.photos]]
    .every(([ids, records]) => { const available = new Set(records.map(record => record.id)); return ids.every(id => available.has(id)); });
}
