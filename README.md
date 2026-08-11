# 星月集（xingyueji）

个人网站与 Cloudflare 全栈内容管理系统。

## 功能

- 首页最新版本卡片、可回溯的完整版本历史与页脚版本自动同步
- 可在后台增删、改名和排序的个人空间大板块与图片相册子板块
- 文章/评论点赞与点踩、游客评论和回复
- 文章在浏览器内生成 PDF 并直接下载（不打开打印窗口）
- R2 原图存储、网页预览和原片下载
- `/studio` 内容发布后台（草稿、发布、插图、板块、相册、评论、留言管理）
- 独立登录页、游客入口、三步注册申请与站长审核
- 审核通过后开放 AI 和会员内容；前端与 Worker 后端双重鉴权
- 用户可修改昵称和密码，Studio 可查看近实时在线状态与最近90天登录痕迹
- 忘记密码采用站长核实后生成的24小时一次性重置链接
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
│  ├─ login.html      # 登录、注册和密码重置
│  └─ studio.html     # 内容发布后台
├─ package.json
└─ package-lock.json
```

不要把 `src` 目录误写成 `scr`，也不要只上传文件而漏掉 `public` 文件夹。
部署后访问 `/api/health`，看到 `version: "1.9.0.0"` 即表示最新 Worker 已生效。

## Cloudflare 绑定

- D1：`DB` → `xingyueji-db`
- R2：`BUCKET` → `xingyueji-media`
- Secret：`ADMIN_PASSWORD`（必须在 Cloudflare Settings → Variables and Secrets 中设置）
- 可选 Secret：`DEEPSEEK_API_KEY`（未设置时复用现有 `qwen-ai` Worker）
- 可选 Secret：`WECOM_WEBHOOK_URL`（企业微信群机器人通知地址）
- QQ 普通变量：`QQ_BOT_APP_ID`（当前已在 `wrangler.jsonc` 中填写）
- QQ 必需 Secret：`QQ_BOT_SECRET`（QQ 机器人 AppSecret，严禁提交到 GitHub）
- QQ 可选 Secret：`QQ_BIND_CODE`（防止其他人抢先绑定网站通知）
- 可选 Secret：`FEEDBACK_WEBHOOK_URL`（其他通用 HTTPS Webhook 中转）

数据库表会在首次 API 请求时自动创建，无需手动执行 SQL。

普通用户的原始密码不会保存到 D1。数据库仅保存带随机盐的 PBKDF2 哈希；Studio
只能查看密码最后修改时间、停用账号或处理重置申请，不能查看用户密码。

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

不要将 `.dev.vars`、API Key 或后台密码提交到 GitHub。
