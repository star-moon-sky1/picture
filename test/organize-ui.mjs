import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import vm from "node:vm";
import { parseHTML } from "linkedom";

// DOM interaction checks, not a substitute for visual/device browser testing.
function domContext(html) {
  const window = parseHTML(html);
  const { document, HTMLElement, HTMLSelectElement, HTMLInputElement } = window;
  Object.defineProperty(HTMLSelectElement.prototype, "value", {
    configurable: true,
    get() { return (this.querySelector("option[selected]") || this.options[0])?.value || ""; },
    set(value) { [...this.options].forEach(option => option.toggleAttribute("selected", option.value === String(value))); },
  });
  HTMLSelectElement.prototype.add = function (option) { this.append(option); };
  Object.defineProperty(HTMLInputElement.prototype, "checked", {
    configurable: true, get() { return this.hasAttribute("checked"); },
    set(value) { this.toggleAttribute("checked", Boolean(value)); },
  });
  HTMLElement.prototype.reset = function () {
    this.querySelectorAll("input,textarea").forEach(input => { input.value = input.getAttribute("value") || ""; });
    this.querySelectorAll("select").forEach(select => { select.value = select.options[0]?.value || ""; });
  };
  HTMLElement.prototype.showModal = function () { this.open = true; };
  HTMLElement.prototype.close = function () { this.open = false; this.dispatchEvent(new window.Event("close")); };
  window.setInterval = () => 0;
  const alerts = [];
  const context = vm.createContext({
    window, document, Element: window.Element, Node: window.Node, Event: window.Event,
    console, URL, crypto: webcrypto, Response, File, Blob, FormData, TextEncoder,
    setTimeout, clearTimeout, performance, location: { href: "https://example.test/", origin: "https://example.test" },
    navigator: { onLine: true }, matchMedia: () => ({ matches: false, addEventListener() {} }),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Option: function (text, value) { const node = document.createElement("option"); node.textContent = text; node.value = value; return node; },
    alert: message => alerts.push(message), confirm: () => true, prompt: () => null,
    fetch: async path => { throw new Error(`Unexpected network request: ${path}`); },
  });
  return { context, document, window, alerts, run: code => vm.runInContext(code, context) };
}

const sections = [
  { id: "articles", kind: "content", name: "Articles", show_all: 1 },
  { id: "photos", kind: "gallery", name: "Photos", show_all: 1 },
  { id: "files", kind: "resources", name: "Files", show_all: 1 },
];
const subsections = [
  { id: "photo-parent", section_id: "photos", name: "Parent" },
  { id: "photo-child", parent_id: "photo-parent", section_id: "photos", name: "Child" },
  { id: "file-parent", section_id: "files", name: "Docs" },
];

const studioHtml = await readFile("public/studio.html", "utf8");
const studio = domContext(studioHtml);
studio.run(await readFile("public/studio-organize.js", "utf8"));
studio.run(await readFile("public/studio-background.js", "utf8"));
const main = [...studioHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1]).find(source => source.includes("const app ="));
assert.ok(main);
studio.run(main.replace("resetChangelog();checkSession();", "resetChangelog();"));
studio.run(`app.sections=${JSON.stringify(sections)};app.subsections=${JSON.stringify(subsections)};
  app.media=[{id:'photo-a',kind:'photo',filename:'a.png',caption:'Photo A',note:'A note',section_id:'photos',subsection_id:'photo-child',previewUrl:'/media/photo-a?preview=1',visibility:'public'}];
  app.users=[{id:'alice',username:'alice',nickname:'Alice',status:'approved'}];
  app.assetFolders=[{id:'custom-folder',section_id:'files',name:'Custom folder'}];
  refreshSectionOptions();renderMedia();`);
assert.equal(studio.document.querySelectorAll("#media-grid .media-card").length, 1);
assert.match(studio.document.querySelector("#media-grid").textContent, /A note/);
assert.match(studio.document.querySelector("#media-grid").textContent, /备注/);
assert.match(studio.document.querySelector("#media-grid").textContent, /下载权限 \/ 内容锁/);
studio.document.getElementById("photo-select-all").click();
assert.equal(studio.document.getElementById("photo-batch-count").textContent, "已选择 1 张");
assert.equal(studio.document.getElementById("photo-batch-move").disabled, false);
studio.document.getElementById("photo-clear-selection").click();
assert.equal(studio.document.getElementById("photo-batch-count").textContent, "已选择 0 张");
assert.match(studio.document.getElementById("photo-batch-target").textContent, /Parent \/ Child/);
studio.document.querySelector('[data-studio-category="gallery"]').click();
assert.equal(studio.document.getElementById("section-kind").value, "gallery");
assert.deepEqual([...studio.document.getElementById("subsection-section").options].map(item => item.value), ["photos"]);
studio.document.getElementById("subsection-parent").value = "photo-parent";
assert.equal(studio.document.getElementById("subsection-parent").value, "photo-parent");
assert.ok(studio.document.getElementById("content-section-assets-panel").hasAttribute("hidden"));
assert.ok(studio.document.getElementById("asset-upload-photo").hasAttribute("hidden"));
studio.run('fillAssetSections();document.getElementById("asset-section").value="files";renderAssetBrowser();');
assert.match(studio.document.getElementById("asset-browser").textContent, /Custom folder/);

