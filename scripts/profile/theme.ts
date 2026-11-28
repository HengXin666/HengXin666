// 主页卡片的视觉令牌与公共工具.
//
// 明暗两套: SVG 里用 CSS 变量 + prefers-color-scheme 切换 (GitHub 用 <img> 引 SVG 时跟随系统明暗).
// 动画全部是 CSS keyframes (<img> 里的 SVG 不跑脚本, 但 CSS 动画照常), prefers-reduced-motion 时全部关掉.
// 主色沿用 HXLoLi 的粉 (#ff88ff), 浅色下加深以保证对比度.

export const W = 792; // 一行的总宽: 磁贴 / 封面都是 6 x 132, 折线图与分节标题同宽 (GitHub 主页 README 区在常见桌面宽度下放得下)
export const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,'PingFang SC','Hiragino Sans','Microsoft YaHei','Noto Sans CJK SC',sans-serif";
export const MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace";

/** 系列色: 提交 / PR / Issue / 评审 / 编码时长 */
export const SERIES = {
  commits: "var(--pk)",
  prs: "var(--pu)",
  issues: "var(--or)",
  reviews: "var(--gr)",
  hours: "var(--cy)",
};

const VARS_LIGHT =
  "--fg:#1f2328;--mute:#59636e;--faint:#818b98;--line:#d1d9e0;--card:#f6f8fa;--card2:#ffffff;" +
  "--pk:#c026d3;--pu:#8250df;--or:#d1580b;--gr:#1a7f37;--cy:#0969da;--glow:#f0abfc";
const VARS_DARK =
  "--fg:#e6edf3;--mute:#9198a1;--faint:#6e7681;--line:#30363d;--card:#161b22;--card2:#0d1117;" +
  "--pk:#ff88ff;--pu:#bc8cff;--or:#f0883e;--gr:#3fb950;--cy:#58c4ff;--glow:#ff88ff";

const BASE_CSS = `
svg{${VARS_LIGHT}}
@media (prefers-color-scheme:dark){svg{${VARS_DARK}}}
text{font-family:${SANS}}text:not([fill]){fill:var(--fg)}
.mono{font-family:${MONO};font-variant-numeric:tabular-nums}
text.mute{fill:var(--mute)}text.faint{fill:var(--faint)}
.card{fill:var(--card);stroke:var(--line)}
.in{opacity:0;animation:in .6s cubic-bezier(.2,.8,.2,1) forwards}
.draw{stroke-dasharray:1;stroke-dashoffset:1;animation:draw 1.4s cubic-bezier(.4,0,.2,1) .2s forwards}
.grow{transform-box:fill-box;transform-origin:left;transform:scaleX(0);animation:grow 1s cubic-bezier(.2,.8,.2,1) .3s forwards}
.rise{transform-box:fill-box;transform-origin:bottom;transform:scaleY(0);animation:rise .8s cubic-bezier(.2,.8,.2,1) forwards}
.pulse{transform-box:fill-box;transform-origin:center;animation:pulse 2s ease-in-out infinite}
@keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes grow{to{transform:scaleX(1)}}
@keyframes rise{to{transform:scaleY(1)}}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(1.6)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.in{opacity:1}.draw{stroke-dashoffset:0}.grow,.rise{transform:none}}
`;

export function svg(w: number, h: number, label: string, body: string, css = ""): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">` +
    `<title>${esc(label)}</title><style>${BASE_CSS}${css}</style>${body}</svg>\n`
  );
}

export const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 估算文字宽度: CJK / 全角按 1em, 其余按 0.58em (只用来截断和排版, 不追求像素级) */
export function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) >= 0x2e80 ? size : size * 0.58;
  return w;
}

export function truncate(s: string, size: number, maxW: number): string {
  if (textWidth(s, size) <= maxW) return s;
  let out = "";
  for (const ch of s) {
    if (textWidth(out + ch + "…", size) > maxW) break;
    out += ch;
  }
  return out + "…";
}

/** 1234 -> 1,234; 12345 -> 12.3k */
export function fmt(n: number): string {
  if (n >= 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return n.toLocaleString("en-US");
}

/** 动画延迟 (秒) 的 style 片段 */
export const delay = (s: number) => `style="animation-delay:${s.toFixed(2)}s"`;

/** 过点的平滑曲线 (单调三次插值, 不会冲出数据范围) */
export function smoothPath(pts: [number, number][]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0][0]} ${pts[0][1]}`;
  const n = pts.length;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) {
      const k = 3 / Math.sqrt(h);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = dx[i] / 3;
    d += `C${f(x0 + h)} ${f(y0 + t[i] * h)} ${f(x1 - h)} ${f(y1 - t[i + 1] * h)} ${f(x1)} ${f(y1)}`;
  }
  return d;
}
