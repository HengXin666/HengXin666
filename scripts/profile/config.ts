// 主页卡片的共用配置: 账号, 时区, 链接目标. 改链接只改这里.

export const LOGIN = "HengXin666";
export const TZ = "Asia/Shanghai";
/** 聚合折线图与磁贴里"近 N 天"的 N */
export const RECENT_DAYS = 30;

export const BLOG = "https://km.woa.qzz.io";

const q = (s: string) => encodeURIComponent(s);
const search = (query: string, type: string) =>
  `https://github.com/search?q=${q(query)}&type=${type}&s=created&o=desc`;

/** 每个可点元素点进去的地方 */
export const LINKS = {
  profile: `https://github.com/${LOGIN}`,
  blog: BLOG,
  blogAll: `${BLOG}/blog`,
  docsAll: `${BLOG}/docs/关于`,
  anime: `${BLOG}/anime`,
  animeDetails: (id: number) => `${BLOG}/anime/details?id=${id}`,
  commits: `https://github.com/search?q=${q(`author:${LOGIN}`)}&type=commits&s=author-date&o=desc`,
  prs: search(`author:${LOGIN} is:pr`, "pullrequests"),
  issues: search(`author:${LOGIN} is:issue`, "issues"),
  stars: `https://github.com/${LOGIN}?tab=repositories&sort=stargazers`,
  wakatime: `https://github.com/${LOGIN}/${LOGIN}/blob/main/data/history.json`,
  language: (name: string) => `https://github.com/${LOGIN}?tab=repositories&language=${q(name.toLowerCase())}`,
  bilibili: "https://space.bilibili.com/478917126",
  leetcode: "https://leetcode.cn/u/heng_xin/",
  modernCpp: "https://learn.microsoft.com/zh-cn/cpp/cpp/welcome-back-to-cpp-modern-cpp",
  hxloli: "https://github.com/HengXin666/HXLoLi",
};

/** 头图的轮播歌词 (原 readme-typing-svg 的那几句) */
export const HERO_LINES = [
  "背伸びして見える世界",
  "あなたのため?",
  "自分のため?",
  "まだ分からない  感情の裏側",
  "壊したい  壊してしまいたい",
  "戻れないのなら",
  "尚更強く抱きしめていたい",
  "離れない優しさを消し去っても",
  "悲しいくらい  溢れ出る思い",
];

/** 技能图标: skillicons.dev 的 id -> 点进去的官网 (图标在 img/skills/<id>.svg, 一次性下载入库) */
export const SKILLS: [string, string][] = [
  ["cpp", "https://isocpp.org/"],
  ["c", "https://en.cppreference.com/w/c"],
  ["cmake", "https://cmake.org/"],
  ["qt", "https://www.qt.io/"],
  ["linux", "https://kernel.org/"],
  ["arch", "https://archlinux.org/"],
  ["docker", "https://www.docker.com/"],
  ["git", "https://git-scm.com/"],
  ["py", "https://www.python.org/"],
  ["ts", "https://www.typescriptlang.org/"],
  ["react", "https://react.dev/"],
  ["vue", "https://vuejs.org/"],
  ["java", "https://dev.java/"],
  ["spring", "https://spring.io/"],
  ["redis", "https://redis.io/"],
  ["mysql", "https://www.mysql.com/"],
  ["sqlite", "https://www.sqlite.org/"],
  ["mongodb", "https://www.mongodb.com/"],
  ["cf", "https://www.cloudflare.com/"],
];
