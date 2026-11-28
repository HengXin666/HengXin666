// 主页的每一个可点元素各是一张独立的小 SVG, README 里各自用 <a> 包住, 点哪个就去哪个.
// (GitHub 用 <img> 引 SVG 时会剥掉 SVG 内部的 <a>, 一张大图只能有一个链接, 所以拆成多张.)

import { icon } from "./icons.js";
import { delay, esc, fmt, smoothPath, svg, SERIES, textWidth, truncate, W } from "./theme.js";

// ---------------------------------------------------------------- 头图

/**
 * 头图: 左边头像 (渐变光环慢转), 右边名字与轮播歌词 (逐字揭开, 停留后淡出, 九句循环).
 * 高 128, 取代原来 200px 头像 + 打字机两段 (合计约 300px 高).
 */
export function hero(avatar: string, name: string, tagline: string, foot: string, lines: string[]): string {
  const H = 128;
  const per = 5; // 每句 5 秒: 1.6s 揭开, 停 2.6s, 0.8s 淡出
  const total = per * lines.length;
  const p = (s: number) => ((s / total) * 100).toFixed(2);
  const css = `
.ring{transform-origin:64px 64px;animation:spin 14s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.blob{animation:float 9s ease-in-out infinite alternate}
@keyframes float{to{transform:translate(40px,-10px)}}
.ly{opacity:0;animation:ly ${total}s linear infinite}
.ly rect{transform-box:fill-box;transform-origin:left;animation:wipe ${total}s steps(24,end) infinite}
@keyframes ly{0%{opacity:1}${p(per - 0.8)}%{opacity:1}${p(per)}%{opacity:0}100%{opacity:0}}
@keyframes wipe{0%{transform:scaleX(0)}${p(1.6)}%{transform:scaleX(1)}100%{transform:scaleX(1)}}
.caret{animation:blink 1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
.name{font-size:30px;font-weight:700;letter-spacing:.5px}
`;
  const lyX = 168;
  const lyY = 82;
  const lyric = lines
    .map((line, i) => {
      const d = `animation-delay:${i * per}s`;
      const w = textWidth(line, 17) + 4;
      return (
        `<g class="ly" style="${d}"><mask id="m${i}"><rect x="${lyX}" y="${lyY - 18}" width="${w.toFixed(0)}" height="24" fill="#fff" style="${d}"/></mask>` +
        `<text x="${lyX}" y="${lyY}" font-size="17" fill="var(--pk)" mask="url(#m${i})">${esc(line)}</text></g>`
      );
    })
    .join("");
  const body = `
<defs>
  <linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--pk)"/><stop offset="1" stop-color="var(--pu)"/></linearGradient>
  <radialGradient id="hb" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="var(--glow)" stop-opacity=".22"/><stop offset="1" stop-color="var(--glow)" stop-opacity="0"/></radialGradient>
  <clipPath id="av"><circle cx="64" cy="64" r="46"/></clipPath>
  <clipPath id="card"><rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16"/></clipPath>
</defs>
<rect class="card" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="16"/>
<g clip-path="url(#card)">
  <circle class="blob" cx="${W - 150}" cy="20" r="150" fill="url(#hb)"/>
  <circle class="blob" cx="${W - 330}" cy="140" r="110" fill="url(#hb)" style="animation-duration:12s"/>
</g>
<g transform="translate(16 0)">
  <circle class="ring" cx="64" cy="64" r="53" fill="none" stroke="url(#hg)" stroke-width="3" stroke-dasharray="26 10" stroke-linecap="round"/>
  <image href="${avatar}" x="18" y="18" width="92" height="92" clip-path="url(#av)" preserveAspectRatio="xMidYMid slice"/>
  <circle cx="64" cy="64" r="46" fill="none" stroke="var(--line)"/>
</g>
<text class="name in" x="${lyX}" y="52" fill="url(#hg)">${esc(name)}</text>
<text class="mute in" x="${lyX + textWidth(name, 30) + 14}" y="51" font-size="13" ${delay(0.15)}>${esc(tagline)}</text>
${lyric}
<rect class="caret" x="${lyX}" y="${lyY + 10}" width="10" height="2" rx="1" fill="var(--pk)"/>
<text class="faint" x="${lyX}" y="${H - 18}" font-size="11">${esc(foot)}</text>
`;
  return svg(W, H, `${name} ${tagline}`, body, css);
}

