(() => {
  "use strict";

  const bell = document.getElementById("notification-bell");
  const badge = document.getElementById("notification-badge");
  if (!bell || !badge) return;

  const community = {
    user: null,
    inbox: null,
    contacts: [],
    peer: null,
    activeTab: "notifications",
  };

  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: "same-origin", ...options });
    const data = (response.headers.get("content-type") || "").includes("application/json") ? await response.json() : null;
    if (!response.ok) throw new Error(data?.error || `请求失败（${response.status}）`);
    return data;
  }

  const dialog = document.createElement("dialog");
  dialog.id = "notification-dialog";
  dialog.className = "notification-dialog";
  dialog.innerHTML = `
    <section class="notification-shell">
      <header class="notification-toolbar">
        <div><h2 style="margin:0">通知与私信</h2><small id="community-status" class="section-desc"></small></div>
        <button id="community-close" class="btn small ghost" type="button">关闭</button>
      </header>
      <nav class="notification-tabs" aria-label="通知信箱栏目">
        <button class="tab-button active" type="button" data-community-tab="notifications">通知</button>
        <button class="tab-button" type="button" data-community-tab="messages">私信</button>
        <button class="tab-button" type="button" data-community-tab="preferences">提醒设置</button>
      </nav>
      <section data-community-panel="notifications">
        <div class="notification-toolbar"><p class="section-desc">账号、回复和文章上新提醒都会集中在这里。</p><button id="notifications-read-all" class="btn small ghost" type="button">全部已读</button></div>
        <div id="notification-list" class="notification-list"></div>
      </section>
      <section data-community-panel="messages" hidden>
        <div class="message-layout">
          <aside class="message-card"><h3>会话</h3><div id="message-contacts" class="message-contacts"></div></aside>
          <article class="message-card">
            <h3 id="message-peer-title">选择一位用户开始交流</h3>
            <div id="message-thread" class="message-thread"></div>
            <form id="message-compose" class="message-compose" hidden>
              <input id="message-input" maxlength="2000" autocomplete="off" placeholder="输入私信…" aria-label="私信内容">
              <button class="btn" type="submit">发送</button>
            </form>
          </article>
        </div>
      </section>
      <section data-community-panel="preferences" hidden>
        <article class="notification-card">
          <h3>提醒设置</h3>
          <div class="preference-list">
            <label><input id="preference-article" type="checkbox">文章上新时提醒我</label>
            <label><input id="preference-auto-open" type="checkbox">登录网站后自动打开通知信箱</label>
            <label><input id="preference-badge" type="checkbox">在小铃铛右上角显示数字红点</label>
          </div>
          <button id="preference-save" class="btn" type="button" style="margin-top:16px">保存设置</button>
        </article>
      </section>
    </section>`;
  document.body.append(dialog);

  const status = dialog.querySelector("#community-status");
  const notificationList = dialog.querySelector("#notification-list");
  const contactsHost = dialog.querySelector("#message-contacts");
  const threadHost = dialog.querySelector("#message-thread");
  const peerTitle = dialog.querySelector("#message-peer-title");
  const compose = dialog.querySelector("#message-compose");

  function setStatus(message = "") { status.textContent = message; }

  function switchTab(name) {
    community.activeTab = name;
    dialog.querySelectorAll("[data-community-tab]").forEach((control) => control.classList.toggle("active", control.dataset.communityTab === name));
    dialog.querySelectorAll("[data-community-panel]").forEach((panel) => { panel.hidden = panel.dataset.communityPanel !== name; });
    if (name === "messages") loadContacts().catch((error) => setStatus(error.message));
  }

  function updateBadge() {
    const preferences = community.inbox?.preferences;
    const count = Number(community.inbox?.unreadCount || 0);
    const visible = Boolean(preferences?.showBadge && count > 0);
    badge.hidden = !visible;
    badge.textContent = count > 99 ? "99+" : String(count);
  }

  function notificationIcon(type) {
    return ({ account: "✓", reply: "↩", comment_reply: "↩", article: "✦", message: "◇" })[type] || "•";
  }

  async function openNotificationTarget(item) {
    if (!item.read_at) {
      await request(`/api/notifications/${encodeURIComponent(item.id)}`, { method: "PUT" }).catch(() => null);
      item.read_at = new Date().toISOString();
      community.inbox.unreadCount = Math.max(0, Number(community.inbox.unreadCount || 0) - 1);
      renderNotifications(); updateBadge();
    }
    const target = String(item.target_url || "");
    const messageUserId = target.match(/#messages-([A-Za-z0-9_-]+)/)?.[1];
    const articleId = target.match(/#article-([A-Za-z0-9_-]+)/)?.[1];
    if (messageUserId) { switchTab("messages"); await openThread(messageUserId); return; }
    if (articleId && typeof openContent === "function") { dialog.close(); openContent(articleId); return; }
    if (target.includes("#settings") && typeof navigateSection === "function") { dialog.close(); navigateSection("settings"); return; }
    if (target.startsWith("/")) location.assign(target);
  }

  function renderNotifications() {
    notificationList.replaceChildren();
    const items = community.inbox?.notifications || [];
    if (!items.length) {
      const empty = document.createElement("p"); empty.className = "section-desc"; empty.textContent = "通知信箱还是空的。"; notificationList.append(empty); return;
    }
    items.forEach((item) => {
      const card = document.createElement("article"); card.className = `notification-item${item.read_at ? "" : " is-unread"}`; card.tabIndex = 0;
      const title = document.createElement("strong"); title.textContent = `${notificationIcon(item.type)} ${item.title}`;
      const body = document.createElement("p"); body.textContent = item.body || "";
      const time = document.createElement("small"); time.textContent = new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(item.created_at));
      card.append(title, body, time);
      card.addEventListener("click", () => openNotificationTarget(item).catch((error) => setStatus(error.message)));
      card.addEventListener("keydown", (event) => { if (event.key === "Enter") card.click(); });
      notificationList.append(card);
    });
  }

  function syncPreferences() {
    const preferences = community.inbox?.preferences || {};
    dialog.querySelector("#preference-article").checked = Boolean(preferences.articleUpdates);
    dialog.querySelector("#preference-auto-open").checked = Boolean(preferences.autoOpenOnLogin);
    dialog.querySelector("#preference-badge").checked = preferences.showBadge !== false;
  }

  async function loadInbox() {
    community.inbox = await request("/api/notifications");
    renderNotifications(); syncPreferences(); updateBadge();
    return community.inbox;
  }

  function renderContacts() {
    contactsHost.replaceChildren();
    if (!community.contacts.length) {
      const empty = document.createElement("p"); empty.className = "section-desc"; empty.textContent = "还没有私信会话。你可以点击评论头像发起交流。"; contactsHost.append(empty); return;
    }
    community.contacts.forEach((contact) => {
      const control = document.createElement("button"); control.type = "button"; control.className = "message-contact";
      const name = document.createElement("strong"); name.textContent = contact.nickname;
      const preview = document.createElement("small"); preview.textContent = `${contact.last_body || ""}${Number(contact.unread_count) ? ` · ${contact.unread_count} 条未读` : ""}`;
      control.append(name, preview); control.addEventListener("click", () => openThread(contact.id).catch((error) => setStatus(error.message))); contactsHost.append(control);
    });
  }

  async function loadContacts() {
    const data = await request("/api/messages");
    community.contacts = data.contacts || [];
    renderContacts();
  }

  function renderThread(messages) {
    threadHost.replaceChildren();
    messages.forEach((message) => {
      const bubble = document.createElement("div");
      bubble.className = `message-bubble${message.sender_user_id === community.user.id ? " mine" : ""}`;
      bubble.textContent = message.body;
      threadHost.append(bubble);
    });
    threadHost.scrollTop = threadHost.scrollHeight;
  }

  async function openThread(userId) {
    if (!community.user || community.user.status !== "approved") throw new Error("账号通过审核后才能使用私信。");
    const data = await request(`/api/messages?userId=${encodeURIComponent(userId)}`);
    community.peer = data.peer;
    peerTitle.textContent = `与 ${data.peer.nickname} 的私信`;
    compose.hidden = false;
    renderThread(data.messages || []);
    switchTab("messages");
  }

  async function openDialog(tab = "notifications", peerId = "") {
    switchTab(tab);
    if (!dialog.open) dialog.showModal();
    if (peerId) await openThread(peerId);
  }

  bell.addEventListener("click", () => openDialog().catch((error) => setStatus(error.message)));
  dialog.querySelector("#community-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  dialog.querySelectorAll("[data-community-tab]").forEach((control) => control.addEventListener("click", () => switchTab(control.dataset.communityTab)));

  dialog.querySelector("#notifications-read-all").addEventListener("click", async () => {
    await request("/api/notifications/read-all", { method: "POST" });
    (community.inbox?.notifications || []).forEach((item) => { item.read_at ||= new Date().toISOString(); });
    if (community.inbox) community.inbox.unreadCount = 0;
    renderNotifications(); updateBadge();
  });

  dialog.querySelector("#preference-save").addEventListener("click", async () => {
    const payload = {
      articleUpdates: dialog.querySelector("#preference-article").checked,
      autoOpenOnLogin: dialog.querySelector("#preference-auto-open").checked,
      showBadge: dialog.querySelector("#preference-badge").checked,
    };
    await request("/api/notification-preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    community.inbox.preferences = payload;
    updateBadge(); setStatus("提醒设置已保存。");
  });

  compose.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = dialog.querySelector("#message-input");
    const body = input.value.trim();
    if (!body || !community.peer) return;
    const submit = compose.querySelector("button"); submit.disabled = true;
    try {
      await request("/api/messages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recipientUserId: community.peer.id, body }) });
      input.value = "";
      await openThread(community.peer.id);
      await loadContacts();
    } catch (error) { setStatus(error.message); }
    finally { submit.disabled = false; }
  });

  document.addEventListener("click", (event) => {
    const author = event.target.closest?.(".comment-author-button[data-user-id]");
    const userId = author?.dataset.userId;
    if (!userId) return;
    event.preventDefault();
    if (!community.user) { location.assign("/?login=1"); return; }
    if (userId === community.user.id) { setStatus("不能给自己发送私信。"); openDialog("messages").catch(() => null); return; }
    openDialog("messages", userId).catch((error) => setStatus(error.message));
  });

  async function initialize() {
    try {
      const session = await request("/api/auth/session");
      if (!session.authenticated) {
        community.user = null;
        community.inbox = null;
        bell.hidden = true;
        badge.hidden = true;
        if (dialog.open) dialog.close();
        return;
      }
      community.user = session.user;
      bell.hidden = false;
      await loadInbox();
      const key = `xyj_notification_auto_open_${session.user.id}`;
      if (community.inbox.preferences?.autoOpenOnLogin && sessionStorage.getItem(key) !== "1") {
        sessionStorage.setItem(key, "1");
        await openDialog("notifications");
      }
    } catch {
      community.user = null;
      bell.hidden = true;
      badge.hidden = true;
    }
  }

  initialize();
  window.addEventListener("xyj-auth-changed", () => initialize());
  window.setInterval(initialize, 30_000);
})();
