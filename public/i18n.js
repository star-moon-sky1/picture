/* 星月集统一界面翻译：静态标签、弹窗和接口动态内容共用同一条转换链。 */
(() => {
  "use strict";

  /* Studio 是站长工作台，始终使用简体中文，不继承前台访客的语言偏好。 */
  if (/^\/studio(?:\/|$)/.test(location.pathname)
    || document.documentElement.dataset.i18nScope === "admin") return;

  const STORAGE_KEY = "xyj_front_language";
  const LEGACY_STORAGE_KEY = "xyj_language";
  const VALID = new Set(["zh-CN", "zh-TW", "en"]);
  const ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"];
  const nodeSources = new WeakMap();
  const attributeSources = new WeakMap();
  const renderedText = new WeakMap();
  const renderedAttributes = new WeakMap();
  let language = readLanguage();
  let mutationTimer = 0;
  let observer = null;

  const fallback = {
    "zh-TW": new Map(Object.entries({
      "主页": "主頁", "个人空间": "個人空間", "关于我": "關於我", "留言与反馈": "留言與回饋",
      "设置": "設定", "登录账号": "登入帳號", "注册账号": "註冊帳號", "修改密码": "修改密碼",
      "登录并进入网站": "登入並進入網站", "以游客身份浏览": "以訪客身分瀏覽", "跟随系统": "跟隨系統",
      "白天模式": "白天模式", "夜览模式": "夜覽模式", "创建桌面访问": "建立桌面存取",
      "简体中文": "簡體中文", "本站使用说明": "本站使用說明", "文件资源": "檔案資源",
      "公开留言板": "公開留言板", "提交给站长": "提交給站長", "发送": "傳送", "关闭": "關閉",
    })),
    en: new Map(Object.entries({
      "主页": "Home", "个人空间": "Personal Space", "关于我": "About Me", "留言与反馈": "Feedback",
      "AI 助手": "AI Assistant", "设置": "Settings", "登录账号": "Sign in", "注册账号": "Create account",
      "修改密码": "Change password", "登录并进入网站": "Sign in", "以游客身份浏览": "Browse as guest",
      "跟随系统": "Follow system", "白天模式": "Light mode", "夜览模式": "Dark mode",
      "创建桌面访问": "Install app", "简体中文": "Simplified Chinese", "繁體中文": "Traditional Chinese",
      "本站使用说明": "Site Guide", "文件资源": "Files", "公开留言板": "Public Messages",
      "提交给站长": "Send to owner", "发送": "Send", "关闭": "Close", "全部": "All",
    })),
  };

  /*
   * 翻译只在浏览器本地完成，不把文章、通知、私信或站长自定义内容发送给外部模型。
   * 繁体转换覆盖全站常用字；英文短语表按长词优先替换，让已收录的动态标签立即变化。
   */
  const traditionalCharacters = new Map(Object.entries({
    "个":"個","为":"為","么":"麼","义":"義","习":"習","乡":"鄉","书":"書","买":"買","乱":"亂","争":"爭","于":"於","亏":"虧","云":"雲","亚":"亞","产":"產","仅":"僅","从":"從","仓":"倉","仪":"儀","们":"們","价":"價","众":"眾","优":"優","会":"會","传":"傳","伤":"傷","体":"體","余":"餘","侠":"俠","侣":"侶","侦":"偵","侧":"側","侨":"僑","俩":"倆","俭":"儉","债":"債","倾":"傾","偿":"償","储":"儲","儿":"兒","兑":"兌","党":"黨","兰":"蘭","关":"關","兴":"興","养":"養","兽":"獸","冈":"岡","册":"冊","写":"寫","军":"軍","农":"農","冲":"沖","决":"決","况":"況","冻":"凍","净":"淨","凉":"涼","减":"減","凑":"湊","几":"幾","凤":"鳳","凭":"憑","凯":"凱","击":"擊","凿":"鑿","划":"劃","刘":"劉","则":"則","刚":"剛","创":"創","删":"刪","别":"別","剂":"劑","剑":"劍","剧":"劇","劝":"勸","办":"辦","务":"務","动":"動","励":"勵","劲":"勁","劳":"勞","势":"勢","勋":"勳","华":"華","协":"協","单":"單","卖":"賣","卢":"盧","卫":"衛","却":"卻","厅":"廳","历":"歷","压":"壓","厌":"厭","厕":"廁","县":"縣","参":"參","双":"雙","发":"發","变":"變","叙":"敘","叶":"葉","号":"號","叹":"嘆","吗":"嗎","听":"聽","启":"啟","吴":"吳","员":"員","呛":"嗆","呜":"嗚","咏":"詠","咙":"嚨","响":"響","哑":"啞","哗":"嘩","唤":"喚","啸":"嘯","喷":"噴","嘱":"囑","团":"團","园":"園","围":"圍","国":"國","图":"圖","圆":"圓","圣":"聖","场":"場","坏":"壞","块":"塊","坚":"堅","坛":"壇","坝":"壩","坞":"塢","垫":"墊","墙":"牆","壮":"壯","声":"聲","壳":"殼","处":"處","备":"備","复":"復","够":"夠","头":"頭","夹":"夾","夺":"奪","奖":"獎","奥":"奧","妇":"婦","妈":"媽","娇":"嬌","娱":"娛","孙":"孫","学":"學","宁":"寧","宝":"寶","实":"實","审":"審","宪":"憲","宫":"宮","宽":"寬","宾":"賓","对":"對","寻":"尋","导":"導","寿":"壽","将":"將","尔":"爾","尘":"塵","尝":"嘗","层":"層","届":"屆","属":"屬","岁":"歲","岛":"島","岭":"嶺","岳":"嶽","峡":"峽","币":"幣","帅":"帥","师":"師","帐":"帳","帘":"簾","带":"帶","帮":"幫","干":"幹","并":"並","广":"廣","庄":"莊","庆":"慶","庐":"廬","库":"庫","应":"應","庙":"廟","废":"廢","开":"開","异":"異","弃":"棄","张":"張","弥":"彌","弯":"彎","弹":"彈","强":"強","归":"歸","录":"錄","当":"當","彻":"徹","径":"徑","忆":"憶","忧":"憂","态":"態","怀":"懷","总":"總","恋":"戀","恶":"惡","恼":"惱","悬":"懸","惊":"驚","惧":"懼","惨":"慘","惩":"懲","惯":"慣","愿":"願","戏":"戲","户":"戶","执":"執","扩":"擴","扫":"掃","扬":"揚","扰":"擾","抚":"撫","抛":"拋","抢":"搶","护":"護","报":"報","担":"擔","拟":"擬","拢":"攏","拥":"擁","拨":"撥","择":"擇","挂":"掛","挡":"擋","挤":"擠","挥":"揮","损":"損","换":"換","据":"據","掷":"擲","揽":"攬","搅":"攪","摄":"攝","摆":"擺","摇":"搖","撑":"撐","数":"數","斋":"齋","斩":"斬","断":"斷","无":"無","旧":"舊","时":"時","显":"顯","晋":"晉","晓":"曉","暂":"暫","术":"術","机":"機","杀":"殺","杂":"雜","权":"權","条":"條","来":"來","杨":"楊","极":"極","构":"構","枪":"槍","标":"標","样":"樣","树":"樹","档":"檔","桥":"橋","梦":"夢","检":"檢","楼":"樓","欢":"歡","欧":"歐","步":"步","残":"殘","毁":"毀","毕":"畢","气":"氣","汇":"匯","汉":"漢","汤":"湯","沟":"溝","没":"沒","泽":"澤","洁":"潔","浅":"淺","测":"測","济":"濟","浏":"瀏","浓":"濃","涂":"塗","涛":"濤","润":"潤","涩":"澀","渊":"淵","渐":"漸","温":"溫","湾":"灣","湿":"濕","满":"滿","滤":"濾","滥":"濫","滚":"滾","滨":"濱","潜":"潛","灭":"滅","灯":"燈","灵":"靈","灾":"災","点":"點","炼":"煉","热":"熱","爱":"愛","爷":"爺","牵":"牽","犹":"猶","独":"獨","狭":"狹","猎":"獵","猫":"貓","现":"現","环":"環","琐":"瑣","电":"電","画":"畫","畅":"暢","疗":"療","监":"監","盖":"蓋","盘":"盤","着":"著","睁":"睜","确":"確","码":"碼","砖":"磚","礼":"禮","离":"離","种":"種","积":"積","称":"稱","稳":"穩","窝":"窩","竞":"競","笔":"筆","笼":"籠","签":"簽","简":"簡","粮":"糧","级":"級","纪":"紀","约":"約","红":"紅","纤":"纖","纯":"純","纲":"綱","纳":"納","纵":"縱","纷":"紛","纸":"紙","纹":"紋","纽":"紐","线":"線","练":"練","组":"組","细":"細","织":"織","终":"終","绍":"紹","经":"經","绑":"綁","结":"結","给":"給","络":"絡","统":"統","继":"繼","续":"續","维":"維","综":"綜","绿":"綠","编":"編","缘":"緣","缩":"縮","缴":"繳","网":"網","罗":"羅","罚":"罰","职":"職","联":"聯","聪":"聰","肃":"肅","胜":"勝","胁":"脅","脑":"腦","脚":"腳","脱":"脫","脸":"臉","腊":"臘","腾":"騰","舆":"輿","舰":"艦","艺":"藝","节":"節","范":"範","药":"藥","获":"獲","营":"營","萧":"蕭","蓝":"藍","虑":"慮","虚":"虛","虫":"蟲","虽":"雖","补":"補","装":"裝","览":"覽","观":"觀","规":"規","视":"視","觉":"覺","触":"觸","订":"訂","计":"計","认":"認","讨":"討","让":"讓","训":"訓","议":"議","讯":"訊","记":"記","讲":"講","许":"許","论":"論","设":"設","访":"訪","证":"證","评":"評","识":"識","诉":"訴","词":"詞","译":"譯","试":"試","诗":"詩","诚":"誠","话":"話","询":"詢","该":"該","详":"詳","语":"語","误":"誤","说":"說","请":"請","诸":"諸","诺":"諾","读":"讀","课":"課","调":"調","谈":"談","谢":"謝","谱":"譜","贝":"貝","负":"負","贡":"貢","财":"財","责":"責","败":"敗","账":"賬","货":"貨","质":"質","贩":"販","贫":"貧","购":"購","贯":"貫","贴":"貼","贵":"貴","贷":"貸","贸":"貿","费":"費","贺":"賀","资":"資","赞":"讚","赠":"贈","赢":"贏","赵":"趙","赶":"趕","跃":"躍","践":"踐","车":"車","轨":"軌","转":"轉","轮":"輪","软":"軟","轴":"軸","轻":"輕","载":"載","较":"較","辅":"輔","辆":"輛","边":"邊","辽":"遼","达":"達","迁":"遷","过":"過","运":"運","还":"還","这":"這","进":"進","远":"遠","违":"違","连":"連","迟":"遲","选":"選","递":"遞","遗":"遺","邮":"郵","邻":"鄰","郑":"鄭","酿":"釀","释":"釋","里":"裡","鉴":"鑒","钟":"鐘","钢":"鋼","钥":"鑰","钱":"錢","锁":"鎖","错":"錯","长":"長","门":"門","闭":"閉","问":"問","间":"間","闹":"鬧","闻":"聞","阅":"閱","队":"隊","阳":"陽","阴":"陰","阶":"階","际":"際","陆":"陸","陈":"陳","险":"險","随":"隨","隐":"隱","难":"難","雾":"霧","静":"靜","顶":"頂","顺":"順","须":"須","预":"預","领":"領","颇":"頗","颜":"顏","风":"風","飞":"飛","饭":"飯","饮":"飲","饱":"飽","馆":"館","马":"馬","验":"驗","惊":"驚","骂":"罵","鱼":"魚","鸟":"鳥","麦":"麥","黄":"黃","齐":"齊","龙":"龍"
  }));

  const englishPhrases = new Map(Object.entries({
    "文件与视频": "Files & Videos",
    "本板块": "This section",
    "已锁定": "Locked",
    "解锁照片": "Unlock photo",
    "输入一次性密码": "Enter one-time code",
    "站长提供的六位数字密码": "Six-digit code provided by the owner",
    "六位数字密码": "Six-digit code",
    "之前的密码已使用，请联系站长设置新密码。": "The previous code has been used. Ask the owner for a new code.",
    "密码只能成功使用一次。本次查看最多保留 15 分钟，关闭或刷新后需要新密码。": "The code works once. Access lasts up to 15 minutes; closing or refreshing requires a new code.",
    "正在核对…": "Checking…",
    "解锁": "Unlock",
    "此处有内容，已开启一次性密码锁。": "Content is available here, protected by a one-time code.",
    "这个板块还没有可查看的文章。": "No articles are available in this section.",
    "这个板块还没有可查看的照片。": "No photos are available in this section.",
    "这个板块暂时没有可查看的文件与视频。": "No files or videos are available in this section.",
    "暂无可查看的文章。": "No articles are available.",
    "暂无可查看的图片。": "No photos are available.",
    "暂无可查看的文件与视频。": "No files or videos are available.",
    "此图片未开放下载": "Downloading this image is not permitted",
    "无权查看此图片": "You do not have permission to view this image",
    "内容已上锁": "Content locked",
    "内容不存在或没有查看权限": "Content not found or viewing is not permitted",
    "此内容已上锁，请输入站长提供的一次性密码": "Enter the one-time code provided by the owner to unlock this content",
    "当前账号没有此内容的下载权限": "Your account cannot download this content",
    "欢迎来到星月集": "Welcome to Xingyueji",
    "主要导航": "Main navigation",
    "主页": "Home",
    "个人空间": "Personal Space",
    "关于我": "About Me",
    "留言与反馈": "Feedback",
    "AI 助手": "AI Assistant",
    "设置": "Settings",
    "展开侧边栏": "Expand sidebar",
    "收起侧边栏": "Collapse sidebar",
    "打开通知信箱": "Open notifications",
    "通知信箱": "Notifications",
    "通知与私信": "Notifications & Messages",
    "通知信箱还是空的。": "Your notification inbox is empty.",
    "还没有私信会话。你可以点击评论头像发起交流。": "No conversations yet. Select a comment avatar to start one.",
    "私信内容": "Message",
    "输入私信…": "Write a message…",
    "发送": "Send",
    "关闭": "Close",
    "界面语言": "Interface language",
    "账号管理": "Account",
    "查看账户状态": "View account status",
    "创建桌面访问": "Install app",
    "登录页面主题": "Sign-in theme",
    "登录与注册页面主题": "Sign-in and registration theme",
    "设置页面主题": "Settings theme",
    "跟随系统": "Follow system",
    "白天模式": "Light mode",
    "夜览模式": "Dark mode",
    "定时夜览": "Scheduled dark mode",
    "简体中文": "Simplified Chinese",
    "繁體中文": "Traditional Chinese",
    "英语": "English",
    "站长后台": "Admin Studio",
    "网站版本": "Site version",
    "本站使用说明": "Site Guide",
    "查看完整本站使用说明": "View the full site guide",
    "查看往期版本更新说明": "View earlier versions",
    "登录账号": "Sign in",
    "登录": "Sign in",
    "登录用户名": "Username",
    "输入登录用户名": "Enter your username",
    "密码": "Password",
    "输入密码": "Enter your password",
    "保持登录30天": "Keep me signed in for 30 days",
    "忘记密码？": "Forgot password?",
    "登录并进入网站": "Sign in",
    "以游客身份浏览": "Browse as guest",
    "请先完成人机验证。": "Complete the human verification first.",
    "登录与游客人机验证": "Sign-in and guest verification",
    "正在登录…": "Signing in…",
    "登录成功，正在进入网站…": "Signed in. Opening the site…",
    "正在以游客身份进入…": "Entering as a guest…",
    "正在核验并进入游客模式…": "Verifying and entering guest mode…",
    "人机验证已通过，可以进入游客模式。": "Verification complete. Guest access is ready.",
    "人机验证失败，请刷新或更换网络后重试。": "Verification failed. Refresh the page or try another network.",
    "注册账号": "Create account",
    "申请注册": "Create an account",
    "创建账号": "Create account",
    "注册进度": "Registration progress",
    "昵称": "Nickname",
    "在网站中显示的名称": "Name shown on the site",
    "设置密码": "Set password",
    "确认密码": "Confirm password",
    "再次输入密码": "Enter the password again",
    "下一步": "Next",
    "上一步": "Back",
    "验证信息": "Verify details",
    "确认提交": "Review and submit",
    "真实姓名或常用昵称（写社交平台昵称亦可）": "Real name or familiar nickname (social profile names are also accepted)",
    "联系方式类型": "Contact type",
    "联系方式类型（选填）": "Contact type (optional)",
    "联系方式（选填）": "Contact (optional)",
    "邀请码（选填）": "Invitation code (optional)",
    "备注（选填）": "Note (optional)",
    "提交注册申请": "Submit registration",
    "正在提交注册申请…": "Submitting registration…",
    "注册申请已经提交。审核完成前仍可浏览公开内容。": "Your application has been submitted. Public content remains available during review.",
    "申请重置密码": "Request password reset",
    "设置新密码": "Set a new password",
    "新密码": "New password",
    "确认新密码": "Confirm new password",
    "正在重置密码…": "Resetting password…",
    "修改密码": "Change password",
    "正在修改密码…": "Changing password…",
    "密码已修改，其他设备上的登录已经失效。": "Password changed. Sessions on other devices have been signed out.",
    "返回登录": "Back to sign in",
    "返回网站首页": "Back to home",
    "进入网站": "Enter site",
    "已通过审核": "Approved",
    "等待审核": "Pending review",
    "审核未通过": "Not approved",
    "账号已停用": "Account disabled",
    "账号正在等待审核": "Your account is awaiting review",
    "账号已获得完整权限，可以使用 AI 助手并查看会员内容。": "Your account has full access to the AI assistant and member content.",
    "登录后可以查看账户状态、修改昵称和密码。": "Sign in to view your account status and update your nickname or password.",
    "个人空间板块": "Personal space sections",
    "大板块与小板块": "Sections and subsections",
    "全部": "All",
    "文章": "Articles",
    "照片": "Photos",
    "文件资源": "Files",
    "文件夹": "Folder",
    "根目录": "Root",
    "未分类": "Uncategorized",
    "未命名文章": "Untitled article",
    "未填写": "Not provided",
    "未标注": "Not specified",
    "时间未知": "Unknown time",
    "点击阅读全文": "Read full article",
    "点击放大查看": "Open full view",
    "打开文件夹查看内容": "Open folder",
    "这个文件夹暂时没有可见资源。": "This folder has no visible files yet.",
    "这个图片板块还没有上传图片或文件。": "No images or files have been uploaded to this section yet.",
    "还没有个人空间板块，请在站长后台新建。": "No personal-space sections yet. Create one in Admin Studio.",
    "在线预览": "Preview online",
    "预览": "Preview",
    "下载": "Download",
    "直接下载": "Download",
    "登录后下载": "Sign in to download",
    "下载原文件": "Download original file",
    "下载原始视频": "Download original video",
    "下载音频": "Download audio",
    "原始文件": "Original file",
    "自动画质": "Auto quality",
    "键盘：←/→ 快退/快进 5 秒，↑/↓ 调节音量": "Keyboard: ←/→ seek 5 seconds; ↑/↓ adjust volume",
    "当前浏览器不支持 HLS 自动画质": "This browser does not support automatic HLS quality.",
    "文件预览": "File preview",
    "图片预览": "Image preview",
    "照片预览": "Photo preview",
    "上一张照片": "Previous photo",
    "下一张照片": "Next photo",
    "照片缩放": "Photo zoom",
    "缩小照片": "Zoom out",
    "放大照片": "Zoom in",
    "还原": "Reset",
    "已经是第一张了": "This is the first photo.",
    "已经是最后一张了": "This is the last photo.",
    "知道了": "Got it",
    "正在读取文档…": "Loading document…",
    "正在读取…": "Loading…",
    "无法读取内容": "Unable to load content",
    "文档不存在，或当前账号没有访问权限": "The document does not exist or your account cannot access it.",
    "浏览器不能直接预览这种文件格式，你可以使用下方下载按钮保存原件。": "This file type cannot be previewed in the browser. Use the download button below.",
    "留言": "Message",
    "公开留言板": "Public messages",
    "游客署名": "Guest name",
    "姓名或称呼": "Name",
    "写下想说的话…": "Write your message…",
    "提交给站长": "Send to owner",
    "正在提交…": "Submitting…",
    "已提交，站长后台会显示这条信息。": "Submitted. The site owner will see your message in Admin Studio.",
    "还没有公开留言。": "No public messages yet.",
    "回复": "Reply",
    "回复内容": "Reply",
    "站长回复": "Owner reply",
    "站长": "Owner",
    "评论于": "Commented",
    "回复于": "Replied",
    "写下评论…": "Write a comment…",
    "发表": "Post",
    "正在发表…": "Posting…",
    "评论已发表。": "Comment posted.",
    "还没有评论，欢迎留下第一条留言。": "No comments yet. Be the first to respond.",
    "作者已赞": "Liked by the author",
    "置顶": "Pin",
    "请登录以使用完整功能": "Sign in to use all features",
    "AI 助手仅向审核通过的账号开放。你可以立即登录或提交注册申请。": "The AI assistant is available to approved accounts. Sign in or submit a registration request.",
    "AI 正在生成回答…": "The AI assistant is responding…",
    "AI 暂时没有返回内容。": "The AI assistant did not return a response.",
    "输入问题": "Ask a question",
    "输入问题…": "Ask a question…",
    "生成中…": "Generating…",
    "外部链接": "External link",
    "确认后访问": "Continue",
    "刷新页面": "Refresh page",
    "关闭页面": "Close page",
    "数据服务尚未完成部署。": "The data service is not ready yet.",
    "文件服务暂时不可用。": "The file service is temporarily unavailable.",
    "留言服务暂时不可用。": "The message service is temporarily unavailable.",
    "未知错误": "Unknown error",
    "公开": "Public",
    "草稿": "Draft",
    "已发布": "Published",
    "状态": "Status",
    "标题": "Title",
    "摘要": "Summary",
    "正文": "Article body",
    "上传图片": "Upload image",
    "上传文件": "Upload file",
    "上传文件/视频": "Upload file/video",
    "上传成功": "Upload complete",
    "上传完成": "Upload complete",
    "保存权限": "Save permissions",
    "删除": "Delete",
    "刷新": "Refresh",
    "星月集": "Xingyueji",
    "星月集 - 个人主页": "Xingyueji — Personal Home",
    "星月集的个人网站": "Xingyueji's personal website",
    "星月集渐变毛玻璃头像": "Xingyueji frosted-glass avatar",
    "注册与账户帮助 - 星月集": "Registration & Account Help — Xingyueji",
    "文档预览 · 星月集": "Document Preview · Xingyueji",
    "版本更新说明": "Release Notes",
    "查看往期 →": "View earlier notes →",
    "正在读取更新记录…": "Loading release notes…",
    "还没有更新记录。": "No release notes yet.",
    "游客模式仅显示公开内容": "Guest mode shows public content only",
    "在线浏览文件夹、PDF/Word 文档和视频；下载按钮会根据游客或登录权限自动显示。": "Browse folders, PDF/Word documents, and videos online. Download controls appear according to guest or account permissions.",
    "下载文件夹整包": "Download folder as ZIP",
    "支持整包下载": "ZIP download available",
    "返回上一级": "Up one level",
    "正在读取文件目录…": "Loading folder…",
    "← 返回主页": "← Back to home",
    "往期版本更新说明": "Earlier Release Notes",
    "每次更新都以独立记录保存，可以按时间回溯。": "Each update is saved separately so you can review the site history by date.",
    "就读院校与专业": "School & Major",
    "目前学习方向": "Current Focus",
    "联系方式": "Contact",
    "国内邮箱": "China Email",
    "国际邮箱": "International Email",
    "联系方式（选填，仅站长可见）": "Contact (optional, visible only to the site owner)",
    "类型": "Type",
    "网站问题": "Site issue",
    "功能建议": "Feature request",
    "内容": "Details",
    "允许将这条留言公开显示在留言板": "Allow this message to appear on the public message board",
    "登录后即可留言": "Sign in to leave a message",
    "正在读取留言…": "Loading messages…",
    "你好！欢迎来到星月集的网站，我是AI助手，除了日常问题，我还了解网站内内容，欢迎提问！": "Hello! Welcome to Xingyueji. I am the AI assistant. I can answer everyday questions and questions about this site.",
    "账户中心": "Account Center",
    "查看审核状态、修改昵称与登录密码。": "View your review status and update your nickname or password.",
    "账户状态": "Account status",
    "读取中": "Loading",
    "当前昵称": "Current nickname",
    "注册时间": "Registration date",
    "最后登录": "Last sign-in",
    "退出账号": "Sign out",
    "修改昵称": "Change nickname",
    "新昵称": "New nickname",
    "保存昵称": "Save nickname",
    "当前密码": "Current password",
    "显示与语言": "Display & Language",
    "访问已终止": "Access terminated",
    "检测到异常自动化行为，当前页面已停止运行。": "Unusual automated activity was detected, so this page has stopped running.",
    "页面正在尝试关闭；如果浏览器阻止自动关闭，请手动关闭此标签页。": "The page is trying to close. If your browser blocks it, close this tab manually.",
    "本标签页此前因异常自动化行为被终止，请将其关闭后重新访问。": "This tab was previously stopped because of unusual automated activity. Close it and visit again.",
    "安装星月集": "Install Xingyueji",
    "请使用浏览器的“安装应用”或“添加到主屏幕”功能。": "Use your browser's “Install app” or “Add to Home Screen” command.",
    "请打开浏览器菜单，选择“安装应用”“创建快捷方式”或“添加到主屏幕”。": "Open the browser menu and choose “Install app,” “Create shortcut,” or “Add to Home Screen.”",
    "星月集已经作为应用运行，无需重复安装。": "Xingyueji is already running as an installed app.",
    "本次安装已取消。以后仍可在“设置”中再次选择“创建桌面访问”。": "Installation was cancelled. You can choose “Install app” again later in Settings.",
    "登录并通过审核后即可使用 AI 助手并查看个人空间完整内容。": "Sign in with an approved account to use the AI assistant and view all Personal Space content.",
    "注册": "Create account",
    "暂不登录": "Not now",
    "确认打开链接": "Open external link?",
    "你即将离开当前文章，请核对目标网站后再继续。": "You are about to leave this article. Check the destination before continuing.",
    "目标网站": "Destination",
    "取消": "Cancel",
    "继续访问": "Continue",
    "评论": "Comments",
    "登录后即可评论和点赞": "Sign in to comment and react",
    "今日游客名额已满": "Today's guest limit has been reached",
    "本日游客浏览已达流量上限，请注册账号进行浏览": "Guest traffic has reached today's limit. Create an account to continue browsing.",
    "返回": "Back",
    "下载原片": "Download original photo",
    "邮箱、微信或 QQ": "Email, WeChat, or QQ",
    "至少8位，包含字母和数字": "At least 8 characters, including letters and numbers",
    "不填写": "None",
    "微信": "WeChat",
    "邮箱": "Email",
    "手机号": "Phone number",
    "其他": "Other",
    "注册时的联系方式": "Contact used during registration",
    "提交重置申请": "Submit reset request",
    "正在验证一次性重置链接…": "Verifying the one-time reset link…",
    "确认重置密码": "Reset password",
    "你已经登录": "You are signed in",
    "账户状态：": "Account status:",
    "4—32位字母、数字或 _ . -": "4–32 letters, numbers, or _ . -",
    "便于站长确认你的身份": "Helps the site owner verify your identity",
    "可以留空": "Optional",
    "主要面向与站长不认识的申请人，可简单说明身份、认识途径或注册原因": "If the site owner does not know you, briefly describe who you are, how you know them, or why you are registering",
    "没有邀请码可以留空": "Leave blank if you do not have an invitation code",
    "正在加载 Word 文档组件和文件内容…": "Loading the Word viewer and document…",
    "备注": "Note",
    "邀请码": "Invitation code",
    "两次输入的密码不一致。": "The passwords do not match.",
    "两次输入的新密码不一致。": "The new passwords do not match.",
    "密码至少需要包含一个字母和一个数字。": "The password must include at least one letter and one number.",
    "新密码至少需要包含一个字母和一个数字。": "The new password must include at least one letter and one number.",
    "链接无效、已使用或已过期，请重新申请密码重置。": "This link is invalid, already used, or expired. Request another password reset.",
    "打开夜览模式": "Turn on dark mode",
    "关闭夜览模式": "Turn off dark mode",
    "▶ 视频": "▶ Video",
    "通知信箱栏目": "Notification inbox section",
    "当前账号暂时不能下载文章 PDF 或图片原片，请前往账户中心查看审核状态。": "This account cannot download article PDFs or original photos yet. Check the review status in Account Center.",
    "文章 PDF 与图片原片仅向审核通过的账号开放；游客仍可阅读文章和查看图片预览。": "Article PDFs and original photos are available only to approved accounts. Guests can still read articles and view photo previews.",
    "站长审核通过后，文章 PDF 与图片原片下载会自动开放。": "Article PDF and original-photo downloads will unlock automatically after approval.",
    "站长审核通过后，AI 助手和个人空间完整内容会自动开放。": "The AI assistant and full Personal Space content will unlock automatically after approval.",
    "账号暂时没有完整权限": "This account does not have full access yet",
    "请前往账户中心查看审核状态；如有疑问，可以通过留言与反馈联系站长。": "Check the review status in Account Center. If you have questions, contact the site owner through Feedback.",
    "正在保存…": "Saving…",
    "已保存": "Saved",
    "昵称已更新。": "Nickname updated.",
    "流式连接不可用，正在自动切换兼容模式…": "Streaming is unavailable. Switching to compatibility mode…",
    "AI 没有返回内容": "The AI assistant returned no content.",
    "HLS 组件加载失败": "The HLS component failed to load",
    "LaTeX 排版失败，已保留原始文字": "LaTeX rendering failed. The original text has been preserved.",
    "加载组件…": "Loading component…",
    "验证已过期，请重新完成验证。": "Verification expired. Complete it again.",
    "人机验证组件加载失败，请检查网络或拦截扩展": "The verification component failed to load. Check your network or blocking extensions.",
    "人机验证组件未正确初始化": "The verification component did not initialize correctly.",
    "人机验证配置尚未补齐，正在通过访问频率限制进入…": "Verification is not fully configured. Continuing with rate-limited access…",
    "下载 PDF 原件": "Download original PDF",
    "下载 Word 原件": "Download original Word file",
    "拍摄照片": "Take photo",
    "查看照片": "View photo",
    "随笔": "Essays",
    "提醒设置已保存。": "Notification settings saved.",
    "不能给自己发送私信。": "You cannot message yourself.",
    "账号通过审核后才能使用私信。": "Messaging is available after your account is approved.",
    "文档地址无效。": "The document URL is invalid.",
    "Word 解析组件没有正确加载": "The Word parser did not load correctly",
    "Word 解析组件加载失败，请检查网络或让站长上传 PDF 预览版本": "The Word parser failed to load. Check your network or ask the site owner to upload a PDF preview.",
    "旧版 .doc 无法在浏览器中安全解析，请下载原件，或让站长在 Studio 上传 PDF 预览版本。": "Legacy .doc files cannot be parsed safely in the browser. Download the original or ask the site owner to upload a PDF preview in Studio."
  }));

  /*
   * 只处理明确的界面句式；文章标题、昵称和错误编号等动态片段原样保留。
   * 这样动态控件能完整切换英文，又不会把用户内容误当成界面文案翻译。
   */
  const englishTemplates = [
    [/^(.+) - 个人主页$/u, ([, site]) => `${site} — Personal Home`],
    [/^(.+)的个人网站$/u, ([, site]) => `${site}'s personal website`],
    [/^“(.+)”尚未发布内容。$/u, ([, title]) => `“${title}” has no published content yet.`],
    [/^(.+) 个版本$/u, ([, count]) => `${count} versions`],
    [/^(.+)（登录后可用）$/u, ([, label]) => `${englishPhrases.get(label) || label} (available after signing in)`],
    [/^发布时间：(.+)$/u, ([, value]) => `Published: ${value}`],
    [/^最新修改：(.+)$/u, ([, value]) => `Last updated: ${value}`],
    [/^查看图片：(.+)$/u, ([, title]) => `View image: ${title}`],
    [/^播放视频：(.+)$/u, ([, title]) => `Play video: ${title}`],
    [/^与 (.+) 私信$/u, ([, name]) => `Message ${name}`],
    [/^与 (.+) 的私信$/u, ([, name]) => `Conversation with ${name}`],
    [/^正在为“(.+)”重置密码。本链接将在24小时内失效，且只能使用一次。$/u,
      ([, name]) => `Resetting the password for “${name}”. This link expires in 24 hours and can be used only once.`],
    [/^请求失败（(.+)）$/u, ([, detail]) => `Request failed (${detail})`],
    [/^PDF 组件读取失败（(.+)）$/u, ([, detail]) => `Could not load the PDF component (${detail})`],
    [/^文档读取失败（(.+)）$/u, ([, detail]) => `Could not load the document (${detail})`],
    [/^PDF 生成失败：(.+)。请刷新页面后重试。$/u,
      ([, detail]) => `PDF generation failed: ${detail}. Refresh the page and try again.`],
    [/^暂时无法回答：(.+)$/u, ([, detail]) => `Unable to answer right now: ${detail}`],
    [/^网站数据暂时无法读取：(.+)$/u, ([, detail]) => `Site data is temporarily unavailable: ${detail}`],
    [/^人机验证暂缺 (.+)，当前由访问频率限制保护，仍可进入游客模式。$/u,
      ([, detail]) => `Verification is missing ${detail}. Rate limiting is protecting guest access for now.`],
    [/^(.+) · 星月集$/u, ([, title]) => `${title} · Xingyueji`],
  ];

  function localTranslate(text, targetLanguage) {
    const exact = fallback[targetLanguage]?.get(text);
    if (exact) return exact;
    if (targetLanguage === "zh-TW") {
      return Array.from(text, (character) => traditionalCharacters.get(character) || character).join("");
    }
    if (targetLanguage !== "en") return text;
    const phraseExact = englishPhrases.get(text);
    if (phraseExact) return phraseExact;
    for (const [pattern, render] of englishTemplates) {
      const match = text.match(pattern);
      if (match) return render(match);
    }
    let translated = text;
    [...englishPhrases.entries()]
      .sort((a, b) => b[0].length - a[0].length)
      .forEach(([source, value]) => { translated = translated.split(source).join(value); });
    // 不显示中英拼接的半成品；未收录的长文保持原文，避免误译或数据外传。
    return /[\u3400-\u9fff]/u.test(translated) ? text : translated;
  }

  function readLanguage() {
    try {
      const value = localStorage.getItem(STORAGE_KEY)
        || localStorage.getItem(LEGACY_STORAGE_KEY)
        || "zh-CN";
      const normalized = VALID.has(value) ? value : "zh-CN";
      localStorage.setItem(STORAGE_KEY, normalized);
      localStorage.removeItem?.(LEGACY_STORAGE_KEY);
      return normalized;
    } catch { return "zh-CN"; }
  }

  function excluded(element) {
    return !element || Boolean(element.closest(
      "script, style, noscript, code, pre, svg, canvas, [contenteditable='true'], [data-no-translate]",
    ));
  }

  function sourceParts(value) {
    const match = String(value ?? "").match(/^(\s*)([\s\S]*?)(\s*)$/);
    return { before: match?.[1] || "", core: match?.[2] || "", after: match?.[3] || "" };
  }

  function translatable(value) {
    const core = sourceParts(value).core;
    return core.length > 0 && /[\u3400-\u9fff]/u.test(core) && core.length <= 2000;
  }

  function textTargets(root = document.body) {
    if (!root) return [];
    const targets = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.parentElement || excluded(node.parentElement)
          || (!nodeSources.has(node) && !translatable(node.nodeValue))) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) targets.push({ type: "text", node: walker.currentNode });
    root.querySelectorAll?.("[placeholder], [title], [aria-label], img[alt]").forEach((element) => {
      if (excluded(element)) return;
      ATTRIBUTES.forEach((name) => {
        const remembered = attributeSources.get(element)?.has(name);
        if (element.hasAttribute(name) && (remembered || translatable(element.getAttribute(name)))) {
          targets.push({ type: "attribute", node: element, name });
        }
      });
    });
    return targets;
  }

  function rememberSource(target, force = false) {
    if (target.type === "text") {
      if (force || !nodeSources.has(target.node)) nodeSources.set(target.node, target.node.nodeValue || "");
      return nodeSources.get(target.node) || "";
    }
    let values = attributeSources.get(target.node);
    if (!values) { values = new Map(); attributeSources.set(target.node, values); }
    if (force || !values.has(target.name)) values.set(target.name, target.node.getAttribute(target.name) || "");
    return values.get(target.name) || "";
  }

  function writeTarget(target, value) {
    if (target.type === "text") {
      renderedText.set(target.node, value);
      if (target.node.nodeValue === value) return false;
      target.node.nodeValue = value;
      return true;
    }
    let values = renderedAttributes.get(target.node);
    if (!values) { values = new Map(); renderedAttributes.set(target.node, values); }
    values.set(target.name, value);
    if (target.node.getAttribute(target.name) === value) return false;
    target.node.setAttribute(target.name, value);
    return true;
  }

  function scheduleApply() {
    window.clearTimeout(mutationTimer);
    mutationTimer = window.setTimeout(() => {
      apply(document.body).catch(() => {});
    }, 16);
  }

  function translatedCore(text, targetLanguage) {
    if (targetLanguage === "zh-CN") return text;
    return localTranslate(text, targetLanguage);
  }

  function renderRows(sourceRows, targetLanguage) {
    let changed = false;
    sourceRows.forEach(({ target, source }) => {
      const parts = sourceParts(source);
      const value = targetLanguage === "zh-CN"
        ? source
        : `${parts.before}${translatedCore(parts.core, targetLanguage)}${parts.after}`;
      changed = writeTarget(target, value) || changed;
    });
    return changed;
  }

  function apply(root = document.body, { refreshSources = false } = {}) {
    const targets = textTargets(root);
    const activeLanguage = language;
    const sourceRows = targets.map((target) => ({ target, source: rememberSource(target, refreshSources) }));
    const changed = renderRows(sourceRows, activeLanguage);
    document.documentElement.lang = activeLanguage;
    if (changed) {
      window.dispatchEvent(new CustomEvent("xyji18napplied", { detail: { language: activeLanguage, root, immediate: true } }));
    }

    return Promise.resolve();
  }

  function setLanguage(value, { persist = true } = {}) {
    const nextLanguage = VALID.has(value) ? value : "zh-CN";
    if (nextLanguage === language && document.documentElement.lang === nextLanguage) return;
    language = nextLanguage;
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, language);
        localStorage.removeItem?.(LEGACY_STORAGE_KEY);
      } catch { /* storage can be disabled */ }
    }
    document.querySelectorAll("#site-language, [data-language-select]").forEach((select) => {
      if (select.value !== language) select.value = language;
    });
    apply(document.body);
    window.dispatchEvent(new CustomEvent("xyji18nchange", { detail: { language } }));
  }

  function install() {
    try {
      sessionStorage.removeItem("xyj_front_translation_cache_v3");
      sessionStorage.removeItem("xyj_front_translation_cache_v4");
    } catch { /* private browsing can disable sessionStorage */ }
    document.querySelectorAll("#site-language, [data-language-select]").forEach((select) => {
      select.value = language;
      const changeLanguage = () => {
        if (select.value !== language) setLanguage(select.value);
      };
      // input 比 change 更早触发，鼠标或触屏选中后在同一帧完成首轮重绘。
      select.addEventListener("input", changeLanguage);
      select.addEventListener("change", changeLanguage);
    });
    apply(document.body);
    observer = new MutationObserver((mutations) => {
      const roots = new Set();
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          if (mutation.target.parentElement && !excluded(mutation.target.parentElement)) {
            if (renderedText.get(mutation.target) === (mutation.target.nodeValue || "")) continue;
            nodeSources.set(mutation.target, mutation.target.nodeValue || "");
            roots.add(mutation.target.parentElement);
          }
        } else if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) roots.add(node);
            else if (node.parentElement) roots.add(node.parentElement);
          });
        } else if (mutation.type === "attributes" && mutation.target instanceof Element) {
          const currentValue = mutation.target.getAttribute(mutation.attributeName) || "";
          if (renderedAttributes.get(mutation.target)?.get(mutation.attributeName) === currentValue) continue;
          let values = attributeSources.get(mutation.target);
          if (!values) { values = new Map(); attributeSources.set(mutation.target, values); }
          values.set(mutation.attributeName, currentValue);
          roots.add(mutation.target);
        }
      }
      if (!roots.size) return;
      scheduleApply();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTES,
    });
    window.addEventListener("storage", (event) => {
      if (event.key === STORAGE_KEY && VALID.has(event.newValue)) {
        setLanguage(event.newValue, { persist: false });
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
  window.XYJI18n = Object.freeze({
    apply,
    setLanguage,
    current: () => language,
    translate: (text, targetLanguage = language) => translatedCore(String(text ?? ""), targetLanguage),
  });
})();
