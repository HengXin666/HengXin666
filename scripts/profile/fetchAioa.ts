// 从 HX-AIOA (Cloudflare Worker) 读主账号的 GitHub 按天统计, 落地 data/aioa.json. 不需要 GitHub 令牌.
//
// AIOA 的 hengxin666.github 插件用 webhook + 定时回填记录关注仓库的推送 / PR / Issue / 评审 / 评论,
// GET /api/v1/github/daily?days=30&tz=480 按北京时间分天汇总 (手机端「最近 N 天」卡片同一份数据).
// 需要 AIOA 的 key (scope events:read): 环境变量 AIOA_SERVER (如 https://aioa.woa.qzz.io) + AIOA_KEY.
// 没配或请求失败时不动旧文件; render.ts 有 aioa.json 时用它画提交 / PR / Issue, 否则退回 GitHub GraphQL 的数.
//
// 用法: node --loader ts-node/esm scripts/profile/fetchAioa.ts

import { writeFileSync } from "fs";
import { RECENT_DAYS } from "./config.js";

const OUT = "data/aioa.json";

async function main() {
  const server = (process.env.AIOA_SERVER || "").replace(/\/+$/, "");
  const key = process.env.AIOA_KEY || "";
  if (!server || !key) {
    console.warn("[aioa] 没有 AIOA_SERVER / AIOA_KEY, 跳过");
    return;
  }
  const res = await fetch(`${server}/api/v1/github/daily?days=${RECENT_DAYS}&tz=480`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "User-Agent": "HengXin666-profile" },
  });
  const text = await res.text();
  if (!res.ok || !text.trim().startsWith("{")) throw new Error(`HTTP ${res.status}: ${text.slice(0, 120)}`);
  const d = JSON.parse(text);
  if (!Array.isArray(d.days)) throw new Error("返回里没有 days");
  writeFileSync(OUT, JSON.stringify({ fetchedAt: new Date().toISOString(), ...d }) + "\n");
  console.log(`[aioa] 已写 ${OUT}: ${d.days.length} 天, 连续 ${d.streak} 天`);
}

main().catch((err) => console.error("[aioa] 拉取失败, 保留旧数据:", err.message));
