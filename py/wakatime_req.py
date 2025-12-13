import os
import json
import requests
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from typing import List, Dict, Any, Optional

# --- 配置区 ---

# 1. 时区设置: 使用标准的 "Asia/Shanghai" 来代表中国时间
CST = ZoneInfo("Asia/Shanghai")

# 2. 文件路径: 使用现代的 pathlib 定义历史文件路径
HISTORY_FILE = Path("data") / "history.json"

# --- 核心功能 ---

def get_dates_for_mode(mode: str, api_key: str) -> List[str]:
    """
    根据模式生成需要爬取的日期列表 (YYYY-MM-DD 格式).
    所有日期计算都基于中国时区 (CST).
    """
    today_cst = datetime.now(CST)

    if mode == "week":
        print("模式: 本周 (七天内)")
        start_of_week = today_cst - timedelta(days=today_cst.weekday())
        return [
            (start_of_week + timedelta(days=i)).strftime("%Y-%m-%d")
            for i in range((today_cst - start_of_week).days + 1)
        ]

    if mode == "full":
        print("模式: 全历史 (注意: 仅付费版有效, 且可能耗时较长)")
        try:
            # 付费版用户可以查询完整的历史记录
            # 我们通过 users/current API 获取用户的创建日期作为开始
            user_api_url = f"https://wakatime.com/api/v1/users/current?api_key={api_key}"
            response = requests.get(user_api_url, timeout=15)
            response.raise_for_status()
            created_at_str = response.json()['data']['created_at']
            start_date = datetime.fromisoformat(created_at_str.rstrip("Z")).replace(tzinfo=ZoneInfo("UTC"))

            # 生成从创建日到今天的全部日期
            date_range = (today_cst - start_date.astimezone(CST)).days + 1
            return [
                (start_date.astimezone(CST) + timedelta(days=i)).strftime("%Y-%m-%d")
                for i in range(date_range)
            ]
        except Exception as e:
            print(f"获取全历史数据失败 (可能是免费版或API问题): {e}")
            print("将回退到默认模式。")
            # Fallback to default

    # 默认模式: 'default' 或 'full' 模式失败时
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
        # requests 库会自动使用 HTTP_PROXY 和 HTTPS_PROXY 环境变量
        response = requests.get(api_url, timeout=20)
        response.raise_for_status()
        data = response.json()
        return data['data'][0] if data.get('data') else None
    except requests.exceptions.RequestException as e:
        print(f"获取 {date_str} 数据时 API 请求失败: {e}")
        return None


def process_summary_data(summary: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """处理 API 返回的摘要数据, 格式化为我们需要的结构"""
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

    # 从环境变量读取模式, 默认为 'default'
    mode = os.getenv("WAKA_MODE", "default").lower()

    # 1. 根据模式获取要处理的日期列表
    dates_to_update = get_dates_for_mode(mode, api_key)

    # 2. 加载现有的历史数据
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    history_data = []
    if HISTORY_FILE.exists():
        try:
            history_data = json.loads(HISTORY_FILE.read_text(encoding='utf-8'))
            if not isinstance(history_data, list): history_data = []
        except json.JSONDecodeError:
            print(f"警告: {HISTORY_FILE} 文件损坏, 将重新创建。")
            history_data = []

    data_map = {item['date']: item for item in history_data}

    # 3. 循环获取、处理并更新数据
    for date_str in dates_to_update:
        summary = fetch_wakatime_for_date(api_key, date_str)
        if summary:
            processed_entry = process_summary_data(summary)
            if processed_entry:
                data_map[date_str] = processed_entry
                print(f"已处理 {date_str} 的数据。")

    if not data_map:
        print("没有任何数据可供写入。")
        return

    # 4. 将更新后的数据写回文件, 确保按日期降序排序
    updated_history = sorted(data_map.values(), key=lambda x: x.get('date', ''), reverse=True)
    HISTORY_FILE.write_text(json.dumps(updated_history, ensure_ascii=False, indent=4), encoding='utf-8')

    print(f"✅ 数据已成功更新到: {HISTORY_FILE}")


if __name__ == "__main__":
    main()

