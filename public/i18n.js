/* 星月集统一界面翻译：静态标签、弹窗和接口动态内容共用同一条转换链。 */
(() => {
  "use strict";

  const STORAGE_KEY = "xyj_language";
  const VALID = new Set(["zh-CN", "zh-TW", "en"]);
  const ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"];
  const nodeSources = new WeakMap();
  const attributeSources = new WeakMap();
  const memoryCache = new Map();
  let language = readLanguage();
  let mutationTimer = 0;
  let applying = false;
  let rescanAfterApply = false;

  const fallback = {
    "zh-TW": new Map(Object.entries({
      "主页": "主頁", "个人空间": "個人空間", "关于我": "關於我", "留言与反馈": "留言與回饋",
      "设置": "設定", "登录账号": "登入帳號", "注册账号": "註冊帳號", "修改密码": "修改密碼",
      "登录并进入网站": "登入並進入網站", "以游客身份浏览": "以訪客身分瀏覽", "跟随系统": "跟隨系統",
      "白天模式": "白天模式", "夜览模式": "夜覽模式", "创建桌面访问": "建立桌面存取",
      "简体中文": "簡體中文", "本站使用说明": "本站使用說明", "文件资源": "檔案資源",
      "公开留言板": "公開留言板", "提交给站长": "提交給站長", "发送": "傳送", "关闭": "關閉",
    })),
    en: new Map(Object.entries({
      "主页": "Home", "个人空间": "Personal Space", "关于我": "About Me", "留言与反馈": "Feedback",
      "AI 助手": "AI Assistant", "设置": "Settings", "登录账号": "Sign in", "注册账号": "Create account",
      "修改密码": "Change password", "登录并进入网站": "Sign in", "以游客身份浏览": "Browse as guest",
      "跟随系统": "Follow system", "白天模式": "Light mode", "夜览模式": "Dark mode",
      "创建桌面访问": "Install app", "简体中文": "Simplified Chinese", "繁體中文": "Traditional Chinese",
      "本站使用说明": "Site Guide", "文件资源": "Files", "公开留言板": "Public Messages",
      "提交给站长": "Send to owner", "发送": "Send", "关闭": "Close", "全部": "All",
    })),
  };

  function readLanguage() {
    try {
      const value = localStorage.getItem(STORAGE_KEY) || "zh-CN";
      return VALID.has(value) ? value : "zh-CN";
    } catch { return "zh-CN"; }
  }

  function excluded(element) {
    return !element || Boolean(element.closest(
      "script, style, noscript, code, pre, svg, canvas, [contenteditable='true'], [data-no-translate]",
    ));
  }

  function sourceParts(value) {
    const match = String(value ?? "").match(/^(\s*)([\s\S]*?)(\s*)$/);
    return { before: match?.[1] || "", core: match?.[2] || "", after: match?.[3] || "" };
  }

  function translatable(value) {
    const core = sourceParts(value).core;
    return core.length > 0 && /[\u3400-\u9fff]/u.test(core) && core.length <= 2000;
  }

  function textTargets(root = document.body) {
    if (!root) return [];
    const targets = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.parentElement || excluded(node.parentElement)
          || (!nodeSources.has(node) && !translatable(node.nodeValue))) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) targets.push({ type: "text", node: walker.currentNode });
    root.querySelectorAll?.("[placeholder], [title], [aria-label], img[alt]").forEach((element) => {
      if (excluded(element)) return;
      ATTRIBUTES.forEach((name) => {
        const remembered = attributeSources.get(element)?.has(name);
        if (element.hasAttribute(name) && (remembered || translatable(element.getAttribute(name)))) {
          targets.push({ type: "attribute", node: element, name });
        }
      });
    });
    return targets;
  }

  function rememberSource(target, force = false) {
    if (target.type === "text") {
      if (force || !nodeSources.has(target.node)) nodeSources.set(target.node, target.node.nodeValue || "");
      return nodeSources.get(target.node) || "";
    }
    let values = attributeSources.get(target.node);
    if (!values) { values = new Map(); attributeSources.set(target.node, values); }
    if (force || !values.has(target.name)) values.set(target.name, target.node.getAttribute(target.name) || "");
    return values.get(target.name) || "";
  }

  function writeTarget(target, value) {
    if (target.type === "text") target.node.nodeValue = value;
    else target.node.setAttribute(target.name, value);
  }

  function scheduleApply() {
    window.clearTimeout(mutationTimer);
    mutationTimer = window.setTimeout(() => {
      apply(document.body).catch(() => {});
    }, 90);
  }

  async function requestTranslations(texts, targetLanguage) {
    const result = new Map();
    const missing = [];
    texts.forEach((text) => {
      const key = `${targetLanguage}\u0000${text}`;
      if (memoryCache.has(key)) result.set(text, memoryCache.get(key));
      else if (!missing.includes(text)) missing.push(text);
    });
    for (let index = 0; index < missing.length; index += 30) {
      const batch = missing.slice(index, index + 30);
      try {
        const response = await fetch("/api/i18n/translate", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: targetLanguage, texts: batch }),
        });
        if (!response.ok) throw new Error(`translation ${response.status}`);
        const payload = await response.json();
        batch.forEach((text, offset) => {
          const translated = String(payload.translations?.[offset] || fallback[targetLanguage]?.get(text) || text);
          memoryCache.set(`${targetLanguage}\u0000${text}`, translated);
          result.set(text, translated);
        });
      } catch (error) {
        console.warn("Site translation unavailable", error);
        batch.forEach((text) => {
          const translated = fallback[targetLanguage]?.get(text) || text;
          memoryCache.set(`${targetLanguage}\u0000${text}`, translated);
          result.set(text, translated);
        });
      }
    }
    return result;
  }

  async function apply(root = document.body, { refreshSources = false } = {}) {
    const targets = textTargets(root);
    applying = true;
    try {
      const sourceRows = targets.map((target) => ({ target, source: rememberSource(target, refreshSources) }));
      if (language === "zh-CN") {
        sourceRows.forEach(({ target, source }) => writeTarget(target, source));
      } else {
        const cores = [...new Set(sourceRows.map(({ source }) => sourceParts(source).core).filter(translatable))];
        const translations = await requestTranslations(cores, language);
        sourceRows.forEach(({ target, source }) => {
          const parts = sourceParts(source);
          writeTarget(target, `${parts.before}${translations.get(parts.core) || parts.core}${parts.after}`);
        });
      }
      document.documentElement.lang = language;
      window.dispatchEvent(new CustomEvent("xyji18napplied", { detail: { language, root } }));
    } finally {
      queueMicrotask(() => {
        applying = false;
        if (rescanAfterApply) {
          rescanAfterApply = false;
          scheduleApply();
        }
      });
    }
  }

  async function setLanguage(value) {
    language = VALID.has(value) ? value : "zh-CN";
    try { localStorage.setItem(STORAGE_KEY, language); } catch { /* storage can be disabled */ }
    document.querySelectorAll("#site-language, [data-language-select]").forEach((select) => {
      if (select.value !== language) select.value = language;
    });
    await apply(document.body);
    window.dispatchEvent(new CustomEvent("xyji18nchange", { detail: { language } }));
  }

  function install() {
    document.querySelectorAll("#site-language, [data-language-select]").forEach((select) => {
      select.value = language;
      select.addEventListener("change", () => setLanguage(select.value));
    });
    apply(document.body);
    const observer = new MutationObserver((mutations) => {
      if (applying) {
        // 接口数据常与首次翻译并行返回；新增节点完成后必须再扫一次，不能只翻译静态标题。
        if (mutations.some((mutation) => mutation.type === "childList")) rescanAfterApply = true;
        return;
      }
      const roots = new Set();
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          if (mutation.target.parentElement && !excluded(mutation.target.parentElement)) {
            nodeSources.set(mutation.target, mutation.target.nodeValue || "");
            roots.add(mutation.target.parentElement);
          }
        } else if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) roots.add(node);
            else if (node.parentElement) roots.add(node.parentElement);
          });
        } else if (mutation.type === "attributes" && mutation.target instanceof Element) {
          let values = attributeSources.get(mutation.target);
          if (!values) { values = new Map(); attributeSources.set(mutation.target, values); }
          values.set(mutation.attributeName, mutation.target.getAttribute(mutation.attributeName) || "");
          roots.add(mutation.target);
        }
      }
      if (!roots.size) return;
      // 以 body 为批次统一去重；服务端缓存保证动态重绘不会重复调用模型。
      scheduleApply();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTES,
    });
  }

  document.addEventListener("DOMContentLoaded", install, { once: true });
  window.XYJI18n = Object.freeze({
    apply,
    setLanguage,
    current: () => language,
  });
})();
