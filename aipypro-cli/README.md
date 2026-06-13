# AiPyPro Pro v5

基于 codenano SDK 的本地 AI 编码助手 CLI，支持 20+ 插件工具、MCP 集成、子代理系统、自愈 3 轮、AtomCode 风格界面。

## 新增功能 (v5)

- **MCP 集成** — 连接外部工具和服务，扩展能力边界
- **子代理系统** — 并行执行多任务，提升效率
- **项目上下文感知** — 自动加载 AGENTS.md、项目规则
- **Diff 可视化** — 编辑前预览变更，确认后应用
- **成本追踪** — 追踪 token 消耗、API 调用成本
- **模型 Fallback** — 主模型失败自动切换备用模型
- **交互式编辑** — 支持搜索替换、行范围编辑

## 快速开始

```bash
aipypro3 ask "你好"
aipypro3 chat
```

## 架构

```
index.js         入口（ask/chat/config/tools）
lib/
├── agent.js      引擎（codenano 工具函数 + 自研 API + 自愈 3 轮）
├── api.js        API 客户端（流式 SSE + Fallback）
├── tools.js      插件加载器（自动扫描 lib/plugins/ + MCP）
├── plugins/      20+ 个独立工具文件
├── ui.js         AtomCode 风格终端界面
├── config.js     配置管理
├── context.js    Token 预算 + 自动裁剪
├── context-project.js  项目上下文感知
├── cost.js       成本追踪
├── fallback.js   模型 Fallback
├── diff.js       Diff 可视化
├── interactive.js  交互式编辑
├── mcp.js        MCP 客户端
├── subagent.js   子代理调度
└── history.js    会话历史管理
```

## 聊天命令

| 命令 | 说明 |
|------|------|
| `ask <问题>` | 直接提问 |
| `chat` | 交互对话（自动保存历史） |
| `history` | 查看历史会话 |
| `tools` | 列出可用工具 |
| `export` | 导出会话为 Markdown |
| `config set <key> <value>` | 修改配置 |
| `config get <key>` | 查看配置项 |
| `/help` | 聊天模式帮助 |
| `/save <名称>` | 保存命名会话 |
| `/load <名称>` | 加载命名会话 |
| `/list` | 列出命名会话 |
| `/stats` | 会话统计 |
| `/session` | 会话详情 |
| `/model <模型>` | 切换模型 |
| `/fallback` | 查看 Fallback 链 |
| `/project` | 项目信息 |
| `/mcp` | MCP 服务器状态 |
| `/agents` | 子代理管理 |
| `/edit <文件>` | 交互式编辑 |
| `undo` | 撤回 |

## 工具

20+ 个工具，存放在 `lib/plugins/`，加工具就是往里扔一个 `.js` 文件。

### MCP 工具
- `mcp_filesystem_*` — 文件系统操作
- `mcp_fetch_*` — 网页抓取

### 子代理工具
- `spawn_subagent` — 创建子代理
- `list_subagents` — 列出子代理
- `get_subagent_result` — 获取结果
- `cancel_subagent` — 取消子代理

## 测试

```bash
node test_all.js    # 核心模块测试
node test_v5.js     # v5 新功能测试
```

## 技术栈

- Node.js 18+
- codenano SDK（token估算/上下文裁剪）
- @modelcontextprotocol/sdk（MCP 集成）
- SenseNova / DeepSeek API（OpenAI 兼容）
