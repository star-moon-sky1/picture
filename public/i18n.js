/* 星月集统一界面翻译：静态标签、弹窗和接口动态内容共用同一条转换链。 */
(() => {
  "use strict";

  /* Studio 是站长工作台，始终使用简体中文，不继承前台访客的语言偏好。 */
  if (/^\/studio(?:\/|$)/.test(location.pathname)
    || document.documentElement.dataset.i18nScope === "admin") return;

  const STORAGE_KEY = "xyj_front_language";
  const LEGACY_STORAGE_KEY = "xyj_language";
  const CACHE_KEY = "xyj_front_translation_cache_v3";
  const VALID = new Set(["zh-CN", "zh-TW", "en"]);
  const ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"];
  const nodeSources = new WeakMap();
  const attributeSources = new WeakMap();
  const renderedText = new WeakMap();
  const renderedAttributes = new WeakMap();
  const memoryCache = loadMemoryCache();
  const inflightBatches = new Map();
  let language = readLanguage();
  let mutationTimer = 0;
  let prefetchTimer = 0;
  let languageRevision = 0;
  let renderEpoch = 0;
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
   * 切换语言时先在浏览器本地完成一次可见重绘，不能让远程翻译接口阻塞界面。
   * 服务端翻译随后只负责补全长文和站长自定义内容。繁体转换覆盖全站常用字，
   * 英文短语表按长词优先替换，因而动态生成的按钮、状态和提示也能立即变化。
   */
  const traditionalCharacters = new Map(Object.entries({
    "个":"個","为":"為","么":"麼","义":"義","习":"習","乡":"鄉","书":"書","买":"買","乱":"亂","争":"爭","于":"於","亏":"虧","云":"雲","亚":"亞","产":"產","仅":"僅","从":"從","仓":"倉","仪":"儀","们":"們","价":"價","众":"眾","优":"優","会":"會","传":"傳","伤":"傷","体":"體","余":"餘","侠":"俠","侣":"侶","侦":"偵","侧":"側","侨":"僑","俩":"倆","俭":"儉","债":"債","倾":"傾","偿":"償","储":"儲","儿":"兒","兑":"兌","党":"黨","兰":"蘭","关":"關","兴":"興","养":"養","兽":"獸","冈":"岡","册":"冊","写":"寫","军":"軍","农":"農","冲":"沖","决":"決","况":"況","冻":"凍","净":"淨","凉":"涼","减":"減","凑":"湊","几":"幾","凤":"鳳","凭":"憑","凯":"凱","击":"擊","凿":"鑿","划":"劃","刘":"劉","则":"則","刚":"剛","创":"創","删":"刪","别":"別","剂":"劑","剑":"劍","剧":"劇","劝":"勸","办":"辦","务":"務","动":"動","励":"勵","劲":"勁","劳":"勞","势":"勢","勋":"勳","华":"華","协":"協","单":"單","卖":"賣","卢":"盧","卫":"衛","却":"卻","厅":"廳","历":"歷","压":"壓","厌":"厭","厕":"廁","县":"縣","参":"參","双":"雙","发":"發","变":"變","叙":"敘","叶":"葉","号":"號","叹":"嘆","吗":"嗎","听":"聽","启":"啟","吴":"吳","员":"員","呛":"嗆","呜":"嗚","咏":"詠","咙":"嚨","响":"響","哑":"啞","哗":"嘩","唤":"喚","啸":"嘯","喷":"噴","嘱":"囑","团":"團","园":"園","围":"圍","国":"國","图":"圖","圆":"圓","圣":"聖","场":"場","坏":"壞","块":"塊","坚":"堅","坛":"壇","坝":"壩","坞":"塢","垫":"墊","墙":"牆","壮":"壯","声":"聲","壳":"殼","处":"處","备":"備","复":"復","够":"夠","头":"頭","夹":"夾","夺":"奪","奖":"獎","奥":"奧","妇":"婦","妈":"媽","娇":"嬌","娱":"娛","孙":"孫","学":"學","宁":"寧","宝":"寶","实":"實","审":"審","宪":"憲","宫":"宮","宽":"寬","宾":"賓","对":"對","寻":"尋","导":"導","寿":"壽","将":"將","尔":"爾","尘":"塵","尝":"嘗","层":"層","届":"屆","属":"屬","岁":"歲","岛":"島","岭":"嶺","岳":"嶽","峡":"峽","币":"幣","帅":"帥","师":"師","帐":"帳","帘":"簾","带":"帶","帮":"幫","干":"幹","并":"並","广":"廣","庄":"莊","庆":"慶","庐":"廬","库":"庫","应":"應","庙":"廟","废":"廢","开":"開","异":"異","弃":"棄","张":"張","弥":"彌","弯":"彎","弹":"彈","强":"強","归":"歸","录":"錄","当":"當","彻":"徹","径":"徑","忆":"憶","忧":"憂","态":"態","怀":"懷","总":"總","恋":"戀","恶":"惡","恼":"惱","悬":"懸","惊":"驚","惧":"懼","惨":"慘","惩":"懲","惯":"慣","愿":"願","戏":"戲","户":"戶","执":"執","扩":"擴","扫":"掃","扬":"揚","扰":"擾","抚":"撫","抛":"拋","抢":"搶","护":"護","报":"報","担":"擔","拟":"擬","拢":"攏","拥":"擁","拨":"撥","择":"擇","挂":"掛","挡":"擋","挤":"擠","挥":"揮","损":"損","换":"換","据":"據","掷":"擲","揽":"攬","搅":"攪","摄":"攝","摆":"擺","摇":"搖","撑":"撐","数":"數","斋":"齋","斩":"斬","断":"斷","无":"無","旧":"舊","时":"時","显":"顯","晋":"晉","晓":"曉","暂":"暫","术":"術","机":"機","杀":"殺","杂":"雜","权":"權","条":"條","来":"來","杨":"楊","极":"極","构":"構","枪":"槍","标":"標","样":"樣","树":"樹","档":"檔","桥":"橋","梦":"夢","检":"檢","楼":"樓","欢":"歡","欧":"歐","步":"步","残":"殘","毁":"毀","毕":"畢","气":"氣","汇":"匯","汉":"漢","汤":"湯","沟":"溝","没":"沒","泽":"澤","洁":"潔","浅":"淺","测":"測","济":"濟","浏":"瀏","浓":"濃","涂":"塗","涛":"濤","润":"潤","涩":"澀","渊":"淵","渐":"漸","温":"溫","湾":"灣","湿":"濕","满":"滿","滤":"濾","滥":"濫","滚":"滾","滨":"濱","潜":"潛","灭":"滅","灯":"燈","灵":"靈","灾":"災","点":"點","炼":"煉","热":"熱","爱":"愛","爷":"爺","牵":"牽","犹":"猶","独":"獨","狭":"狹","猎":"獵","猫":"貓","现":"現","环":"環","琐":"瑣","电":"電","画":"畫","畅":"暢","疗":"療","监":"監","盖":"蓋","盘":"盤","着":"著","睁":"睜","确":"確","码":"碼","砖":"磚","礼":"禮","离":"離","种":"種","积":"積","称":"稱","稳":"穩","窝":"窩","竞":"競","笔":"筆","笼":"籠","签":"簽","简":"簡","粮":"糧","级":"級","纪":"紀","约":"約","红":"紅","纤":"纖","纯":"純","纲":"綱","纳":"納","纵":"縱","纷":"紛","纸":"紙","纹":"紋","纽":"紐","线":"線","练":"練","组":"組","细":"細","织":"織","终":"終","绍":"紹","经":"經","绑":"綁","结":"結","给":"給","络":"絡","统":"統","继":"繼","续":"續","维":"維","综":"綜","绿":"綠","编":"編","缘":"緣","缩":"縮","缴":"繳","网":"網","罗":"羅","罚":"罰","职":"職","联":"聯","聪":"聰","肃":"肅","胜":"勝","胁":"脅","脑":"腦","脚":"腳","脱":"脫","脸":"臉","腊":"臘","腾":"騰","舆":"輿","舰":"艦","艺":"藝","节":"節","范":"範","药":"藥","获":"獲","营":"營","萧":"蕭","蓝":"藍","虑":"慮","虚":"虛","虫":"蟲","虽":"雖","补":"補","装":"裝","览":"覽","观":"觀","规":"規","视":"視","觉":"覺","触":"觸","订":"訂","计":"計","认":"認","讨":"討","让":"讓","训":"訓","议":"議","讯":"訊","记":"記","讲":"講","许":"許","论":"論","设":"設","访":"訪","证":"證","评":"評","识":"識","诉":"訴","词":"詞","译":"譯","试":"試","诗":"詩","诚":"誠","话":"話","询":"詢","该":"該","详":"詳","语":"語","误":"誤","说":"說","请":"請","诸":"諸","诺":"諾","读":"讀","课":"課","调":"調","谈":"談","谢":"謝","谱":"譜","贝":"貝","负":"負","贡":"貢","财":"財","责":"責","败":"敗","账":"賬","货":"貨","质":"質","贩":"販","贫":"貧","购":"購","贯":"貫","贴":"貼","贵":"貴","贷":"貸","贸":"貿","费":"費","贺":"賀","资":"資","赞":"讚","赠":"贈","赢":"贏","赵":"趙","赶":"趕","跃":"躍","践":"踐","车":"車","轨":"軌","转":"轉","轮":"輪","软":"軟","轴":"軸","轻":"輕","载":"載","较":"較","辅":"輔","辆":"輛","边":"邊","辽":"遼","达":"達","迁":"遷","过":"過","运":"運","还":"還","这":"這","进":"進","远":"遠","违":"違","连":"連","迟":"遲","选":"選","递":"遞","遗":"遺","邮":"郵","邻":"鄰","郑":"鄭","酿":"釀","释":"釋","里":"裡","鉴":"鑒","钟":"鐘","钢":"鋼","钥":"鑰","钱":"錢","锁":"鎖","错":"錯","长":"長","门":"門","闭":"閉","问":"問","间":"間","闹":"鬧","闻":"聞","阅":"閱","队":"隊","阳":"陽","阴":"陰","阶":"階","际":"際","陆":"陸","陈":"陳","险":"險","随":"隨","隐":"隱","难":"難","雾":"霧","静":"靜","顶":"頂","顺":"順","须":"須","预":"預","领":"領","颇":"頗","颜":"顏","风":"風","飞":"飛","饭":"飯","饮":"飲","饱":"飽","馆":"館","马":"馬","验":"驗","惊":"驚","骂":"罵","鱼":"魚","鸟":"鳥","麦":"麥","黄":"黃","齐":"齊","龙":"龍"
  }));

  const englishPhrases = new Map(Object.entries({
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
    "当前浏览器不支持 HLS 自动画质": "This browser does not support automatic HLS quality.",
    "文件预览": "File preview",
    "图片预览": "Image preview",
    "照片预览": "Photo preview",
    "上一张照片": "Previous photo",
    "下一张照片": "Next photo",
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
    "刷新": "Refresh"
  }));

  function localTranslate(text, targetLanguage) {
    const exact = fallback[targetLanguage]?.get(text);
    if (exact) return exact;
    if (targetLanguage === "zh-TW") {
      return Array.from(text, (character) => traditionalCharacters.get(character) || character).join("");
    }
    if (targetLanguage !== "en") return text;
    const phraseExact = englishPhrases.get(text);
    if (phraseExact) return phraseExact;
    let translated = text;
    [...englishPhrases.entries()]
      .sort((a, b) => b[0].length - a[0].length)
      .forEach(([source, value]) => { translated = translated.split(source).join(value); });
    // 不显示中英拼接的半成品；未知长文由后台预取后一次性替换。
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

  function loadMemoryCache() {
    try {
      const entries = JSON.parse(sessionStorage.getItem(CACHE_KEY) || "[]");
      return new Map(Array.isArray(entries) ? entries.filter((item) => Array.isArray(item) && item.length === 2) : []);
    } catch { return new Map(); }
  }

  function persistMemoryCache() {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify([...memoryCache.entries()].slice(-500)));
    } catch { /* private browsing or storage quota */ }
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
    schedulePrefetch();
  }

  function schedulePrefetch(delay = 220) {
    window.clearTimeout(prefetchTimer);
    prefetchTimer = window.setTimeout(() => prefetchEnglish(document.body), delay);
  }

  function translationKey(targetLanguage, text) {
    return `${targetLanguage}\u0000${text}`;
  }

  function translatedCore(text, targetLanguage, translations = null) {
    if (targetLanguage === "zh-CN") return text;
    return translations?.get(text)
      || memoryCache.get(translationKey(targetLanguage, text))
      || localTranslate(text, targetLanguage);
  }

  function needsRemoteEnglish(text) {
    return translatable(text)
      && !memoryCache.has(translationKey("en", text))
      && /[\u3400-\u9fff]/u.test(localTranslate(text, "en"));
  }

  function requestTranslationBatch(batch, targetLanguage) {
    const batchKey = `${targetLanguage}\u0000${batch.join("\u0002")}`;
    if (inflightBatches.has(batchKey)) return inflightBatches.get(batchKey);
    const request = (async () => {
      const output = new Map();
      try {
        const response = await fetch("/api/i18n/translate", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: targetLanguage, texts: batch }),
        });
        if (!response.ok) throw new Error(`translation ${response.status}`);
        const payload = await response.json();
        batch.forEach((text, offset) => {
          const translated = String(payload.translations?.[offset] || localTranslate(text, targetLanguage));
          memoryCache.set(translationKey(targetLanguage, text), translated);
          output.set(text, translated);
        });
        persistMemoryCache();
      } catch (error) {
        console.warn("Site translation unavailable", error);
        batch.forEach((text) => output.set(text, localTranslate(text, targetLanguage)));
      }
      return output;
    })().finally(() => inflightBatches.delete(batchKey));
    inflightBatches.set(batchKey, request);
    return request;
  }

  async function requestTranslations(texts, targetLanguage) {
    const result = new Map();
    const missing = [];
    texts.forEach((text) => {
      const key = translationKey(targetLanguage, text);
      if (memoryCache.has(key)) result.set(text, memoryCache.get(key));
      else if (!missing.includes(text)) missing.push(text);
    });
    const batches = [];
    let batch = [];
    let batchLength = 0;
    missing.forEach((text) => {
      if (batch.length && (batch.length >= 30 || batchLength + text.length > 10_000)) {
        batches.push(batch);
        batch = [];
        batchLength = 0;
      }
      batch.push(text);
      batchLength += text.length;
    });
    if (batch.length) batches.push(batch);
    const batchResults = await Promise.all(batches.map((batch) => requestTranslationBatch(batch, targetLanguage)));
    batchResults.forEach((items) => items.forEach((value, key) => result.set(key, value)));
    return result;
  }

  function sourceIsCurrent(row) {
    if (!row.target.node.isConnected) return false;
    if (row.target.type === "text") return nodeSources.get(row.target.node) === row.source;
    return attributeSources.get(row.target.node)?.get(row.target.name) === row.source;
  }

  function renderRows(sourceRows, targetLanguage, translations = null) {
    let changed = false;
    sourceRows.forEach(({ target, source }) => {
      const parts = sourceParts(source);
      const value = targetLanguage === "zh-CN"
        ? source
        : `${parts.before}${translatedCore(parts.core, targetLanguage, translations)}${parts.after}`;
      changed = writeTarget(target, value) || changed;
    });
    return changed;
  }

  function apply(root = document.body, { refreshSources = false } = {}) {
    const targets = textTargets(root);
    const activeLanguage = language;
    const activeRevision = languageRevision;
    const activeEpoch = ++renderEpoch;
    const sourceRows = targets.map((target) => ({ target, source: rememberSource(target, refreshSources) }));
    const changed = renderRows(sourceRows, activeLanguage);
    document.documentElement.lang = activeLanguage;
    if (changed) {
      window.dispatchEvent(new CustomEvent("xyji18napplied", { detail: { language: activeLanguage, root, immediate: true } }));
    }

    if (activeLanguage === "en") {
      const cores = [...new Set(sourceRows
        .map(({ source }) => sourceParts(source).core)
        .filter(needsRemoteEnglish))];
      requestTranslations(cores, activeLanguage).then((translations) => {
        if (language !== activeLanguage || languageRevision !== activeRevision || renderEpoch !== activeEpoch) return;
        const currentRows = sourceRows.filter(sourceIsCurrent);
        if (renderRows(currentRows, activeLanguage, translations)) {
          window.dispatchEvent(new CustomEvent("xyji18napplied", { detail: { language: activeLanguage, root, immediate: false } }));
        }
      }).catch(() => {});
    }
    return Promise.resolve();
  }

  function prefetchEnglish(root) {
    const cores = [...new Set(textTargets(root)
      .map((target) => sourceParts(rememberSource(target)).core)
      .filter(needsRemoteEnglish))];
    if (cores.length) requestTranslations(cores, "en").catch(() => {});
  }

  function setLanguage(value, { persist = true } = {}) {
    const nextLanguage = VALID.has(value) ? value : "zh-CN";
    if (nextLanguage === language && document.documentElement.lang === nextLanguage) return;
    language = nextLanguage;
    languageRevision += 1;
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
    document.querySelectorAll("#site-language, [data-language-select]").forEach((select) => {
      select.value = language;
      const changeLanguage = () => {
        if (select.value !== language) setLanguage(select.value);
      };
      // input 比 change 更早触发，鼠标或触屏选中后在同一帧完成首轮重绘。
      select.addEventListener("input", changeLanguage);
      select.addEventListener("change", changeLanguage);
      select.addEventListener("focus", () => schedulePrefetch(0));
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
    schedulePrefetch(0);
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
  });
})();