// Saving the photo permission is a partial update with durable same-card feedback.
const writes = [];
studio.context.fetch = async (path, init) => {
  writes.push({ path, body: init?.body && JSON.parse(init.body) });
  return Response.json({ id: "photo-a", visibility: "public", allowed_user_ids: [] });
};
await studio.run(`(async()=>{
  const card=document.querySelector('#media-grid .media-card');
  const save=[...card.querySelectorAll('button')].find(button=>button.textContent==='保存照片权限');
  await updateMediaVisibility(app.media[0],card.querySelector('select[aria-label$="的可见范围"]'),card.querySelector('.audience-picker'),save);
})()`);
assert.deepEqual(writes[0].body, { visibility: "public", allowedUserIds: [] });
assert.match(studio.document.querySelector(".media-save-status").textContent, /已保存/);

// Common security editor: invalid PINs must not submit or half-save downloads.
studio.context.fetch = async (path, init) => {
  if (!init?.method) return Response.json({ downloads: [], locks: [] });
  writes.push({ path, body: JSON.parse(init.body) }); return Response.json({ ok: true });
};
await studio.run('app.media[0].hasMosaic=true;editContentSecurity("media",app.media[0])');
const securityDialog = studio.document.querySelector("dialog.organize-dialog");
securityDialog.querySelector('.checkbox-field input').checked = true;
const code = securityDialog.querySelector('input[type="password"]');
const form = securityDialog.querySelector("form");
code.value = "123";
const before = writes.length;
form.dispatchEvent(new studio.window.Event("submit", { bubbles: true, cancelable: true }));
assert.equal(writes.length, before);
assert.match(securityDialog.querySelector('[role="status"]').textContent, /六位/);
code.value = "012345";
form.dispatchEvent(new studio.window.Event("submit", { bubbles: true, cancelable: true }));
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(writes.at(-1).body.lock.code, "012345");
assert.equal(code.value, "");
assert.match(securityDialog.querySelector('[role="status"]').textContent, /已保存/);
securityDialog.close();
assert.deepEqual(studio.alerts, []);

const portfolio = domContext(await readFile("public/index.html", "utf8"));
portfolio.context.state = { data: {
  sections, subsections, content: [], media: [{ id: "photo-a", section_id: "photos", subsection_id: "photo-child", caption: "Photo A", note: "A note", previewUrl: "/media/photo-a?mosaic=1", locked: true }],
  assets: [{ id: "asset-a", section_id: "files", folder_id: null, status: "ready", kind: "video" }],
  assetFolders: [{ id: "custom-folder", section_id: "files", name: "Custom folder" }],
}, activeSubsections: {}, imageSequence: [] };
portfolio.context.portfolioSections = () => portfolio.context.state.data.sections;
portfolio.context.empty = text => { const node = portfolio.document.createElement("p"); node.textContent = text; return node; };
portfolio.context.resourceFolderPath = () => "Files";
portfolio.context.resourceCardForFolder = item => portfolio.context.empty(item.name);
portfolio.context.resourceCardForAsset = item => portfolio.context.empty(item.id);
portfolio.context.contentCard = item => portfolio.context.empty(item.title);
portfolio.context.api = async () => portfolio.context.state.data;
portfolio.context.fetch = async () => Response.json({ ok: true });
portfolio.run(await readFile("public/portfolio-organize.js", "utf8"));
portfolio.run('function renderPortfolio(){renderOrganizedPortfolio()} function renderPortfolioPanel(){renderOrganizedPanel()}');
portfolio.run('activePortfolioCategory="gallery";renderPortfolio();');
assert.deepEqual([...portfolio.document.querySelectorAll("#portfolio-tabs button")].map(node => node.textContent), ["文章", "图片", "文件与视频"]);
assert.match(portfolio.document.querySelector(".photo-name").textContent, /A note.*已锁定/);
assert.match(portfolio.document.querySelector(".photo-card img").getAttribute("src"), /mosaic=1/);
portfolio.run('state.activeSubsections.photos="photo-parent";renderPortfolioPanel();');
assert.equal(portfolio.document.querySelectorAll(".photo-card").length, 1);
assert.match(portfolio.document.querySelector(".portfolio-child-tabs").textContent, /Child/);

// Navigating deeper keeps the redeemed parent lock, while leaving a sibling revokes it.
portfolio.run(`contentViewGrants.set('section:photos',{kind:'section',id:'photos',owner:'section:photos',token:'${"a".repeat(64)}',expiresAt:Date.now()+10000});
  contentViewGrants.set('subsection:photo-parent',{kind:'subsection',id:'photo-parent',owner:'subsection:photo-parent',token:'${"b".repeat(64)}',expiresAt:Date.now()+10000});`);
await portfolio.run(`(async()=>{const keep=subsectionGrantPath('photos','photo-child');await releaseViewGrants(grant=>!keep.has(grant.kind+':'+grant.id))})()`);
assert.equal(portfolio.run("contentViewGrants.size"), 2);
await portfolio.run(`(async()=>{const keep=subsectionGrantPath('photos','all');await releaseViewGrants(grant=>!keep.has(grant.kind+':'+grant.id))})()`);
assert.equal(portfolio.run("contentViewGrants.size"), 1);
portfolio.run('activePortfolioCategory="resources";state.activePortfolioSection="files";renderPortfolio();');
assert.match(portfolio.document.getElementById("resource-grid").textContent, /Custom folder/);
assert.match(portfolio.document.getElementById("resource-grid").textContent, /asset-a/);
assert.deepEqual(portfolio.alerts, []);
console.log("photo queue controls, permission feedback, lock editor and three-category DOM regression passed");
