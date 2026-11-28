// 渲染主页的全部卡片到 img/cards/, 返回 README 的 HTML 片段.
//
// 输入 (都是仓库内文件, 渲染不联网):
//   data/github.json        fetchGithub.ts 拉的 GitHub 统计
//   data/aioa*.json         fetchAioa.ts 拉的 AIOA 按天统计与近 14 天走势 (可选)
//   data/history.json       py/wakatime_req.py 拉的 WakaTime 每日时长
//   img/cards/anime/index.json  py/anime_card.py 生成的「最近在看」封面清单
//   img/misaka03.jpg        头像
// RSS 由 updateReadme.ts 拉好后传进来.
//
// 每个可点元素是一张独立 SVG, README 里各自用 <a> 包住; 同一行的图之间不留空白字符, 间距画在 SVG 里.

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { trendChart, type TrendPoint } from "./trendChart.js";
import { activityChart, hero, langBar, langCell, latestRow, pill, sectionHead, tile, type Day } from "./cards.js";
import { HERO_LINES, LINKS, RECENT_DAYS, SKILLS } from "./config.js";
import { fmt, W } from "./theme.js";

export type LatestItem = { title: string; link: string; date: string };

const OUT = join("img", "cards");
// 访问计数只能用实时服务; 放在页脚, 灰色小号, 不抢视觉. extraCount 补回旧 komarev 计数 (约 5000)
const VIEWS = "https://hits.sh/github.com/HengXin666.svg?label=views&extraCount=5000&style=flat-square&color=6e7681&labelColor=30363d";
const rel = (...p: string[]) => "./" + [OUT, ...p].join("/");
const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function write(name: string, content: string): string {
  const path = join(OUT, name);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  return rel(name);
}

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

/** <a href><img></a>, 宽度写进 width 属性, GitHub 在窄屏会按比例缩 */
const link = (href: string | null, src: string, alt: string, width: number) => {
  const img = `<img src="${src}" width="${width}" alt="${attr(alt)}" title="${attr(alt)}">`;
  return href ? `<a href="${attr(href)}">${img}</a>` : img;
};

function wakaDays(): Map<string, number> {
  const raw = readJson<{ date: string; system?: Record<string, number>[] }[]>("data/history.json", []);
  const out = new Map<string, number>();
  for (const d of raw) {
    const sec = (d.system ?? []).reduce((s, o) => s + Object.values(o).reduce((a, b) => a + b, 0), 0);
    out.set(d.date, sec / 3600);
  }
  return out;
}

/** 笔记分类 = 链接里 /docs/ 后的第一段 */
function docCat(url: string): string | undefined {
  try {
    const seg = decodeURIComponent(new URL(url).pathname).split("/docs/")[1]?.split("/")[0];
    return seg || undefined;
  } catch {
    return undefined;
  }
}

