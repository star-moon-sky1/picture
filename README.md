# 星月集（xingyueji）

个人网站与 Cloudflare 全栈内容管理系统。

## 功能

- 首页历史版本更新记录
- 文章、图片、北京旅行指南三个作品集专栏
- 文章/评论点赞与点踩、游客评论和回复
- 文章打印并另存为 PDF
- R2 原图存储、网页预览和原片下载
- `/studio` 内容发布后台（草稿、发布、插图、相册、评论管理）
- D1 内容数据库与 R2 对象存储
- 可读取已发布网站内容的 AI 助手
- 桌面端与手机端独立纵向滚动适配

## Cloudflare 绑定

- D1：`DB` → `xingyueji-db`
- R2：`BUCKET` → `xingyueji-media`
- Secret：`ADMIN_PASSWORD`（必须在 Cloudflare Settings → Variables and Secrets 中设置）
- 可选 Secret：`DEEPSEEK_API_KEY`（未设置时复用现有 `qwen-ai` Worker）

数据库表会在首次 API 请求时自动创建，无需手动执行 SQL。

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

不要将 `.dev.vars`、API Key 或后台密码提交到 GitHub。
