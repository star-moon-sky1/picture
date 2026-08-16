/*
 * 登录页液态玻璃折射辅助层
 * --------------------------------------------------------------------------
 * CSS 的 backdrop-filter 能模糊玻璃后面的内容，但不能真正“放大”背景。
 * 本文件给登录/注册卡片放入一张与全屏背景同步的照片副本，再只显示副本靠近
 * 卡片边缘的部分。副本会轻微放大并模糊，因此背景照片轮播或窗口移动时，
 * 玻璃边缘会出现接近真实水滴的折射变化，而不是一条静止的白色描边。
 */
(function installLiquidGlassPhotoLens(global) {
  "use strict";

  function createPhotoLens(targets) {
    const elements = [...new Set((targets || []).filter((target) => target instanceof HTMLElement))];
    if (!elements.length) return { setSource() {}, refresh() {}, destroy() {} };

    const records = elements.map((target) => {
      const lens = document.createElement("span");
      const image = document.createElement("img");
      lens.className = "liquid-glass-refraction";
      lens.setAttribute("aria-hidden", "true");
      image.alt = "";
      image.decoding = "async";
      image.draggable = false;
      lens.append(image);
      target.prepend(lens);
      return { target, lens, image };
    });

    let animationFrame = 0;

    /*
     * 折射照片必须与视口中的全屏背景保持同一坐标。这里把卡片左上角到
     * 视口左上角的距离写入 CSS 变量，使卡片内部的照片副本反向偏移。
     * resize、滚动和手机地址栏伸缩时都会重新计算，但统一压缩到一帧内执行。
     */
    function refresh() {
      animationFrame = 0;
      const viewportWidth = `${global.innerWidth}px`;
      const viewportHeight = `${global.visualViewport?.height || global.innerHeight}px`;
      for (const { target } of records) {
        const rect = target.getBoundingClientRect();
        target.style.setProperty("--liquid-lens-left", `${-rect.left}px`);
        target.style.setProperty("--liquid-lens-top", `${-rect.top}px`);
        target.style.setProperty("--liquid-lens-width", viewportWidth);
        target.style.setProperty("--liquid-lens-height", viewportHeight);
      }
    }

    function scheduleRefresh() {
      if (!animationFrame) animationFrame = global.requestAnimationFrame(refresh);
    }

    function setSource(source) {
      if (!source) return;
      const absoluteSource = new URL(source, global.location.href).href;
      for (const { image } of records) {
        if (image.src !== absoluteSource) image.src = absoluteSource;
      }
      scheduleRefresh();
    }

    global.addEventListener("resize", scheduleRefresh, { passive: true });
    global.addEventListener("scroll", scheduleRefresh, { passive: true, capture: true });
    global.visualViewport?.addEventListener("resize", scheduleRefresh, { passive: true });
    global.visualViewport?.addEventListener("scroll", scheduleRefresh, { passive: true });
    scheduleRefresh();

    return {
      setSource,
      refresh: scheduleRefresh,
      destroy() {
        if (animationFrame) global.cancelAnimationFrame(animationFrame);
        global.removeEventListener("resize", scheduleRefresh);
        global.removeEventListener("scroll", scheduleRefresh, true);
        global.visualViewport?.removeEventListener("resize", scheduleRefresh);
        global.visualViewport?.removeEventListener("scroll", scheduleRefresh);
        records.forEach(({ lens }) => lens.remove());
      },
    };
  }

  global.XingyuejiLiquidGlass = Object.freeze({ createPhotoLens });
})(window);
