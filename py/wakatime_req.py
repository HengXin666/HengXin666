import os
import json
from time import sleep
import requests
from enum import Enum
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from typing import List, Dict, Any, Optional

# --- 配置区 ---

# 1. 时区设置: 使用标准的 "Asia/Shanghai" 来代表中国时间
CST = ZoneInfo("Asia/Shanghai")

# 2. 文件路径: 使用现代的 pathlib 定义历史文件路径
HISTORY_FILE = Path("data") / "history.json"

# 3. (新) 模式枚举: 替代裸字符串, 让代码更健壮
class WakaMode(Enum):
    """定义脚本的执行模式"""
    DEFAULT = "default"
    WEEK = "week"
    FULL = "full"

    @classmethod
    def from_str(cls, value: str) -> 'WakaMode':
        """从字符串安全地创建枚举实例, 如果失败则返回默认值"""
        try:
            return cls(value)
        except ValueError:
            print(f"警告: 未知的模式 '{value}'。将使用默认模式。")
            return cls.DEFAULT

# --- 核心功能 ---

def get_dates_for_mode(mode: WakaMode, api_key: str) -> List[str]:
    """
    根据模式枚举生成需要爬取的日期列表 (YYYY-MM-DD 格式).
    所有日期计算都基于中国时区 (CST).
    """
    today_cst = datetime.now(CST)

    if mode is WakaMode.WEEK:
        print("模式: 本周 (周一至今日)")
        start_of_week = today_cst - timedelta(days=today_cst.weekday())
        return [
            (start_of_week + timedelta(days=i)).strftime("%Y-%m-%d")
            for i in range((today_cst - start_of_week).days + 1)
        ]

    if mode is WakaMode.FULL:
        print("模式: 全历史 (注意: 仅付费版有效, 且可能耗时较长)")
        try:
            user_api_url = f"https://wakatime.com/api/v1/users/current?api_key={api_key}"
            response = requests.get(user_api_url, timeout=15)
            response.raise_for_status()
            created_at_str = response.json()['data']['created_at']
            start_date = datetime.fromisoformat(created_at_str.rstrip("Z")).replace(tzinfo=ZoneInfo("UTC"))
            date_range = (today_cst - start_date.astimezone(CST)).days + 1
            return [
                (start_date.astimezone(CST) + timedelta(days=i)).strftime("%Y-%m-%d")
                for i in range(date_range)
            ]
        except Exception as e:
            print(f"获取全历史数据失败 (可能是免费版或API问题): {e}")
            print("将回退到默认模式。")

    # 默认模式 (WakaMode.DEFAULT) 或 'full' 模式失败时的回退
    print("模式: 默认 (今天和昨天)")
    yesterday_cst = today_cst - timedelta(days=1)
    return [
        today_cst.strftime("%Y-%m-%d"),
        yesterday_cst.strftime("%Y-%m-%d"),
    ]

def fetch_wakatime_for_date(api_key: str, date_str: str) -> Optional[Dict[str, Any]]:
    """为指定日期获取 WakaTime 统计数据"""
    api_url = f"https://wakatime.com/api/v1/users/current/summaries?start={date_str}&end={date_str}&api_key={api_key}"
    print(f"正在获取 {date_str} 的数据...")
    try:
        response = requests.get(api_url, timeout=20)
        response.raise_for_status()
        data = response.json()
        return data['data'][0] if data.get('data') else None
    except requests.exceptions.RequestException as e:
        print(f"获取 {date_str} 数据时 API 请求失败: {e}")
        return None

def process_summary_data(summary: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """处理 API 返回的摘要数据, 格式化为我们需要的结构"""
    # ... (此函数内容不变, 保留高精度秒)
    date = summary.get('range', {}).get('date')
    if not date:
        return None
    return {
        "date": date,
        "languages": [
            {lang['name']: lang['total_seconds']}
            for lang in summary.get('languages', []) if lang.get('name', '').lower() != 'other'
        ],
        "system": [
            {os_item['name']: os_item['total_seconds']}
            for os_item in summary.get('operating_systems', [])
        ]
    }

def main():
    """主执行函数"""
    api_key = os.getenv("WAKATIME_API_KEY")
    if not api_key:
        raise ValueError("错误: 请在环境中设置 WAKATIME_API_KEY")

    # (新) 从环境变量安全地转换为 WakaMode 枚举
    mode_str = os.getenv("WAKA_MODE", "default").lower()
    mode = WakaMode.from_str(mode_str)

    dates_to_update = get_dates_for_mode(mode, api_key)

    # --- (核心) 安全的数据更新逻辑 ---
    # 这一部分逻辑保证了您的第二个要求: 任何时候都是更新, 而不是清空重写。

    # 1. 确保目录存在
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)

    # 2. 读取旧数据: 尝试读取磁盘上已有的 `history.json` 文件。
    #    如果文件不存在或内容损坏, 则从一个空的列表开始, 保证程序不会崩溃。
    history_data = []
    if HISTORY_FILE.exists():
        try:
            history_data = json.loads(HISTORY_FILE.read_text(encoding='utf-8'))
            if not isinstance(history_data, list): history_data = []
        except json.JSONDecodeError:
            print(f"警告: {HISTORY_FILE} 文件损坏, 将从零开始。")
            history_data = []

    # 3. 在内存中合并: 将读取到的历史数据(列表)转换成一个以日期为键的字典。
    #    这样做可以非常高效地更新或添加新数据。
    data_map = {item['date']: item for item in history_data}

    # 4. 获取新数据并更新内存中的字典:
    #    循环今天、昨天(或其他模式下的日期), 获取最新数据。
    #    然后直接在 `data_map` 中覆盖或添加对应日期的条目。
    #    旧文件中其他日期的数据, 因为已经加载到了 `data_map` 中, 所以依然存在。
    for date_str in dates_to_update:
        summary = fetch_wakatime_for_date(api_key, date_str)
        sleep(3) # 防止被封禁
        if summary and (processed_entry := process_summary_data(summary)):
            data_map[date_str] = processed_entry
            print(f"已在内存中更新 {date_str} 的数据。")

    if not data_map:
        print("没有任何数据可供写入。")
        return

    # 5. 写回完整数据: 将内存中合并了所有新旧数据的 `data_map` 转换回列表,
    #    排序后, 一次性地、完整地写回到 `history.json` 文件。
    #    这一步是"覆盖写", 但覆盖的是包含了全部历史的最新内容, 因此是安全的。
    updated_history = sorted(data_map.values(), key=lambda x: x.get('date', ''), reverse=True)
    HISTORY_FILE.write_text(json.dumps(updated_history, ensure_ascii=False, indent=4), encoding='utf-8')

    print(f"✅ 文件更新完成: {HISTORY_FILE}")

if __name__ == "__main__":
    main()
