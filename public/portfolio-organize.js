/* Grants live only in this page's memory. No password or token is stored in
 * localStorage, sessionStorage or links to third-party origins. */
const contentViewGrants = new Map();
let activePortfolioCategory = "content";
let contentUnlockInProgress = false;
const categoryLabels = { content: "文章", gallery: "图片", resources: "文件与视频" };

function contentGrantTokens() {
  for (const [key, grant] of contentViewGrants) if (grant.expiresAt <= Date.now()) contentViewGrants.delete(key);
  return [...contentViewGrants.values()].map(grant => grant.token).join(",");
}
function protectedMediaUrl(source) {
  if (!source) return "";
  const url = new URL(source, location.href);
  if (url.origin !== location.origin || !/^\/(media|files)\//.test(url.pathname)) return source;
  const tokens = contentGrantTokens();
  if (tokens) url.searchParams.set("grants", tokens); else url.searchParams.delete("grants");
  return `${url.pathname}${url.search}${url.hash}`;
}
async function releaseViewGrants(owner = "") {
  const removed = [...contentViewGrants.entries()].filter(([, grant]) => typeof owner === "function" ? owner(grant) : !owner || grant.owner === owner);
  removed.forEach(([key]) => contentViewGrants.delete(key));
  if (!removed.length) return false;
  try { await fetch("/api/content-release", { method: "POST", headers: { "Content-Type": "application/json", "X-Content-Grants": removed.map(([, grant]) => grant.token).join(",") }, body: "{}", keepalive: true }); } catch { /* Lost tokens expire on the server as well. */ }
  return true;
}
async function closeProtectedView(owner) {
  if (!(await releaseViewGrants(owner))) return;
  try { await refreshProtectedContent(); renderPortfolio(); } catch { /* Every byte route still checks the grant. */ }
}
function subsectionGrantPath(sectionId, subsectionId) {
  const keep = new Set([`section:${sectionId}`]);
  let current = (state.data?.subsections || []).find(item => item.id === subsectionId && item.section_id === sectionId);
  while (current && !keep.has(`subsection:${current.id}`)) {
    keep.add(`subsection:${current.id}`);
    current = (state.data?.subsections || []).find(item => item.id === current.parent_id && item.section_id === sectionId);
  }
  return keep;
}
async function refreshProtectedContent() { state.data = await api("/api/bootstrap"); }
function findProtectedItem(kind, id) {
  const keys = { section: ["sections"], subsection: ["subsections"], content: ["content"], media: ["media"], asset: ["assets", "galleryAssets", "sectionAssets", "articleAssets"], assetFolder: ["assetFolders"] }[kind] || [];
  return keys.flatMap(key => state.data?.[key] || []).find(item => item.id === id);
}
function askContentCode(lock, owner) {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog"); dialog.className = "organize-dialog";
    const form = document.createElement("form");
    const title = document.createElement("h3"); title.textContent = "输入一次性密码";
    const label = document.createElement("label"); label.textContent = "站长提供的六位数字密码";
    const code = document.createElement("input"); code.type = "password"; code.className = "content-lock-code"; code.inputMode = "numeric"; code.pattern = "[0-9]{6}"; code.maxLength = 6; code.required = true; code.autocomplete = "off"; code.setAttribute("aria-label", "六位数字密码"); label.append(code);
    const help = document.createElement("p"); help.className = "status";
    help.textContent = lock.needsNewCode ? "之前的密码已使用，请联系站长设置新密码。" : "密码只能成功使用一次。本次查看最多保留 15 分钟，关闭或刷新后需要新密码。";
    const status = document.createElement("p"); status.className = "status"; status.setAttribute("role", "status");
    const actions = document.createElement("div"); actions.className = "actions";
    const submit = document.createElement("button"); submit.type = "submit"; submit.className = "btn"; submit.textContent = "解锁";
    const cancel = document.createElement("button"); cancel.type = "button"; cancel.className = "btn ghost"; cancel.textContent = "取消"; cancel.addEventListener("click", () => dialog.close());
    actions.append(submit, cancel); form.append(title, label, help, actions, status); dialog.append(form); document.body.append(dialog);
    let settled = false; let saving = false;
    dialog.addEventListener("cancel", event => { if (saving) event.preventDefault(); });
    dialog.addEventListener("close", () => { dialog.remove(); if (!settled) resolve(false); }, { once: true });
    form.addEventListener("submit", async event => {
      event.preventDefault(); if (saving || !/^\d{6}$/.test(code.value)) return;
      saving = true; submit.disabled = cancel.disabled = true; status.textContent = "正在核对…";
      try {
        const grant = await api("/api/content-unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: lock.kind, id: lock.id, code: code.value }) });
        code.value = ""; contentViewGrants.set(`${lock.kind}:${lock.id}`, { ...grant, owner }); settled = true; dialog.close(); resolve(true);
      } catch (error) { code.value = ""; status.textContent = error.message; code.focus(); }
      finally { saving = false; submit.disabled = cancel.disabled = false; }
    });
    dialog.showModal(); code.focus();
  });
}
async function ensureContentUnlocked(kind, item) {
  if (contentUnlockInProgress) return false;
  contentUnlockInProgress = true;
  try {
    let access = await api(`/api/content-access/${kind}/${encodeURIComponent(item.id)}`);
    for (const lock of access.locks || []) if (!(await askContentCode(lock, `${kind}:${item.id}`))) {
      await closeProtectedView(`${kind}:${item.id}`); return false;
    }
    if (access.locked) { await refreshProtectedContent(); access = await api(`/api/content-access/${kind}/${encodeURIComponent(item.id)}`); }
    Object.assign(item, findProtectedItem(kind, item.id) || {}, access);
    if (!item.canDownload) {
      item.downloadUrl = ""; delete item.originalUrl;
      if (kind === "asset") item.variants = (item.variants || []).map(variant => ({ ...variant, downloadUrl: "" }));
    }
    if (kind === "media" && !item.locked) {
      item.url = item.previewUrl = `/media/${item.id}?preview=1`;
      item.downloadUrl = item.canDownload ? `/media/${item.id}?download=1` : "";
    }
    return !access.locked;
  } catch (error) { alert(error.message); return false; }
  finally { contentUnlockInProgress = false; }
}
function subsectionMatches(itemId, selected) {
  if (!selected || selected === "all") return true;
  if (itemId === selected) return true;
  return (state.data?.subsections || []).some(item => item.id === itemId && item.parent_id === selected);
}
function organizedAssets() { return [...(state.data?.assets || []), ...(state.data?.galleryAssets || []), ...(state.data?.sectionAssets || [])]; }
function organizedSections() {
  const sections = portfolioSections();
  return sections.filter(section => {
    if (section.kind === activePortfolioCategory) return true;
    // Legacy mixed sections remain visible under the appropriate category,
    // without moving their data or broadening their original permissions.
    if (activePortfolioCategory === "gallery") return (state.data?.media || []).some(item => item.section_id === section.id);
    if (activePortfolioCategory === "resources") return organizedAssets().some(item => item.section_id === section.id);
    return false;
  }).map(section => ({ ...section, displayKind: activePortfolioCategory }));
}
async function selectOrganizedSection(id) {
  if (state.activePortfolioSection === id) return;
  await releaseViewGrants(); await refreshProtectedContent();
  state.activePortfolioSection = id; state.currentResourceFolder = ""; renderPortfolio();
}
function renderOrganizedPortfolio() {
  const tabs = document.getElementById("portfolio-tabs"); tabs.replaceChildren();
  for (const [category, label] of Object.entries(categoryLabels)) {
    const button = document.createElement("button"); button.type = "button"; button.className = `tab-button${category === activePortfolioCategory ? " active" : ""}`; button.textContent = label;
    button.setAttribute("aria-pressed", String(category === activePortfolioCategory));
    button.addEventListener("click", async () => {
      if (activePortfolioCategory === category) return;
      try { await releaseViewGrants(); await refreshProtectedContent(); activePortfolioCategory = category; state.activePortfolioSection = null; state.currentResourceFolder = ""; renderPortfolio(); }
      catch (error) { alert(error.message); }
    }); tabs.append(button);
  }
  renderOrganizedPanel();
}
function lockedContentNotice(host, kind, item) {
  const box = document.createElement("div"); box.className = "locked-content-notice";
  const text = document.createElement("p"); text.textContent = "此处有内容，已开启一次性密码锁。";
  const control = document.createElement("button"); control.className = "btn"; control.type = "button"; control.textContent = "输入密码";
  control.addEventListener("click", async () => { if (await ensureContentUnlocked(kind, item)) renderPortfolioPanel(); });
  box.append(text, control); host.append(box);
}
function renderOrganizedPanel() {
  const host = document.getElementById("portfolio-panel-host");
  state.resourcePanelNode ||= document.querySelector("#resources .section-inner");
  host.replaceChildren();
  const sections = organizedSections();
  const section = sections.find(item => item.id === state.activePortfolioSection) || sections[0];
  if (!section) { host.append(empty(`暂无可查看的${categoryLabels[activePortfolioCategory]}。`)); return; }
  state.activePortfolioSection = section.id;
  const tabs = document.createElement("div"); tabs.className = "portfolio-section-tabs";
  sections.forEach(item => {
    const control = document.createElement("button"); control.type = "button"; control.className = `tab-button${item.id === section.id ? " active" : ""}`;
    control.textContent = `${item.name}${item.locked ? " · 已锁定" : ""}`; control.addEventListener("click", () => selectOrganizedSection(item.id).catch(error => alert(error.message))); tabs.append(control);
  }); host.append(tabs);
  if (section.locked) { lockedContentNotice(host, "section", section); return; }
  const subsections = (state.data?.subsections || []).filter(item => item.section_id === section.id);
  const roots = subsections.filter(item => !item.parent_id);
  let active = state.activeSubsections[section.id];
  const allowAll = Number(section.show_all) !== 0;
  if (!active || (active === "all" && !allowAll) || (active !== "all" && !subsections.some(item => item.id === active))) active = allowAll || !roots.length ? "all" : roots[0].id;
  state.activeSubsections[section.id] = active;
  const current = subsections.find(item => item.id === active);
  const rootId = current?.parent_id || current?.id;
  const choose = async id => {
    if (state.activeSubsections[section.id] === id) return;
    const keep = subsectionGrantPath(section.id, id);
    await releaseViewGrants(grant => !keep.has(`${grant.kind}:${grant.id}`)); await refreshProtectedContent();
    state.activeSubsections[section.id] = id; state.currentResourceFolder = ""; renderPortfolioPanel();
  };
  const addTab = (container, label, id, isActive) => {
    const button = document.createElement("button"); button.type = "button"; button.className = `tab-button${isActive ? " active" : ""}`; button.textContent = label;
    button.addEventListener("click", () => choose(id).catch(error => alert(error.message))); container.append(button);
  };
  if (roots.length || allowAll) {
    const children = document.createElement("div"); children.className = activePortfolioCategory === "gallery" ? "album-tabs" : "portfolio-subtabs";
    if (allowAll) addTab(children, "全部", "all", active === "all");
    roots.forEach(item => addTab(children, `${item.name}${item.locked ? " · 已锁定" : ""}`, item.id, rootId === item.id)); host.append(children);
  }
  const grandchildren = subsections.filter(item => item.parent_id === rootId);
  if (grandchildren.length) {
    const children = document.createElement("div"); children.className = "portfolio-child-tabs";
    addTab(children, "本板块", rootId, active === rootId);
    grandchildren.forEach(item => addTab(children, `${item.name}${item.locked ? " · 已锁定" : ""}`, item.id, active === item.id)); host.append(children);
  }
  if (current?.locked) { lockedContentNotice(host, "subsection", current); return; }
  if (activePortfolioCategory === "resources") {
    if (state.resourcePanelNode) host.append(state.resourcePanelNode);
    renderOrganizedResources(active); return;
  }
  if (activePortfolioCategory === "content") {
    const grid = document.createElement("div"); grid.className = "content-grid";
    const items = (state.data?.content || []).filter(item => item.section_id === section.id && subsectionMatches(item.subsection_id, active));
    items.forEach(item => grid.append(contentCard(item, section))); if (!items.length) grid.append(empty("这个板块还没有可查看的文章。")); host.append(grid);
  } else {
    const photos = (state.data?.media || []).filter(item => item.section_id === section.id && subsectionMatches(item.subsection_id, active));
    const gallery = document.createElement("div"); gallery.className = "gallery";
    photos.forEach(photo => {
      const card = document.createElement("div"); card.className = `photo-card${photo.locked ? " is-locked" : ""}`; card.tabIndex = 0; card.setAttribute("role", "button");
      card.setAttribute("aria-label", photo.locked ? "解锁照片" : `查看照片：${photo.caption || photo.filename}`);
      const image = document.createElement("img"); image.loading = "lazy"; image.src = protectedMediaUrl(photo.previewUrl || photo.url); image.alt = photo.caption || "照片";
      const name = document.createElement("span"); name.className = "photo-name"; name.textContent = `${photo.caption || photo.filename}${photo.note ? ` · ${photo.note}` : ""}${photo.locked ? " · 已锁定" : ""}`;
      card.append(image, name); card.addEventListener("click", () => openImage(photo, photos));
      card.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openImage(photo, photos); } }); gallery.append(card);
    });
    if (!photos.length) gallery.append(empty("这个板块还没有可查看的照片。")); host.append(gallery);
  }
}
function renderOrganizedResources(requestedSubsection = null) {
  const sectionId = state.activePortfolioSection;
  const active = requestedSubsection || state.activeSubsections[sectionId] || "all";
  const folders = (state.data?.assetFolders || []).filter(item => (item.section_id || "section-resources") === sectionId);
  const assets = organizedAssets().filter(item => item.section_id === sectionId && subsectionMatches(item.subsection_id, active));
  if (!folders.some(item => item.id === state.currentResourceFolder)) state.currentResourceFolder = "";
  const current = state.currentResourceFolder || null;
  const folder = folders.find(item => item.id === current);
  document.getElementById("resource-path").textContent = resourceFolderPath(current);
  document.getElementById("resource-up").hidden = !current;
  const archive = assets.find(item => item.id === folder?.archive_asset_id && item.canDownload && !item.locked);
  const download = document.getElementById("resource-folder-download"); download.hidden = !archive; download.dataset.assetId = archive?.id || "";
  const grid = document.getElementById("resource-grid"); grid.replaceChildren();
  if (folder?.locked) { lockedContentNotice(grid, "assetFolder", folder); return; }
  folders.filter(item => (item.parent_id || null) === current).forEach(item => grid.append(resourceCardForFolder(item)));
  assets.filter(item => item.status === "ready" && (item.folder_id || null) === current).forEach(item => grid.append(resourceCardForAsset(item)));
  if (!grid.childElementCount) grid.append(empty("这个板块暂时没有可查看的文件与视频。"));
}
function initializeContentLocks() {
  document.addEventListener("contextmenu", event => {
    if (event.target.closest?.("#portfolio img,#portfolio video,#image-dialog img,#resource-viewer video,#resource-viewer audio,#reader-body img,.resource-card")) event.preventDefault();
  });
  document.addEventListener("dragstart", event => {
    if (event.target.closest?.("#portfolio img,#image-dialog img,#reader-body img")) event.preventDefault();
  });
  document.getElementById("image-dialog").addEventListener("close", () => {
    const photo = state.imageSequence[state.currentImageIndex];
    document.getElementById("image-preview").removeAttribute("src"); if (photo) closeProtectedView(`media:${photo.mediaId || photo.id}`);
  });
  document.getElementById("reader-dialog").addEventListener("close", () => {
    if (state.currentContent) closeProtectedView(`content:${state.currentContent.id}`);
    document.getElementById("reader-body").replaceChildren();
  });
  document.getElementById("resource-dialog").addEventListener("close", () => {
    if (state.activeResourceAsset) closeProtectedView(`asset:${state.activeResourceAsset.id}`);
  });
  window.addEventListener("pagehide", () => releaseViewGrants());
}
