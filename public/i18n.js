/* 星月集统一界面翻译：静态标签、弹窗和接口动态内容共用同一条转换链。 */
(() => {
  "use strict";

  const STORAGE_KEY = "xyj_language";
  const VALID = new Set(["zh-CN", "zh-TW", "en"]);
  const ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"];
  const nodeSources = new WeakMap();
  const attributeSources = new WeakMap();
  const memoryCache = new Map();
  let language = readLanguage();
  let mutationTimer = 0;
  let applying = false;
  let rescanAfterApply = false;
  let languageRevision = 0;

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
    "个人空间板块":"Personal space sections","大板块与小板块":"Sections and subsections","图片、相册与视频":"Images, albums and videos","文章内容与文件":"Articles and files","独立文件资源":"Independent files","留言与反馈":"Feedback","用户与审核":"Users and review","网站设置":"Site settings","游客统计":"Guest analytics","评论管理":"Comment management","用户私信":"Messages","更新日志":"Changelog","查看网站目前的内容状态":"View the current site status","新建大板块":"New section","新建小板块":"New subsection","所属大板块":"Section","所属小板块":"Subsection","板块名称":"Section name","板块类型":"Section type","板块说明":"Description","文章类":"Articles","图片类":"Images","文件资源类":"Files","访问权限":"Visibility","仅审核用户":"Approved users only","仅指定用户":"Selected users only","不给指定用户看":"Exclude selected users","仅本人可见":"Private","保存板块":"Save section","保存小板块":"Save subsection","未分类":"Uncategorized","上传图片":"Upload image","上传文件":"Upload file","上传文件/视频":"Upload file/video","文件资源":"Files","在线预览":"Preview online","直接下载":"Download","登录后下载":"Sign in to download","公开":"Public","草稿":"Draft","已发布":"Published","状态":"Status","标题":"Title","摘要":"Summary","正文":"Article body","保存内容":"Save content","删除":"Delete","刷新":"Refresh","返回登录":"Back to sign in","下一步":"Next","上一步":"Back","创建账号":"Create account","验证信息":"Verify details","确认提交":"Review and submit","申请注册":"Create an account","登录用户名":"Username","昵称":"Nickname","设置密码":"Set password","确认密码":"Confirm password","联系方式":"Contact","联系方式类型":"Contact type","备注":"Note","选填":"optional","提交注册申请":"Submit registration","申请重置密码":"Request password reset","设置新密码":"Set a new password","返回网站首页":"Back to home","正在登录":"Signing in","上传成功":"Upload complete","上传完成":"Upload complete","保存权限":"Save permissions","预览":"Preview","下载":"Download","根目录":"Root","全部":"All","主页":"Home","个人空间":"Personal Space","关于我":"About Me","设置":"Settings","登录账号":"Sign in","注册账号":"Create account","修改密码":"Change password","白天模式":"Light mode","夜览模式":"Dark mode","跟随系统":"Follow system","定时夜览":"Scheduled dark mode","简体中文":"Simplified Chinese","繁體中文":"Traditional Chinese","英语":"English","发送":"Send","关闭":"Close"
  }));

  function localTranslate(text, targetLanguage) {
    const exact = fallback[targetLanguage]?.get(text);
    if (exact) return exact;
    if (targetLanguage === "zh-TW") {
      return Array.from(text, (character) => traditionalCharacters.get(character) || character).join("");
    }
    if (targetLanguage !== "en") return text;
    let translated = text;
    [...englishPhrases.entries()]
      .sort((a, b) => b[0].length - a[0].length)
      .forEach(([source, value]) => { translated = translated.split(source).join(value); });
    return translated;
  }

  function readLanguage() {
    try {
      const value = localStorage.getItem(STORAGE_KEY) || "zh-CN";
      return VALID.has(value) ? value : "zh-CN";
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
    if (target.type === "text") target.node.nodeValue = value;
    else target.node.setAttribute(target.name, value);
  }

  function scheduleApply() {
    window.clearTimeout(mutationTimer);
    mutationTimer = window.setTimeout(() => {
      apply(document.body).catch(() => {});
    }, 90);
  }

  async function requestTranslations(texts, targetLanguage) {
    const result = new Map();
    const missing = [];
    texts.forEach((text) => {
      const key = `${targetLanguage}\u0000${text}`;
      if (memoryCache.has(key)) result.set(text, memoryCache.get(key));
      else if (!missing.includes(text)) missing.push(text);
    });
    const batches = [];
    for (let index = 0; index < missing.length; index += 30) batches.push(missing.slice(index, index + 30));
    await Promise.all(batches.map(async (batch) => {
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
          memoryCache.set(`${targetLanguage}\u0000${text}`, translated);
          result.set(text, translated);
        });
      } catch (error) {
        console.warn("Site translation unavailable", error);
        batch.forEach((text) => {
          result.set(text, localTranslate(text, targetLanguage));
        });
      }
    }));
    return result;
  }

  function apply(root = document.body, { refreshSources = false } = {}) {
    const targets = textTargets(root);
    const activeLanguage = language;
    const activeRevision = languageRevision;
    const sourceRows = targets.map((target) => ({ target, source: rememberSource(target, refreshSources) }));
    applying = true;
    try {
      if (activeLanguage === "zh-CN") {
        sourceRows.forEach(({ target, source }) => writeTarget(target, source));
      } else {
        sourceRows.forEach(({ target, source }) => {
          const parts = sourceParts(source);
          writeTarget(target, `${parts.before}${localTranslate(parts.core, activeLanguage)}${parts.after}`);
        });
      }
      document.documentElement.lang = activeLanguage;
      window.dispatchEvent(new CustomEvent("xyji18napplied", { detail: { language: activeLanguage, root, immediate: true } }));
    } finally {
      window.setTimeout(() => {
        applying = false;
        if (rescanAfterApply) {
          rescanAfterApply = false;
          scheduleApply();
        }
      }, 0);
    }

    if (activeLanguage !== "zh-CN") {
      const cores = [...new Set(sourceRows.map(({ source }) => sourceParts(source).core).filter(translatable))];
      requestTranslations(cores, activeLanguage).then((translations) => {
        if (language !== activeLanguage || languageRevision !== activeRevision) return;
        applying = true;
        try {
          sourceRows.forEach(({ target, source }) => {
            const parts = sourceParts(source);
            writeTarget(target, `${parts.before}${translations.get(parts.core) || localTranslate(parts.core, activeLanguage)}${parts.after}`);
          });
          window.dispatchEvent(new CustomEvent("xyji18napplied", { detail: { language: activeLanguage, root, immediate: false } }));
        } finally {
          window.setTimeout(() => { applying = false; }, 0);
        }
      }).catch(() => {});
    }
    return Promise.resolve();
  }

  async function setLanguage(value) {
    language = VALID.has(value) ? value : "zh-CN";
    languageRevision += 1;
    try { localStorage.setItem(STORAGE_KEY, language); } catch { /* storage can be disabled */ }
    document.querySelectorAll("#site-language, [data-language-select]").forEach((select) => {
      if (select.value !== language) select.value = language;
    });
    apply(document.body);
    window.dispatchEvent(new CustomEvent("xyji18nchange", { detail: { language } }));
  }

  function install() {
    document.querySelectorAll("#site-language, [data-language-select]").forEach((select) => {
      select.value = language;
      select.addEventListener("change", () => setLanguage(select.value));
    });
    apply(document.body);
    const observer = new MutationObserver((mutations) => {
      if (applying) {
        // 接口数据常与首次翻译并行返回；新增节点完成后必须再扫一次，不能只翻译静态标题。
        if (mutations.some((mutation) => mutation.type === "childList")) rescanAfterApply = true;
        return;
      }
      const roots = new Set();
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          if (mutation.target.parentElement && !excluded(mutation.target.parentElement)) {
            nodeSources.set(mutation.target, mutation.target.nodeValue || "");
            roots.add(mutation.target.parentElement);
          }
        } else if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) roots.add(node);
            else if (node.parentElement) roots.add(node.parentElement);
          });
        } else if (mutation.type === "attributes" && mutation.target instanceof Element) {
          let values = attributeSources.get(mutation.target);
          if (!values) { values = new Map(); attributeSources.set(mutation.target, values); }
          values.set(mutation.attributeName, mutation.target.getAttribute(mutation.attributeName) || "");
          roots.add(mutation.target);
        }
      }
      if (!roots.size) return;
      // 以 body 为批次统一去重；服务端缓存保证动态重绘不会重复调用模型。
      scheduleApply();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRIBUTES,
    });
  }

  document.addEventListener("DOMContentLoaded", install, { once: true });
  window.XYJI18n = Object.freeze({
    apply,
    setLanguage,
    current: () => language,
  });
})();
