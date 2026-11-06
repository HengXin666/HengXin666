#!/usr/bin/env python3
"""生成 README 追番卡片 img/cards/anime.svg

数据源: HXLoLi-ANiMe 仓库的 data/ANiMeRecord.json 与 data/anime/{id}.jpg
  - 筛出 watch_status == 3 (在看), 按 last_update 倒序取前 N 部
  - 封面 base64 内嵌 (GitHub camo 不加载 SVG 内的外链图片)
  - 页脚统计 想看/看过/在看/搁置/抛弃 (实时计算)

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
import sys
from datetime import datetime
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# WatchStatus 枚举 (见 HXLoLi-ANiMe/scripts/crawler/ANiMeType.py)
STATUS_NAMES = {1: "想看", 2: "看过", 3: "在看", 4: "搁置", 5: "抛弃"}
WATCHING = 3

# 版式
COLS = 6
CARD_W = 840
PAD_X = 24
COVER_W = 116
COVER_H = 164
GAP = (CARD_W - 2 * PAD_X - COLS * COVER_W) / (COLS - 1)
TOP = 64
TITLE_COLOR = "#990099"
TEXT_COLOR = "#D17277"
ACCENT = "#F7CE45"
FONT = "'Segoe UI', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"


def parse_last_update(s: str) -> datetime:
    # 例: 'Tue 2026-04-21 1:34 PM CST (UTC+08:00)'
    try:
        parts = s.split()
        return datetime.strptime(" ".join(parts[1:4]), "%Y-%m-%d %I:%M %p")
    except Exception:
        return datetime.min


def char_w(c: str) -> float:
    return 1.0 if ord(c) > 0x2E80 else 0.64


def wrap_title(text: str, max_units: float, lines: int = 2) -> list[str]:
    out: list[str] = []
    cur, w = "", 0.0
    for i, c in enumerate(text):
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
        im.thumbnail((COVER_W * 2, COVER_H * 2))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=82, optimize=True)
        if buf.tell() < len(raw):
            raw = buf.getvalue()
    except Exception:
        pass
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode()


def render(records: list[dict], data_dir: Path, limit: int) -> str:
    counts = {k: 0 for k in STATUS_NAMES}
    for r in records:
        st = r.get("user_status", {}).get("watch_status")
        if st in counts:
            counts[st] += 1

    watching = [r for r in records if r.get("user_status", {}).get("watch_status") == WATCHING]
    watching.sort(key=lambda r: parse_last_update(r["user_status"].get("last_update", "")), reverse=True)
    shown = watching[:limit]

    rows = max(1, (len(shown) + COLS - 1) // COLS)
    item_h = COVER_H + 70
    height = TOP + rows * item_h + 44

    o: list[str] = []
    o.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
        f'width="{CARD_W}" height="{height}" viewBox="0 0 {CARD_W} {height}" role="img" aria-label="追番中">'
    )
    o.append("<style>")
    o.append(f".t{{font:700 20px {FONT};fill:{TITLE_COLOR}}}")
    o.append(f".s{{font:400 12px {FONT};fill:{TEXT_COLOR}}}")
    o.append(f".n{{font:600 12.5px {FONT};fill:{TEXT_COLOR}}}")
    o.append(f".f{{font:400 12.5px {FONT};fill:{TEXT_COLOR}}}")
    o.append(f".fb{{font:700 12.5px {FONT};fill:{TITLE_COLOR}}}")
    o.append("</style>")
    o.append("<defs>")
    for i in range(len(shown)):
        o.append(f'<clipPath id="c{i}"><rect width="{COVER_W}" height="{COVER_H}" rx="8"/></clipPath>')
    o.append("</defs>")
    o.append(f'<text class="t" x="{PAD_X}" y="38">📺 追番中 · 在看 {counts[WATCHING]} 部</text>')
    o.append(f'<text class="s" x="{CARD_W - PAD_X}" y="38" text-anchor="end">最近更新的 {len(shown)} 部</text>')

    for i, r in enumerate(shown):
        a, u = r["anime_data"], r["user_status"]
        col, row = i % COLS, i // COLS
        x = PAD_X + col * (COVER_W + GAP)
        y = TOP + row * item_h
        name = a.get("name_cn") or a.get("name") or str(a.get("id"))
        watched = int(u.get("watched_eps") or 0)
        total = int(a.get("total_episodes") or a.get("eps") or 0)
        ratio = min(1.0, watched / total) if total else 0.0
        uri = cover_data_uri(data_dir / "anime" / f"{a.get('id')}.jpg")

        o.append(f'<g transform="translate({x:.1f},{y})">')
        o.append(f"<title>{escape(name)} ({watched}/{total or '?'})</title>")
        o.append(f'<rect width="{COVER_W}" height="{COVER_H}" rx="8" fill="#f4e4f0"/>')
        if uri:
            o.append(
                f'<image clip-path="url(#c{i})" width="{COVER_W}" height="{COVER_H}" '
                f'preserveAspectRatio="xMidYMid slice" href="{uri}" xlink:href="{uri}"/>'
            )
        score = a.get("score")
        if score:
            o.append(f'<rect x="{COVER_W - 40}" y="6" width="34" height="18" rx="9" fill="#000" fill-opacity="0.55"/>')
            o.append(
                f'<text x="{COVER_W - 23}" y="19" text-anchor="middle" '
                f'style="font:700 11px {FONT};fill:{ACCENT}">{score}</text>'
            )
        ty = COVER_H + 18
        for j, line in enumerate(wrap_title(name, COVER_W / 12.5)):
            o.append(f'<text class="n" x="0" y="{ty + j * 16}">{escape(line)}</text>')
        by = COVER_H + 52
        o.append(f'<rect y="{by}" width="{COVER_W}" height="6" rx="3" fill="{TEXT_COLOR}" fill-opacity="0.2"/>')
        if ratio > 0:
            o.append(f'<rect y="{by}" width="{max(6, COVER_W * ratio):.1f}" height="6" rx="3" fill="{TITLE_COLOR}"/>')
        o.append(f'<text class="s" x="{COVER_W}" y="{by + 18}" text-anchor="end">{watched} / {total or "?"} 话</text>')
        o.append("</g>")

    fy = height - 14
    parts = []
    for k in (3, 2, 1, 4, 5):
        parts.append(f'<tspan class="f">{STATUS_NAMES[k]} </tspan><tspan class="fb">{counts[k]}</tspan>')
    o.append(f'<text x="{PAD_X}" y="{fy}">' + '<tspan class="f">  ·  </tspan>'.join(parts) + "</text>")
    o.append(
        f'<text class="s" x="{CARD_W - PAD_X}" y="{fy}" text-anchor="end">From HXLoLi-ANiMe · 共 {len(records)} 部</text>'
    )
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
    print(f"[anime_card] 已生成 {out} ({out.stat().st_size // 1024} KiB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
