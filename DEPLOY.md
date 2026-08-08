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
  "version": "1.8.8.0",
  "bindings": {
    "DB": true,
    "BUCKET": true,
    "ASSETS": true
  },
  "databaseReachable": true
}
```

如果访问 `/api/health` 得到 404，或者没有显示 `1.8.8.0`，说明 Cloudflare 仍在运行旧部署。

## 留言消息通知（可选）

留言无论是否配置外部通知，都会先安全保存到 D1，并显示在 `/studio` 的“留言与反馈”中。

如需企业微信提醒：

1. 在企业微信群中添加群机器人并复制 Webhook 地址。
2. 打开 Cloudflare Worker → Settings → Variables and Secrets。
3. 新建加密 Secret，名称写 `WECOM_WEBHOOK_URL`，值粘贴完整 Webhook 地址。
4. 保存并重新部署后，新留言会按企业微信文本消息格式推送。

个人微信和 QQ 没有可以直接写进网页的通用个人账号接口。可以使用自建机器人或可信中转服务，
把它提供的 HTTPS 接收地址保存为 Secret `FEEDBACK_WEBHOOK_URL`。Worker 会发送包含
`event`、`feedback` 和 `text` 的 JSON；API Key 和 Webhook 地址都不要写进 HTML 或提交到 GitHub。
