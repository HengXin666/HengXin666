import {writeFileSync} from "fs";
import fetch from "node-fetch";
import {parseStringPromise} from "xml2js";

const RSS_URL = "https://hengxin666.github.io/HXLoLi/blog/rss.xml";
const README_PATH = "README.md";

async function main() {
  const res = await fetch(RSS_URL);
  const xml = await res.text();
  const parsed = await parseStringPromise(xml);
  const items = parsed.rss.channel[0].item.slice(0, 5); // 最新5条

  const beijingTime = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());

  const blogList = items.map((item: any) => {
    const title = item.title[0];
    const link = item.link[0];
    const date = new Date(item.pubDate?.[0] ?? "").toISOString().split("T")[0];
    return `- [${title}](${link}) <sub><i>${date}</i></sub>`;
  }).join("\n");

  const readme = `<!-- https://github.com/kyechan99/capsule-render -->
<div id="title" align=center>

<!-- 头像 -->
<img width="200" src="./img/misaka03.jpg" />

<!-- 动态打字效果 -->
[![Typing SVG](https://readme-typing-svg.demolab.com?font=Rampart+One+&duration=3200&pause=2000&color=FD4AFF&center=true&vCenter=true&width=435&lines=%E8%83%8C%E4%BC%B8%E3%81%B3%E3%81%97%E3%81%A6%E8%A6%8B%E3%81%88%E3%82%8B%E4%B8%96%E7%95%8C;%E3%81%82%E3%81%AA%E3%81%9F%E3%81%AE%E3%81%9F%E3%82%81%3F;%E8%87%AA%E5%88%86%E3%81%AE%E3%81%9F%E3%82%81%3F;%E3%81%BE%E3%81%A0%E5%88%86%E3%81%8B%E3%82%89%E3%81%AA%E3%81%84+++%E6%84%9F%E6%83%85%E3%81%AE%E8%A3%8F%E5%81%B4;%E5%A3%8A%E3%81%97%E3%81%9F%E3%81%84+++%E5%A3%8A%E3%81%97%E3%81%A6%E3%81%97%E3%81%BE%E3%81%84%E3%81%9F%E3%81%84;%E6%88%BB%E3%82%8C%E3%81%AA%E3%81%84%E3%81%AE%E3%81%AA%E3%82%89;%E5%B0%9A%E6%9B%B4%E5%BC%B7%E3%81%8F%E6%8A%B1%E3%81%8D%E3%81%97%E3%82%81%E3%81%A6%E3%81%84%E3%81%9F%E3%81%84;%E9%9B%A2%E3%82%8C%E3%81%AA%E3%81%84%E5%84%AA%E3%81%97%E3%81%95%E3%82%92%E6%B6%88%E3%81%97%E5%8E%BB%E3%81%A3%E3%81%A6%E3%82%82;%E6%82%B2%E3%81%97%E3%81%84%E3%81%8F%E3%82%89%E3%81%84+%E6%BA%A2%E3%82%8C%E5%87%BA%E3%82%8B%E6%80%9D%E3%81%84)](https://git.io/typing-svg)

<img align="center" width="400" src="https://github-readme-stats-flame-pi-70.vercel.app/api?username=HengXin666&show_icons=true&theme=transparent&locale=ja&title_color=990099&hide_border=true&icon_color=F7CE45&text_color=D17277" title="GitHub Stats">
<img align="center" width="400" src="https://github-readme-streak-stats-two-coral-24.vercel.app?user=HengXin666&theme=radical&hide_border=true&border_radius=10&locale=ja&short_numbers=false%C2%A0%C2%A0%E6%97%A0%E6%95%88&date_format=%5BY.%5Dn.j" title="GitHub Streak">

![Activity Graph](https://github-readme-activity-graph.vercel.app/graph?username=HengXin666&show_icons=true&theme=github-compact&locale=ja&title_color=990099&icon_color=F7CE45&text_color=D17277&hide_border=true)


![WakaTime Stats](https://github-readme-stats-flame-pi-70.vercel.app/api/wakatime?username=Heng_Xin&theme=transparent&hide_border=true&layout=compact&langs_count=114514&locale=ja&title_color=990099&text_color=D17277)![Top Langs](https://github-readme-stats-flame-pi-70.vercel.app/api/top-langs/?username=HengXin666&theme=transparent&hide_border=true&layout=donut-vertical&langs_count=114514&locale=ja&title_color=990099&text_color=D17277)

![Skills](https://skillicons.dev/icons?i=git,github,c,cpp,cmake,qt,linux,arch,docker,py,java,spring,mysql,redis,mongodb,html,css,js,ts,vue,cf,windows,md&theme=light)

[![Modern C++](https://img.shields.io/badge/Code-Modern%20C++-blue)](https://learn.microsoft.com/zh-cn/cpp/cpp/welcome-back-to-cpp-modern-cpp)

[![GitHub](https://img.shields.io/badge/GitHub-HengXin666-blue?logo=github)](https://github.com/HengXin666)
[![Bilibili](https://img.shields.io/badge/哔哩哔哩-Heng__Xin-pink?logo=bilibili)](https://space.bilibili.com/478917126)
![QQ](https://img.shields.io/badge/QQ-282000500-green?logo=tencentqq)
[![LeetCode](https://img.shields.io/badge/LeetCode-Heng__Xin-rgb(99,00,99)?logo=leetcode)](https://leetcode.cn/u/heng_xin/)
![Profile Views](https://komarev.com/ghpvc/?username=HengXin666&abbreviated=true&color=yellow)
![WakaTime Badge](https://wakatime.com/badge/user/2eabe28a-bba2-4d68-932a-4ea435bd8dc3.svg)

<!-- https://github.com/kyechan99/capsule-render -->
</div>

<!-- 仓库 -->

## 📚 最新 [博客](https://hengxin666.github.io/HXLoLi/) 文章 (每日00:00更新)

${blogList}

> 更新时间: ${beijingTime} (北京时间) | From [HXLoLi](https://github.com/HengXin666/HXLoLi)
`;

  writeFileSync(README_PATH, readme);
  console.log("README.md 已更新");
}

main().catch(err => {
  console.error("更新失败:", err);
  process.exit(1);
});
