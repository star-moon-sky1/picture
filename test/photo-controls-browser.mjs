/*
 * Local visual regression fixture. Run `node test/photo-controls-browser.mjs`,
 * then open http://127.0.0.1:4173 with the supported browser runtime.
 * Uses the real viewer markup and complete stylesheet cascade, never site APIs.
 */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const styles = new Set(["/theme.css", "/vnext.css", "/material.css"]);
const port = Number(process.env.XYJ_VISUAL_TEST_PORT || 4173);

async function fixture() {
  const index = await readFile(new URL("public/index.html", root), "utf8");
  const baseCss = index.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  const viewer = index.match(/<dialog id="image-dialog"[\s\S]*?<\/dialog>/)?.[0];
  if (!baseCss || !viewer) throw new Error("Photo viewer markup or styles not found");
  return `<!doctype html><html lang="zh-CN" data-theme="light"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>照片查看器对比度回归</title>
    <style>${baseCss}</style>
    ${[...styles].map((path) => `<link rel="stylesheet" href="${path}">`).join("")}
    <style>
      body { overflow:auto; padding:20px; }
      .qa-tools { display:flex; flex-wrap:wrap; gap:18px; align-items:center; }
      .qa-tools label { display:grid; gap:6px; }
      .qa-tools select { padding:8px; }
      .qa-layout { display:flex; align-items:stretch; gap:20px; margin-top:20px; }
      .qa-sidebar { flex:0 0 160px; width:160px; height:auto; padding:18px; }
      .qa-main { flex:1; min-width:0; }
      #image-dialog { display:block; position:relative; inset:auto; margin:0 auto; animation:none; }
      #image-preview { display:block; width:100%; height:260px; max-height:260px; }
      #image-boundary-notice { top:28%; }
      #qa-report { display:block; white-space:pre-wrap; font:13px/1.5 monospace; margin-top:18px; }
    </style></head><body>
    <header class="qa-tools">
      <label>测试主题<select id="qa-theme"><option value="light">日间</option><option value="dark">夜览</option></select></label>
      <label>按钮状态<select id="qa-state"><option value="rest">普通</option><option value="pressed">按住</option><option value="rebound">回弹</option><option value="selected">选中</option><option value="disabled">禁用</option></select></label>
      <span>白色与黑色测试图，无用户照片、无外部请求</span>
    </header>
    <div class="qa-layout"><aside class="sidebar qa-sidebar"><nav class="nav"><button class="active">主页</button><button>个人空间</button></nav></aside><main class="main qa-main">${viewer}</main></div>
    <output id="qa-report" aria-live="polite"></output>
    <script>
      const dialog = document.getElementById('image-dialog');
      dialog.setAttribute('open', '');
      dialog.querySelectorAll('[hidden]').forEach(node => node.hidden = false);
      document.getElementById('image-preview').src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="300"><path fill="white" d="M0 0h500v300H0z"/><path fill="black" d="M500 0h500v300H500z"/></svg>');
      document.getElementById('image-caption').textContent = '照片查看器测试';
      document.getElementById('image-boundary-message').textContent = '已到最后一张照片';
      const controls = [...dialog.querySelectorAll('.btn')];
      const report = () => {
        const result = {
          theme: document.documentElement.dataset.theme,
          state: document.getElementById('qa-state').value,
          pageBackground: getComputedStyle(document.body).backgroundColor,
          sidebarBackground: getComputedStyle(document.querySelector('.sidebar')).backgroundColor,
          controls: [...dialog.querySelectorAll('button, a.btn')].map(node => {
            const style = getComputedStyle(node);
            return { id: node.id || node.textContent.trim(), text: node.textContent.trim(), color: style.color, background: style.backgroundColor, image: style.backgroundImage, opacity: style.opacity, disabled: node.disabled || false, transform: style.transform };
          })
        };
        document.getElementById('qa-report').textContent = JSON.stringify(result, null, 2);
      };
      let reportTimer;
      function apply() {
        document.documentElement.dataset.theme = document.getElementById('qa-theme').value;
        const state = document.getElementById('qa-state').value;
        controls.forEach(node => {
          node.classList.remove('active', 'selected', 'is-control-pressed', 'control-bounce-release');
          node.disabled = state === 'disabled';
          if (state === 'selected') node.classList.add('selected');
          if (state === 'pressed') node.classList.add('is-control-pressed');
          if (state === 'rebound') node.classList.add('control-bounce-release');
        });
        clearTimeout(reportTimer);
        reportTimer = setTimeout(report, 1200);
      }
      document.getElementById('qa-theme').addEventListener('change', apply);
      document.getElementById('qa-state').addEventListener('change', apply);
      dialog.addEventListener('click', event => event.preventDefault());
      apply();
    </script></body></html>`;
}

const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === '/') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(await fixture());
    } else if (styles.has(path)) {
      response.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(await readFile(new URL(`public${path}`, root)));
    } else {
      response.writeHead(404).end();
    }
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Photo control fixture: http://127.0.0.1:${port}`));
