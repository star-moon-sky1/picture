/* Studio photo queue and common content controls. Loaded before the main script;
 * initialization occurs after Studio has created its shared application state. */
const photoSelection = [];
const selectedPhotoIds = new Set();
let preparingPhotos = false;
let sendingPhotos = false;
let heicDecoderPromise;
let studioSectionCategory = "content";
function currentAssetSection() { return document.getElementById("asset-section")?.value || "section-resources"; }
function fillAssetSections() {
  const select = document.getElementById("asset-section"); if (!select) return;
  const current = select.value; select.replaceChildren();
  app.sections.filter(section => section.kind === "resources" || app.assets.some(item => item.scope !== "article" && item.section_id === section.id))
    .forEach(section => select.add(new Option(`${section.name}${section.kind !== "resources" ? "（旧栏目文件）" : ""}`, section.id)));
  if ([...select.options].some(option => option.value === current)) select.value = current;
}

function isHeicPhoto(file) { return /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf]$/i.test(file.type); }
async function decodeHeicPhoto(file) {
  heicDecoderPromise ||= import("/vendor/heic-to.js").catch(error => { heicDecoderPromise = null; throw error; });
  const { heicTo } = await heicDecoderPromise;
  return heicTo({ blob: file, type: "image/png" });
}
async function createPhotoMosaic(preview) {
  const decoded = await decodeLocalImage(preview);
  try {
    const canvas = document.createElement("canvas"); canvas.width = 8; canvas.height = 8;
    canvas.getContext("2d").drawImage(decoded.source, 0, 0, 8, 8);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", .6));
    if (!blob) throw new Error("无法生成马赛克预览");
    return blob;
  } finally { decoded.close(); }
}
async function ensurePhotoMosaic(item) {
  if (item.hasMosaic) return;
  const source = await fetch(`/api/admin/media/${item.id}/source?preview=1`);
  if (!source.ok) throw new Error("无法读取图片预览");
  const form = new FormData(); form.append("mosaic", await createPhotoMosaic(await source.blob()), "mosaic.webp");
  await api(`/api/admin/media/${item.id}/mosaic`, { method: "POST", body: form });
  item.hasMosaic = true;
}
function subsectionPath(item) {
  const parent = item.parent_id && app.subsections.find(row => row.id === item.parent_id);
  return parent ? `${parent.name} / ${item.name}` : item.name;
}
function fillSubsectionParents(selected = "") {
  const select = document.getElementById("subsection-parent");
  const sectionId = document.getElementById("subsection-section").value;
  const currentId = document.getElementById("subsection-id").value;
  select.replaceChildren(new Option("直属大板块（建立小板块）", ""));
  app.subsections.filter(item => item.section_id === sectionId && !item.parent_id && item.id !== currentId)
    .forEach(item => select.add(new Option(item.name, item.id)));
  select.value = selected;
}

