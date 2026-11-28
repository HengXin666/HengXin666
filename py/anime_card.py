#!/usr/bin/env python3
"""生成 README「最近在看」: 每部番一张独立封面卡 img/cards/anime/<n>.svg + 清单 index.json

README 里每张封面各自用 <a> 包住, 点哪部进哪部的详情页 (GitHub 用 <img> 引 SVG 会剥掉内部链接,
一张大图只能一个链接, 所以一部一张). 清单由 scripts/profile/render.ts 读取并拼进 README.

选取规则与博客首页 HomeAnime 相同 (HXLoLi/src/utils/anime/recent.ts):
  - 候选 = 在看 / 看过 / 搁置; 想看没有进度, 抛弃不展示
  - 按 user_status.last_update 倒序取前 N. 爬虫只在观看状态或已看集数变化时推进 last_update,
    所以它就是最近一次真的看了 / 改了进度的时间; 看完的老番也会出现, 很久没动的在看会自然沉下去
  - 每部标阶段 (在看 / 看完 / 搁置) 和进度条; 在看且已放送集数多于已看时标出"更新到第 N 话"

视觉与 scripts/profile/theme.ts 一致: 明暗两套 CSS 变量跟随系统, CSS 动画, 不用任何文字符号当图标.

数据源: HXLoLi-ANiMe 的 data/ANiMeIndex.json (轻量索引, 含剧集放送日期; 没有时退回 ANiMeRecord.json)
与 data/anime/{id}.jpg. 封面 base64 内嵌 (<img> 里的 SVG 不加载外链图片), 装了 Pillow 时先缩小.

用法:
  python py/anime_card.py [--data <HXLoLi-ANiMe/data 目录>] [--out img/cards/anime] [--limit 6]
  数据目录默认取环境变量 ANIME_DATA_DIR, 否则 .anime-data/data (workflow 的检出位置)
"""
from __future__ import annotations

import argparse
import base64
import io
import json
import os
import re
import sys
from datetime import date, datetime, timezone
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# WatchStatus 枚举 (HXLoLi-ANiMe/scripts/crawler/ANiMeType.py)
WANT, WATCHED, WATCHING, ON_HOLD, DROPPED = 1, 2, 3, 4, 5
PHASE = {WATCHING: ("watching", "在看", "var(--pk)"), WATCHED: ("finished", "看完", "var(--gr)"), ON_HOLD: ("paused", "搁置", "var(--faint)")}
COUNT_ORDER = [(WATCHED, "看过"), (WATCHING, "在看"), (ON_HOLD, "搁置"), (WANT, "想看")]

# ---- 与 scripts/profile/theme.ts 相同的令牌 ----
SANS = ("-apple-system,BlinkMacSystemFont,'Segoe UI','Noto Sans',Helvetica,Arial,'PingFang SC',"
        "'Hiragino Sans','Microsoft YaHei','Noto Sans CJK SC',sans-serif")
MONO = "ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,'Liberation Mono',monospace"
VARS_LIGHT = ("--fg:#1f2328;--mute:#59636e;--faint:#818b98;--line:#d1d9e0;--card:#f6f8fa;"
              "--pk:#c026d3;--gr:#1a7f37")
VARS_DARK = ("--fg:#e6edf3;--mute:#9198a1;--faint:#6e7681;--line:#30363d;--card:#161b22;"
             "--pk:#ff88ff;--gr:#3fb950")

# ---- 版式: 一行 6 张, 总宽 792 (与 theme.ts 的 W 一致) ----
CARD_W = 132
PAD = 4                      # 卡片四周留白, 相邻两张之间就是 8px
COVER_W = CARD_W - 2 * PAD
COVER_H = round(COVER_W * 17 / 12)
NAME_SIZE = 12
NAME_LH = 16
CARD_H = PAD + COVER_H + 8 + 2 * NAME_LH + 18 + 14

DECOR_RE = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0E\uFE0F\u200D]")


def clean(text: str) -> str:
    """去掉 emoji / 装饰符号, 再合并空白."""
    return re.sub(r"\s+", " ", DECOR_RE.sub(" ", str(text))).strip()


def char_w(c: str) -> float:
    return 1.0 if ord(c) > 0x2E80 else 0.58


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
        im.thumbnail((COVER_W * 2, COVER_H * 2))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=80, optimize=True)
        if buf.tell() < len(raw):
            raw = buf.getvalue()
    except Exception:
        pass
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode()


