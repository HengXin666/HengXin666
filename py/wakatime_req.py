import os
import json
import random
from time import sleep
import requests
from enum import Enum
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo
from typing import List, Dict, Any, Optional, Set

# --- 配置区 ---

# 1. 时区设置: 使用标准的 "Asia/Shanghai" 来代表中国时间
CST = ZoneInfo("Asia/Shanghai")

# 2. 文件路径: 使用现代的 pathlib 定义历史文件路径
HISTORY_FILE = Path("data") / "history.json"

# 3. (新) 代理设置: 硬编码一个代理, 默认是空字符串 (不启用)
#    格式: "http://user:pass@host:port" 或 "socks5://user:pass@host:port"
PROXY = "" # "http://127.0.0.1:2334"

# 4. 模式枚举: 替代裸字符串, 让代码更健壮
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

def get_proxies() -> Dict[str, str]:
    """(新) 根据 PROXY 配置生成 requests 使用的代理字典"""
    if PROXY:
        return {"http": PROXY, "https": PROXY}
    return {}

# (修改) 函数签名增加了 existing_dates 参数, 用于过滤已有数据
def get_dates_for_mode(mode: WakaMode, api_key: str, existing_dates: Set[str]) -> List[str]:
    """
    根据模式枚举生成需要爬取的日期列表 (YYYY-MM-DD 格式).
    所有日期计算都基于中国时区 (CST).
    在 'full' 模式下, 会跳过 `existing_dates` 中已存在的日期。
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
        print("模式: 全历史 (增量更新, 仅爬取本地没有的数据)")
        try:
            user_api_url = f"https://wakatime.com/api/v1/users/current?api_key={api_key}"
            # (修改) 请求时使用代理
            response = requests.get(user_api_url, timeout=15, proxies=get_proxies())
            response.raise_for_status()
            created_at_str = response.json()['data']['created_at']
            start_date = datetime.fromisoformat(created_at_str.rstrip("Z")).replace(tzinfo=ZoneInfo("UTC"))
            
            all_possible_dates = []
            current_date = start_date.astimezone(CST)
            end_date = today_cst
            while current_date <= end_date:
                all_possible_dates.append(current_date.strftime("%Y-%m-%d"))
                current_date += timedelta(days=1)

            # (修改) 核心逻辑: 过滤掉本地已存在的日期
            missing_dates = [date for date in all_possible_dates if date not in existing_dates]
            print(f"全量扫描: 发现 {len(missing_dates)}个缺失的日期需要爬取。")
            return missing_dates
            
        except Exception as e:
            print(f"获取全历史数据失败 (可能是免费版或API问题): {e}")
            print("将回退到默认模式。")
            # Fallback to default
            mode = WakaMode.DEFAULT

    # 默认模式 (WakaMode.DEFAULT) 或 'full' 模式失败时的回退
    print("模式: 默认 (今天和昨天)")
    yesterday_cst = today_cst - timedelta(days=1)
    return [
        today_cst.strftime("%Y-%m-%d"),
        yesterday_cst.strftime("%Y-%m-%d"),
    ]

def fetch_wakatime_for_date(api_key: str, date_str: str) -> Optional[Dict[str, Any]]:
    """为指定日期获取 WakaTime 统计数据, 并带有指数退避的重试逻辑"""
    api_url = f"https://wakatime.com/api/v1/users/current/summaries?start={date_str}&end={date_str}&api_key={api_key}"
    print(f"正在获取 {date_str} 的数据...")
    max_retries = 5
    base_wait_time = 60
    
    for attempt in range(max_retries):
        try:
            # (修改) 请求时使用代理
            response = requests.get(api_url, timeout=30, proxies=get_proxies())
            response.raise_for_status()
            data = response.json()
            return data.get('data')[0] if data.get('data') else None
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 429:
                wait_time = base_wait_time * (2 ** attempt)
                print(f"收到 429 速率限制错误。将在 {wait_time} 秒后重试... (第 {attempt + 1}/{max_retries} 次)")
                sleep(wait_time)
            else:
                print(f"获取 {date_str} 数据时发生 HTTP 错误: {e}")
                return None
        except requests.exceptions.RequestException as e:
            print(f"获取 {date_str} 数据时 API 请求失败: {e}")
            return None
            
    print(f"重试 {max_retries} 次后仍然失败, 放弃获取 {date_str} 的数据。")
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

    mode_str = os.getenv("WAKA_MODE", "default").lower()
    mode = WakaMode.from_str(mode_str)

    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    history_data = []
    if HISTORY_FILE.exists():
        try:
            history_data = json.loads(HISTORY_FILE.read_text(encoding='utf-8'))
            if not isinstance(history_data, list): history_data = []
        except json.JSONDecodeError:
            print(f"警告: {HISTORY_FILE} 文件损坏, 将从零开始。")
            history_data = []
            
    data_map = {item['date']: item for item in history_data}
    
    # (修改) 传入本地已有的日期集合
    existing_dates = set(data_map.keys())
    dates_to_update = get_dates_for_mode(mode, api_key, existing_dates)

    if not dates_to_update:
        print("所有日期数据都已是最新, 无需更新。")
        return

    # (修改) 核心修改: 循环获取和写入
    data_updated = False
    for date_str in dates_to_update:
        summary = fetch_wakatime_for_date(api_key, date_str)
        
        if summary and (processed_entry := process_summary_data(summary)):
            data_map[date_str] = processed_entry
            print(f"已在内存中更新 {date_str} 的数据。")
            data_updated = True

            # (修改) 如果是全量模式, 每次获取成功后都立即写回文件, 实现"边爬边存"
            if mode is WakaMode.FULL:
                updated_history = sorted(data_map.values(), key=lambda x: x.get('date', ''), reverse=True)
                HISTORY_FILE.write_text(json.dumps(updated_history, ensure_ascii=False, indent=4), encoding='utf-8')
                print(f"增量写入完成: {date_str} -> {HISTORY_FILE}")

        # 随机 x 秒, 避免过于频繁请求
        sleep_time = random.randint(5, 10)
        print(f"随机等待 {sleep_time} 秒...")
        sleep(sleep_time)

    # (修改) 对于非全量模式, 在所有爬取结束后统一写入一次
    if data_updated and mode is not WakaMode.FULL:
        if not data_map:
            print("没有任何数据可供写入。")
            return
        updated_history = sorted(data_map.values(), key=lambda x: x.get('date', ''), reverse=True)
        # 减小文件大小, 不格式化
        HISTORY_FILE.write_text(json.dumps(updated_history, ensure_ascii=False, indent=None), encoding='utf-8')
        print(f"✅ 文件更新完成: {HISTORY_FILE}")
    elif not data_updated:
        print("本次运行没有获取到任何新数据。")


if __name__ == "__main__":
    main()