function contentSecurityButton(kind, item, label = "下载权限 / 内容锁") {
  const control = button(label, "btn small ghost");
  control.addEventListener("click", () => editContentSecurity(kind, item).catch(error => alert(error.message)));
  return control;
}
async function editContentSecurity(kind, item) {
  const config = await api("/api/admin/security");
  const rule = config.downloads.find(row => row.target_kind === kind && row.target_id === item.id);
  let lock = config.locks.find(row => row.target_kind === kind && row.target_id === item.id);
  const dialog = document.createElement("dialog"); dialog.className = "organize-dialog";
  const form = document.createElement("form");
  const heading = document.createElement("h3"); heading.textContent = item.name || item.title || item.caption || item.display_name || item.filename;
  const downloadLabel = document.createElement("label"); downloadLabel.textContent = kind === "content" ? "本文转 PDF 下载权限" : "下载权限";
  const select = document.createElement("select");
  [["inherit", "沿用默认 / 上级限制"], ["public", "所有有查看权限的人"], ["member", "仅审核用户"], ["selected", "仅指定用户"], ["excluded", "不给指定用户下载"], ["private", "仅站长"], ["none", "关闭下载"]]
    .forEach(([value, text]) => select.add(new Option(text, value)));
  select.value = rule?.mode || "inherit"; downloadLabel.append(select);
  const users = document.createElement("div"); users.className = "audience-picker";
  renderAudiencePicker(users, rule?.user_ids || []);
  const showUsers = () => users.classList.toggle("hidden", !visibilityUsesAudience(select.value));
  select.addEventListener("change", showUsers); showUsers();
  const lockLabel = document.createElement("label"); lockLabel.className = "checkbox-field";
  const enabled = document.createElement("input"); enabled.type = "checkbox"; enabled.checked = Boolean(lock?.enabled);
  lockLabel.append(enabled, "开启一次性密码锁");
  const codeLabel = document.createElement("label"); codeLabel.textContent = "六位数字密码";
  const code = document.createElement("input"); code.type = "password"; code.inputMode = "numeric"; code.pattern = "[0-9]{6}"; code.maxLength = 6; code.autocomplete = "new-password";
  code.placeholder = enabled.checked ? "留空保留现有状态；填写可更换密码" : "例如 012345"; codeLabel.append(code);
  const help = document.createElement("p"); help.className = "status";
  help.textContent = `${lock?.enabled ? (lock.consumed_at ? "当前密码已用完，需要设置新密码。" : "当前密码尚未使用。") : "当前未上锁。"}只有已有查看权限的人可输入密码。密码成功使用一次即作废；本次阅读最多保留 15 分钟，关闭或刷新后需新密码。下载仍受全部上级限制。`;
  const status = document.createElement("p"); status.className = "status"; status.setAttribute("role", "status");
  const controls = document.createElement("div"); controls.className = "actions";
  const save = button("保存设置", "btn"); save.type = "submit";
  const cancel = button("取消"); cancel.addEventListener("click", () => dialog.close()); controls.append(save, cancel);
  form.append(heading, downloadLabel, users, lockLabel, codeLabel, help, controls, status); dialog.append(form); document.body.append(dialog);
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    const download = { mode: select.value, userIds: selectedAudienceIds(users) };
    if (visibilityUsesAudience(download.mode) && !download.userIds.length) { status.textContent = "请勾选至少一位用户。"; return; }
    const payload = { download };
    if (enabled.checked !== Boolean(lock?.enabled) || code.value) payload.lock = { enabled: enabled.checked, code: code.value };
    if (payload.lock?.enabled && !/^\d{6}$/.test(code.value)) { status.textContent = "请输入恰好六位数字。"; return; }
    save.disabled = true; cancel.disabled = true; status.textContent = "正在保存…";
    try {
      let mosaicWarning = false;
      if (kind === "media" && payload.lock?.enabled) {
        try { await ensurePhotoMosaic(item); } catch { mosaicWarning = true; }
      }
      await api(`/api/admin/security/${kind}/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      code.value = ""; status.textContent = mosaicWarning ? "已保存。此图片暂用安全占位图隐藏内容；原图不会暴露。" : "已保存。新权限立即生效。"; save.textContent = "已保存";
      // A saved secret is deliberately never returned by the server.
      if (payload.lock) lock = { enabled: payload.lock.enabled ? 1 : 0, consumed_at: null };
    } catch (error) { status.textContent = `保存失败：${error.message}`; }
    finally { save.disabled = false; cancel.disabled = false; }
  });
  dialog.showModal();
}
async function editPhotoNote(item, control) {
  const note = prompt("照片备注（可留空，展示在照片名旁边）", item.note || "");
  if (note === null) return;
  const unlock = lockMediaCard(item, control); if (!unlock) return;
  control.textContent = "正在保存…";
  try {
    const saved = await api(`/api/admin/media/${item.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }) });
    item.note = saved.note; control.textContent = "备注已保存";
    const title = control.closest(".media-card")?.querySelector(".media-info strong");
    if (title) title.textContent = `${item.caption || item.filename}${item.note ? ` · ${item.note}` : ""}`;
  } catch (error) { control.textContent = "备注"; alert(`备注保存失败：${error.message}`); }
  finally { unlock(); }
}
function attachPhotoControls(card, item, actions) {
  card.dataset.mediaId = item.id;
  const label = document.createElement("label"); label.className = "photo-select-label";
  const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = selectedPhotoIds.has(item.id);
  checkbox.setAttribute("aria-label", `选择照片 ${item.caption || item.filename}`);
  checkbox.addEventListener("change", () => { checkbox.checked ? selectedPhotoIds.add(item.id) : selectedPhotoIds.delete(item.id); updatePhotoBatchCount(); });
  label.append(checkbox, "选择"); card.prepend(label);
  const note = button("备注"); note.addEventListener("click", () => editPhotoNote(item, note));
  actions.append(note, contentSecurityButton("media", item));
}
function updatePhotoBatchCount() {
  const visibleIds = new Set([...document.querySelectorAll("#media-grid .media-card[data-media-id]")].map(card => card.dataset.mediaId));
  for (const id of selectedPhotoIds) if (!visibleIds.has(id)) selectedPhotoIds.delete(id);
  document.getElementById("photo-batch-count").textContent = `已选择 ${selectedPhotoIds.size} 张`;
  document.getElementById("photo-batch-move").disabled = !selectedPhotoIds.size;
}
function fillPhotoMoveTargets() {
  const select = document.getElementById("photo-batch-target"); const current = select.value;
  select.replaceChildren();
  app.sections.filter(section => section.kind === "gallery").forEach(section => {
    const group = document.createElement("optgroup"); group.label = section.name;
    group.append(new Option("未分类", JSON.stringify([section.id, ""])));
    app.subsections.filter(item => item.section_id === section.id).forEach(item => group.append(new Option(subsectionPath(item), JSON.stringify([section.id, item.id]))));
    select.append(group);
  });
  if ([...select.options].some(option => option.value === current)) select.value = current;
}
async function moveSelectedPhotos() {
  const ids = [...selectedPhotoIds]; if (!ids.length) return;
  if (ids.some(id => app.busyMediaIds.has(id))) { alert("部分照片正在保存，请稍后再移动。"); return; }
  const [sectionId, subsectionId] = JSON.parse(document.getElementById("photo-batch-target").value);
  const control = document.getElementById("photo-batch-move"); control.disabled = true;
  const unlocks = ids.map(id => lockMediaCard({ id }, document.querySelector(`.media-card[data-media-id="${id}"] button`))).filter(Boolean);
  const notice = document.getElementById("media-notice"); notice.textContent = `正在移动 ${ids.length} 张照片…`;
  try {
    const result = await api("/api/admin/media/batch-move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, sectionId, subsectionId }) });
    selectedPhotoIds.clear(); await Promise.all([loadAlbumsAndMedia(), loadSubsections()]);
    notice.textContent = `已移动 ${result.moved} 张照片，原片、备注和照片权限保持不变。`;
  } catch (error) { notice.textContent = `移动失败：${error.message}`; }
  finally { unlocks.forEach(unlock => unlock()); updatePhotoBatchCount(); }
}

function removePhotoSelection(entry) {
  const index = photoSelection.indexOf(entry); if (index >= 0) photoSelection.splice(index, 1);
  if (entry.url) URL.revokeObjectURL(entry.url);
  entry.node.remove();
}
async function addSelectedPhotos(files) {
  if (preparingPhotos || sendingPhotos) { alert("请等当前处理完成后再添加照片。"); return; }
  preparingPhotos = true;
  const notice = document.getElementById("media-notice");
  const submit = document.querySelector("#media-form button[type=submit]"); submit.disabled = true;
  try {
    for (const file of files) {
      if (photoSelection.length >= 100) { notice.textContent = "一次最多选择 100 张，请先上传当前队列。"; break; }
      if (photoSelection.some(entry => entry.file.name === file.name && entry.file.size === file.size && entry.file.lastModified === file.lastModified)) { notice.textContent = `“${file.name}”已在队列中。`; continue; }
      const entry = { file, token: crypto.randomUUID() }; photoSelection.push(entry);
      const node = document.createElement("article"); node.className = "photo-upload-preview"; entry.node = node;
      const image = document.createElement("img"); image.alt = file.name;
      const title = document.createElement("strong"); title.textContent = file.name;
      const status = document.createElement("p"); status.className = "status"; entry.status = status; status.textContent = isHeicPhoto(file) ? "正在转换 HEIC 预览…" : "正在生成预览…";
      const remove = button("移除"); entry.remove = remove; remove.addEventListener("click", () => removePhotoSelection(entry));
      node.append(image, title, status, remove); document.getElementById("photo-selection-previews").append(node);
      try {
        if (!file.size || file.size > 20 * 1024 * 1024) throw new Error("单张照片需大于 0 且不超过 20MB");
        if (!isHeicPhoto(file) && !/^image\/(jpeg|png|webp|gif|avif)$/i.test(file.type)) throw new Error("请选择 JPEG、PNG、WebP、GIF、AVIF 或 HEIC/HEIF 图片");
        entry.preview = await createCompressedPreview(file);
        entry.mosaic = await createPhotoMosaic(entry.preview);
        entry.hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))].map(n => n.toString(16).padStart(2, "0")).join("");
        if (!photoSelection.includes(entry)) continue;
        entry.url = URL.createObjectURL(entry.preview); image.src = entry.url;
        const [duplicate] = await api("/api/admin/media/duplicates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: [{ sha256: entry.hash, name: file.name, size: file.size }] }) });
        const queuedDuplicate = photoSelection.some(other => other !== entry && other.hash === entry.hash);
        entry.duplicate = duplicate.duplicate || queuedDuplicate;
        if (entry.duplicate) {
          status.textContent = `${duplicate.exact || queuedDuplicate ? "检测到重复图片" : "发现同名同大小的旧照片，可能重复"}。默认跳过；如需保留两份，请勾选。`;
          const label = document.createElement("label"); const keep = document.createElement("input"); keep.type = "checkbox";
          keep.addEventListener("change", () => { entry.allowDuplicate = keep.checked; }); label.append(keep, "仍然上传此重复图片"); node.append(label);
        } else status.textContent = `待上传 · ${formatBytes(file.size)}`;
      } catch (error) { entry.error = error.message; status.textContent = `无法准备：${error.message}，可移除后重新选择。`; }
    }
  } finally { preparingPhotos = false; submit.disabled = false; document.getElementById("media-file").value = ""; }
}
async function submitPhotoUploads(event) {
  event.preventDefault(); if (preparingPhotos || sendingPhotos) return;
  const notice = document.getElementById("media-notice");
  const choice = visibilityPayload("media-visibility", "media-user-picker"); if (!validateVisibilityChoice(choice, notice)) return;
  const entries = photoSelection.filter(entry => !entry.error && (!entry.duplicate || entry.allowDuplicate));
  if (!entries.length) { notice.textContent = "请选择照片；重复照片需明确勾选后才会上传。"; return; }
  const sectionId = document.getElementById("media-section").value;
  const subsectionId = document.getElementById("media-album").value;
  if (!sectionId) { notice.textContent = "请先选择图片大板块。"; return; }
  const caption = document.getElementById("media-caption").value.trim();
  const submit = event.currentTarget.querySelector("button[type=submit]"); sendingPhotos = true; submit.disabled = true;
  let completed = 0; let failures = 0;
  try {
    for (const entry of entries) {
      entry.remove.disabled = true;
      const job = createUploadJob(entry.file, "photo"); job.setSessionId(entry.token);
      try {
        const form = new FormData();
        form.append("file", entry.file); form.append("preview", entry.preview); form.append("mosaic", entry.mosaic, "mosaic.webp");
        form.append("sectionId", sectionId); form.append("subsectionId", subsectionId); form.append("kind", "photo");
        form.append("caption", caption || entry.file.name); form.append("visibility", choice.visibility); form.append("allowedUserIds", JSON.stringify(choice.allowedUserIds));
        form.append("uploadToken", entry.token); if (entry.allowDuplicate) form.append("allowDuplicate", "1");
        entry.status.textContent = "正在上传…";
        await uploadPartWithRetry("/api/admin/media", form, job, { label: "照片", onProgress: metric => {
          const percent = metric.total ? metric.loaded / metric.total * 100 : 0;
          job.update(Math.min(99, percent), percent >= 100 ? "正在保存并校验照片…" : `已传输 ${Math.round(percent)}%`); job.setRate(metric.bytesPerSecond);
        } });
        await job.waitUntilResumed(); job.finish("照片已保存"); completed++; removePhotoSelection(entry);
      } catch (error) {
        if (job.isCancelled() || error.cancelled) {
          try {
            await api(`/api/admin/photo-uploads/${entry.token}`, { method: "DELETE" }); job.cancelled("已取消并清理"); removePhotoSelection(entry);
          } catch (cancelError) { entry.error = "等待取消清理"; job.cancelled(`取消尚未送达：${cancelError.message}`, { autoRemove: false }); entry.status.textContent = "取消未送达，请联网后点击重试清理";
            const retry = button("重试清理"); entry.node.append(retry); retry.addEventListener("click", async () => { retry.disabled = true; try { await api(`/api/admin/photo-uploads/${entry.token}`, { method: "DELETE" }); removePhotoSelection(entry); } catch (failure) { retry.disabled = false; entry.status.textContent = failure.message; } });
          }
        } else {
          failures++; job.fail(error.message); entry.status.textContent = `失败：${error.message}，再次点击上传可重试。`;
          if (error.status === 409) { entry.duplicate = true; entry.status.textContent = `${error.message}；请移除后重新选择，以确认重复上传。`; }
        }
      } finally { entry.remove.disabled = false; }
    }
    await Promise.all([loadAlbumsAndMedia(), loadSubsections(), loadDashboard()]);
    refreshMediaSubsectionOptions(sectionId, subsectionId); document.getElementById("media-subsection").value = subsectionId; renderMedia();
    notice.textContent = `已上传 ${completed} 张${failures ? `，${failures} 张失败，可在预览队列重试` : ""}。`;
  } catch (error) { notice.textContent = `上传已处理，但列表刷新失败：${error.message}`; }
  finally { sendingPhotos = false; submit.disabled = false; }
}