// ---------------------------------------------------------------- 小胶囊 (社交 / 语言)

/** 带图标的胶囊, 宽度按文字自适应. 右侧可带一段弱化的值 */
export function pill(opt: { icon?: string; dot?: string; label: string; value?: string; color?: string; i?: number }): {
  svg: string;
  width: number;
} {
  const H = 30;
  const pad = 12;
  const iconW = opt.icon || opt.dot ? 20 : 0;
  const lw = textWidth(opt.label, 13);
  const vw = opt.value ? textWidth(opt.value, 12) + 8 : 0;
  const inner = iconW + lw + vw;
  const w = Math.ceil(inner + pad * 2 + 8); // +8: 左右各留 4px 作为相邻胶囊的间距
  const c = opt.color ?? "var(--fg)";
  const x0 = 4 + pad;
  const mark = opt.icon
    ? icon(opt.icon, x0, 8, 14, c)
    : opt.dot
      ? `<circle class="pulse" cx="${x0 + 6}" cy="15" r="4" fill="${opt.dot}" ${delay((opt.i ?? 0) * 0.2)}/>`
      : "";
  const css = `.sh{animation:sh 3.2s ease-in-out 1}@keyframes sh{from{transform:translateX(-80px)}to{transform:translateX(${w + 80}px)}}`;
  const body =
    `<defs><linearGradient id="s" x1="0" x2="1"><stop offset="0" stop-color="var(--glow)" stop-opacity="0"/><stop offset=".5" stop-color="var(--glow)" stop-opacity=".25"/><stop offset="1" stop-color="var(--glow)" stop-opacity="0"/></linearGradient>` +
    `<clipPath id="c"><rect x="4.5" y="0.5" width="${w - 9}" height="${H - 1}" rx="${H / 2}"/></clipPath></defs>` +
    `<g class="in" ${delay((opt.i ?? 0) * 0.06)}>` +
    `<rect class="card" x="4.5" y="0.5" width="${w - 9}" height="${H - 1}" rx="${H / 2}"/>` +
    `<g clip-path="url(#c)"><rect class="sh" x="-60" y="0" width="60" height="${H}" fill="url(#s)" ${delay(0.6 + (opt.i ?? 0) * 0.15)}/></g>` +
    mark +
    `<text x="${x0 + iconW}" y="19.5" font-size="13" font-weight="500">${esc(opt.label)}</text>` +
    (opt.value ? `<text class="mono mute" x="${x0 + iconW + lw + 8}" y="19.5" font-size="12">${esc(opt.value)}</text>` : "") +
    `</g>`;
  return { svg: svg(w, H, opt.value ? `${opt.label} ${opt.value}` : opt.label, body, css), width: w };
}

// ---------------------------------------------------------------- 数据磁贴

/** 一格统计: 图标 + 标签, 大数字, 一行小注, 近 30 天迷你柱. 宽 W/6 (132), 内含 4px 外边距 */
export function tile(opt: { icon: string; color: string; value: string; label: string; spark: number[]; sub: string; i: number }): string {
  const w = W / 6;
  const H = 96;
  const max = Math.max(1, ...opt.spark);
  const bw = (w - 32) / opt.spark.length;
  const base = H - 14;
  const bars = opt.spark
    .map((v, k) => {
      const h = v === 0 ? 1 : Math.max(2, (v / max) * 14);
      return `<rect class="rise" x="${(16 + k * bw).toFixed(1)}" y="${(base - h).toFixed(1)}" width="${Math.max(1, bw - 1.2).toFixed(1)}" height="${h.toFixed(1)}" rx="1" fill="${opt.color}" opacity="${v === 0 ? 0.25 : 0.85}" ${delay(0.3 + opt.i * 0.06 + k * 0.012)}/>`;
    })
    .join("");
  const body =
    `<g class="in" ${delay(opt.i * 0.07)}>` +
    `<rect class="card" x="4.5" y="4.5" width="${w - 9}" height="${H - 9}" rx="12"/>` +
    icon(opt.icon, 16, 15, 14, opt.color) +
    `<text class="mute" x="36" y="26" font-size="12">${esc(opt.label)}</text>` +
    `<text class="mono" x="16" y="52" font-size="22" font-weight="700">${esc(opt.value)}</text>` +
    `<text class="faint" x="16" y="67" font-size="10">${esc(opt.sub)}</text>` +
    bars +
    `</g>`;
  return svg(w, H, `${opt.label} ${opt.value}`, body);
}