export function renderProfile(blog: LatestItem[], docs: LatestItem[], updatedAt: string): string {
  mkdirSync(OUT, { recursive: true });
  for (const f of readdirSync(OUT)) if (/^lang-\d+\.svg$/.test(f)) unlinkSync(join(OUT, f));
  const gh = readJson<any>("data/github.json", null);
  const waka = wakaDays();
  const parts: string[] = [];

  // ---- 头图 + 社交胶囊
  const avatar = `data:image/jpeg;base64,${readFileSync("img/misaka03.jpg").toString("base64")}`;
  const heroSrc = write("hero.svg", hero(avatar, "Heng_Xin", "HengXin666", "Modern C++ / Linux / Qt / 二次元", HERO_LINES));
  parts.push(`<p>${link(LINKS.blog, heroSrc, "Heng_Xin 的博客", W)}</p>`);

  const social: [string | null, Parameters<typeof pill>[0]][] = [
    [LINKS.blog, { icon: "book", label: "博客", value: "km.woa.qzz.io", color: "var(--pk)" }],
    [LINKS.bilibili, { icon: "bilibili", label: "Heng_Xin", color: "#00a1d6" }],
    [LINKS.leetcode, { icon: "leetcode", label: "Heng_Xin", color: "#ffa116" }],
    [LINKS.modernCpp, { icon: "cplusplus", label: "Modern C++", color: "#659ad2" }],
    [null, { icon: "tencentqq", label: "QQ", value: "282000500", color: "#12b7f5" }],
  ];
  parts.push(
    `<p>${social
      .map(([href, opt], i) => {
        const p = pill({ ...opt, i });
        const src = write(`social-${i}.svg`, p.svg);
        return link(href, src, opt.value ? `${opt.label} ${opt.value}` : opt.label, p.width);
      })
      .join("")}</p>`,
  );

  // ---- GitHub 磁贴 + 聚合折线
  if (gh) {
    // 有 AIOA 的数据 (近两天内拉到的) 就用它的提交 / PR / Issue / 评审, 与手机端同源; 否则用 GitHub GraphQL 的
    const aioa = readJson<any>("data/aioa.json", null);
    const aioaFresh = aioa && Date.now() - Date.parse(aioa.fetchedAt) < 2 * 86_400_000;
    const aDay = new Map<string, any>(aioaFresh ? aioa.days.map((d: any) => [d.day, d]) : []);
    const recent: Day[] = gh.recent.map((d: any) => {
      const a = aDay.get(d.date);
      const base = a
        ? { date: d.date, commits: a.commits, prs: a.prOpened + a.prMerged + a.prClosed, issues: a.issueOpened + a.issueClosed, reviews: a.reviews }
        : d;
      return { ...base, hours: waka.get(d.date) ?? 0 };
    });
    const col = (k: keyof Day) => recent.map((d) => d[k] as number);
    const sum = (k: keyof Day) => col(k).reduce((a, b) => a + b, 0);
    const tiles = [
      { href: LINKS.profile, icon: "activity", color: "var(--pk)", value: fmt(gh.year.total), label: "贡献", spark: gh.calendar.slice(-RECENT_DAYS).map((d: any) => d.count), sub: gh.scope === "all" ? `近一年 · 含私有 ${fmt(gh.year.private)}` : "近一年 · 仅公开" },
      { href: LINKS.commits, icon: "commit", color: "var(--pk)", value: fmt(gh.year.commits), label: "提交", spark: col("commits"), sub: `近 30 天 ${fmt(sum("commits"))}` },
      { href: LINKS.prs, icon: "pr", color: "var(--pu)", value: fmt(gh.year.prs), label: "PR", spark: col("prs"), sub: `近 30 天 ${fmt(sum("prs"))}` },
      { href: LINKS.issues, icon: "issue", color: "var(--or)", value: fmt(gh.year.issues), label: "Issue", spark: col("issues"), sub: `近 30 天 ${fmt(sum("issues"))}` },
      { href: LINKS.stars, icon: "star", color: "#e3b341", value: fmt(gh.stars), label: "Star", spark: [], sub: `${gh.repos} 个仓库` },
      { href: LINKS.wakatime, icon: "clock", color: "var(--cy)", value: `${sum("hours").toFixed(0)}h`, label: "编码", spark: col("hours"), sub: `近 30 天 · 日均 ${(sum("hours") / RECENT_DAYS).toFixed(1)}h` },
    ];
    parts.push(
      `<p>${tiles
        .map((t, i) => link(t.href, write(`tile-${i}.svg`, tile({ ...t, spark: t.spark.length ? t.spark : Array(RECENT_DAYS).fill(0), i })), `${t.label} ${t.value}`, W / 6))
        .join("")}</p>`,
    );
    // 有 AIOA 走势 (近两天内拉到的) 就画走势合一图, 编码时长按同样的日期并进去; 否则退回原来的 30 天折线
    const tr = readJson<{ fetchedAt: string; backfill?: { done?: boolean }; days?: { points?: TrendPoint[] } } | null>("data/aioa-trend.json", null);
    const pts = tr && Date.now() - Date.parse(tr.fetchedAt) < 2 * 86_400_000 ? tr.days?.points ?? [] : [];
    const chart = pts.length
      ? trendChart(pts, pts.map((p) => waka.get(p.label) ?? 0), gh.streak, tr?.backfill?.done ?? true)
      : activityChart(recent, gh.streak, gh.scope);
    const alt = pts.length ? `近 ${pts.length} 天 GitHub 走势` : "近 30 天 GitHub 动态";
    parts.push(`<p>${link(LINKS.profile, write("activity.svg", chart), alt, W)}</p>`);

    // 语言: 每个一枚胶囊, 点进去是按该语言筛选的仓库列表
    const total = gh.languages.reduce((s: number, l: any) => s + l.size, 0) || 1;
    parts.push(`<p>${link(LINKS.stars.replace("&sort=stargazers", ""), write("langs.svg", langBar(gh.languages, gh.repos)), "语言占比", W)}</p>`);
    // 一行 6 格, 不折行; 第 7 名之后只在上面的分段条里 (悬停可见)
    parts.push(
      `<p>${gh.languages
        .slice(0, 6)
        .map((l: any, i: number) => {
          const pct = (l.size / total) * 100;
          return link(LINKS.language(l.name), write(`lang-${i}.svg`, langCell({ name: l.name, color: l.color, pct, max: (gh.languages[0].size / total) * 100, i })), `${l.name} ${pct.toFixed(1)}%`, W / 6);
        })
        .join("")}</p>`,
    );
  }

  // ---- 最近在看 (封面由 py/anime_card.py 生成)
  const anime = readJson<{ counts: string; items: { id: number; file: string; name: string }[] } | null>(join(OUT, "anime", "index.json"), null);
  if (anime?.items?.length) {
    const head = write("head-anime.svg", sectionHead({ icon: "tv", title: "最近在看", sub: "BanGuMi 进度", right: anime.counts, more: "全部追番" }));
    parts.push(`<p>${link(LINKS.anime, head, "全部追番", W)}</p>`);
    parts.push(`<p>${anime.items.map((a) => link(LINKS.animeDetails(a.id), rel("anime", a.file), a.name, W / 6)).join("")}</p>`);
  }

  // ---- 最近更新: 左博客右笔记, 每行一条
  parts.push(`<p>${link(LINKS.blog, write("head-latest.svg", sectionHead({ icon: "sparkles", title: "最近更新", sub: "博客与笔记", more: "去博客" })), "最近更新", W)}</p>`);
  for (const f of existsSync(join(OUT, "latest")) ? readdirSync(join(OUT, "latest")) : []) rmSync(join(OUT, "latest", f));
  const rows: string[] = [];
  for (let i = 0; i < Math.max(blog.length, docs.length); i++) {
    const cell = (it: LatestItem | undefined, kind: "blog" | "note") =>
      it ? link(it.link, write(`latest/${kind}-${i}.svg`, latestRow({ kind, idx: i, title: it.title, date: it.date, cat: kind === "note" ? docCat(it.link) : undefined })), it.title, W / 2) : "";
    rows.push(cell(blog[i], "blog") + cell(docs[i], "note"));
  }
  parts.push(`<p>${rows.join("<br>")}</p>`);

  // ---- 技能图标: 每个一枚, 点进官网
  parts.push(
    `<p>${SKILLS.filter(([id]) => existsSync(join("img", "skills", `${id}.svg`)))
      .map(([id, href]) => `<a href="${href}"><img src="./img/skills/${id}.svg" width="34" alt="${id}" title="${id}"></a>`)
      .join(" ")}</p>`,
  );

  parts.push(
    `<p><sub>更新于 ${updatedAt} (北京时间) · 数据来自 GitHub, WakaTime, <a href="${LINKS.hxloli}">HXLoLi</a> · 每日凌晨更新</sub>&nbsp;&nbsp;<img src="${VIEWS}" height="16" alt="访问量"></p>`,
  );
  return parts.join("\n\n");
}
