(() => {
  "use strict";

  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let lastExpansionSource = null;

  function isExpansionSource(node) {
    return node?.closest?.(".content-card, .photo-card, .resource-card, .usage-guide, .updates, [data-open-dialog], .comment-author-button");
  }

  document.addEventListener("pointerdown", (event) => {
    lastExpansionSource = isExpansionSource(event.target) || event.target.closest?.("button, a, [role='button']") || null;
  }, true);

  /* 为现有及后续创建的 dialog 统一补上“从点击处长出并缩回”的原点动效。 */
  if (globalThis.HTMLDialogElement) {
    const nativeShowModal = HTMLDialogElement.prototype.showModal;
    const nativeClose = HTMLDialogElement.prototype.close;

    HTMLDialogElement.prototype.showModal = function showModalFromSource() {
      const source = lastExpansionSource?.isConnected ? lastExpansionSource : null;
      const rect = source?.getBoundingClientRect();
      const sourceX = rect ? rect.left + rect.width / 2 : innerWidth / 2;
      const sourceY = rect ? rect.top + rect.height / 2 : innerHeight / 2;
      this.style.setProperty("--xyj-shift-x", `${Math.round(sourceX - innerWidth / 2)}px`);
      this.style.setProperty("--xyj-shift-y", `${Math.round(sourceY - innerHeight / 2)}px`);
      this.classList.remove("is-closing");
      this.classList.add("xyj-origin-dialog");
      return nativeShowModal.call(this);
    };

    HTMLDialogElement.prototype.close = function closeToSource(returnValue = "") {
      if (!this.open || reducedMotion.matches || this.dataset.xyjClosing === "1") {
        return nativeClose.call(this, returnValue);
      }
      this.dataset.xyjClosing = "1";
      this.classList.add("is-closing");
      window.setTimeout(() => {
        this.classList.remove("is-closing");
        delete this.dataset.xyjClosing;
        if (this.open) nativeClose.call(this, returnValue);
      }, 300);
      return undefined;
    };

    document.addEventListener("cancel", (event) => {
      if (!(event.target instanceof HTMLDialogElement)) return;
      event.preventDefault();
      event.target.close();
    }, true);
  }

  function installUsageGuideDialog() {
    const preview = document.getElementById("usage-guide");
    const source = document.getElementById("usage-guide-content");
    if (!preview || !source) return;

    const dialog = document.createElement("dialog");
    dialog.id = "usage-guide-dialog";
    dialog.className = "notification-dialog";
    const shell = document.createElement("article");
    shell.className = "notification-shell";
    const toolbar = document.createElement("div");
    toolbar.className = "notification-toolbar";
    const title = document.createElement("h2"); title.textContent = "本站使用说明";
    const close = document.createElement("button"); close.type = "button"; close.className = "btn small ghost"; close.textContent = "关闭";
    toolbar.append(title, close);
    const full = document.createElement("div"); full.className = "usage-guide-full";
    shell.append(toolbar, full); dialog.append(shell); document.body.append(dialog);

    const open = () => {
      full.replaceChildren(...[...source.childNodes].map((node) => node.cloneNode(true)));
      if (!dialog.open) dialog.showModal();
    };
    preview.addEventListener("click", open);
    preview.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(); }
    });
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  }

  async function installAccountSettings() {
    const host = document.getElementById("settings-account-host");
    const accountSection = document.getElementById("account");
    const grid = accountSection?.querySelector(".account-grid");
    if (!host || !grid) return;

    host.className = "settings-card";
    host.style.gridColumn = "1 / -1";
    const title = document.createElement("h2"); title.textContent = "账号管理";
    const guest = document.createElement("div"); guest.className = "account-guest-state";
    const login = document.createElement("a"); login.className = "btn"; login.href = "/?login=1"; login.textContent = "登录账号";
    guest.append(login);
    host.append(title, guest, grid);

    const refresh = async () => {
      try {
        const response = await fetch("/api/auth/session", { credentials: "same-origin" });
        const session = response.ok ? await response.json() : { authenticated: false };
        grid.hidden = !session.authenticated;
        guest.hidden = Boolean(session.authenticated);
      } catch {
        grid.hidden = true;
        guest.hidden = false;
      }
    };
    await refresh();
    window.setInterval(refresh, 60_000);
  }

  function installLanguageSetting() {
    const select = document.getElementById("site-language");
    if (!select) return;
    select.value = localStorage.getItem("xyj_front_language")
      || localStorage.getItem("xyj_language")
      || "zh-CN";
  }

  function installMobileScrollHeader() {
    const mobile = matchMedia("(max-width: 760px) and (hover: none), (max-width: 760px) and (pointer: coarse)");
    const sidebar = document.querySelector(".sidebar");
    if (!sidebar) return;
    let hiddenDistance = 0;
    let headerHeight = sidebar.getBoundingClientRect().height;

    const reset = () => {
      hiddenDistance = 0;
      sidebar.style.setProperty("--mobile-bar-offset", "0px");
      sidebar.style.marginBottom = "0px";
      document.querySelectorAll(".content-section").forEach((section) => { section.dataset.xyjLastScroll = String(section.scrollTop); });
    };
    const update = (section) => {
      if (!mobile.matches || !section.classList.contains("active")) return;
      const current = section.scrollTop;
      const previous = Number(section.dataset.xyjLastScroll || current);
      const delta = current - previous;
      section.dataset.xyjLastScroll = String(current);
      headerHeight = Math.max(64, sidebar.offsetHeight);
      if (current <= 2) hiddenDistance = 0;
      else hiddenDistance = Math.min(headerHeight, Math.max(0, hiddenDistance + delta));
      sidebar.style.setProperty("--mobile-bar-offset", `${-Math.round(hiddenDistance)}px`);
      sidebar.style.marginBottom = `${-Math.round(hiddenDistance)}px`;
    };

    document.querySelectorAll(".content-section").forEach((section) => {
      section.dataset.xyjLastScroll = String(section.scrollTop);
      section.addEventListener("scroll", () => update(section), { passive: true });
    });
    mobile.addEventListener?.("change", reset);
    window.addEventListener("resize", () => { headerHeight = Math.max(64, sidebar.offsetHeight); if (!mobile.matches) reset(); }, { passive: true });
  }

  /* 触屏从卡片上起手滚动时，位移优先解释为滚动，不再误触卡片的 click。 */
  function installTouchScrollIntentGuard() {
    const selector = ".content-card, .photo-card, .resource-card, .usage-guide, .updates, .list-item, .asset-row.folder, .album-chip, [role='button']";
    let gesture = null;
    let suppress = null;
    document.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") return;
      const target = event.target instanceof Element ? event.target.closest(selector) : null;
      if (!target) return;
      gesture = { pointerId: event.pointerId, target, x: event.clientX, y: event.clientY, moved: false };
    }, true);
    document.addEventListener("pointermove", (event) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 9) gesture.moved = true;
    }, { capture: true, passive: true });
    document.addEventListener("pointerup", (event) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      if (gesture.moved) suppress = { target: gesture.target, until: performance.now() + 500 };
      gesture = null;
    }, true);
    document.addEventListener("pointercancel", () => { gesture = null; }, true);
    document.addEventListener("click", (event) => {
      if (!suppress || performance.now() > suppress.until) { suppress = null; return; }
      if (event.target instanceof Node && suppress.target.contains(event.target)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppress = null;
      }
    }, true);
  }

  installUsageGuideDialog();
  installAccountSettings();
  installLanguageSetting();
  installMobileScrollHeader();
  installTouchScrollIntentGuard();
})();