function initializePhotoManagement() {
  document.getElementById("asset-section").addEventListener("change",()=>{app.currentAssetFolder="";refreshAssetSubsectionOptions();renderAssetFolderOptions();renderAssetBrowser()});
  document.querySelectorAll("[data-studio-category]").forEach(control=>control.addEventListener("click",()=>{
    studioSectionCategory=control.dataset.studioCategory;switchView("sections");resetSectionForm();document.getElementById("section-kind").value=studioSectionCategory;
    resetSubsectionForm();renderSectionList();renderSubsectionList();
  }));
  document.getElementById("media-file").addEventListener("change", event => addSelectedPhotos([...event.target.files]));
  const drop = document.getElementById("photo-drop-zone");
  drop.addEventListener("dragover", event => { event.preventDefault(); drop.classList.add("is-dragging"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("is-dragging"));
  drop.addEventListener("drop", event => { event.preventDefault(); drop.classList.remove("is-dragging"); addSelectedPhotos([...event.dataTransfer.files]); });
  document.getElementById("photo-select-all").addEventListener("click", () => {
    document.querySelectorAll("#media-grid .photo-select-label input").forEach(input => { input.checked = true; selectedPhotoIds.add(input.closest(".media-card").dataset.mediaId); }); updatePhotoBatchCount();
  });
  document.getElementById("photo-clear-selection").addEventListener("click", () => { selectedPhotoIds.clear(); renderMedia(); });
  document.getElementById("photo-batch-move").addEventListener("click", moveSelectedPhotos);
  document.getElementById("subsection-section").addEventListener("change", () => fillSubsectionParents());
  for (const [kind, inputId, buttonId] of [["section", "section-id", "section-security"], ["subsection", "subsection-id", "subsection-security"], ["content", "content-id", "content-security"]]) {
    document.getElementById(buttonId).addEventListener("click", () => {
      const id = document.getElementById(inputId).value;
      if (!id) { alert("请先保存内容，再设置下载权限和密码。"); return; }
      const source = kind === "section" ? app.sections : kind === "subsection" ? app.subsections : app.content;
      editContentSecurity(kind, source.find(item => item.id === id) || { id }).catch(error => alert(error.message));
    });
  }
}
