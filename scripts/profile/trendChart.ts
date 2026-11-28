// 近 14 天走势合一图, 数据与系列同 HX-AIOA 安卓 GitHub 页的 "走势" (GithubTrendChart.kt): PR / Issue / 评论共用左轴, 提交用右轴.
// 配色按主页主题收成 5 个色相: 提交粉, PR 紫, Issue 橙, 评论绿, 编码蓝; 同一类里用画法区分事件:
// 新开 = 线 (Issue 为虚线), 合入 / 关闭完成 = 胶囊柱, 没合入就关 / 未完成就关 = 空心环.
// 数字: 每条线只标峰值, 柱顶标数, 编码条带日均线; 每天的全部数字由竖线 + 提示框逐日轮播 (<img> 里不能点).
// 数据: data/aioa-trend.json (fetchAioa.ts 拉 AIOA GET /api/v1/github/trend 的 days) + WakaTime 每日时长.

import { icon } from "./icons.js";
import { delay, fmt, smoothPath, svg, textWidth, W } from "./theme.js";

export type TrendPoint = {
  label: string;
  commits: number;
  prOpened: number;
  prMerged: number;
  prClosed: number;
  issueOpened: number;
  issueClosed: number;
  issueDropped?: number;
  prComments: number;
  issueComments: number;
  reviews: number;
};

type Style = "area" | "line" | "dashed" | "bars" | "ring";
type Series = { name: string; short: string; color: string; style: Style; right?: boolean; values: number[] };

const PK = "var(--pk)";
const PU = "var(--pu)";
const OR = "var(--or)";
const GR = "var(--gr)";
const CY = "var(--cy)";
const WEEK = "日一二三四五六";

const CSS =
  ".pop{transform-box:fill-box;transform-origin:center;transform:scale(0);animation:pop .5s cubic-bezier(.3,1.6,.5,1) forwards}" +
  "@keyframes pop{to{transform:scale(1)}}" +
  ".chip{fill:var(--card2);stroke:var(--line)}";

const STEP = 1.8; // 轮播每格停留秒数
const CYCLE_START = 3.4; // 入场动画走完再开始轮播
const FS = 10.5; // 图例 / 提示框字号

/** 拉丁字母比 theme.textWidth 的估算窄一些, 图例排版单独用 */
const tw = (s: string, size: number, mono = false) =>
  [...s].reduce((w, ch) => w + ((ch.codePointAt(0) ?? 0) >= 0x2e80 ? size : size * (mono ? 0.6 : 0.54)), 0);

function seriesOf(p: TrendPoint[]): Series[] {
  const of = (name: string, short: string, color: string, style: Style, f: (d: TrendPoint) => number, right = false): Series => ({
    name, short, color, style, right, values: p.map(f),
  });
  return [
    of("提交", "提交", PK, "area", (d) => d.commits, true),
    of("PR 新开", "新开", PU, "line", (d) => d.prOpened),
    of("PR 合入", "合入", PU, "bars", (d) => d.prMerged),
    of("PR 未合入关闭", "未合入", PU, "ring", (d) => d.prClosed),
    of("Issue 新开", "新开", OR, "dashed", (d) => d.issueOpened),
    of("Issue 关闭完成", "完成", OR, "bars", (d) => d.issueClosed),
    of("Issue 未完成关闭", "未完成", OR, "ring", (d) => d.issueDropped ?? 0),
    of("评论", "评论", GR, "line", (d) => d.prComments + d.issueComments),
  ];
}

