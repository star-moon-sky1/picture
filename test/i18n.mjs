import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);
const source = await readFile(new URL("public/i18n.js", root), "utf8");
const stored = new Map([["xyj_front_language", "zh-CN"]]);
const sandbox = {
  location: { pathname: "/" },
  document: {
    documentElement: { dataset: {} },
    readyState: "loading",
    addEventListener() {},
  },
  localStorage: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key),
  },
};
sandbox.window = sandbox;
runInNewContext(source, sandbox);

const translate = sandbox.XYJI18n?.translate;
assert.equal(typeof translate, "function", "i18n must expose its local translation function for regression checks");

const decodeEntities = (value) => value
  .replaceAll("&nbsp;", " ")
  .replaceAll("&amp;", "&")
  .replaceAll("&lt;", "<")
  .replaceAll("&gt;", ">")
  .replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'");

function staticInterfaceStrings(html) {
  const markup = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "");
  const values = [];
  markup.split(/<[^>]+>/g).forEach((value) => values.push(value));
  for (const match of markup.matchAll(/(?:placeholder|title|aria-label|alt)\s*=\s*"([^"]*)"/gi)) {
    values.push(match[1]);
  }
  return [...new Set(values
    .map((value) => decodeEntities(value).replace(/\s+/g, " ").trim())
    .filter((value) => /[\u3400-\u9fff]/u.test(value)))];
}

const untranslated = [];
for (const path of ["public/index.html", "public/login.html", "public/document-viewer.html"]) {
  const html = await readFile(new URL(path, root), "utf8");
  for (const value of staticInterfaceStrings(html)) {
    const result = translate(value, "en");
    if (/[\u3400-\u9fff]/u.test(result)) untranslated.push(`${path}: ${value}`);
  }
}
assert.deepEqual(untranslated, [], `English interface dictionary is incomplete:\n${untranslated.join("\n")}`);

for (const value of [
  "请求失败（503）",
  "PDF 组件读取失败（404）",
  "文档读取失败（403）",
  "发布时间：2026-08-28",
  "最新修改：2026-08-28",
  "5 个版本",
  "照片（登录后可用）",
  "播放视频：Travel.mov",
  "Sample · 星月集",
]) {
  assert.doesNotMatch(translate(value, "en"), /[\u3400-\u9fff]/u, `dynamic UI state must translate: ${value}`);
}

assert.equal(translate("与 小明 私信", "en"), "Message 小明", "dynamic names must be preserved inside translated UI templates");
assert.equal(
  translate("这是一篇用户写的长文，没有预置界面词条。", "en"),
  "这是一篇用户写的长文，没有预置界面词条。",
  "unknown user content must remain intact instead of becoming a mixed-language fragment",
);
assert.equal(translate("打开设置并查看文件资源", "zh-TW"), "打開設置並查看文件資源");

console.log("front-end i18n regression passed");
