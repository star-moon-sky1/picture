import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const css = await readFile(new URL("public/vnext.css", root), "utf8");
const pages = await Promise.all([
  "public/index.html",
  "public/login.html",
  "public/studio.html",
].map(async (path) => [path, await readFile(new URL(path, root), "utf8")]));

assert.match(css, /--xyj-motion-rebound:\s*\.58s/);
assert.match(css, /--xyj-motion-settle:\s*\.46s/);
assert.match(css, /--xyj-frost-grain-opacity/);
assert.match(css, /feTurbulence/);
assert.match(css, /--xyj-liquid-press-fill/);
assert.match(css, /\.is-control-pressed,\s*\.control-bounce-release/);
assert.match(css, /blur\(\.58px\)\s+saturate\(1\.30\)/);
assert.match(css, /\.harmony-light-bloom\.is-releasing\s*\{[\s\S]*?animation-duration:\s*\.46s/);

for (const [path, html] of pages) {
  const inlineScripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1])
    .filter((source) => source.trim());
  for (const source of inlineScripts) new Function(source);

  assert.match(html, /const reboundTimers = new WeakMap\(\)/, `${path} must guard repeated rebounds`);
  assert.match(html, /const beginPress = \(control\) =>/, `${path} must restart rapid repeated presses cleanly`);
  assert.match(html, /control\.classList\.add\("is-control-pressed"\)/, `${path} must enter the pressed state`);
  assert.match(html, /control\.classList\.remove\("is-control-pressed"\)/, `${path} must leave the pressed state`);
  assert.match(html, /}, 680\)/, `${path} must keep the rebound class for the full animation`);
  assert.match(html, /bloom\.remove\(\), 560\)/, `${path} must allow the longer light release to finish`);
  assert.doesNotMatch(html, /control\.classList\.remove\("control-bounce-release"\), 340/);
}

console.log("glass material and motion regression passed");
