import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { parseHTML } from "linkedom";

// Real Studio markup and controller, with a DOM (not a visual/device browser).
const html = await readFile("public/studio.html", "utf8");
const window = parseHTML(html); const { document, HTMLSelectElement, HTMLInputElement } = window;
Object.defineProperty(HTMLSelectElement.prototype, "value", {
  configurable: true, get() { return (this.querySelector("option[selected]") || this.options[0])?.value || ""; },
  set(value) { [...this.options].forEach(option => option.toggleAttribute("selected", option.value === value)); },
});
HTMLSelectElement.prototype.add = function (option) { this.append(option); };
Object.defineProperty(HTMLInputElement.prototype, "checked", {
  configurable: true, get() { return this.hasAttribute("checked"); }, set(value) { this.toggleAttribute("checked", Boolean(value)); },
});
const clone = value => JSON.parse(JSON.stringify(value));
const node = name => document.getElementById(`entry-background-${name}`);
const config = { mode: "all", sectionIds: [], subsectionIds: [], photoIds: [] };
let saved = { config, limit: 40, invalidConfig: false,
  sections: [{ id: "gallery", name: "Gallery" }, { id: "other", name: "Other" }],
  subsections: [{ id: "parent", section_id: "gallery", parent_id: null, name: "Parent" }, { id: "child", section_id: "gallery", parent_id: "parent", name: "Child" }],
  photos: Array.from({ length: 62 }, (_, i) => ({ id: `photo-${i}`, filename: `photo-${i}.jpg`, caption: `Photo ${i}`,
    section_id: i === 61 ? "other" : "gallery", subsection_id: i === 0 ? "child" : null, subsection_parent_id: i === 0 ? "parent" : null, previewUrl: `/api/admin/media/photo-${i}/source?preview=1` })) };
let failure = ""; let deferredSave; const writes = [];
const context = vm.createContext({ document, console,
  Option: function (text, value) { const option = document.createElement("option"); option.textContent = text; option.value = value; return option; },
  api: async (path, options) => {
    assert.equal(path, "/api/admin/entry-background");
    if (failure) throw new Error(failure);
    if (options?.method === "PUT") {
      writes.push(JSON.parse(options.body));
      if (deferredSave) await deferredSave.promise;
      saved = { ...saved, config: JSON.parse(options.body) };
    }
    return clone(saved);
  },
});
const run = code => vm.runInContext(code, context);
const state = () => clone(run("entryBackgroundState"));
function changeMode(mode) { node("mode").value = mode; node("mode").dispatchEvent(new window.Event("change")); }
function choose(id, checked = true) {
  const checkbox = node("form").querySelector(`input[type="checkbox"][value="${id}"]`); assert.ok(checkbox, id);
  checkbox.checked = checked; checkbox.dispatchEvent(new window.Event("change")); return checkbox;
}
run(await readFile("public/studio-background.js", "utf8")); run("initializeEntryBackgroundSettings()");
assert.match(html, /if\(name==="settings"\)loadEntryBackgroundSettings\(\)/);
assert.equal(node("form").closest("#settings-form"), null, "separate forms avoid resetting unrelated settings");
assert.equal(node("controls").hasAttribute("disabled"), true);
failure = "Network unavailable";
await run("loadEntryBackgroundSettings()");
assert.match(node("notice").textContent, /加载失败/); assert.equal(node("refresh").disabled, false);
assert.equal(node("controls").disabled, true);
failure = ""; await run("loadEntryBackgroundSettings()");
assert.equal(node("controls").disabled, false); assert.equal(node("mode").value, "all");
assert.equal(node("photos").querySelectorAll("img").length, 0, "no thumbnail downloads in all-photo mode");
changeMode("sections"); choose("parent");
assert.deepEqual(state().config.subsectionIds, ["parent"]);
assert.match(node("sections").textContent, /Gallery \/ Parent \/ Child/);
assert.match(node("summary").textContent, /1 张/);
await run("saveEntryBackgroundSettings()");
assert.deepEqual(writes.at(-1), { mode: "sections", sectionIds: [], subsectionIds: ["parent"], photoIds: [] });

