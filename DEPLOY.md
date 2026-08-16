# 星月集部署操作说明

## GitHub 中必须保持的文件位置

```text
仓库根目录
├─ wrangler.jsonc
├─ package.json
├─ package-lock.json
├─ src
│  └─ worker.js
└─ public
   ├─ index.html
   ├─ login.html
   ├─ studio.html
   ├─ document-viewer.html
   ├─ theme.css
   └─ theme.js
```

`worker.js` 位于 `src` 目录，`wrangler.jsonc` 中的 `main` 必须写成 `src/worker.js`。
不要创建名为 `scr` 的目录，也不要把 `worker.js` 移出 `src` 目录。

## 使用 GitHub 网页更新

1. 进入仓库的 `src` 文件夹，上传并替换 `worker.js`；配置改动时再替换根目录的 `wrangler.jsonc`。
2. 点击仓库中的 `public` 文件夹，上传并替换 `index.html`、`login.html`、`studio.html`、
   `document-viewer.html`、`theme.css` 和 `theme.js`。
3. 每次上传后点击绿色的 **Commit changes**。
4. 打开 Cloudflare 的 `xingyueji` Worker，进入 **Deployments**，等待最新部署显示成功。

## 判断新版本是否已经部署

浏览器打开：

```text
https://xingyueji.com.cn/api/health
```

正常情况下应看到类似内容：

```json
{
  "ok": true,
  "version": "2.1.0.0",
  "bindings": {
    "DB": true,
    "BUCKET": true,
    "ASSETS": true
  },
  "databaseReachable": true
}
```

如果访问 `/api/health` 得到 404，或者没有显示 `2.1.0.0`，说明 Cloudflare 仍在运行旧部署。

## 文件资源库部署检查

- `wrangler.jsonc` 的静态资源配置必须包含 `"/files/*"` 的 `run_worker_first`，否则文件请求会被静态资源层截获。
- R2 绑定名称仍为 `BUCKET`，不需要再创建第二个存储桶。
- D1 会自动建立 `asset_folders`、`assets`、`asset_variants` 和 `asset_uploads` 表。
- 第一次部署后先访问一次 `/api/health`，再打开 Studio；这会先完成数据库升级。
- 视频自动转码不是 R2 本身的能力。未开通 Cloudflare Stream 时，在 Studio 手动上传各清晰度版本；
  开通后可给视频填写 Stream HLS 地址以使用自适应画质。各清晰度独立下载仍使用上传到 R2 的版本文件。

## 留言消息通知（可选）

留言无论是否配置外部通知，都会先安全保存到 D1，并显示在 `/studio` 的“留言与反馈”中。

如需企业微信提醒：

1. 在企业微信群中添加群机器人并复制 Webhook 地址。
2. 打开 Cloudflare Worker → Settings → Variables and Secrets。
3. 新建加密 Secret，名称写 `WECOM_WEBHOOK_URL`，值粘贴完整 Webhook 地址。
4. 保存并重新部署后，新留言会按企业微信文本消息格式推送。

### QQ 官方机器人提醒

`wrangler.jsonc` 已填写机器人 AppID。QQ 机器人的 AppSecret 只能放在 Cloudflare，不能写进
HTML、`worker.js`、`wrangler.jsonc` 或 GitHub。

1. 打开 Cloudflare Worker → Settings → Variables and Secrets。
2. 新增加密 Secret `QQ_BOT_SECRET`，值填写 QQ 开放平台显示的 AppSecret。
3. 推荐再新增加密 Secret `QQ_BIND_CODE`，值由站长自己设置，例如一串不少于 12 位的随机字符。
4. 保存并重新部署，访问 `https://xingyueji.com.cn/api/qq/events`；看到
   `configured: true` 说明 AppID 和 AppSecret 已被 Worker 读取。
5. 打开 QQ 开放平台机器人的 Webhook 设置，回调地址填写：

