/*
 * 星月集全站主题控制器
 * ------------------------------------------------------------------
 * 可选值：system（跟随系统）、light（白天）、dark（夜览）。
 * 本文件在页面样式之前同步执行，先给 <html> 写入 data-theme，避免刷新时
 * 先出现白色页面再跳到夜览模式。公开网站、账户页和 Studio 共用同一个键。
 */
(function initializeXingyuejiTheme() {
  "use strict";

  const STORAGE_KEY = "xyj_theme_preference";
  const VALID_PREFERENCES = new Set(["system", "light", "dark"]);
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");
  const root = document.documentElement;

  /*
   * 页面可以用 data-theme-default 指定特殊页面的初始外观；星月集当前所有
   * 登录、注册和内容页面都不强制指定，因此首次访问默认跟随系统。用户在
   * 右上角或侧边栏手动选择后，仍以浏览器中已保存的选择为最高优先级。
   */
  function pageDefaultPreference() {
    const value = root.dataset.themeDefault || "system";
    return VALID_PREFERENCES.has(value) ? value : "system";
  }

  function savedPreference() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      if (!value) return pageDefaultPreference();
      return VALID_PREFERENCES.has(value) ? value : pageDefaultPreference();
    } catch {
      return pageDefaultPreference();
    }
  }

  function resolvedTheme(preference) {
    if (preference === "system") return systemDark.matches ? "dark" : "light";
    return preference;
  }

  function updateControls(preference, resolved) {
    const labels = { system: "跟随系统", light: "白天模式", dark: "夜览模式" };
    const icons = { system: "◐", light: "☀", dark: "☾" };
    document.querySelectorAll("[data-theme-choice]").forEach((control) => {
      const selected = control.dataset.themeChoice === preference;
      control.classList.toggle("active", selected);
      control.setAttribute("aria-checked", String(selected));
    });
    document.querySelectorAll("[data-theme-toggle]").forEach((control) => {
      const icon = control.querySelector("[data-theme-icon]");
      const text = control.querySelector("[data-theme-label]");
      if (icon) icon.textContent = icons[preference];
      if (text) text.textContent = labels[preference];
      control.title = `当前：${labels[preference]}（实际为${resolved === "dark" ? "夜览" : "白天"}）`;
      control.setAttribute("aria-label", control.title);
    });
  }

  function apply(preference, options = {}) {
    const normalized = VALID_PREFERENCES.has(preference) ? preference : "system";
    const resolved = resolvedTheme(normalized);
    root.dataset.themePreference = normalized;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;

    if (options.persist) {
      try { localStorage.setItem(STORAGE_KEY, normalized); } catch { /* 隐私模式可能禁止写入。 */ }
    }
    updateControls(normalized, resolved);
    if (options.announce !== false) {
      window.dispatchEvent(new CustomEvent("xyjthemechange", {
        detail: { preference: normalized, resolved },
      }));
    }
    return { preference: normalized, resolved };
  }

  function closeThemeMenus(except = null) {
    document.querySelectorAll("[data-theme-menu]").forEach((menu) => {
      if (menu !== except) menu.hidden = true;
    });
    document.querySelectorAll("[data-theme-toggle]").forEach((toggle) => {
      const menu = toggle.closest("[data-theme-picker]")?.querySelector("[data-theme-menu]");
      toggle.setAttribute("aria-expanded", String(menu && !menu.hidden));
    });
  }

  function installControls() {
    root.dataset.themeReady = "true";
    updateControls(root.dataset.themePreference || "system", root.dataset.theme || "light");

    document.querySelectorAll("[data-theme-toggle]").forEach((toggle) => {
      toggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const picker = toggle.closest("[data-theme-picker]");
        const menu = picker?.querySelector("[data-theme-menu]");
        if (!menu) return;
        const opening = menu.hidden;
        closeThemeMenus(opening ? menu : null);
        menu.hidden = !opening;
        toggle.setAttribute("aria-expanded", String(opening));
        if (opening) menu.querySelector("[data-theme-choice].active")?.focus({ preventScroll: true });
      });
    });

    document.querySelectorAll("[data-theme-choice]").forEach((choice) => {
      choice.addEventListener("click", () => {
        apply(choice.dataset.themeChoice, { persist: true });
        closeThemeMenus();
      });
    });

    document.addEventListener("click", (event) => {
      if (!(event.target instanceof Element) || !event.target.closest("[data-theme-picker]")) closeThemeMenus();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeThemeMenus();
    });
  }

  apply(savedPreference(), { announce: false });
  systemDark.addEventListener?.("change", () => {
    if ((root.dataset.themePreference || "system") === "system") apply("system", { announce: true });
  });
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) apply(savedPreference(), { announce: true });
  });
  document.addEventListener("DOMContentLoaded", installControls, { once: true });

  window.XYJTheme = Object.freeze({
    apply: (preference) => apply(preference, { persist: true }),
    current: () => ({
      preference: root.dataset.themePreference || "system",
      resolved: root.dataset.theme || "light",
    }),
  });
})();
