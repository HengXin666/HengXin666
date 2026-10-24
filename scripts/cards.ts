// 卡片来源配置: 输出文件名 -> 候选上游 URL (按顺序回退)
// 拉取后写入 img/cards/<name>.svg, README 用相对路径引用, GitHub 同源直出,
// 不再经过 camo / 第三方域名, 也就不会因为代理或上游抖动而加载失败。

export type CardSource = {
  /** 输出文件名 (img/cards/<name>.svg) */
  name: string;
  /** 候选 URL 列表, 依次尝试 */
  urls: string[];
  /** 该卡片是否要求"必须成功" (失败则整体报错); 默认 false, 失败时保留旧文件 */
  required?: boolean;
};

const STATS_BASE = "https://github-readme-stats-flame-pi-70.vercel.app";
const STREAK_BASE = "https://github-readme-streak-stats-two-coral-24.vercel.app";

// 活动图: 原 github-readme-activity-graph.vercel.app 已返回 402 DEPLOYMENT_DISABLED
const ACTIVITY_HOSTS = [
  "https://github-readme-activity-graph-indol.vercel.app",
  "https://github-readme-activity-graph-delta.vercel.app",
  "https://readme-activity-graph.vercel.app",
];

const activityUrls = ACTIVITY_HOSTS.map(
  (host) =>
    `${host}/graph?username=HengXin666&show_icons=true&theme=github-compact&locale=ja&title_color=990099&icon_color=F7CE45&text_color=D17277&hide_border=true`,
);

export const CARDS: CardSource[] = [
  {
    name: "typing",
    required: true,
    urls: [
      "https://readme-typing-svg.demolab.com?font=Rampart+One+&duration=3200&pause=2000&color=FD4AFF&center=true&vCenter=true&width=435&lines=%E8%83%8C%E4%BC%B8%E3%81%B3%E3%81%97%E3%81%A6%E8%A6%8B%E3%81%88%E3%82%8B%E4%B8%96%E7%95%8C;%E3%81%82%E3%81%AA%E3%81%9F%E3%81%AE%E3%81%9F%E3%82%81%3F;%E8%87%AA%E5%88%86%E3%81%AE%E3%81%9F%E3%82%81%3F;%E3%81%BE%E3%81%A0%E5%88%86%E3%81%8B%E3%82%89%E3%81%AA%E3%81%84+++%E6%84%9F%E6%83%85%E3%81%AE%E8%A3%8F%E5%81%B4;%E5%A3%8A%E3%81%97%E3%81%9F%E3%81%84+++%E5%A3%8A%E3%81%97%E3%81%A6%E3%81%97%E3%81%BE%E3%81%84%E3%81%9F%E3%81%84;%E6%88%BB%E3%82%8C%E3%81%AA%E3%81%84%E3%81%AE%E3%81%AA%E3%82%89;%E5%B0%9A%E6%9B%B4%E5%BC%B7%E3%81%8F%E6%8A%B1%E3%81%8D%E3%81%97%E3%82%81%E3%81%A6%E3%81%84%E3%81%9F%E3%81%84;%E9%9B%A2%E3%82%8C%E3%81%AA%E3%81%84%E5%84%AA%E3%81%97%E3%81%95%E3%82%92%E6%B6%88%E3%81%97%E5%8E%BB%E3%81%A3%E3%81%A6%E3%82%82;%E6%82%B2%E3%81%97%E3%81%84%E3%81%8F%E3%82%89%E3%81%84+%E6%BA%A2%E3%82%8C%E5%87%BA%E3%82%8B%E6%80%9D%E3%81%84",
    ],
  },
  {
    name: "stats",
    urls: [
      `${STATS_BASE}/api?username=HengXin666&show_icons=true&theme=transparent&locale=ja&title_color=990099&hide_border=true&icon_color=F7CE45&text_color=D17277`,
    ],
  },
  {
    name: "streak",
    urls: [
      `${STREAK_BASE}?user=HengXin666&theme=radical&hide_border=true&border_radius=10&locale=ja&short_numbers=false&date_format=%5BY.%5Dn.j`,
    ],
  },
  {
    name: "activity",
    urls: activityUrls,
  },
  {
    name: "wakatime",
    urls: [
      `${STATS_BASE}/api/wakatime?username=Heng_Xin&theme=transparent&hide_border=true&layout=compact&langs_count=10&locale=ja&title_color=990099&text_color=D17277`,
    ],
  },
  {
    name: "top-langs",
    urls: [
      `${STATS_BASE}/api/top-langs/?username=HengXin666&theme=transparent&hide_border=true&layout=donut-vertical&langs_count=10&locale=ja&title_color=990099&text_color=D17277`,
    ],
  },
  {
    name: "skills",
    urls: [
      "https://skillicons.dev/icons?i=git,github,c,cpp,cmake,qt,linux,arch,docker,py,java,spring,sqlite,mysql,redis,mongodb,html,css,js,ts,react,vue,cf,windows,md&theme=light",
    ],
  },
  {
    name: "badge-modern-cpp",
    urls: ["https://img.shields.io/badge/Code-Modern%20C%2B%2B-blue"],
  },
  {
    name: "badge-github",
    urls: ["https://img.shields.io/badge/GitHub-HengXin666-blue?logo=github"],
  },
  {
    name: "badge-bilibili",
    urls: ["https://img.shields.io/badge/%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9-Heng__Xin-pink?logo=bilibili"],
  },
  {
    name: "badge-qq",
    urls: ["https://img.shields.io/badge/QQ-282000500-green?logo=tencentqq"],
  },
  {
    name: "badge-leetcode",
    urls: ["https://img.shields.io/badge/LeetCode-Heng__Xin-rgb(99%2C00%2C99)?logo=leetcode"],
  },
  {
    name: "badge-wakatime",
    urls: ["https://wakatime.com/badge/user/2eabe28a-bba2-4d68-932a-4ea435bd8dc3.svg"],
  },
];

/** 访客计数必须实时, 无法自托管; 原 komarev.com 已不可用 */
export const VIEW_COUNTER_URL = "https://hits.sh/github.com/HengXin666.svg";
