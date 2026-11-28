import { writeFileSync } from "fs";
import fetch from "node-fetch";
import { parseStringPromise } from "xml2js";
import { renderProfile } from "./profile/render.js";

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
  }).format(new Date());

  // 卡片全部由 scripts/profile/ 渲染成仓库内 SVG, 每个可点元素一张, 各自用 <a> 包住 (见 render.ts 头注释)
  const body = renderProfile(blogItems, docsItems, beijingTime);
  const readme = `<!-- 由 scripts/updateReadme.ts 生成, 每日凌晨更新; 手改会被覆盖 -->
<div align="center">

${body}

</div>
`;

  writeFileSync(README_PATH, readme);
  console.log("README.md 已更新");
}

main().catch((err) => {
  console.error("更新失败:", err);
  process.exit(1);
});
