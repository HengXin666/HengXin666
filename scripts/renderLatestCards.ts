// 「最近更新」自托管 SVG 卡片 (博客 5 + 笔记 5), 与 img/cards/anime.svg 同一套视觉语言.
//
// 主题令牌 / 版式常量全部照抄 py/anime_card.py (HXLoLi custom.css 暗色 + Docusaurus 暗色灰阶):
//   暗色底 #121212, 主色 #ff88ff, 卡片宽 840, 外边距 20, 面板圆角 12 / 内边距 16,
//   面板底 rgba(255,255,255,0.025) + 描边 #444950, 正文 12px, 等宽日期 11px.
//
// 加载速度: 纯文字排版, 不内嵌任何图片 (没有 data:image / base64), 单文件约 5~8 KB.
//
// 可点击性: GitHub 用 <img> 引用 SVG 时会剥掉 SVG 内部所有 <a>, 所以这里故意不放 <a>;
// 链接由 updateReadme.ts 在 README 层给出 (卡片整体 <a> 包裹 + 卡片下方一一对应的编号链接行),
// 卡片里每条前面的编号 (01..05) 与 README 链接行的编号一一对应.
//
// 用法:
//   1) 被 updateReadme.ts import: renderLatestSvg(blogItems, docsItems, beijingTime) -> SVG 字符串
//   2) 单独预览: node scripts/renderLatestCards.ts  (自带同一套 RSS 源 / 5 条上限, 写 img/cards/latest.svg)
// 不引入新依赖: 只用 fs / node-fetch / xml2js (仓库已有).

export type LatestItem = { title: string; link: string; date: string };

// ---- 主题令牌 (与 py/anime_card.py 一致) ----
const BG = "#121212";
const SURFACE = "#ffffff";
const SURFACE_OP = 0.025;
const LINE = "#444950";
const FAINT = "#ccd0d5";
const TEXT = "#e3e3e3";
const PRIMARY = "#ff88ff";
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, " +
  "'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif";
const MONO = "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace";

// ---- 版式 (与 py/anime_card.py 一致的部分) ----
const CARD_W = 840;
const OUTER = 20;
const PANEL_W = CARD_W - 2 * OUTER;
const PANEL_PAD = 16;
const PANEL_R = 12;
const HEAD_Y = 34;
const PANEL_Y = 56;
const INNER_W = PANEL_W - 2 * PANEL_PAD;
const SECTION_GAP = 16;
const NAME_SIZE = 12;
const META_SIZE = 11;

// ---- 本卡片自己的版式 ----
const SEC_HEAD_H = 24; // 小节头 (博客 5 / 全部博客)
const ROW_H = 30;
const IDX_W = 28; // "01" 编号列
const TAG_PAD = 6;
const TAG_H = 18;
const TAG_R = 4;
const DATE_W = 80; // "2026-10-08" @ 11px mono
const COL_GAP = 12;
const FOOT_H = 30;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// 估算渲染宽度: CJK / 全角按 1em, 其余按 0.6em (够用来截断, 不追求像素级)
function textWidth(s: string, size: number): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    w += cp >= 0x2e80 ? size : size * 0.6;
  }
  return w;
}

function truncate(s: string, size: number, maxW: number): string {
  if (textWidth(s, size) <= maxW) return s;
  let out = "";
  for (const ch of s) {
    if (textWidth(out + ch + "…", size) > maxW) break;
    out += ch;
  }
  return out + "…";
}

// 笔记的分类 = 链接里 /docs/ 后的第一段 (与 updateReadme.ts 的 docCat 一致)
export function docCat(link: string): string {
  try {
    return decodeURIComponent(new URL(link).pathname).split("/docs/")[1]?.split("/")[0] ?? "";
  } catch {
    return "";
  }
}

function section(
  o: string[],
  y: number,
  name: string,
  allLabel: string,
  items: LatestItem[],
  withCat: boolean,
): number {
  const panelH = PANEL_PAD * 2 + SEC_HEAD_H + Math.max(items.length, 1) * ROW_H;
  o.push(`<g transform="translate(${OUTER},${y})">`);
  o.push(
    `<rect x="0.5" y="0.5" width="${PANEL_W - 1}" height="${panelH - 1}" rx="${PANEL_R}" ` +
      `fill="${SURFACE}" fill-opacity="${SURFACE_OP}" stroke="${LINE}"/>`,
  );
  o.push(`<g transform="translate(${PANEL_PAD},${PANEL_PAD})">`);
  // 小节头: 名称 + 等宽计数 (主色) ... 右侧 "全部 xx →"
  o.push(`<text class="s" x="0" y="15">${esc(name)}</text>`);
  o.push(`<text class="k" x="${textWidth(name, 14) + 8}" y="15">${items.length}</text>`);
  o.push(`<text class="a" x="${INNER_W}" y="15" text-anchor="end">${esc(allLabel)} →</text>`);

  items.forEach((it, i) => {
    const ry = SEC_HEAD_H + i * ROW_H;
    const base = ry + 19;
    // 行分隔线
    o.push(`<rect y="${ry + 0.5}" width="${INNER_W}" height="1" fill="${LINE}" fill-opacity="0.6"/>`);
    o.push(`<text class="ix" x="0" y="${base}">${String(i + 1).padStart(2, "0")}</text>`);
    let x = IDX_W;
    if (withCat) {
      const cat = docCat(it.link);
      if (cat) {
        const tw = Math.round(textWidth(cat, META_SIZE) + TAG_PAD * 2);
        o.push(
          `<rect x="${x}" y="${base - 13}" width="${tw}" height="${TAG_H}" rx="${TAG_R}" ` +
            `fill="${PRIMARY}" fill-opacity="0.12"/>`,
        );
        o.push(`<text class="c" x="${x + TAG_PAD}" y="${base - 0.5}">${esc(cat)}</text>`);
        x += tw + 10;
      }
    }
    const maxW = INNER_W - x - DATE_W - COL_GAP;
    o.push(`<text class="n" x="${x}" y="${base}">${esc(truncate(it.title, NAME_SIZE, maxW))}</text>`);
    o.push(`<text class="m" x="${INNER_W}" y="${base}" text-anchor="end">${esc(it.date)}</text>`);
  });
  if (items.length === 0) {
    o.push(`<text class="d" x="0" y="${SEC_HEAD_H + 19}">暂无</text>`);
  }
  o.push(`</g></g>`);
  return panelH;
}

