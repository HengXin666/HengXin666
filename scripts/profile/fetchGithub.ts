// 拉 GitHub 统计并落地到 data/github.json, 卡片渲染 (render.ts) 只读这份文件.
//
// 为什么自己拉而不用 github-readme-stats: 上游卡片又高又大, 整张图只能一个链接, 也画不出"按天聚合"的折线.
// 这里只取渲染需要的数: 年度贡献 / 提交 / PR / Issue, 近 30 天每天的提交 / PR / Issue / 评审, 仓库 Star 与语言.
//
// 令牌: 环境变量 GH_STATS_TOKEN (有则能把私有仓库贡献也算进来), 否则 GITHUB_TOKEN (Actions 自带, 只算公开).
// 失败时不覆盖旧文件, 退出码 0: README 继续用上次的数据.
//
// 用法: node --loader ts-node/esm scripts/profile/fetchGithub.ts

import { existsSync, mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { LOGIN, RECENT_DAYS, TZ } from "./config.js";

const OUT = "data/github.json";
const API = "https://api.github.com/graphql";

const MAIN_QUERY = `
query($login: String!, $yearFrom: DateTime!, $recentFrom: DateTime!, $to: DateTime!) {
  user(login: $login) {
    login
    name
    followers { totalCount }
    repositories(ownerAffiliations: OWNER, isFork: false, first: 100, orderBy: { field: STARGAZERS, direction: DESC }) {
      totalCount
      nodes {
        name
        stargazerCount
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges { size node { name color } }
        }
      }
    }
    year: contributionsCollection(from: $yearFrom, to: $to) {
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
    recent: contributionsCollection(from: $recentFrom, to: $to) {
      commitContributionsByRepository(maxRepositories: 100) {
        contributions(first: 100) { nodes { occurredAt commitCount } }
      }
    }
  }
}`;

// PR / Issue / 评审 一个月能超过 100 条, 单独分页
const PAGED_QUERY = (field: string) => `
query($login: String!, $recentFrom: DateTime!, $to: DateTime!, $after: String) {
  user(login: $login) {
    recent: contributionsCollection(from: $recentFrom, to: $to) {
      list: ${field}(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes { occurredAt }
      }
    }
  }
}`;

async function gql<T>(token: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json", "User-Agent": "HengXin666-profile" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join("; "));
  return body.data as T;
}

/** UTC 时间 -> 北京时间的日期 YYYY-MM-DD */
const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));

async function paged(token: string, field: string, vars: Record<string, unknown>): Promise<string[]> {
  const out: string[] = [];
  let after: string | null = null;
  for (let page = 0; page < 20; page++) {
    const d: any = await gql(token, PAGED_QUERY(field), { ...vars, after });
    const list = d.user.recent.list;
    for (const n of list.nodes) out.push(n.occurredAt);
    if (!list.pageInfo.hasNextPage) break;
    after = list.pageInfo.endCursor;
  }
  return out;
}

function streaks(days: { date: string; count: number }[]): { current: number; longest: number } {
  let longest = 0;
  let run = 0;
  for (const d of days) {
    run = d.count > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  // 当前连续: 今天还没提交不算断, 从昨天往前数
  let current = 0;
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--;
  for (; i >= 0 && days[i].count > 0; i--) current++;
  return { current, longest };
}

async function main() {
  const token = process.env.GH_STATS_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    console.warn("[github] 没有 GH_STATS_TOKEN / GITHUB_TOKEN, 跳过");
    return;
  }
  const now = new Date();
  const to = now.toISOString();
  const yearFrom = new Date(now.getTime() - 365 * 86_400_000).toISOString();
  const recentFrom = new Date(now.getTime() - (RECENT_DAYS + 1) * 86_400_000).toISOString();
  const vars = { login: LOGIN, recentFrom, to };

  const [main, prs, issues, reviews] = await Promise.all([
    gql<any>(token, MAIN_QUERY, { ...vars, yearFrom }),
    paged(token, "pullRequestContributions", vars),
    paged(token, "issueContributions", vars),
    paged(token, "pullRequestReviewContributions", vars),
  ]);
  const u = main.user;

  // 近 RECENT_DAYS 天, 北京时间按天对齐
  const dates: string[] = [];
  for (let i = RECENT_DAYS - 1; i >= 0; i--) dates.push(dayOf(new Date(now.getTime() - i * 86_400_000).toISOString()));
  const blank = () => ({ commits: 0, prs: 0, issues: 0, reviews: 0 });
  const byDay = new Map(dates.map((d) => [d, blank()]));
  for (const repo of u.recent.commitContributionsByRepository) {
    for (const n of repo.contributions.nodes) {
      const slot = byDay.get(dayOf(n.occurredAt));
      if (slot) slot.commits += n.commitCount;
    }
  }
  const bump = (list: string[], key: "prs" | "issues" | "reviews") => {
    for (const at of list) {
      const slot = byDay.get(dayOf(at));
      if (slot) slot[key]++;
    }
  };
  bump(prs, "prs");
  bump(issues, "issues");
  bump(reviews, "reviews");

  const calendar = u.year.contributionCalendar.weeks
    .flatMap((w: any) => w.contributionDays)
    .map((d: any) => ({ date: d.date, count: d.contributionCount }));

  // 语言按字节汇总 (只算自己的非 fork 仓库)
  const langs = new Map<string, { name: string; color: string; size: number }>();
  for (const r of u.repositories.nodes) {
    for (const e of r.languages.edges) {
      const cur = langs.get(e.node.name) ?? { name: e.node.name, color: e.node.color ?? "#8b949e", size: 0 };
      cur.size += e.size;
      langs.set(e.node.name, cur);
    }
  }

  const data = {
    generatedAt: now.toISOString(),
    login: u.login,
    name: u.name,
    followers: u.followers.totalCount,
    repos: u.repositories.totalCount,
    stars: u.repositories.nodes.reduce((s: number, r: any) => s + r.stargazerCount, 0),
    year: {
      total: u.year.contributionCalendar.totalContributions,
      commits: u.year.totalCommitContributions,
      prs: u.year.totalPullRequestContributions,
      issues: u.year.totalIssueContributions,
      reviews: u.year.totalPullRequestReviewContributions,
      private: u.year.restrictedContributionsCount,
    },
    streak: streaks(calendar),
    calendar,
    recent: dates.map((date) => ({ date, ...byDay.get(date)! })),
    languages: [...langs.values()].sort((a, b) => b.size - a.size).slice(0, 12),
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(data) + "\n");
  console.log(`[github] 已写 ${OUT}: 年度贡献 ${data.year.total}, 近 ${RECENT_DAYS} 天提交 ${data.recent.reduce((s, d) => s + d.commits, 0)}`);
}

main().catch((err) => {
  console.error("[github] 拉取失败, 保留旧数据:", err.message);
  if (!existsSync(OUT)) process.exitCode = 0;
});
