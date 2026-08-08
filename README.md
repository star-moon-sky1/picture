# 星月集（xingyueji）

个人网站与 Cloudflare 全栈内容管理系统。

## 功能

- 首页最新版本卡片、可回溯的完整版本历史与页脚版本自动同步
- 可在后台增删、改名和排序的个人空间大板块与图片相册子板块
- 文章/评论点赞与点踩、游客评论和回复
- 文章打印并另存为 PDF
- R2 原图存储、网页预览和原片下载
- `/studio` 内容发布后台（草稿、发布、插图、板块、相册、评论、留言管理）
- D1 内容数据库与 R2 对象存储
- 可读取已发布网站内容的 AI 助手
- AI 回答支持逐字流式显示；配置 DeepSeek Secret 后支持模型原生流式转发
- AI 数学内容支持安全的 LaTeX/MathJax 排版
- 游客留言与问题反馈、公开留言板、后台未读/解决状态与可选消息通知
- 流式连接被浏览器或网络拦截时，自动切换到非流式兼容模式
- 桌面端与手机端独立纵向滚动适配

## 必须保留的目录结构

```text
picture/
├─ src/
│  └─ worker.js       # Cloudflare 后端
├─ wrangler.jsonc     # Cloudflare 配置，main 指向 src/worker.js
├─ public/
│  ├─ index.html      # 公开网站
│  └─ studio.html     # 内容发布后台
├─ package.json
└─ package-lock.json
```

不要把 `src` 目录误写成 `scr`，也不要只上传文件而漏掉 `public` 文件夹。
部署后访问 `/api/health`，看到 `version: "1.8.8.0"` 即表示最新 Worker 已生效。

## Cloudflare 绑定

- D1：`DB` → `xingyueji-db`
- R2：`BUCKET` → `xingyueji-media`
- Secret：`ADMIN_PASSWORD`（必须在 Cloudflare Settings → Variables and Secrets 中设置）
- 可选 Secret：`DEEPSEEK_API_KEY`（未设置时复用现有 `qwen-ai` Worker）
- 可选 Secret：`WECOM_WEBHOOK_URL`（企业微信群机器人通知地址）
- 可选 Secret：`FEEDBACK_WEBHOOK_URL`（QQ/个人微信机器人中转或其他通用 HTTPS Webhook）

数据库表会在首次 API 请求时自动创建，无需手动执行 SQL。

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

不要将 `.dev.vars`、API Key 或后台密码提交到 GitHub。