def parse_at(s: str) -> datetime | None:
    try:
        dt = datetime.fromisoformat(str(s).strip())
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def aired_eps(a: dict, today: str) -> int:
    return sum(1 for ep in a.get("episodes") or [] if ep.get("type") == 0 and ep.get("air_date") and ep["air_date"] <= today)


def pick_recent(records: list[dict], limit: int, today: str) -> list[dict]:
    """候选 = 在看 / 看过 / 搁置, 按 last_update 倒序前 limit 部 (与 recent.ts 的 pickRecent 一致)."""
    out = []
    for r in records:
        a, u = r.get("anime_data", {}), r.get("user_status", {})
        st = u.get("watch_status")
        at = parse_at(u.get("last_update") or "")
        if st not in PHASE or at is None:
            continue
        total = a.get("eps") or a.get("total_episodes") or 0
        aired = aired_eps(a, today)
        watched = int(u.get("watched_eps") or 0)
        behind = max(0, aired - watched) if st == WATCHING else 0
        out.append({"r": r, "st": st, "at": at, "total": total, "aired": aired, "watched": watched, "behind": behind})
    out.sort(key=lambda x: (x["at"], int(x["r"]["anime_data"].get("id") or 0)), reverse=True)
    return out[:limit]


def ago(at: datetime, now: datetime) -> str:
    day = (now - at).days
    if day <= 0:
        return "今天"
    if day == 1:
        return "昨天"
    if day < 30:
        return f"{day} 天前"
    if day < 365:
        return f"{day // 30} 个月前"
    return f"{at.year}.{at.month}"


def render_card(it: dict, i: int, data_dir: Path, now: datetime) -> str:
    a = it["r"]["anime_data"]
    key, label, color = PHASE[it["st"]]
    name = clean(a.get("name_cn") or a.get("name") or a.get("id"))
    prog = f"{it['watched']} / {it['total']} 话" if it["total"] else f"看到第 {it['watched']} 话"
    meta = f"{prog} · {ago(it['at'], now)}"
    if it["st"] == WATCHED:
        ratio = 1.0
    else:
        base = it["total"] or it["aired"]
        ratio = min(1.0, it["watched"] / base) if base else 0.0
    uri = cover_data_uri(data_dir / "anime" / f"{a.get('id')}.jpg")
    d = i * 0.08

    css = (
        f"svg{{{VARS_LIGHT}}}@media (prefers-color-scheme:dark){{svg{{{VARS_DARK}}}}}"
        f"text{{font-family:{SANS};fill:var(--fg)}}.mono{{font-family:{MONO}}}.mute{{fill:var(--mute)}}"
        ".in{opacity:0;animation:in .6s cubic-bezier(.2,.8,.2,1) forwards}"
        ".cv{animation:kb 16s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 30%}"
        ".gl{animation:gl 5s ease-in-out infinite}"
        ".bar{transform-box:fill-box;transform-origin:left;transform:scaleX(0);animation:grow 1.1s cubic-bezier(.2,.8,.2,1) forwards}"
        ".dot{transform-box:fill-box;transform-origin:center;animation:pulse 1.8s ease-in-out infinite}"
        "@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}"
        "@keyframes kb{from{transform:scale(1)}to{transform:scale(1.09) translateY(-3px)}}"
        f"@keyframes gl{{0%{{transform:translateX(-30px)}}50%,100%{{transform:translateX({COVER_W:.0f}px)}}}}"
        f"@keyframes grow{{to{{transform:scaleX({ratio:.3f})}}}}"
        "@keyframes pulse{50%{opacity:.3}}"
        "@media (prefers-reduced-motion:reduce){*{animation:none!important}.in{opacity:1}"
        f".bar{{transform:scaleX({ratio:.3f})}}}}"
    )
    o: list[str] = []
    o.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{CARD_W}" height="{CARD_H}" viewBox="0 0 {CARD_W} {CARD_H}" '
        f'role="img" aria-label="{escape(name)}">'
    )
    o.append(f"<title>{escape(name)} ({escape(label)} {escape(prog)})</title><style>{css}</style>")
    o.append(f'<defs><clipPath id="c"><rect x="{PAD}" y="{PAD}" width="{COVER_W}" height="{COVER_H}" rx="10"/></clipPath></defs>')
    o.append(f'<g class="in" style="animation-delay:{d:.2f}s">')
    o.append(f'<rect x="{PAD}" y="{PAD}" width="{COVER_W}" height="{COVER_H}" rx="10" fill="var(--card)"/>')
    if uri:
        o.append(
            f'<g clip-path="url(#c)"><image class="cv" x="{PAD}" y="{PAD}" width="{COVER_W}" height="{COVER_H}" '
            f'preserveAspectRatio="xMidYMid slice" href="{uri}" style="animation-delay:-{i * 2.7:.1f}s"/></g>'
        )
    o.append(f'<rect x="{PAD + .5}" y="{PAD + .5}" width="{COVER_W - 1}" height="{COVER_H - 1}" rx="10" fill="none" stroke="var(--line)"/>')
    # 阶段角标: 半透明黑底 + 状态色圆点
    bw = 14 + 12 * len(label) + 8
    o.append(f'<rect x="{PAD + 6}" y="{PAD + 6}" width="{bw}" height="18" rx="9" fill="#000" fill-opacity=".58"/>')
    dot_cls = ' class="dot"' if key == "watching" else ""
    o.append(f'<circle{dot_cls} cx="{PAD + 15}" cy="{PAD + 15}" r="3.2" fill="{color}"/>')
    o.append(f'<text x="{PAD + 22}" y="{PAD + 19}" font-size="11" style="fill:#fff">{escape(label)}</text>')
    # 底部进度条
    by = PAD + COVER_H - 10
    o.append(f'<rect x="{PAD + 6}" y="{by}" width="{COVER_W - 12}" height="4" rx="2" fill="#000" fill-opacity=".45"/>')
    o.append(f'<rect class="bar" x="{PAD + 6}" y="{by}" width="{COVER_W - 12}" height="4" rx="2" fill="{color}" style="animation-delay:{d + .35:.2f}s"/>')
    # 进度条上循环走过的一点高光 (只在已看的那段里)
    o.append(f'<clipPath id="pb"><rect x="{PAD + 6}" y="{by}" width="{(COVER_W - 12) * ratio:.1f}" height="4" rx="2"/></clipPath>')
    o.append(f'<g clip-path="url(#pb)"><rect class="gl" x="{PAD + 6}" y="{by}" width="26" height="4" fill="#fff" fill-opacity=".55" style="animation-delay:{1.5 + i * 0.6:.1f}s"/></g>')
    # 番名 (两行) + 进度 · 时间 (+ 更新到第 N 话)
    ty = PAD + COVER_H + 8 + 12
    for j, line in enumerate(wrap_title(name, COVER_W / NAME_SIZE)):
        o.append(f'<text x="{PAD}" y="{ty + j * NAME_LH}" font-size="{NAME_SIZE}">{escape(line)}</text>')
    my = ty + 2 * NAME_LH + 2
    o.append(f'<text class="mono mute" x="{PAD}" y="{my}" font-size="10.5">{escape(meta)}</text>')
    if it["behind"]:
        o.append(f'<text x="{PAD}" y="{my + 14}" font-size="10.5" style="fill:var(--pk)">更新到第 {it["aired"]} 话</text>')
    o.append("</g></svg>")
    return "".join(o)


