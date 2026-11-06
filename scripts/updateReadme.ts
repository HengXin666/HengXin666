import { writeFileSync } from "fs";
import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import { VIEW_COUNTER_URL } from "./cards.js";

// 优先 km.woa.qzz.io (Cloudflare), 回退 GitHub Pages
const BLOG_RSS_URLS = [
  "https://km.woa.qzz.io/blog/rss.xml",
  "https://hengxin666.github.io/HXLoLi/blog/rss.xml",
];
const DOCS_RSS_URLS = [
  "https://km.woa.qzz.io/docs-rss.xml",
  "https://hengxin666.github.io/HXLoLi/docs-rss.xml",
];
const README_PATH = "README.md";

// 所有卡片都走仓库内相对路径: GitHub 同源直出, 不经过 camo 和第三方域名。
// 这样即使上游 Vercel 冷启动慢 / 挂了, 也不影响页面加载。
const C = (name: string) => `./img/cards/${name}.svg`;

async function fetchLatest(urls: string[], count: number) {
  let lastErr: Error | null = null;

  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const xml = await res.text();

      // 宽容解析: 去掉可能被注入的 HTML 前缀 (Cloudflare 错误页等)
      const xmlStart = xml.indexOf("<?xml");
      const cleanXml = xmlStart >= 0 ? xml.slice(xmlStart) : xml;

      const parsed = await parseStringPromise(cleanXml);
      const items = parsed.rss.channel[0].item.slice(0, count).map((item: any) => {
        const title = item.title[0];
        const link = item.link[0];
        const date = new Date(item.pubDate?.[0] ?? "").toISOString().split("T")[0];
        return { title, link, date };
      });

      console.log(`  ✓ ${url} (${items.length} items)`);
      return items;
    } catch (err: any) {
      console.warn(`  ✗ ${url}: ${err.message?.slice(0, 120)}`);
      lastErr = err;
    }
  }

  throw new Error(`所有 RSS URL 均失败: ${lastErr?.message}`);
}

async function main() {
  const [blogItems, docsItems] = await Promise.all([
    fetchLatest(BLOG_RSS_URLS, 5),
    fetchLatest(DOCS_RSS_URLS, 5),
  ]);

  const beijingTime = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());

  // 最近更新: 照 HXLoLi 主页"最近更新"的写法 (分类 + 计数作小节头, 一行一条: 分类 / 标题 / 等宽日期右对齐, 页脚"全部 xx").
  // GitHub Markdown 没有交互 tab, 两栏改成上下两个静态小节, 每节一张表; 不用表情符号.
  const cell = (s: string) => s.replace(/\|/g, "\\|");
  // 笔记的分类 = 链接里 /docs/ 后的第一段 (与 RSS 的 <category> 一致), 解析失败就留空
  const docCat = (link: string) => {
    try {
      return decodeURIComponent(new URL(link).pathname).split("/docs/")[1]?.split("/")[0] ?? "";
    } catch {
      return "";
    }
  };

  const blogList = [
    "| 标题 | 日期 |",
    "| :-- | --: |",
    ...blogItems.map((it) => `| [${cell(it.title)}](${it.link}) | <code>${it.date}</code> |`),
  ].join("\n");

  const docsList = [
    "| 分类 | 标题 | 日期 |",
    "| :-- | :-- | --: |",
    ...docsItems.map(
      (it) => `| <sub>${cell(docCat(it.link))}</sub> | [${cell(it.title)}](${it.link}) | <code>${it.date}</code> |`,
    ),
  ].join("\n");

  const readme = `<div id="title" align=center>

<!-- 注意: div 内的裸 <img> 是行内元素, 会被挤到同一行;
     必须每张图单独用 <p> 包裹才会上下排列。 -->

<!-- 头像 -->
<p><img width="200" src="./img/misaka03.jpg" /></p>

<!-- 动态打字效果 (自托管) -->
<p><img src="${C("typing")}" alt="Typing SVG" /></p>

<p><img width="400" src="${C("stats")}" title="GitHub Stats"><img width="400" src="${C("streak")}" title="GitHub Streak"></p>

<p><img src="${C("activity")}" alt="Activity Graph" /></p>

<p><img src="${C("wakatime")}" alt="WakaTime Stats"><img src="${C("top-langs")}" alt="Top Langs" /></p>

<p><img src="${C("anime")}" alt="追番中" title="追番中 (From HXLoLi-ANiMe)"></p>

<p><img src="${C("skills")}" alt="Skills" /></p>

<p><a href="https://learn.microsoft.com/zh-cn/cpp/cpp/welcome-back-to-cpp-modern-cpp"><img src="${C("badge-modern-cpp")}" alt="Modern C++"></a></p>

<p><a href="https://github.com/HengXin666"><img src="${C("badge-github")}" alt="GitHub"></a>
<a href="https://space.bilibili.com/478917126"><img src="${C("badge-bilibili")}" alt="Bilibili"></a>
<img src="${C("badge-qq")}" alt="QQ">
<a href="https://leetcode.cn/u/heng_xin/"><img src="${C("badge-leetcode")}" alt="LeetCode"></a>
<img src="${VIEW_COUNTER_URL}" alt="Profile Views">
<img src="${C("badge-wakatime")}" alt="WakaTime Badge"></p>

</div>

<!-- 仓库 -->

## [最近更新](https://km.woa.qzz.io/)

### 博客 <sub><code>${blogItems.length}</code></sub>

${blogList}

<sub><a href="https://km.woa.qzz.io/blog">全部博客</a></sub>

### 笔记 <sub><code>${docsItems.length}</code></sub>

${docsList}

<sub><a href="https://km.woa.qzz.io/docs/关于">全部笔记</a></sub>

> 更新时间: ${beijingTime} (北京时间) | From [HXLoLi](https://github.com/HengXin666/HXLoLi) <sub>[每日凌晨更新]</sub>
`;

  writeFileSync(README_PATH, readme);
  console.log("README.md 已更新");
}

main().catch((err) => {
  console.error("更新失败:", err);
  process.exit(1);
});
