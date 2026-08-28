import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);
const css = await readFile(new URL("public/material.css", root), "utf8");
const theme = await readFile(new URL("public/theme.js", root), "utf8");
const pages = await Promise.all([
  "public/index.html",
  "public/login.html",
  "public/studio.html",
].map(async (path) => [path, await readFile(new URL(path, root), "utf8")]));

assert.match(css, /--xyj-motion-rebound:\s*\.64s/);
assert.match(css, /--xyj-motion-settle:\s*\.56s/);
assert.match(css, /--xyj-page-cream:\s*#f6efe4/);
assert.match(css, /background-image:\s*none\s*!important/);
assert.match(css, /--xyj-frost-grain-opacity:\s*\.36/);
assert.match(css, /feTurbulence/);
assert.match(css, /--xyj-liquid-press-fill/);
assert.match(css, /\.is-control-pressed,\s*\.control-bounce-release/);
assert.match(css, /blur\(\.35px\)\s+saturate\(1\.46\)/);
assert.match(css, /\.harmony-light-bloom\.is-releasing\s*\{\s*animation-duration:\s*\.54s/);
assert.match(css, /\.night-mode-switch\.is-on\s*\{\s*--xyj-knob-x:\s*30px/);
assert.match(css, /\.night-mode-switch\.is-on \.night-mode-fill[\s\S]*?background-color:\s*#3d8fd0/);
assert.match(css, /\.night-mode-switch:is\(\.is-control-pressed, \.control-bounce-release\) \.night-mode-knob[\s\S]*?blur\(\.20px\)/);
for (const color of ["--xyj-blue", "--xyj-teal", "--xyj-amber", "--xyj-coral", "--xyj-violet"]) {
  assert.match(css, new RegExp(`${color}:\\s*#`), `${color} must be present in the restrained color palette`);
}

new Function(theme);
assert.match(theme, /value === "dark" \|\| value === "light"/);
assert.match(theme, /value === "system"/);
assert.match(theme, /value === "scheduled"/);
assert.match(theme, /button\.setAttribute\("aria-checked", String\(enabled\)\)/);
assert.match(theme, /root\.dataset\.theme === "dark" \? "light" : "dark"/);
assert.doesNotMatch(theme, /setInterval\(/);
assert.doesNotMatch(theme, /\[data-theme-choice\]/);

const makeClassList = () => {
  const values = new Set();
  return {
    toggle(name, enabled) { enabled ? values.add(name) : values.delete(name); },
    contains(name) { return values.has(name); },
  };
};
const themeControl = { classList: makeClassList(), dataset: {} };
const themeButton = {
  classList: makeClassList(),
  attributes: {},
  listeners: {},
  setAttribute(name, value) { this.attributes[name] = value; },
  addEventListener(name, listener) { this.listeners[name] = listener; },
};
const storedTheme = new Map([["xyj_theme_preference", "system"]]);
const documentListeners = {};
const windowListeners = {};
const themeRoot = { dataset: {}, style: {} };
const themeDocument = {
  documentElement: themeRoot,
  querySelectorAll(selector) {
    if (selector === "[data-theme-switch]") return [themeControl];
    if (selector === "[data-theme-switch-button]") return [themeButton];
    return [];
  },
  addEventListener(name, listener) { documentListeners[name] = listener; },
};
const themeWindow = {
  matchMedia: () => ({ matches: true }),
  addEventListener(name, listener) { windowListeners[name] = listener; },
  dispatchEvent() {},
};
runInNewContext(theme, {
  window: themeWindow,
  document: themeDocument,
  localStorage: {
    getItem: (key) => storedTheme.get(key) ?? null,
    setItem: (key, value) => storedTheme.set(key, value),
  },
  CustomEvent: class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } },
  Date,
  JSON,
  Number,
  String,
  Boolean,
  Set,
});
assert.equal(themeRoot.dataset.theme, "dark", "legacy system preference must resolve before first paint");
assert.equal(storedTheme.get("xyj_theme_preference"), "dark", "legacy preference must migrate to the binary state");
documentListeners.DOMContentLoaded();
assert.equal(themeButton.attributes["aria-checked"], "true");
assert.ok(themeButton.classList.contains("is-on"));
themeButton.listeners.click();
assert.equal(themeRoot.dataset.theme, "light");
assert.equal(storedTheme.get("xyj_theme_preference"), "light");
assert.equal(themeButton.attributes["aria-checked"], "false");

for (const [path, html] of pages) {
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((source) => source.trim());
  for (const source of inlineScripts) new Function(source);

  assert.match(html, /href="\/material\.css"/, `${path} must load the final material layer`);
  assert.match(html, /class="night-mode-control/, `${path} must expose the night-mode control`);
  assert.match(html, /role="switch" aria-checked="false"/, `${path} must use an accessible binary switch`);
  assert.match(html, /data-theme-switch-button/, `${path} must connect the switch to theme.js`);
  assert.doesNotMatch(html, /data-theme-(?:toggle|choice|menu|picker|schedule)/, `${path} must not retain the old theme menu`);
  assert.doesNotMatch(html, />白天模式</, `${path} must not expose a separate light-mode choice`);
  assert.doesNotMatch(html, />跟随系统</, `${path} must not expose the old system choice`);
  assert.doesNotMatch(html, />定时夜览</, `${path} must not expose the old schedule choice`);

  assert.match(html, /const reboundTimers = new WeakMap\(\)/, `${path} must guard repeated rebounds`);
  assert.match(html, /const beginPress = \(control\) =>/, `${path} must restart rapid repeated presses cleanly`);
  assert.match(html, /control\.classList\.add\("is-control-pressed"\)/, `${path} must enter the pressed state`);
  assert.match(html, /control\.classList\.remove\("is-control-pressed"\)/, `${path} must leave the pressed state`);
  assert.match(html, /}, 680\)/, `${path} must keep the rebound class for the full animation`);
  assert.match(html, /bloom\.remove\(\), 560\)/, `${path} must allow the longer light release to finish`);
  assert.doesNotMatch(html, /control\.classList\.remove\("control-bounce-release"\), 340/);
}

console.log("glass material and motion regression passed");