changeMode("photos");
assert.equal(node("photos").querySelectorAll("img").length, 48);
assert.equal(node("more").hidden, false);
assert.ok([...node("photos").querySelectorAll("img")].every(image => image.loading === "lazy"));
choose("photo-0"); choose("photo-1");
node("filter").value = "section:other"; node("filter").dispatchEvent(new window.Event("change"));
assert.equal(node("photos").querySelectorAll("img").length, 1);
choose("photo-61"); assert.deepEqual(state().config.photoIds, ["photo-0", "photo-1", "photo-61"]);
node("search").value = "does not exist"; node("search").dispatchEvent(new window.Event("input"));
assert.match(node("photos").textContent, /没有符合筛选/); assert.equal(state().config.photoIds.length, 3);
await run("loadEntryBackgroundSettings()");
assert.equal(state().config.photoIds.length, 3); assert.match(node("notice").textContent, /未保存的选择已保留/);

deferredSave = {}; deferredSave.promise = new Promise(resolve => { deferredSave.resolve = resolve; });
const pending = run("saveEntryBackgroundSettings()");
assert.equal(node("controls").disabled, true); assert.equal(node("refresh").disabled, true);
assert.match(node("notice").textContent, /正在保存/);
await run("saveEntryBackgroundSettings()"); assert.equal(writes.length, 2, "duplicate submit is ignored while saving");
deferredSave.resolve(); await pending; deferredSave = null;
assert.match(node("notice").textContent, /已保存/); assert.equal(state().dirty, false);
assert.deepEqual(writes.at(-1), { mode: "photos", sectionIds: [], subsectionIds: [], photoIds: ["photo-0", "photo-1", "photo-61"] });
await run("loadEntryBackgroundSettings()"); assert.equal(state().config.photoIds.length, 3, "saved selection survives reload");
node("filter").value = ""; node("search").value = ""; node("filter").dispatchEvent(new window.Event("change"));
node("more").click(); assert.equal(node("photos").querySelectorAll("img").length, 62);
assert.equal(node("more").hidden, true);
node("clear").click();
assert.deepEqual(state().config.photoIds, []); assert.match(node("summary").textContent, /没有可用照片/);
await run("saveEntryBackgroundSettings()"); assert.deepEqual(writes.at(-1).photoIds, []);

run("entryBackgroundState.config.photoIds = Array.from({length:40}, (_,i) => 'photo-'+i); renderEntryBackgroundSettings()");
const rejected = choose("photo-40");
assert.equal(rejected.checked, false); assert.equal(state().config.photoIds.length, 40); assert.match(node("notice").textContent, /最多选择 40/);
choose("photo-0", false); choose("photo-40"); assert.equal(state().config.photoIds.length, 40);
failure = "Saved scope changed; refresh";
await run("saveEntryBackgroundSettings()");
assert.match(node("notice").textContent, /保存失败/); assert.equal(state().dirty, true); assert.equal(node("controls").disabled, false);
failure = "";
// A photo becoming private is not silently replaced by another one.
saved.photos = saved.photos.filter(photo => photo.id !== "photo-40");
await run("loadEntryBackgroundSettings()");
assert.equal(node("unavailable").hidden, false); assert.match(node("unavailable-text").textContent, /1 项/);
node("clear-unavailable").click(); assert.equal(state().config.photoIds.includes("photo-40"), false);
await run("saveEntryBackgroundSettings()"); assert.equal(writes.at(-1).photoIds.length, 39);
changeMode("off"); await run("saveEntryBackgroundSettings()");
assert.deepEqual(writes.at(-1), { mode: "off", sectionIds: [], subsectionIds: [], photoIds: [] });
assert.match(node("summary").textContent, /纯色背景/);
console.log("entry background selector loading, hierarchy, multi-select, previews, draft persistence and save DOM regressions passed");