def load_records(data_dir: Path) -> list[dict] | None:
    for name in ("ANiMeIndex.json", "ANiMeRecord.json"):
        p = data_dir / name
        if p.is_file():
            with p.open(encoding="utf-8") as f:
                return json.load(f)
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=os.environ.get("ANIME_DATA_DIR") or str(ROOT / ".anime-data" / "data"))
    ap.add_argument("--out", default=str(ROOT / "img" / "cards" / "anime"))
    ap.add_argument("--limit", type=int, default=6)
    args = ap.parse_args()

    data_dir = Path(args.data)
    records = load_records(data_dir)
    if records is None:
        print(f"[anime_card] {data_dir} 下没有 ANiMeIndex.json / ANiMeRecord.json, 保留旧卡片", file=sys.stderr)
        return 1

    now = datetime.now(timezone.utc)
    shown = pick_recent(records, args.limit, date.today().isoformat())
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.svg"):
        old.unlink()

    counts: dict[int, int] = {}
    for r in records:
        st = r.get("user_status", {}).get("watch_status")
        counts[st] = counts.get(st, 0) + 1
    items = []
    for i, it in enumerate(shown):
        a = it["r"]["anime_data"]
        file = f"{i}.svg"
        (out / file).write_text(render_card(it, i, data_dir, now), encoding="utf-8")
        items.append({"id": a.get("id"), "file": file, "name": clean(a.get("name_cn") or a.get("name") or a.get("id"))})
        print(f"  {it['at']:%Y-%m-%d}  {PHASE[it['st']][1]}  {items[-1]['name']}")
    index = {"counts": " / ".join(f"{label} {counts.get(st, 0)}" for st, label in COUNT_ORDER), "items": items}
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"[anime_card] 已生成 {len(items)} 张 -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