export function renderLatestSvg(blog: LatestItem[], docs: LatestItem[], updatedAt: string): string {
  const o: string[] = [];
  const body: string[] = [];
  let y = PANEL_Y;
  y += section(body, y, "博客", "全部博客", blog, false) + SECTION_GAP;
  y += section(body, y, "笔记", "全部笔记", docs, true);
  const height = y + FOOT_H + 6;

  o.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${height}" ` +
      `viewBox="0 0 ${CARD_W} ${height}" role="img" aria-label="最近更新">`,
  );
  o.push("<style>");
  o.push(`.h{font:600 20px ${SANS};fill:${TEXT};letter-spacing:-0.2px}`);
  o.push(`.d{font:400 13px ${SANS};fill:${FAINT}}`);
  o.push(`.s{font:600 14px ${SANS};fill:${TEXT}}`);
  o.push(`.k{font:600 13px ${MONO};fill:${PRIMARY}}`);
  o.push(`.a{font:400 13px ${SANS};fill:${PRIMARY}}`);
  o.push(`.ix{font:400 ${META_SIZE}px ${MONO};fill:${PRIMARY}}`);
  o.push(`.c{font:400 ${META_SIZE}px ${SANS};fill:${PRIMARY}}`);
  o.push(`.n{font:400 ${NAME_SIZE}px ${SANS};fill:${TEXT}}`);
  o.push(`.m{font:400 ${META_SIZE}px ${MONO};fill:${FAINT}}`);
  o.push(`.l{font:400 11px ${SANS};fill:${FAINT}}`);
  o.push("</style>");
  o.push(`<rect width="${CARD_W}" height="${height}" rx="${PANEL_R}" fill="${BG}"/>`);
  o.push(`<text class="h" x="${OUTER}" y="${HEAD_Y}">最近更新</text>`);
  o.push(
    `<text class="d" x="${CARD_W - OUTER}" y="${HEAD_Y}" text-anchor="end">` +
      `HXLoLi 博客与笔记, 编号对应下方链接</text>`,
  );
  o.push(...body);
  o.push(
    `<text class="m" x="${CARD_W - OUTER}" y="${height - 14}" text-anchor="end">` +
      `${esc(updatedAt)} (北京时间) · From HXLoLi</text>`,
  );
  o.push("</svg>");
  return o.join("\n") + "\n";
}

// ---- 单独运行: 生成 img/cards/latest.svg 预览 (数据源 / 上限与 updateReadme.ts 相同) ----
const isMain = (() => {
  try {
    const argv1 = process.argv[1] ?? "";
    return argv1.endsWith("renderLatestCards.ts") || argv1.endsWith("renderLatestCards.js");
  } catch {
    return false;
  }
})();

if (isMain) {
  const { writeFileSync } = await import("fs");
  const { default: fetch } = await import("node-fetch");
  const { parseStringPromise } = await import("xml2js");

  const BLOG_RSS_URLS = [
    "https://km.woa.qzz.io/blog/rss.xml",
    "https://hengxin666.github.io/HXLoLi/blog/rss.xml",
  ];
  const DOCS_RSS_URLS = [
    "https://km.woa.qzz.io/docs-rss.xml",
    "https://hengxin666.github.io/HXLoLi/docs-rss.xml",
  ];

  // 与 updateReadme.ts 的 fetchLatest 同一逻辑
  const fetchLatest = async (urls: string[], count: number): Promise<LatestItem[]> => {
    let lastErr: Error | null = null;
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        const xmlStart = xml.indexOf("<?xml");
        const cleanXml = xmlStart >= 0 ? xml.slice(xmlStart) : xml;
        const parsed = await parseStringPromise(cleanXml);
        return parsed.rss.channel[0].item.slice(0, count).map((item: any) => ({
          title: item.title[0],
          link: item.link[0],
          date: new Date(item.pubDate?.[0] ?? "").toISOString().split("T")[0],
        }));
      } catch (err: any) {
        console.warn(`  ✗ ${url}: ${err.message?.slice(0, 120)}`);
        lastErr = err;
      }
    }
    throw new Error(`所有 RSS URL 均失败: ${lastErr?.message}`);
  };

  const [blog, docs] = await Promise.all([fetchLatest(BLOG_RSS_URLS, 5), fetchLatest(DOCS_RSS_URLS, 5)]);
  const now = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());
  writeFileSync("img/cards/latest.svg", renderLatestSvg(blog, docs, now));
  console.log("img/cards/latest.svg 已生成");
}
