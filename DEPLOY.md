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
   └─ studio.html
```

`worker.js` 位于 `src` 目录，`wrangler.jsonc` 中的 `main` 必须写成 `src/worker.js`。
不要创建名为 `scr` 的目录，也不要把 `worker.js` 移出 `src` 目录。

## 使用 GitHub 网页更新

1. 进入仓库的 `src` 文件夹，上传并替换 `worker.js`；配置改动时再替换根目录的 `wrangler.jsonc`。
2. 点击仓库中的 `public` 文件夹，上传并替换 `index.html` 和 `studio.html`。
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
  "version": "1.8.9.0",
  "bindings": {
    "DB": true,
    "BUCKET": true,
    "ASSETS": true
  },
  "databaseReachable": true
}
```

如果访问 `/api/health` 得到 404，或者没有显示 `1.8.9.0`，说明 Cloudflare 仍在运行旧部署。

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
