/*
 * 星月集夜览模式开关
 * ------------------------------------------------------------------
 * 全站只保留 light / dark 两种手动状态。旧版本保存的“跟随系统”或
 * “定时夜览”会在首次加载时解析为当下实际主题，再迁移为新的固定状态，
 * 因此升级后不会突然换色，也不会继续受到旧定时器影响。
 */
(function initializeXingyuejiTheme() {
  "use strict";

  const STORAGE_KEY = "xyj_theme_preference";
  const LEGACY_SCHEDULE_KEY = "xyj_theme_schedule";
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

  function legacyScheduledTheme() {
    let start = "22:00";
    let end = "07:00";
    try {
      const parsed = JSON.parse(localStorage.getItem(LEGACY_SCHEDULE_KEY) || "{}");
      const validTime = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
      if (validTime(parsed.start)) start = parsed.start;
      if (validTime(parsed.end)) end = parsed.end;
    } catch { /* 使用旧版默认时间完成一次性迁移。 */ }

    const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
    const startMinutes = minutes(start);
    const endMinutes = minutes(end);
    const now = new Date();
    const current = now.getHours() * 60 + now.getMinutes();
    const dark = startMinutes === endMinutes
      ? true
      : startMinutes < endMinutes
        ? current >= startMinutes && current < endMinutes
        : current >= startMinutes || current < endMinutes;
    return dark ? "dark" : "light";
  }

  function normalizePreference(value) {
    if (value === "dark" || value === "light") return value;
    if (value === "system") return systemDark.matches ? "dark" : "light";
    if (value === "scheduled") return legacyScheduledTheme();
    return root.dataset.themeDefault === "dark" ? "dark" : "light";
  }

  function readSavedPreference() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return { preference: normalizePreference(saved), migrated: Boolean(saved && saved !== "light" && saved !== "dark") };
    } catch {
      return { preference: normalizePreference(null), migrated: false };
    }
  }

  function updateControls(theme) {
    const enabled = theme === "dark";
    document.querySelectorAll("[data-theme-switch]").forEach((control) => {
      control.classList.toggle("is-on", enabled);
      control.dataset.themeState = enabled ? "on" : "off";
    });
    document.querySelectorAll("[data-theme-switch-button]").forEach((button) => {
      button.classList.toggle("is-on", enabled);
      button.setAttribute("aria-checked", String(enabled));
      button.title = enabled ? "关闭夜览模式" : "打开夜览模式";
    });
  }

  function apply(preference, options = {}) {
    const resolved = normalizePreference(preference);
    root.dataset.themePreference = resolved;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;

    if (options.persist) {
      try { localStorage.setItem(STORAGE_KEY, resolved); } catch { /* 隐私模式可能禁止写入。 */ }
    }
    updateControls(resolved);
    if (options.announce !== false) {
      window.dispatchEvent(new CustomEvent("xyjthemechange", {
        detail: { preference: resolved, resolved },
      }));
    }
    return { preference: resolved, resolved };
  }

  function installControls() {
    root.dataset.themeReady = "true";
    updateControls(root.dataset.theme || "light");
    document.querySelectorAll("[data-theme-switch-button]").forEach((button) => {
      button.addEventListener("click", () => {
        apply(root.dataset.theme === "dark" ? "light" : "dark", { persist: true });
      });
    });
  }

  const initial = readSavedPreference();
  apply(initial.preference, { announce: false, persist: initial.migrated });
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    const next = normalizePreference(event.newValue);
    apply(next, { announce: true, persist: event.newValue !== next });
  });
  document.addEventListener("DOMContentLoaded", installControls, { once: true });

  window.XYJTheme = Object.freeze({
    apply: (preference) => apply(preference, { persist: true }),
    current: () => ({
      preference: root.dataset.themePreference || "light",
      resolved: root.dataset.theme || "light",
    }),
  });
})();
