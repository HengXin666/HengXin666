// 从 HX-AIOA (Cloudflare Worker) 读主账号的 GitHub 按天统计, 落地 data/aioa.json. 不需要 GitHub 令牌.
//
// AIOA 的 hengxin666.github 插件用 webhook + 定时回填记录关注仓库的推送 / PR / Issue / 评审 / 评论,
// GET /api/v1/github/daily?days=30&tz=480 按北京时间分天汇总 (磁贴用); GET /api/v1/github/trend 给近 14 天走势 (手机端走势合一图同源).
// 两个接口都只要 events:read.
// 需要 AIOA 的 key (scope events:read): 环境变量 AIOA_SERVER (如 https://aioa.woa.qzz.io) + AIOA_KEY.
// 没配或请求失败时不动旧文件; render.ts 有 aioa.json 时用它画提交 / PR / Issue, 否则退回 GitHub GraphQL 的数.
//
// 用法: node --loader ts-node/esm scripts/profile/fetchAioa.ts

import { writeFileSync } from "fs";
import { RECENT_DAYS, TZ } from "./config.js";

const OUT = "data/aioa.json";
const TREND_OUT = "data/aioa-trend.json";

async function getJson(server: string, key: string, path: string): Promise<any> {
  const res = await fetch(`${server}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "User-Agent": "HengXin666-profile" },
  });
  const text = await res.text();
  if (!res.ok || !text.trim().startsWith("{")) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  return JSON.parse(text);
}

async function daily(server: string, key: string) {
  const d = await getJson(server, key, `/api/v1/github/daily?days=${RECENT_DAYS}&tz=480`);
  if (!Array.isArray(d.days)) throw new Error("返回里没有 days");
  writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), ...d }) + "\n");
  console.log(`[aioa] 已写 ${OUT}: ${d.days.length} 天, 连续 ${d.streak} 天`);
}

// 走势合一图: 只留按天的 14 格与回补状态, 周数据和足迹主页不用
async function trend(server: string, key: string) {
  const d = await getJson(server, key, `/api/v1/github/trend?tz=${encodeURIComponent(TZ)}`);
  if (!Array.isArray(d.days?.points)) throw new Error("返回里没有 days.points");
  const out = { fetchedAt: new Date().toISOString(), syncedAt: d.syncedAt, backfill: d.backfill, days: d.days };
  writeFileSync(TREND_OUT, JSON.stringify(out) + "\n");
  console.log(`[aioa] 已写 ${TREND_OUT}: ${d.days.points.length} 天`);
}

async function main() {
  const server = (process.env.AIOA_SERVER || "").replace(/\/+$/, "");
  const key = process.env.AIOA_KEY || "";
  if (!server || !key) {
    console.warn("[aioa] 没有 AIOA_SERVER / AIOA_KEY, 跳过");
    return;
  }
  // 两份互不影响, 哪份失败就保留哪份的旧文件
  for (const [name, job] of [["daily", daily], ["trend", trend]] as const) {
    await job(server, key).catch((err) => console.error(`[aioa] ${name} 拉取失败, 保留旧数据:`, err.message));
  }
}

main();
