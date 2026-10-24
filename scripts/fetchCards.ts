import { mkdirSync, writeFileSync, existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import fetch from "node-fetch";
import { CARDS, type CardSource } from "./cards.js";

const OUT_DIR = join("img", "cards");

// 上游在 HTTP 200 时也可能返回"错误卡片", 需要识别出来当作失败
const ERROR_MARKERS = [
  "Something went wrong",
  "Could not fetch",
  "Invalid username",
  "maximum retries",
  "rate limit",
  "DEPLOYMENT_DISABLED",
  "Payment required",
  "404 page not found",
];

function validateSvg(name: string, body: string): string | null {
  if (!body || body.trim().length === 0) return "空响应";
  if (!/<svg[\s>]/i.test(body)) return "不是 SVG";
  for (const marker of ERROR_MARKERS) {
    if (body.includes(marker)) return `上游返回错误卡片: "${marker}"`;
  }
  // 太小多半是错误占位
  if (body.length < 200) return `内容过小 (${body.length} 字节)`;
  return null;
}

async function tryFetch(url: string, timeoutMs = 25_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal as any,
      headers: { "User-Agent": "HengXin666-profile-readme-updater" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function buildCard(card: CardSource): Promise<{ name: string; ok: boolean; note: string }> {
  const target = join(OUT_DIR, `${card.name}.svg`);
  const errors: string[] = [];

  for (const url of card.urls) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const body = await tryFetch(url);
        const invalid = validateSvg(card.name, body);
        if (invalid) throw new Error(invalid);

        writeFileSync(target, body.trim() + "\n", "utf-8");
        return {
          name: card.name,
          ok: true,
          note: `${(body.length / 1024).toFixed(1)} KiB  <- ${new URL(url).host}`,
        };
      } catch (err: any) {
        errors.push(`${new URL(url).host}#${attempt}: ${err.message?.slice(0, 90)}`);
        if (attempt === 1) await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }

  // 全部失败: 保留旧文件, 避免 README 出现裂图
  const kept = existsSync(target);
  return {
    name: card.name,
    ok: false,
    note: kept
      ? `全部上游失败, 保留旧卡片 (最后错误: ${errors.at(-1)})`
      : `全部上游失败且无旧卡片 (最后错误: ${errors.at(-1)})`,
  };
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  console.log(`开始更新 ${CARDS.length} 张卡片 -> ${OUT_DIR}/`);

  const results = await Promise.all(CARDS.map(buildCard));

  let failedRequired = 0;
  for (const r of results) {
    const card = CARDS.find((c) => c.name === r.name)!;
    const icon = r.ok ? "  ✓" : card.required ? "  ✗" : "  !";
    console.log(`${icon} ${r.name.padEnd(18)} ${r.note}`);
    if (!r.ok && card.required) failedRequired++;
  }

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\n完成: ${okCount}/${results.length} 成功`);

  if (failedRequired > 0) {
    throw new Error(`${failedRequired} 张必需卡片更新失败`);
  }
}

main().catch((err) => {
  console.error("卡片更新失败:", err.message);
  process.exit(1);
});