// ---------------------------------------------------------------- 聚合折线图

export type Day = { date: string; commits: number; prs: number; issues: number; reviews: number; hours: number };

/**
 * 近 30 天聚合折线 (参考 HX-AIOA 手机端 GitHub 页的做法: 上面一行汇总, 下面一张图把几种动态叠在一起):
 * 提交 / PR / Issue 用左轴 (次数), 编码时长用右轴 (小时, 面积). 线条逐条描出, 最新一天的点呼吸.
 */
export function activityChart(days: Day[], streak: { current: number; longest: number }): string {
  const H = 232;
  const L = 44;
  const R = 44;
  const T = 58;
  const B = 32;
  const iw = W - L - R;
  const ih = H - T - B;
  const n = days.length;
  const x = (i: number) => L + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);

  const countMax = Math.max(1, ...days.flatMap((d) => [d.commits, d.prs, d.issues, d.reviews]));
  const hourMax = Math.max(1, ...days.map((d) => d.hours));
  // 四等分网格: 先取每格步长 (整齐的数), 再乘 4, 刻度都是整数
  const niceMax = (v: number) => {
    const raw = v / 4;
    const p = 10 ** Math.floor(Math.log10(raw));
    return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((k) => k * p >= raw) ?? 10) * p * 4;
  };
  const cMax = niceMax(countMax);
  const hMax = niceMax(hourMax);
  const yc = (v: number) => T + ih - (v / cMax) * ih;
  const yh = (v: number) => T + ih - (v / hMax) * ih;

  let grid = "";
  for (let k = 0; k <= 4; k++) {
    const y = T + (ih * k) / 4;
    grid += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="var(--line)" stroke-dasharray="${k === 4 ? "0" : "3 4"}"/>`;
    grid += `<text class="mono faint" x="${L - 8}" y="${y + 4}" font-size="10" text-anchor="end">${fmt(Math.round(cMax * (1 - k / 4)))}</text>`;
    grid += `<text class="mono faint" x="${W - R + 8}" y="${y + 4}" font-size="10">${+(hMax * (1 - k / 4)).toFixed(1)}h</text>`;
  }
  for (let i = 0; i < n; i += 5) {
    const anchor = i === 0 ? "start" : "middle";
    grid += `<text class="mono faint" x="${x(i)}" y="${H - 12}" font-size="10" text-anchor="${anchor}">${days[i].date.slice(5).replace("-", ".")}</text>`;
  }
  grid += `<text class="mono faint" x="${x(n - 1)}" y="${H - 12}" font-size="10" text-anchor="end">今天</text>`;

  // 编码时长: 面积 + 细线
  const hp = days.map((d, i) => [x(i), yh(d.hours)] as [number, number]);
  const hLine = smoothPath(hp);
  const area = `${hLine}L${x(n - 1)} ${T + ih}L${x(0)} ${T + ih}Z`;
  const series: [keyof typeof SERIES, string][] = [
    ["issues", "Issue"],
    ["prs", "PR"],
    ["commits", "提交"],
  ];
  if (days.some((d) => d.reviews > 0)) series.unshift(["reviews", "评审"]);
  const lines = series
    .map(([k, , ], j) => {
      const pts = days.map((d, i) => [x(i), yc(d[k as keyof Day] as number)] as [number, number]);
      const last = pts[pts.length - 1];
      return (
        `<path class="draw" pathLength="1" d="${smoothPath(pts)}" fill="none" stroke="${SERIES[k]}" stroke-width="${k === "commits" ? 2.4 : 1.8}" stroke-linecap="round" ${delay(0.2 + j * 0.25)}/>` +
        `<circle class="pulse" cx="${last[0]}" cy="${last[1]}" r="3.2" fill="${SERIES[k]}" ${delay(1.6 + j * 0.2)}/>`
      );
    })
    .join("");

  // 顶部: 标题 + 汇总 + 图例
  const sum = (k: keyof Day) => days.reduce((s, d) => s + (d[k] as number), 0);
  const legend: [string, string, string][] = [
    [SERIES.commits, "提交", fmt(sum("commits"))],
    [SERIES.prs, "PR", fmt(sum("prs"))],
    [SERIES.issues, "Issue", fmt(sum("issues"))],
    ...(sum("reviews") > 0 ? ([[SERIES.reviews, "评审", fmt(sum("reviews"))]] as [string, string, string][]) : []),
    [SERIES.hours, "编码", `${sum("hours").toFixed(0)}h`],
  ];
  let lx = 16;
  let leg = "";
  legend.forEach(([c, label, v], j) => {
    leg += `<g class="in" ${delay(0.1 + j * 0.06)}><rect x="${lx}" y="36" width="10" height="10" rx="3" fill="${c}"/>`;
    leg += `<text class="mute" x="${lx + 15}" y="45" font-size="12">${label}</text>`;
    const vx = lx + 15 + textWidth(label, 12) + 5;
    leg += `<text class="mono" x="${vx}" y="45" font-size="12" font-weight="600">${v}</text></g>`;
    lx = vx + textWidth(v, 12) + 18;
  });
  const head =
    icon("activity", 16, 12, 15, "var(--pk)") +
    `<text x="38" y="24" font-size="14" font-weight="600">近 ${n} 天</text>` +
    `<text class="faint" x="${38 + textWidth(`近 ${n} 天`, 14) + 8}" y="24" font-size="11">GitHub 动态与 WakaTime 编码时长</text>` +
    `<g class="pulse">${icon("flame", W - 150, 11, 15, "var(--or)")}</g>` +
    `<text x="${W - 130}" y="24" font-size="12"><tspan class="mono" font-weight="700">${streak.current}</tspan><tspan class="mute"> 天连续</tspan><tspan class="faint"> · 最长 </tspan><tspan class="mono mute">${streak.longest}</tspan></text>`;

  const body =
    `<defs><linearGradient id="ha" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--cy)" stop-opacity=".28"/><stop offset="1" stop-color="var(--cy)" stop-opacity="0"/></linearGradient></defs>` +
    `<rect class="card" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14"/>` +
    head +
    leg +
    grid +
    `<path class="in" d="${area}" fill="url(#ha)" ${delay(0.4)}/>` +
    `<path class="draw" pathLength="1" d="${hLine}" fill="none" stroke="var(--cy)" stroke-width="1.4" stroke-dasharray="1" ${delay(0.1)} opacity=".9"/>` +
    lines;
  return svg(W, H, `近 ${n} 天 GitHub 动态`, body);
}

