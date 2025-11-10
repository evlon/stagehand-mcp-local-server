# Stagehand MCP Local Server

一个基于 FastMCP 的本地 MCP 服务器，封装并暴露 Stagehand 的能力，支持多会话隔离、页面管理、历史记录、Playwright 脚本生成与截图预览。

## 特性
- 多会话隔离：每个 MCP 会话拥有独立的 `Stagehand` 实例与活动页索引。
- 页面管理：创建/列出/切换/关闭页面，导航到指定 URL。
- 工具集合：
  - `stagehand_act`、`stagehand_observe`、`stagehand_extract`、`stagehand_agent`
  - `stagehand_history`、`stagehand_generate_playwright`
  - `stagehand_new_page`、`stagehand_list_pages`、`stagehand_set_active_page`、`stagehand_goto`、`stagehand_close_page`
  - `stagehand_screenshot`（返回可访问 URL 或 data URL）
- 配置优先级：默认配置 < 配置文件（JSON/JSONC）< 环境变量（最高）。
- 截图静态服务器：为图片提供可访问 URL，降低 LLM token 消耗。

## 目录结构
```
├── public/
│   └── screenshots/          # 截图存放目录（自动创建）
├── src/
│   ├── config/config.mjs     # 读取 .env 并暴露基础配置
│   ├── index.mjs             # 入口，启动 MCP 服务器
│   └── servers/mcpServer.mjs # 工具注册与会话隔离逻辑
├── stagehand.config.jsonc    # Stagehand 配置（支持注释）
├── .env                      # 环境变量文件（可选）
├── package.json
└── README.md
```

## 快速开始
1) 安装依赖（使用 pnpm）
```
pnpm install
```

2) 启动服务器（默认端口 `3333`，端点 `http://localhost:<port>/mcp`）
```
MCP_PORT=3334 pnpm exec node src/index.mjs
```
- 若端口占用，修改 `MCP_PORT` 环境变量即可。
- 启动后，控制台会打印 MCP 端点与静态资源服务器地址。

## 配置
本项目支持从 `stagehand.config.jsonc` 加载配置并兼容注释；也支持通过环境变量进行覆盖（优先级最高）。

- 默认配置示例（摘自 `mcpServer.mjs`）：
  - `env: "LOCAL"`
  - `verbose: 2`
  - `model` 使用 `provider/model` 形式的标识（可通过环境变量覆盖）
  - `cacheDir` 默认 `./stagehand_cache`（可通过环境变量覆盖并展开 `~`）

- 配置文件：`stagehand.config.jsonc`
  - 支持注释（JSONC），会自动去除注释后解析。
  - 示例（节选）：
    ```jsonc
    {
      // AI/LLM 配置
      "model": {
        "name": "openai/gpt-4o",
        "apiKey": "YOUR_OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      },
      // 缓存目录
      "cacheDir": "~/.stagehand/cache"
    }
    ```

### 环境变量优先级与列表
- 优先级：默认配置 < 配置文件 < 环境变量（最高）
- 可用环境变量：
  - `MCP_PORT`: MCP 服务器端口（默认 `3333`）。
  - `ASSET_PORT`: 静态资源服务器端口（默认 `4001`）。
  - `STAGEHAND_CONFIGFILE`: 指定配置文件路径（若未设置，回退解析 `./stagehand.config.jsonc`）。
  - `STAGEHAND_ENV`: 覆盖 Stagehand 的 `env`。
  - `STAGEHAND_MODEL` 或 `STAGEHAND_MODEL_NAME`: 覆盖模型名称（如 `provider/model`）。
  - `STAGEHAND_MODEL_API_KEY` 或 `STAGEHAND_API_KEY`: 覆盖模型的 API Key。
  - `STAGEHAND_MODEL_BASE_URL` 或 `STAGEHAND_BASE_URL`: 覆盖模型 Base URL（自动清理反引号与空格）。
  - `STAGEHAND_CACHE_DIR`: 覆盖缓存目录；支持 `~` 展开为用户主目录。

