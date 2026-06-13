# AiPyPro Pro v4

基于 codenano SDK 的本地 AI 编码助手 CLI，支持 15+ 插件工具、自愈 3 轮、AtomCode 风格界面。

## 对话界面特大升级 ✨

- **多行输入** — `"""` 进入多行模式，粘贴代码无压力
- **Markdown 渲染** — 粗体/表格/列表/引用/代码语法高亮（20+ 语言）
- **命令历史** — ↑/↓ 翻历史，Tab 补全命令
- **命名会话** — `/save myProject` 保存，`/load myProject` 恢复
- **会话导出** — `/export` 导出 Markdown 格式
- **实时统计** — 消息数 / Token 用量 / 会话时长自动显示
- **新品牌横幅** — 全彩 ASCII art 启动画面

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
├── api.js        API 客户端（流式 SSE)
├── tools.js      插件加载器（自动扫描 lib/plugins/）
├── plugins/      15 个独立工具文件
├── ui.js         AtomCode 风格终端界面
├── config.js     配置管理
├── context.js    Token 预算 + 自动裁剪
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
| `undo` | 撤回 |

## 工具

15 个工具，存放在 `lib/plugins/`，加工具就是往里扔一个 `.js` 文件。

## 测试

```bash
node test_all.js
```

## 技术栈

- Node.js 18+
- codenano SDK（token估算/上下文裁剪）
- SenseNova / DeepSeek API（OpenAI 兼容）
