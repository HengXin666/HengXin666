# py

此为运行脚本. 作为互联网定时任务. 基于 Github 工作流.

目前提供:

- `wakatime_req.py`: WakaTime 统计 (爬取 一天内语言、操作系统 时间信息)

## 一、本地环境安装

1. 使用 UV 管理 (下载UV)

```sh
# On macOS and Linux.
curl -LsSf https://astral.sh/uv/install.sh | sh

# On Windows.
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"

# With pip.
pip install uv
```

2. 创建环境

```sh
cd py # 从项目根目录, 进入到 py 目录
uv init
```

3. 同步依赖

```sh
uv sync
```

4. 启动

```sh
# 生产环境(配置保存于系统配置目录)
uv run main.py

# 开发环境(配置保存于项目目录)
uv run main.py -d

# Note: 可使用 -p 参数指定端口
```