```text
https://xingyueji.com.cn/api/qq/events
```

6. 监听事件选择 `C2C_MESSAGE_CREATE`（单聊消息事件），然后保存并让平台完成回调验证。
7. 使用已加入沙箱的站长 QQ 给机器人发送以下指令：

```text
绑定网站通知 你在QQ_BIND_CODE中设置的口令
```

如果没有配置 `QQ_BIND_CODE`，第一次绑定也可以只发送 `绑定网站通知`；但必须在机器人公开前完成，
否则可能被其他人抢先绑定。收到“星月集网站通知绑定成功”后，新留言就会直接发到该 QQ 会话。

最后访问 `/api/health`，正常时会看到：

```json
{
  "notifications": {
    "feedbackWebhook": true,
    "qqBotConfigured": true,
    "qqRecipientBound": true
  }
}
```

其他第三方通知中转仍可使用 Secret `FEEDBACK_WEBHOOK_URL`。Worker 会发送包含 `event`、
`feedback` 和 `text` 的 JSON；中转地址及 API Key 同样不得提交到 GitHub。

## 注册审核和密码重置

- 游客首次访问可以选择“以游客身份进入”，无需创建账号。
- 用户注册后默认为“待审核”，QQ机器人会向已绑定的站长账号发送申请摘要。
- 在 `/studio` →“用户与审核”中批准账号后，用户即可使用 AI 和会员内容。
- 用户忘记密码时提交预留联系方式；站长核实身份后点击“生成链接”，把链接通过原联系方式发给用户。
- 重置链接有效期为24小时且只能使用一次；重新生成、成功重置或用户再次申请都会使旧链接失效。
- Studio 永远不会显示用户原始密码或密码哈希。

## 游客反机器人验证与访问统计

代码已经接好 Cloudflare Turnstile 的前端组件与 Worker 服务端 Siteverify。只有前端出现“验证通过”
并不算完成，Worker 还会再次向 Cloudflare 校验 Token；验证 Token 过期、重复使用或来源域名不匹配
都会被拒绝。

1. 在 Cloudflare 控制台打开 **Turnstile**，新建一个 Managed 小组件。
2. Hostname 只填写网站实际域名，例如 `xingyueji.com.cn`；如果同时使用 `www`，也把该域名加入。
3. 复制 Site Key 和 Secret Key。
4. 打开 Worker → **Settings → Variables and Secrets**，新增：
   - 普通变量 `TURNSTILE_SITE_KEY`：填写 Site Key；
   - 加密 Secret `TURNSTILE_SECRET_KEY`：填写 Secret Key；
   - 普通变量 `TURNSTILE_HOSTNAMES`：填写允许的域名，多个域名用英文逗号分隔；
   - 推荐加密 Secret `SESSION_SECRET`：填写一串独立随机字符，用于签发游客会话。
5. 保存并重新部署。访问 `/api/health`，确认 `guestProtection.turnstileConfigured` 为 `true`。

如果 Site Key 和 Secret Key 都没有配置，网站不会中断游客访问，但只会启用 IP 频率限制；如果只配置
其中一个，入口会提示配置不完整，避免出现看似验证、实际上未验证的状态。

游客通过后，D1 的 `guest_visits` 表会按日保存：匿名浏览器编号、脱敏 IP、IP 摘要、国家/省州/城市、
网络运营组织、浏览器、来源域名、首次/最近访问时间、进入次数、页面浏览数和最后访问板块。后台
`/studio` →“游客统计”可以查看每日汇总和单个浏览器的明细。完整 IP 和精确住址不会保存；定位信息
只来自 Cloudflare 的 IP 级大致定位。明细默认保存 90 天，并自动清理更早的数据。

统计日默认按 `Asia/Shanghai` 汇总。如需修改，在 Variables 中添加普通变量 `ANALYTICS_TIMEZONE`，
值填写 IANA 时区名称。