> 提示：`cacheDir` 会在启动时自动展开 `~` 为绝对路径；若使用相对路径（如 `./stagehand_cache`），会在项目根目录下创建并使用。

## 工具列表（MCP）
所有工具均支持多会话隔离，按 `context.sessionId` 路由到对应的 `Stagehand` 实例；涉及页面的工具默认作用于“活动页”，可通过 `pageIndex` 指定目标页。

- `stagehand_new_page`
  - 参数：`url?`
  - 功能：创建新页面并可选导航到 `url`；更新活动页索引。
- `stagehand_list_pages`
  - 参数：无
  - 功能：列出当前会话的页面数量与索引，返回活动页索引。
- `stagehand_set_active_page`
  - 参数：`pageIndex`
  - 功能：设置活动页索引。
- `stagehand_goto`
  - 参数：`url`, `pageIndex?`
  - 功能：在活动页或指定页导航到 `url`。
- `stagehand_close_page`
  - 参数：`pageIndex?`
  - 功能：关闭指定或活动页，并更新活动页索引。
- `stagehand_screenshot`
  - 参数：`pageIndex?`, `fullPage?`, `type?`(`png|jpeg`), `quality?`, `clip?`, `returnMode?`(`url|dataURL`)
  - 功能：对页面截图，返回可访问 URL 或 data URL。
- `stagehand_act`
  - 参数：`instruction`, `pageIndex?`
  - 功能：自然语言原子操作（如点击、输入等）。
- `stagehand_observe`
  - 参数：`instruction`, `pageIndex?`
  - 功能：返回候选动作计划与细节。
- `stagehand_extract`
  - 参数：`instruction`, `selector?`, `pageIndex?`
  - 功能：抽取信息，支持基于选择器的目标元素。
- `stagehand_agent`
  - 参数：`instruction`, `maxSteps?`, `cua?`, `model?`, `executionModel?`, `systemPrompt?`, `integrations?`
  - 功能：多步自动执行任务。
- `stagehand_history`
  - 参数：`includeActions?`, `summarize?`
  - 功能：获取历史记录并返回概要或原始条目。
- `stagehand_generate_playwright`
  - 参数：`testName?`, `includeComments?`
  - 功能：将历史记录转换为 Playwright 测试脚本字符串。

## 会话与并发
- 每个 MCP 会话独立维护状态：`Stagehand` 实例与活动页索引互不影响。
- 自然语言操作默认作用于活动页；如需指定页面，请传入 `pageIndex` 或先调用 `stagehand_set_active_page`。

## 截图与预览
- 截图保存到 `public/screenshots/`（若 `returnMode='url'`）。
- 静态资源服务器启动后打印地址：`http://localhost:<ASSET_PORT>/`，截图 URL 形如：
  - `http://localhost:<ASSET_PORT>/screenshots/<文件名>`
- 建议使用 URL 返回模式，以降低 LLM token 消耗。

## 开发与测试
- 依赖安装：`pnpm install`
- 启动：`MCP_PORT=3334 pnpm exec node src/index.mjs`
- 若需要自定义配置文件位置，在 `.env` 或运行参数里设置：
  - `STAGEHAND_CONFIGFILE=/absolute/path/to/stagehand.config.jsonc`

## 常见问题
- 端口占用：修改 `MCP_PORT` 或 `ASSET_PORT` 后重启。
- 未找到活动页：先调用 `stagehand_new_page` 或 `stagehand_goto` 创建/导航页面。
- 配置文件无法解析：确保为 JSON 或 JSONC（注释会被移除后再解析）。

---
如需扩展更多操作（`reload`、`goBack`、查询 `title/url`、更细粒度的定位器操作），或将生成的 Playwright 脚本直接写入文件，请提出需求，我可以继续完善。