/** 四等分刻度的上限: 步长是整齐的整数 (至少 1) */
function ceil4(v: number): number {
  const raw = Math.max(v, 1) / 4;
  if (raw <= 1) return 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  return Math.ceil(([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((k) => k * p >= raw) ?? 10) * p) * 4;
}

/** 图例里的小样: 按系列的画法画, 14x10 */
function swatch(style: Style, c: string): string {
  switch (style) {
    case "area":
      return `<path d="M0 9L4 4L8 6L14 1V10H0Z" fill="${c}" fill-opacity=".25"/><path d="M0 9L4 4L8 6L14 1" fill="none" stroke="${c}" stroke-width="1.8" stroke-linejoin="round"/>`;
    case "line":
      return `<line x1="0" x2="14" y1="5" y2="5" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`;
    case "dashed":
      return `<line x1="0" x2="14" y1="5" y2="5" stroke="${c}" stroke-width="2" stroke-dasharray="3.5 2.5"/>`;
    case "bars":
      return `<rect x="4.5" y="0" width="5" height="10" rx="2.5" fill="${c}"/>`;
    case "ring":
      return `<circle cx="7" cy="5" r="3.4" fill="var(--card2)" stroke="${c}" stroke-width="1.8"/>`;
  }
}

/** 一枚图例胶囊: [标题] 小样 名字 数, ...; 返回 svg 片段与宽度 */
function chip(x: number, y: number, title: string | null, color: string, items: { sw: string; label: string; v: string }[], i: number) {
  let w = 9;
  let g = "";
  if (title) {
    g += `<text x="${x + w}" y="${y + 15}" font-size="${FS}" font-weight="600" fill="${color}">${title}</text>`;
    w += tw(title, FS) + 8;
  }
  items.forEach((it, k) => {
    if (k) w += 8;
    g += `<g transform="translate(${(x + w).toFixed(1)} ${y + 6})">${it.sw}</g>`;
    w += 17;
    if (it.label) {
      g += `<text class="mute" x="${(x + w).toFixed(1)}" y="${y + 15}" font-size="${FS}">${it.label}</text>`;
      w += tw(it.label, FS) + 4;
    }
    g += `<text class="mono" x="${(x + w).toFixed(1)}" y="${y + 15}" font-size="${FS}" font-weight="600">${it.v}</text>`;
    w += tw(it.v, FS, true);
  });
  w += 9;
  return { w, svg: `<g class="in" ${delay(0.1 + i * 0.07)}><rect class="chip" x="${x}" y="${y}" width="${w.toFixed(1)}" height="22" rx="11"/>${g}</g>` };
}

/** 数字小牌: 实心底 + 同色描边, 用于峰值 */
const badge = (cx: number, y: number, v: string, c: string, d: number) => {
  const w = tw(v, 10, true) + 10;
  return (
    `<g class="pop" ${delay(d)}><rect x="${(cx - w / 2).toFixed(1)}" y="${(y - 8).toFixed(1)}" width="${w.toFixed(1)}" height="15" rx="7.5" fill="var(--card2)" stroke="${c}" stroke-opacity=".7"/>` +
    `<text class="mono" x="${cx.toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="10" font-weight="700" text-anchor="middle" fill="${c}">${v}</text></g>`
  );
};

export function trendChart(points: TrendPoint[], hours: number[], streak: { current: number; longest: number }, backfillDone: boolean): string {
  const n = points.length;
  const series = seriesOf(points);
  const L = 40;
  const R = 50;
  const iw = W - L - R;
  const slot = iw / n;
  const x = (i: number) => L + slot * (i + 0.5);
  const sum = (s: Series) => s.values.reduce((a, b) => a + b, 0);
  const by = (name: string) => series.find((s) => s.name === name)!;

  // ---- 顶部: 标题 + 连续天数
  const sub = `GitHub 提交 / PR / Issue / 评论 与 WakaTime 编码时长${backfillDone ? "" : " · 历史回补中"}`;
  let head =
    icon("activity", 16, 12, 15, PK) +
    `<text x="38" y="24" font-size="14" font-weight="600">近 ${n} 天走势</text>` +
    `<text class="faint" x="${38 + textWidth(`近 ${n} 天走势`, 14) + 8}" y="24" font-size="11">${sub}</text>` +
    `<g class="pulse">${icon("flame", W - 150, 11, 15, OR)}</g>` +
    `<text x="${W - 130}" y="24" font-size="12"><tspan class="mono" font-weight="700">${streak.current}</tspan><tspan class="mute"> 天连续</tspan><tspan class="faint"> · 最长 </tspan><tspan class="mono mute">${streak.longest}</tspan></text>`;

  // ---- 图例: 按类成组的胶囊, 放不下就折行
  const hourSum = hours.reduce((a, b) => a + b, 0);
  const hourAvg = hourSum / n;
  const it = (s: Series, label = s.short) => ({ sw: swatch(s.style, s.color), label, v: fmt(sum(s)) });
  const groups: [string | null, string, { sw: string; label: string; v: string }[]][] = [
    [null, PK, [it(by("提交"))]],
    ["PR", PU, [it(by("PR 新开")), it(by("PR 合入")), it(by("PR 未合入关闭"))]],
    ["Issue", OR, [it(by("Issue 新开")), it(by("Issue 关闭完成")), it(by("Issue 未完成关闭"))]],
    [null, GR, [it(by("评论"))]],
    [null, CY, [{ sw: swatch("bars", CY), label: "编码", v: `${hourSum.toFixed(1)}h` }]],
  ];
  let cx = 16;
  let cy = 38;
  groups.forEach(([title, color, items], i) => {
    let c = chip(cx, cy, title, color, items, i);
    if (cx + c.w > W - 16) {
      cx = 16;
      cy += 28;
      c = chip(cx, cy, title, color, items, i);
    }
    head += c.svg;
    cx += c.w + 6;
  });

  // ---- 绘图区与双轴
  const T = cy + 52;
  const ih = 150;
  const base = T + ih;
  const left = series.filter((s) => !s.right);
  const lMax = ceil4(Math.max(...left.flatMap((s) => s.values)));
  const rMax = ceil4(Math.max(...by("提交").values));
  const yl = (v: number) => base - (v / lMax) * ih;
  const yr = (v: number) => base - (v / rMax) * ih;
  const yOf = (s: Series) => (s.right ? yr : yl);

  let grid = `<text class="faint" x="${L - 8}" y="${T - 12}" font-size="9.5" text-anchor="end">次</text>`;
  grid += `<text x="${W - R + 8}" y="${T - 12}" font-size="9.5" fill="${PK}" fill-opacity=".75">提交</text>`;
  for (let k = 0; k <= 4; k++) {
    const y = T + (ih * k) / 4;
    grid += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-opacity="${k === 4 ? 1 : 0.6}" stroke-dasharray="${k === 4 ? "0" : "2 5"}"/>`;
    grid += `<text class="mono faint" x="${L - 8}" y="${y + 3.5}" font-size="9.5" text-anchor="end">${lMax * (1 - k / 4)}</text>`;
    grid += `<text class="mono" x="${W - R + 8}" y="${y + 3.5}" font-size="9.5" fill="${PK}" fill-opacity=".75">${rMax * (1 - k / 4)}</text>`;
  }
  // 今天那一列: 淡粉底, 日期标签换成 "今天"
  grid += `<rect class="breathe" x="${(L + slot * (n - 1) + 2).toFixed(1)}" y="${T - 4}" width="${(slot - 4).toFixed(1)}" height="${ih + 4}" rx="6" fill="${PK}" fill-opacity=".07"/>`;
  points.forEach((p, i) => {
    const today = i === n - 1;
    if (!today && i % 2) return;
    grid += `<text class="mono ${today ? "" : "faint"}" x="${x(i)}" y="${base + 15}" font-size="9.5" text-anchor="middle"${today ? ` fill="${PK}"` : ""}>${today ? "今天" : p.label.slice(5).replace("-", ".")}</text>`;
  });

  // ---- 系列: 面积 -> 柱 -> 线 -> 环
  let defs = `<filter id="tglow" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>`;
  let plot = "";
  const pts = (s: Series) => s.values.map((v, i) => [x(i), yOf(s)(v)] as [number, number]);
  const placed: [number, number][] = []; // 已放的数字, 避免互相压住
  const free = (px: number, py: number, w = 30) => placed.every(([qx, qy]) => Math.abs(qx - px) > w || Math.abs(qy - py) > 15);

  const commit = by("提交");
  const cd = smoothPath(pts(commit));
  defs += `<linearGradient id="tga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${PK}" stop-opacity=".32"/><stop offset=".7" stop-color="${PK}" stop-opacity=".06"/><stop offset="1" stop-color="${PK}" stop-opacity="0"/></linearGradient>`;
  plot += `<path class="rise" d="${cd}L${x(n - 1)} ${base}L${x(0)} ${base}Z" fill="url(#tga)" ${delay(0.3)}/>`;
  plot += `<path class="draw" pathLength="1" d="${cd}" fill="none" stroke="${PK}" stroke-width="5" stroke-opacity=".35" filter="url(#tglow)" ${delay(0.2)}/>`;
  plot += `<path id="tlc" class="draw" pathLength="1" d="${cd}" fill="none" stroke="${PK}" stroke-width="2.2" stroke-linecap="round" ${delay(0.2)}/>`;

  const bars = series.filter((s) => s.style === "bars");
  const bw = 6;
  // 同一天两根柱都有数时, 数字各自往外贴, 左柱右对齐、右柱左对齐, 免得叠在一起
  const both = (i: number) => bars.length > 1 && bars.every((s) => s.values[i] > 0);
  bars.forEach((s, b) => {
    const id = `tgb${b}`;
    defs += `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}"/><stop offset="1" stop-color="${s.color}" stop-opacity=".35"/></linearGradient>`;
    s.values.forEach((v, i) => {
      if (v <= 0) return;
      const bx = x(i) - bw - 1 + b * (bw + 2);
      const top = yl(v);
      plot += `<rect class="rise" x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="${bw}" height="${(base - top).toFixed(1)}" rx="3" fill="url(#${id})" ${delay(0.6 + i * 0.04 + b * 0.08)}/>`;
      const pair = both(i);
      const tx = pair ? (b === 0 ? bx + bw - 0.5 : bx + 0.5) : bx + bw / 2;
      const anchor = pair ? (b === 0 ? "end" : "start") : "middle";
      plot += `<text class="mono in" x="${tx.toFixed(1)}" y="${(top - 4).toFixed(1)}" font-size="8.5" font-weight="600" text-anchor="${anchor}" fill="${s.color}" ${delay(1.2 + i * 0.04)}>${v}</text>`;
      placed.push([bx + bw / 2, top - 7]);
    });
  });

  series.forEach((s, j) => {
    if (s.style !== "line" && s.style !== "dashed") return;
    const d = smoothPath(pts(s));
    if (s.style === "line") {
      plot += `<path class="draw" pathLength="1" d="${d}" fill="none" stroke="${s.color}" stroke-width="1.7" stroke-linecap="round" stroke-opacity=".95" ${delay(0.5 + j * 0.12)}/>`;
      return;
    }
    // 虚线不能再靠 dasharray 描出来, 用一块从左往右展开的遮罩
    defs +=
      `<mask id="tgm${j}"><rect x="${L}" y="${T - 10}" width="0" height="${ih + 20}" fill="#fff">` +
      `<animate attributeName="width" from="0" to="${iw}" dur="1.4s" begin="${(0.5 + j * 0.12).toFixed(2)}s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".4 0 .2 1"/></rect></mask>`;
    plot += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.7" stroke-dasharray="5 4" stroke-linecap="round" mask="url(#tgm${j})"/>`;
  });

  series.forEach((s) => {
    if (s.style !== "ring") return;
    s.values.forEach((v, i) => {
      if (v > 0) plot += `<circle class="pop" cx="${x(i)}" cy="${yl(v).toFixed(1)}" r="3.6" fill="var(--card)" stroke="${s.color}" stroke-width="1.8" ${delay(1.3 + i * 0.05)}/>`;
    });
  });

  // 每条线的峰值标数 (提交优先), 放不下就放到点下方, 还压就不标
  let marks = "";
  [commit, by("评论"), by("PR 新开"), by("Issue 新开")].forEach((s, k) => {
    const max = Math.max(...s.values);
    if (max <= 0) return;
    const i = s.values.lastIndexOf(max);
    const px = x(i);
    const py = yOf(s)(max);
    const spot = [py - 14, py + 16].find((y) => y > T - 6 && y < base - 6 && free(px, y));
    if (spot === undefined) return;
    placed.push([px, spot]);
    marks += `<circle class="pop" cx="${px}" cy="${py.toFixed(1)}" r="3" fill="${s.color}" ${delay(1.6 + k * 0.1)}/>`;
    marks += badge(px, spot, String(max), s.color, 1.7 + k * 0.1);
  });

  const comet =
    `<g><circle r="6" fill="${PK}" opacity=".25"/><circle r="2.6" fill="${PK}"/>` +
    `<animateMotion dur="9s" begin="2.4s" repeatCount="indefinite" calcMode="linear"><mpath href="#tlc"/></animateMotion>` +
    `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.08;.9;1" dur="9s" begin="2.4s" repeatCount="indefinite"/></g>`;

  // ---- 编码时长: 同一时间轴的胶囊柱 + 日均虚线
  const hy = base + 30;
  const hh = 34;
  const hMax = Math.max(1, ...hours);
  const yh = (v: number) => hy + hh - (v / hMax) * hh;
  defs += `<linearGradient id="tgh" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${CY}"/><stop offset="1" stop-color="${CY}" stop-opacity=".25"/></linearGradient>`;
  let strip = icon("clock", L - 26, hy + 2, 12, CY);
  strip += `<line x1="${L}" x2="${W - R}" y1="${hy + hh}" y2="${hy + hh}" stroke="var(--line)"/>`;
  hours.forEach((h, i) => {
    const cw = Math.min(16, slot * 0.42);
    const top = h > 0 ? Math.min(yh(h), hy + hh - 3) : hy + hh;
    if (h > 0) strip += `<rect class="rise" x="${(x(i) - cw / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${cw.toFixed(1)}" height="${(hy + hh - top).toFixed(1)}" rx="3" fill="url(#tgh)" fill-opacity="${h >= hourAvg ? 1 : 0.6}" ${delay(0.9 + i * 0.04)}/>`;
  });
  const ay = yh(hourAvg);
  strip += `<line class="in" x1="${L}" x2="${W - R}" y1="${ay.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="${CY}" stroke-width="1.2" stroke-dasharray="4 4" ${delay(1.6)}/>`;
  strip += `<g class="in" ${delay(1.7)}><rect x="${W - R + 4}" y="${(ay - 8).toFixed(1)}" width="${R - 8}" height="16" rx="8" fill="${CY}" fill-opacity=".16"/>`;
  strip += `<text class="mono" x="${W - R / 2}" y="${(ay + 3.5).toFixed(1)}" font-size="9.5" font-weight="700" text-anchor="middle" fill="${CY}">均${hourAvg.toFixed(1)}h</text></g>`;

  // ---- 轮播: 每格一组 (竖线 + 线上标记 + 提示框), 依次各亮 STEP 秒, 全程循环
  const cycle = n * STEP;
  const on = 100 / n;
  const fade = Math.min(2.5, on / 5);
  let cyc =
    `<style>.cy{opacity:0;animation:cy ${cycle.toFixed(1)}s linear infinite}` +
    `@keyframes cy{0%{opacity:0}${fade.toFixed(2)}%{opacity:1}${(on - fade).toFixed(2)}%{opacity:1}${on.toFixed(2)}%{opacity:0}100%{opacity:0}}</style>`;
  points.forEach((p, i) => {
    const rows: [string, Style, string, string][] = series.filter((s) => s.values[i] > 0).map((s) => [s.color, s.style, s.name, String(s.values[i])]);
    if (hours[i] > 0) rows.push([CY, "bars", "编码", `${hours[i].toFixed(1)}h`]);
    const wd = WEEK[new Date(`${p.label}T00:00:00Z`).getUTCDay()];
    const title = `${p.label.slice(5).replace("-", ".")} 周${wd}`;
    const bwid = 150;
    const bh = 30 + Math.max(1, rows.length) * 16;
    const bx = x(i) + 14 + bwid > W - R ? x(i) - 14 - bwid : x(i) + 14;
    const by0 = T - 2;
    let g = `<line x1="${x(i)}" x2="${x(i)}" y1="${T - 4}" y2="${hy + hh}" stroke="var(--fg)" stroke-opacity=".28" stroke-dasharray="2 3"/>`;
    for (const s of series) if (s.style === "area" || s.style === "line" || s.style === "dashed") g += `<circle cx="${x(i)}" cy="${yOf(s)(s.values[i]).toFixed(1)}" r="3.8" fill="${s.color}" stroke="var(--card)" stroke-width="1.6"/>`;
    g += `<rect x="${bx}" y="${by0}" width="${bwid}" height="${bh}" rx="10" fill="var(--card2)" fill-opacity=".96" stroke="var(--line)"/>`;
    g += `<rect x="${bx + 10}" y="${by0}" width="${bwid - 20}" height="2" rx="1" fill="${PK}" fill-opacity=".8"/>`;
    g += `<text class="mono" x="${bx + 12}" y="${by0 + 19}" font-size="${FS}" font-weight="700">${title}</text>`;
    if (!rows.length) g += `<text class="faint" x="${bx + 12}" y="${by0 + 38}" font-size="10.5">这天没有动静</text>`;
    rows.forEach(([c, st, name, v], r) => {
      const ry = by0 + 38 + r * 16;
      g += `<g transform="translate(${bx + 10} ${ry - 8.5}) scale(.85)">${swatch(st, c)}</g>`;
      g += `<text class="mute" x="${bx + 28}" y="${ry}" font-size="10.5">${name}</text>`;
      g += `<text class="mono" x="${bx + bwid - 12}" y="${ry}" font-size="10.5" font-weight="700" text-anchor="end">${v}</text>`;
    });
    cyc += `<g class="cy" ${delay(CYCLE_START + i * STEP)}>${g}</g>`;
  });

  const foot = `<text class="faint" x="${L}" y="${hy + hh + 22}" font-size="10">左轴: PR / Issue / 评论 (次) · 右轴: 提交 · 柱上为当天数, 牌子为峰值 · 蓝色虚线为日均编码时长</text>`;
  const H = hy + hh + 34;
  const body =
    `<defs>${defs}</defs><rect class="card" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14"/>` +
    head + grid + plot + marks + comet + strip + cyc + foot;
  return svg(W, H, `近 ${n} 天 GitHub 走势`, body, CSS);
}
