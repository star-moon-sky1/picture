import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const studioHtml = await readFile(new URL("../public/studio.html", import.meta.url), "utf8");
const inlineScripts = [...studioHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1])
  .filter((source) => source.trim());

assert.ok(inlineScripts.length > 0, "Studio must contain inline application JavaScript");
for (const source of inlineScripts) new Function(source);

assert.match(studioHtml, /id="subsection-download-policy"/);
assert.match(studioHtml, /站长私有备注（仅后台可见）/);
assert.match(studioHtml, /className="upload-job-rate"/);
assert.match(studioHtml, /function uploadPartRequest\(/);
assert.match(studioHtml, /UPLOAD_STALL_TIMEOUT_MS=30\*1000/);
assert.match(studioHtml, /waitUntilReady/);
assert.match(studioHtml, /wasNetworkAbort/);
assert.match(studioHtml, /照片权限已保存/);
assert.match(studioHtml, /选择原文件继续/);
assert.match(studioHtml, /刷新后待续传/);
assert.match(studioHtml, /取消并删除/);
assert.match(studioHtml, /hardwareConcurrency/);
assert.match(studioHtml, /activeLoaded/);
assert.match(studioHtml, /pause\.hidden=true/);
assert.match(studioHtml, /setTimeout\(\(\)=>job\.remove\(\),600\)/);
assert.match(studioHtml, /finish\(text\)\{[^}]*job\.remove\(\)/);
assert.match(studioHtml, /上传到图片小板块/);
assert.match(studioHtml, /form\.append\("subsectionId", subsectionId\)/);
assert.match(studioHtml, /refreshMediaSubsectionOptions\(sectionId,subsectionId\)/);
assert.match(studioHtml, /uploadTarget\.value=event\.target\.value/);

console.log("studio UI regression passed");
