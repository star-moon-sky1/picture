/* Admin-only controls; the server recalculates eligibility at save and display. */
const entryBackgroundState = {
  loaded: false, busy: false, dirty: false, visibleCount: 48,
  config: { mode: "all", sectionIds: [], subsectionIds: [], photoIds: [] },
  sections: [], subsections: [], photos: [], limit: 40,
};

function entryBackgroundNode(name) { return document.getElementById(`entry-background-${name}`); }
function entryBackgroundCopy(config) {
  return { mode: config.mode, sectionIds: [...config.sectionIds], subsectionIds: [...config.subsectionIds], photoIds: [...config.photoIds] };
}
function entryBackgroundNotice(text) { entryBackgroundNode("notice").textContent = text; }
function entryBackgroundBusy(value) {
  entryBackgroundState.busy = value;
  entryBackgroundNode("form").setAttribute("aria-busy", String(value));
  entryBackgroundNode("controls").disabled = value || !entryBackgroundState.loaded;
  entryBackgroundNode("refresh").disabled = value;
  entryBackgroundNode("save").textContent = value ? "请稍候…" : "保存背景轮播";
}
function entryBackgroundMarkDirty() {
  entryBackgroundState.dirty = true;
  entryBackgroundNotice("有未保存的更改，点击“保存背景轮播”后生效。");
  renderEntryBackgroundSummary();
}
function entryBackgroundMatches(photo, config = entryBackgroundState.config) {
  if (config.mode === "all") return true;
  if (config.mode === "photos") return config.photoIds.includes(photo.id);
  return config.mode === "sections" && (config.sectionIds.includes(photo.section_id)
    || config.subsectionIds.includes(photo.subsection_id) || config.subsectionIds.includes(photo.subsection_parent_id));
}
function entryBackgroundUnavailable() {
  const state = entryBackgroundState;
  const fields = state.config.mode === "sections" ? [["sectionIds", state.sections], ["subsectionIds", state.subsections]]
    : state.config.mode === "photos" ? [["photoIds", state.photos]] : [];
  return fields.map(([key, rows]) => {
    const available = new Set(rows.map(row => row.id));
    return [key, state.config[key].filter(id => !available.has(id))];
  });
}
function renderEntryBackgroundSummary() {
  const state = entryBackgroundState;
  const count = state.photos.filter(photo => entryBackgroundMatches(photo)).length;
  const missing = entryBackgroundUnavailable().reduce((sum, [, ids]) => sum + ids.length, 0);
  const summary = state.config.mode === "off" ? "图片轮播已关闭，登录和注册使用纯色背景。"
    : count ? `当前范围内有 ${count} 张可用照片，将展示最新的 ${Math.min(count, state.limit)} 张。`
      : "当前范围内没有可用照片，登录和注册将使用纯色背景。";
  entryBackgroundNode("summary").textContent = `${state.config.mode === "photos" ? `已勾选 ${state.config.photoIds.length} / ${state.limit} 张。` : ""}${summary}`;
  entryBackgroundNode("unavailable").hidden = !missing;
  entryBackgroundNode("unavailable-text").textContent = `${missing} 项已选内容因权限、密码锁、预览缺失或删除而不可用，未参与轮播。可刷新列表，或清除这些选择后保存。`;
  entryBackgroundNode("clear").hidden = !["sections", "photos"].includes(state.config.mode);
}
function entryBackgroundLabel(item, kind) {
  const state = entryBackgroundState;
  if (kind === "section") return item.name;
  const section = state.sections.find(section => section.id === item.section_id);
  const parent = state.subsections.find(parent => parent.id === item.parent_id);
  return [section?.name, parent?.name, item.name].filter(Boolean).join(" / ");
}
function entryBackgroundOrderedSections() {
  const state = entryBackgroundState;
  return state.sections.flatMap(section => [
    { item: section, key: "sectionIds", label: section.name, depth: 0 },
    ...state.subsections.filter(sub => sub.section_id === section.id && !sub.parent_id).flatMap(parent => [
      { item: parent, key: "subsectionIds", label: entryBackgroundLabel(parent, "subsection"), depth: 1 },
      ...state.subsections.filter(child => child.parent_id === parent.id).map(child => (
        { item: child, key: "subsectionIds", label: entryBackgroundLabel(child, "subsection"), depth: 2 })),
    ]),
  ]);
}
function entryBackgroundCheckbox(key, id, labelText) {
  const input = document.createElement("input");
  input.type = "checkbox"; input.value = id; input.checked = entryBackgroundState.config[key].includes(id);
  input.setAttribute("aria-label", labelText);
  input.addEventListener("change", () => {
    const state = entryBackgroundState;
    if (state.busy) { input.checked = state.config[key].includes(id); return; }
    if (input.checked && key === "photoIds" && state.config.photoIds.length >= state.limit) {
      input.checked = false;
      entryBackgroundNotice(`最多选择 ${state.limit} 张照片，请先取消其他选择。`); return;
    }
    state.config[key] = state.config[key].filter(value => value !== id);
    if (input.checked) state.config[key].push(id);
    input.closest("label").classList.toggle("is-selected", input.checked);
    entryBackgroundMarkDirty();
  });
  return input;
}
function renderEntryBackgroundSections() {
  const list = entryBackgroundNode("sections"); list.replaceChildren();
  const entries = entryBackgroundOrderedSections();
  if (!entries.length) { list.textContent = "暂无公开且未上锁的板块。"; return; }
  for (const { item, key, label: name, depth } of entries) {
    const label = document.createElement("label");
    label.className = "entry-background-section";
    label.style.setProperty("--entry-background-depth", String(depth));
    const input = entryBackgroundCheckbox(key, item.id, name);
    const title = document.createElement("span"); title.textContent = name;
    label.classList.toggle("is-selected", input.checked); label.append(input, title); list.append(label);
  }
}
function renderEntryBackgroundFilters() {
  const filter = entryBackgroundNode("filter"); const previous = filter.value;
  filter.replaceChildren(new Option("所有板块", ""));
  for (const { item, key, label } of entryBackgroundOrderedSections()) {
    filter.add(new Option(label, `${key === "sectionIds" ? "section" : "subsection"}:${item.id}`));
  }
  if ([...filter.options].some(option => option.value === previous)) filter.value = previous;
}
function renderEntryBackgroundPhotos() {
  const state = entryBackgroundState;
  const list = entryBackgroundNode("photos"); list.replaceChildren();
  // Do not create thumbnails outside the photo-selection mode. Only a small
  // page of lazy images is rendered, even when the photo library is large.
  if (state.config.mode !== "photos") return;
  const [kind, id] = entryBackgroundNode("filter").value.split(":");
  const query = entryBackgroundNode("search").value.trim().toLocaleLowerCase();
  const photos = state.photos.filter(photo => (!id || (kind === "section" ? photo.section_id === id
    : photo.subsection_id === id || photo.subsection_parent_id === id))
    && (!query || `${photo.caption || ""} ${photo.filename}`.toLocaleLowerCase().includes(query)));
  if (!photos.length) { const empty = document.createElement("p"); empty.className = "status";
    empty.textContent = state.photos.length ? "没有符合筛选条件的照片，已选照片不会被清除。" : "暂无公开、未上锁且有预览的照片，请先到图片板块上传。"; list.append(empty); }
  const sectionNames = new Map(state.sections.map(item => [item.id, item.name]));
  const subsectionNames = new Map(state.subsections.map(item => [item.id, entryBackgroundLabel(item, "subsection")]));
  for (const photo of photos.slice(0, state.visibleCount)) {
    const label = document.createElement("label"); label.className = "entry-background-photo";
    const name = photo.caption || photo.filename || "未命名照片";
    const input = entryBackgroundCheckbox("photoIds", photo.id, `选择照片：${name}`);
    const image = document.createElement("img"); image.src = photo.previewUrl;
    image.alt = name; image.loading = "lazy"; image.decoding = "async"; image.width = 240; image.height = 160;
    image.addEventListener("error", () => { image.src = "/protected-image.svg"; }, { once: true });
    const title = document.createElement("span"); title.className = "entry-background-photo-name"; title.textContent = name;
    const path = document.createElement("small"); path.textContent = subsectionNames.get(photo.subsection_id) || sectionNames.get(photo.section_id) || "未分类";
    label.classList.toggle("is-selected", input.checked); label.append(input, image, title, path); list.append(label);
  }
  entryBackgroundNode("more").hidden = photos.length <= state.visibleCount;
}
function renderEntryBackgroundSettings() {
  const mode = entryBackgroundState.config.mode;
  entryBackgroundNode("mode").value = mode;
  entryBackgroundNode("section-panel").hidden = mode !== "sections";
  entryBackgroundNode("photo-panel").hidden = mode !== "photos";
  renderEntryBackgroundSections(); renderEntryBackgroundFilters(); renderEntryBackgroundPhotos(); renderEntryBackgroundSummary();
}
function applyEntryBackgroundResponse(data, { preserveDraft = false } = {}) {
  const state = entryBackgroundState;
  if (!preserveDraft) { state.config = entryBackgroundCopy(data.config); state.dirty = false; }
  state.sections = data.sections; state.subsections = data.subsections; state.photos = data.photos; state.limit = data.limit;
  state.loaded = true;
  renderEntryBackgroundSettings();
}
async function loadEntryBackgroundSettings() {
  const state = entryBackgroundState;
  if (state.busy) return;
  entryBackgroundBusy(true); entryBackgroundNotice("正在加载背景设置和可用照片…");
  try {
    const data = await api("/api/admin/entry-background");
    applyEntryBackgroundResponse(data, { preserveDraft: state.dirty });
    entryBackgroundNotice(state.dirty ? "图片列表已刷新，未保存的选择已保留。" : data.invalidConfig
      ? "原背景配置无法读取，已安全停用轮播；请选择范围并重新保存。" : "设置已加载。更改后请单独保存背景轮播。");
  } catch (error) { entryBackgroundNotice(`背景设置加载失败：${error.message}。请点击“刷新图片列表”重试。`); }
  finally { entryBackgroundBusy(false); }
}
async function saveEntryBackgroundSettings(event) {
  event?.preventDefault();
  const state = entryBackgroundState;
  if (state.busy || !state.loaded) return;
  entryBackgroundBusy(true); entryBackgroundNotice("正在保存背景轮播…");
  const config = entryBackgroundCopy(state.config);
  if (config.mode !== "sections") config.sectionIds = config.subsectionIds = [];
  if (config.mode !== "photos") config.photoIds = [];
  try {
    const data = await api("/api/admin/entry-background", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
    applyEntryBackgroundResponse(data);
    entryBackgroundNotice("背景轮播已保存。重新打开或刷新登录／注册页即可看到新范围。");
  } catch (error) { entryBackgroundNotice(`保存失败：${error.message}`); }
  finally { entryBackgroundBusy(false); }
}
function initializeEntryBackgroundSettings() {
  entryBackgroundNode("form").addEventListener("submit", saveEntryBackgroundSettings);
  entryBackgroundNode("refresh").addEventListener("click", loadEntryBackgroundSettings);
  entryBackgroundNode("mode").addEventListener("change", event => {
    entryBackgroundState.config.mode = event.target.value;
    renderEntryBackgroundSettings(); entryBackgroundMarkDirty();
  });
  for (const name of ["filter", "search"]) entryBackgroundNode(name).addEventListener(name === "search" ? "input" : "change", () => {
    entryBackgroundState.visibleCount = 48; renderEntryBackgroundPhotos();
  });
  entryBackgroundNode("more").addEventListener("click", () => { entryBackgroundState.visibleCount += 48; renderEntryBackgroundPhotos(); });
  entryBackgroundNode("clear").addEventListener("click", () => {
    const state = entryBackgroundState;
    if (state.config.mode === "photos") state.config.photoIds = [];
    else { state.config.sectionIds = []; state.config.subsectionIds = []; }
    renderEntryBackgroundSettings(); entryBackgroundMarkDirty();
  });
  entryBackgroundNode("clear-unavailable").addEventListener("click", () => {
    for (const [key, ids] of entryBackgroundUnavailable()) {
      entryBackgroundState.config[key] = entryBackgroundState.config[key].filter(id => !ids.includes(id));
    }
    renderEntryBackgroundSettings(); entryBackgroundMarkDirty();
  });
}