// ---------------------------------------------------------------- 分节标题

export function sectionHead(opt: { icon: string; title: string; sub?: string; right?: string; more?: string }): string {
  const H = 40;
  const body =
    `<g class="in">` +
    icon(opt.icon, 6, 12, 16, "var(--pk)") +
    `<text x="30" y="26" font-size="16" font-weight="700">${esc(opt.title)}</text>` +
    (opt.sub ? `<text class="faint" x="${30 + textWidth(opt.title, 16) + 10}" y="26" font-size="12">${esc(opt.sub)}</text>` : "") +
    (opt.right ? `<text class="mute" x="${W - (opt.more ? 76 : 6)}" y="26" font-size="12" text-anchor="end">${esc(opt.right)}</text>` : "") +
    (opt.more
      ? `<text x="${W - 22}" y="26" font-size="12" fill="var(--pk)" text-anchor="end">${esc(opt.more)}</text>` +
        `<path d="M${W - 16} 15l5 5-5 5" fill="none" stroke="var(--pk)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
      : "") +
    `<line class="grow" x1="6" x2="${W - 6}" y1="${H - 1}" y2="${H - 1}" stroke="var(--line)"/>` +
    `</g>`;
  return svg(W, H, opt.title, body);
}

// ---------------------------------------------------------------- 最近更新的一行

export function latestRow(opt: { kind: "blog" | "note"; idx: number; title: string; date: string; cat?: string }): string {
  const w = W / 2;
  const H = 38;
  const color = opt.kind === "blog" ? "var(--pk)" : "var(--cy)";
  const right = opt.date;
  const rw = textWidth(right, 11) + 4;
  const catW = opt.cat ? textWidth(opt.cat, 10) + 12 : 0;
  const titleMax = w - 8 - 44 - rw - (catW ? catW + 8 : 0) - 16;
  const body =
    `<g class="in" ${delay(opt.idx * 0.06 + (opt.kind === "note" ? 0.03 : 0))}>` +
    `<rect class="card" x="4.5" y="3.5" width="${w - 9}" height="${H - 7}" rx="9"/>` +
    `<rect class="rise" x="4.5" y="9" width="3" height="${H - 18}" rx="1.5" fill="${color}" ${delay(0.2 + opt.idx * 0.06)}/>` +
    icon(opt.kind === "blog" ? "book" : "note", 16, 12, 14, color) +
    `<text x="38" y="24" font-size="13">${esc(truncate(opt.title, 13, titleMax))}</text>` +
    (opt.cat
      ? `<rect x="${w - 14 - rw - catW - 6}" y="11" width="${catW}" height="16" rx="8" fill="${color}" fill-opacity=".12"/>` +
        `<text x="${w - 14 - rw - catW / 2 - 6}" y="22.5" font-size="10" fill="${color}" text-anchor="middle">${esc(opt.cat)}</text>`
      : "") +
    `<text class="mono faint" x="${w - 14}" y="23.5" font-size="11" text-anchor="end">${esc(right)}</text>` +
    `</g>`;
  return svg(w, H, opt.title, body);
}

// ---------------------------------------------------------------- 语言占比

/**
 * 语言占比: 一条按字节比例分段的横条 (各段依次长出), 下方前 4 名的名字与百分比.
 * 整张图一个链接 (仓库列表); 每种语言单独可点的入口是下面那排胶囊.
 */
export function langBar(langs: { name: string; color: string; size: number }[], repos: number): string {
  const H = 76;
  const total = langs.reduce((s, l) => s + l.size, 0) || 1;
  const x0 = 16;
  const bw = W - 32;
  let x = x0;
  let segs = "";
  langs.forEach((l, i) => {
    const w = (l.size / total) * bw;
    if (w < 0.5) return;
    segs += `<rect class="grow" x="${x.toFixed(1)}" y="38" width="${Math.max(0.5, w - 1.5).toFixed(1)}" height="12" fill="${l.color}" ${delay(0.15 + i * 0.09)}><title>${esc(l.name)} ${((l.size / total) * 100).toFixed(1)}%</title></rect>`;
    x += w;
  });
  const top = langs
    .slice(0, 4)
    .map((l) => `${l.name} ${((l.size / total) * 100).toFixed(0)}%`)
    .join(" / ");
  const body =
    `<defs><clipPath id="b"><rect x="${x0}" y="38" width="${bw}" height="12" rx="6"/></clipPath></defs>` +
    `<rect class="card" x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="14"/>` +
    icon("code", 16, 11, 15, "var(--pk)") +
    `<text x="38" y="23" font-size="14" font-weight="600">语言占比</text>` +
    `<text class="faint" x="${38 + textWidth("语言占比", 14) + 8}" y="23" font-size="11">${repos} 个自有仓库, 按代码字节</text>` +
    `<text class="mute" x="${W - 16}" y="23" font-size="12" text-anchor="end">${esc(top)}</text>` +
    `<rect x="${x0}" y="38" width="${bw}" height="12" rx="6" fill="var(--line)" opacity=".5"/>` +
    `<g clip-path="url(#b)">${segs}</g>` +
    `<text class="faint" x="${x0}" y="66" font-size="10">点下方语言看对应仓库</text>`;
  return svg(W, H, "语言占比", body);
}
