#!/usr/bin/env python3
"""生成 README 追番卡片 img/cards/anime.svg

样式对齐 HXLoLi 主页"在追的番"区块 (HXLoLi/src/components/home/HomeAnime.tsx + page.module.css, 暗色主题):
  - 区块标题 20px/600 + 右侧 13px 说明, 面板 1px 描边 / 圆角 12 / 内边距 16
  - 一行 6 格计数 (记录 看过 在看 搁置 想看 抛弃): 1px 分隔线, 外圈圆角 10, 数字等宽 20px/600, 第一格主色
  - 6 列封面, 间距 12, 比例 12:17, 圆角 8, 1px 描边; 下方剧名 12px 两行截断, 元信息 11px 等宽 "x / y 话 · 评分"

数据源: HXLoLi-ANiMe 仓库的 data/ANiMeRecord.json 与 data/anime/{id}.jpg
  - 筛出 watch_status == 3 (在看), 按 sort_key 倒序取前 N 部: 先有进度, 再按放送日期 anime_data.date
    (last_update 会被标签回填刷新, 不再用作排序键, 见 sort_key 注释)
  - 封面 base64 内嵌 (GitHub camo 不加载 SVG 内的外链图片)
  - 所有文字不含 emoji / 装饰符号 (U+1F300-1FAFF, U+2600-27BF 等), 剧名里的这类符号会被去掉

用法:
  python py/anime_card.py [--data <HXLoLi-ANiMe/data 目录>] [--out img/cards/anime.svg] [--limit 6]
  数据目录默认取环境变量 ANIME_DATA_DIR, 否则 .anime-data/data (workflow 的检出位置)

只读追番数据, 不修改它; 只依赖标准库, 装了 Pillow 时会把封面缩小以减小 SVG 体积.
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import re
import sys
from datetime import datetime, timezone
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# WatchStatus 枚举 (见 HXLoLi-ANiMe/scripts/crawler/ANiMeType.py)
WANT, WATCHED, WATCHING, ON_HOLD, DROPPED = 1, 2, 3, 4, 5
# 与 HomeAnime.tsx 的 STATUS_ORDER 同序, 前面再加一格"记录"
STATUS_ORDER = [(WATCHED, "看过"), (WATCHING, "在看"), (ON_HOLD, "搁置"), (WANT, "想看"), (DROPPED, "抛弃")]

# ---- 主题令牌 (HXLoLi custom.css 暗色 + Docusaurus 暗色灰阶) ----
BG = "#121212"            # --ifm-background-color (dark)
SURFACE = "#ffffff"       # --hx-surface: rgba(255,255,255,0.025)
SURFACE_OP = 0.025
LINE = "#444950"          # --hx-line = --ifm-color-emphasis-200 (dark)
FAINT = "#ccd0d5"         # --hx-faint = --ifm-color-emphasis-600 (dark)
TEXT = "#e3e3e3"          # --ifm-font-color-base (dark)
PRIMARY = "#ff88ff"       # --ifm-color-primary
PLACEHOLDER_OP = 0.04     # 封面底色 rgba(255,255,255,0.04)
SANS = ("-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, "
        "'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif")
MONO = "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"

# ---- 版式 ----
CARD_W = 840
OUTER = 20                 # 卡片外边距
PANEL_X = OUTER
PANEL_W = CARD_W - 2 * OUTER
PANEL_PAD = 16             # .panel padding
PANEL_R = 12               # .panel border-radius
HEAD_Y = 34                # 区块标题基线
PANEL_Y = 56
INNER_W = PANEL_W - 2 * PANEL_PAD
SECTION_GAP = 16           # .anime gap
STATS_H = 56               # 8 + 20*1.2 + 11*1.4 + 8
STATS_R = 10
COLS = 6
COVER_GAP = 12             # .animeCovers gap
COVER_W = (INNER_W - (COLS - 1) * COVER_GAP) / COLS
COVER_H = round(COVER_W * 17 / 12)   # aspect-ratio: 12 / 17
COVER_R = 8
NAME_SIZE = 12
NAME_LH = 16.8             # 12px * 1.4
META_SIZE = 11
FOOT_H = 18

DECOR_RE = re.compile(
    "["
    "\U0001F000-\U0001FAFF"   # emoji / 符号扩展
    "\u2600-\u27BF"           # 杂项符号与装饰 (含 ☆ ★ ♪)
    "\u2B00-\u2BFF"           # 杂项符号与箭头 (含 ⭐)
    "\uFE0E\uFE0F\u200D"      # 变体选择符 / 零宽连接
    "]"
)

_MIN_DT = datetime.min.replace(tzinfo=timezone.utc)


def parse_last_update(s: str) -> datetime:
    """user_status.last_update 是 ISO 8601, 例 '2026-11-01T17:47:44+08:00'."""
    try:
        dt = datetime.fromisoformat(s.strip())
    except (ValueError, AttributeError):
        return _MIN_DT
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def clean(text: str) -> str:
    """去掉 emoji / 装饰符号, 夹在字之间的换成空格, 再合并空白."""
    text = DECOR_RE.sub(" ", str(text))
    return re.sub(r"\s+", " ", text).strip()


def char_w(c: str) -> float:
    return 1.0 if ord(c) > 0x2E80 else 0.6


def wrap_title(text: str, max_units: float, lines: int = 2) -> list[str]:
    out: list[str] = []
    cur, w = "", 0.0
    for c in text:
        cw = char_w(c)
        if w + cw > max_units:
            out.append(cur)
            cur, w = "", 0.0
            if len(out) == lines:
                last = out[-1]
                while last and sum(map(char_w, last)) + 1 > max_units:
                    last = last[:-1]
                out[-1] = last + "…"
                return out
        cur += c
        w += cw
    if cur:
        out.append(cur)
    return out


def cover_data_uri(img: Path) -> str | None:
    if not img.is_file():
        return None
    raw = img.read_bytes()
    try:  # 可选: 缩小封面 (2x 显示尺寸足够清晰)
        from PIL import Image

        im = Image.open(io.BytesIO(raw)).convert("RGB")
        im.thumbnail((int(COVER_W * 2), COVER_H * 2))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=82, optimize=True)
        if buf.tell() < len(raw):
            raw = buf.getvalue()
    except Exception:
        pass
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode()


def sort_key(r: dict) -> tuple:
    """在看的排序键: (有进度, anime_data.date 放送日期, id), 倒序.

    不用 user_status.last_update: 2026-11-06 的标签回填把 187 部的 last_update 刷成同一天
    (只改了 tags, 进度/状态没动), 它已不代表"最近更新进度". 放送日期只来自番剧本身, 不受标签与爬虫
    时间影响; 在看列表里放送越新的越是正在逐周追的. 同日放送用 id 定序, 保证不同快照结果一致.
    """
    a, u = r.get("anime_data", {}), r.get("user_status", {})
    has_progress = int(u.get("watched_eps") or 0) > 0
    return (has_progress, str(a.get("date") or ""), int(a.get("id") or 0))


def pick_watching(records: list[dict], limit: int) -> list[dict]:
    """在看, 按 sort_key 倒序: 先有进度的, 再按放送日期 (anime_data.date) 从新到旧."""
    watching = [r for r in records if r.get("user_status", {}).get("watch_status") == WATCHING]
    watching.sort(key=sort_key, reverse=True)
    return watching[:limit]


def display_name(a: dict) -> str:
    return clean(a.get("name_cn") or a.get("name") or str(a.get("id")))


def progress(a: dict, u: dict) -> str:
    total = a.get("eps") or a.get("total_episodes")
    watched = int(u.get("watched_eps") or 0)
    s = f"{watched} / {total} 话" if total else f"看到第 {watched} 话"
    score = a.get("score")
    return f"{s} · {score}" if score else s


def render(records: list[dict], data_dir: Path, limit: int) -> str:
    counts: dict[int, int] = {}
    for r in records:
        st = r.get("user_status", {}).get("watch_status")
        counts[st] = counts.get(st, 0) + 1

    shown = pick_watching(records, limit)

    stats_y = PANEL_PAD
    covers_y = stats_y + STATS_H + SECTION_GAP
    name_y = covers_y + COVER_H + 4
    meta_y = name_y + 2 * NAME_LH + 4
    covers_h = (meta_y + 14) - covers_y
    foot_y = covers_y + covers_h + SECTION_GAP
    panel_h = foot_y + FOOT_H + PANEL_PAD
    panel_h = round(panel_h)
    height = PANEL_Y + panel_h + OUTER

    o: list[str] = []
    o.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{CARD_W}" height="{height}" viewBox="0 0 {CARD_W} {height}" role="img" aria-label="在追的番">'
    )
    o.append("<style>")
    o.append(f".h{{font:600 20px {SANS};fill:{TEXT};letter-spacing:-0.2px}}")
    o.append(f".d{{font:400 13px {SANS};fill:{FAINT}}}")
    o.append(f".v{{font:600 20px {MONO};fill:{TEXT}}}")
    o.append(f".vp{{font:600 20px {MONO};fill:{PRIMARY}}}")
    o.append(f".l{{font:400 11px {SANS};fill:{FAINT}}}")
    o.append(f".n{{font:400 {NAME_SIZE}px {SANS};fill:{TEXT}}}")
    o.append(f".m{{font:400 {META_SIZE}px {MONO};fill:{FAINT}}}")
    o.append(f".a{{font:400 13px {SANS};fill:{PRIMARY}}}")
    o.append("</style>")
    o.append("<defs>")
    o.append(f'<clipPath id="st"><rect width="{INNER_W}" height="{STATS_H}" rx="{STATS_R}"/></clipPath>')
    o.append(f'<clipPath id="cv"><rect width="{COVER_W:.2f}" height="{COVER_H}" rx="{COVER_R}"/></clipPath>')
    o.append("</defs>")

    # 背景 (页面底色) + 区块标题
    o.append(f'<rect width="{CARD_W}" height="{height}" rx="{PANEL_R}" fill="{BG}"/>')
    o.append(f'<text class="h" x="{OUTER}" y="{HEAD_Y}">在追的番</text>')
    o.append(
        f'<text class="d" x="{CARD_W - OUTER}" y="{HEAD_Y}" text-anchor="end">'
        f"BanGuMi 追番记录, 封面是在看里放送最新的几部</text>"
    )

    # 面板
    o.append(f'<g transform="translate({PANEL_X},{PANEL_Y})">')
    o.append(
        f'<rect x="0.5" y="0.5" width="{PANEL_W - 1}" height="{panel_h - 1}" rx="{PANEL_R}" '
        f'fill="{SURFACE}" fill-opacity="{SURFACE_OP}" stroke="{LINE}"/>'
    )

    # 计数行
    cells = [("记录", len(records))] + [(label, counts.get(st, 0)) for st, label in STATUS_ORDER]
    cell_w = INNER_W / len(cells)
    o.append(f'<g transform="translate({PANEL_PAD},{stats_y})">')
    o.append(f'<g clip-path="url(#st)"><rect width="{INNER_W}" height="{STATS_H}" fill="{BG}"/>')
    for i in range(1, len(cells)):
        o.append(f'<rect x="{i * cell_w - 0.5:.2f}" width="1" height="{STATS_H}" fill="{LINE}"/>')
    o.append("</g>")
    o.append(
        f'<rect x="0.5" y="0.5" width="{INNER_W - 1}" height="{STATS_H - 1}" rx="{STATS_R}" '
        f'fill="none" stroke="{LINE}"/>'
    )
    for i, (label, n) in enumerate(cells):
        cx = i * cell_w + 12
        o.append(f'<text class="{"vp" if i == 0 else "v"}" x="{cx:.2f}" y="30">{n}</text>')
        o.append(f'<text class="l" x="{cx:.2f}" y="46">{label}</text>')
    o.append("</g>")

    # 封面
    for i, r in enumerate(shown):
        a, u = r["anime_data"], r["user_status"]
        x = PANEL_PAD + i * (COVER_W + COVER_GAP)
        name = display_name(a)
        meta = progress(a, u)
        uri = cover_data_uri(data_dir / "anime" / f"{a.get('id')}.jpg")
        o.append(f'<g transform="translate({x:.2f},{covers_y})">')
        o.append(f"<title>{escape(name)} ({escape(meta)})</title>")
        o.append(
            f'<rect width="{COVER_W:.2f}" height="{COVER_H}" rx="{COVER_R}" '
            f'fill="#ffffff" fill-opacity="{PLACEHOLDER_OP}"/>'
        )
        if uri:
            o.append(
                f'<image clip-path="url(#cv)" width="{COVER_W:.2f}" height="{COVER_H}" '
                f'preserveAspectRatio="xMidYMid slice" href="{uri}" xlink:href="{uri}"/>'
            )
        o.append(
            f'<rect x="0.5" y="0.5" width="{COVER_W - 1:.2f}" height="{COVER_H - 1}" rx="{COVER_R}" '
            f'fill="none" stroke="{LINE}"/>'
        )
        for j, line in enumerate(wrap_title(name, COVER_W / NAME_SIZE)):
            o.append(f'<text class="n" x="0" y="{name_y - covers_y + 12 + j * NAME_LH:.1f}">{escape(line)}</text>')
        o.append(f'<text class="m" x="0" y="{meta_y - covers_y + 11:.1f}">{escape(meta)}</text>')
        o.append("</g>")

    # 页脚
    o.append(f'<text class="l" x="{PANEL_PAD}" y="{foot_y + 13}">From HXLoLi-ANiMe</text>')
    o.append(f'<text class="a" x="{PANEL_W - PANEL_PAD}" y="{foot_y + 13}" text-anchor="end">全部追番</text>')
    o.append("</g>")
    o.append("</svg>")
    return "\n".join(o)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=os.environ.get("ANIME_DATA_DIR") or str(ROOT / ".anime-data" / "data"))
    ap.add_argument("--out", default=str(ROOT / "img" / "cards" / "anime.svg"))
    ap.add_argument("--limit", type=int, default=6)
    args = ap.parse_args()

    data_dir = Path(args.data)
    rec_path = data_dir / "ANiMeRecord.json"
    if not rec_path.is_file():
        print(f"[anime_card] 找不到 {rec_path}, 跳过生成", file=sys.stderr)
        return 1
    with rec_path.open(encoding="utf-8") as f:
        records = json.load(f)

    svg = render(records, data_dir, args.limit)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(svg, encoding="utf-8")
    for r in pick_watching(records, args.limit):
        print(f"  {r['anime_data'].get('date')}  {display_name(r['anime_data'])}")
    print(f"[anime_card] 已生成 {out} ({out.stat().st_size // 1024} KiB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
