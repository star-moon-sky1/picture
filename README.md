# 星月集（xingyueji）

个人网站与 Cloudflare 全栈内容管理系统。

## 功能

- 首页最新版本卡片、可回溯的完整版本历史与页脚版本自动同步
- 可在后台增删、改名和排序的个人空间大板块与图片相册子板块
- 文章/评论点赞与点踩、游客评论和回复
- 文章在浏览器内生成 PDF 并直接下载（不打开打印窗口）
- R2 原图存储、网页预览和原片下载
- R2 大文件/整个文件夹分片上传，PDF/Word 在线预览，ZIP 等压缩包直接下载
- 视频网页播放、手动清晰度版本与 Cloudflare Stream 自动画质入口
- 文件、文件夹、文档和视频可作为资源卡片插入文章正文
- 白天、夜览、跟随系统三种全站主题，并在当前浏览器记住选择
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
│  ├─ studio.html     # 内容发布后台
│  ├─ document-viewer.html # Word 在线阅读器
│  ├─ theme.js        # 全站主题选择和系统主题监听
│  └─ theme.css       # 全站夜览覆盖样式
├─ package.json
└─ package-lock.json
```

不要把 `src` 目录误写成 `scr`，也不要只上传文件而漏掉 `public` 文件夹。
部署后访问 `/api/health`，看到 `version: "2.2.0.0"` 即表示最新 Worker 已生效。

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

## 大文件与视频的使用方法

1. 打开 `/studio` →“文件与视频”，先选择当前文件夹、可见范围和下载权限。
2. “上传文件/视频”可多选；“上传整个文件夹”会保留浏览器提供的目录层级。
3. 浏览器把每个文件切成 32MiB 分片，逐片写入 R2。请等进度显示“上传完成”再关闭页面。
4. Word 文档可直接使用浏览器阅读器；若版式复杂，可点“上传 PDF 预览”补充一份 PDF。
5. 视频可以点“上传清晰度”分别补充 360p、480p、720p、1080p 文件。若已开通
   Cloudflare Stream，也可点“接入自动画质”粘贴 `.m3u8` 地址。
6. 文件夹若需要一个按钮整包下载，先上传 ZIP/7z/RAR，再在文件夹卡片点“设置整包下载”。
7. 编辑文章时点“插入文件/视频”，即可插入资源卡片；文章只保存资源 ID，不复制大文件。

R2 单对象上限约 4.995TiB。实际能否顺利上传还取决于浏览器、设备磁盘、网络稳定性和
Cloudflare 套餐；中断的 multipart 会话保留24小时，并在下次打开 Studio 后清理过期分片。

普通用户的原始密码不会保存到 D1。数据库仅保存带随机盐的 PBKDF2 哈希；Studio
只能查看密码最后修改时间、停用账号或处理重置申请，不能查看用户密码。

## 本地开发

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

不要将 `.dev.vars`、API Key 或后台密码提交到 GitHub。
