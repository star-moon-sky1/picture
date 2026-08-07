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
