/*
 * 星月集 PWA 安装控制器
 * ------------------------------------------------------------------
 * 1. 注册 /sw.js，让浏览器把网站识别为可安装的 Web App；
 * 2. 捕获 Chromium 的 beforeinstallprompt，只有用户点击站内安装按钮后才
 *    调用浏览器原生确认框，网页不能也不会静默创建桌面图标；
 * 3. Safari 或不支持该事件的浏览器返回对应的手动安装步骤；
 * 4. 已经以独立应用模式运行时隐藏重复安装入口。
 */
(function initializeXingyuejiPwa() {
  "use strict";

  let deferredInstallPrompt = null;
  let installedDuringSession = false;

  function isStandalone() {
    return installedDuringSession
      || window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
  }

  function manualInstallInstructions() {
    const userAgent = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/i.test(userAgent);
    const isSafari = /Safari/i.test(userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/i.test(userAgent);

    if (isIOS) {
      return "请使用 Safari 打开本网站，点击浏览器的“分享”按钮，再选择“添加到主屏幕”。";
    }
    if (isSafari) {
      return "在 Mac Safari 菜单栏中选择“文件”，再选择“添加到程序坞”；旧版本 Safari 可使用“添加到主屏幕”。";
    }
    return "在 Chrome 或 Edge 地址栏右侧点击“安装”图标；如果没有图标，请打开浏览器菜单，选择“安装应用”“将页面安装为应用”或“创建快捷方式”。";
  }

  function updateInstallControls() {
    const installed = isStandalone();
    document.querySelectorAll("[data-install-app-container]").forEach((container) => {
      container.hidden = installed;
    });
    document.querySelectorAll("[data-install-app]").forEach((button) => {
      button.hidden = installed;
      button.disabled = false;
      const label = button.querySelector("[data-install-app-label]");
      if (label) label.textContent = deferredInstallPrompt ? "安装桌面应用" : "创建桌面访问";
    });
    window.dispatchEvent(new CustomEvent("xyjpwastatus", {
      detail: { installed, promptAvailable: Boolean(deferredInstallPrompt) },
    }));
  }

  async function requestInstall() {
    if (isStandalone()) return { status: "installed" };

    if (!deferredInstallPrompt) {
      return { status: "manual", instructions: manualInstallInstructions() };
    }

    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      updateInstallControls();
      return { status: choice?.outcome === "accepted" ? "accepted" : "dismissed" };
    } catch {
      updateInstallControls();
      return { status: "manual", instructions: manualInstallInstructions() };
    }
  }

  // Chromium 在确认 manifest、图标和 Service Worker 满足要求后触发此事件。
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallControls();
  });

  window.addEventListener("appinstalled", () => {
    installedDuringSession = true;
    deferredInstallPrompt = null;
    updateInstallControls();
  });

  document.addEventListener("DOMContentLoaded", updateInstallControls, { once: true });
  window.matchMedia("(display-mode: standalone)").addEventListener?.("change", updateInstallControls);

  // 仅在 HTTPS/本机安全环境中注册；失败不会阻断普通网页访问。
  if ("serviceWorker" in navigator && window.isSecureContext) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => { /* 不让安装组件故障影响网站主体。 */ });
    }, { once: true });
  }

  window.XYJPWA = Object.freeze({
    requestInstall,
    isStandalone,
    manualInstallInstructions,
  });
})();
