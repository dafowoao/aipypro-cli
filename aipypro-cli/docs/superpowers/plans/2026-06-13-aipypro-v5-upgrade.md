# AiPyPro Pro v5 升级计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。

**目标：** 将 AiPyPro Pro v4 升级为 v5，增加 MCP 集成、子代理系统、项目上下文感知、Diff 可视化、成本追踪、模型 Fallback、交互式编辑 7 大能力。

**架构：** 在现有插件化架构基础上，新增 `lib/mcp.js`（MCP 客户端）、`lib/subagent.js`（子代理调度）、`lib/context-project.js`（项目感知）、`lib/cost.js`（成本追踪）、`lib/fallback.js`（模型切换）。扩展 `lib/agent.js` 和 `lib/api.js` 支持新特性。

**技术栈：** Node.js 18+, MCP SDK (@modelcontextprotocol/sdk), 现有 codenano SDK

---

## 阶段一：基础设施（成本追踪 + 模型 Fallback）

### 任务 1：成本追踪模块

**文件：**
- 创建：`lib/cost.js`
- 修改：`lib/api.js:10-100`（注入 token 统计）
- 修改：`lib/config.js:12-19`（添加定价配置）
- 修改：`index.js:263-274`（显示成本）

- [ ] **步骤 1：创建 cost.js 模块**

```javascript
// lib/cost.js — 成本追踪模块
const fs = require('fs');
const path = require('path');
const { CONFIG_DIR } = require('./config');

const COST_FILE = path.join(CONFIG_DIR, 'cost.json');

// 模型定价 (USD per 1M tokens)
const PRICING = {
  'deepseek-v4-flash': { input: 0.27, output: 1.10 },
  'deepseek-chat': { input: 0.27, output: 1.10 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
};

let sessionStats = { inputTokens: 0, outputTokens: 0, cost: 0, calls: 0 };

function getModelPricing(model) {
  const base = model.split('/').pop().toLowerCase();
  return PRICING[base] || { input: 1.0, output: 3.0 };
}

function recordUsage(model, inputTokens, outputTokens) {
  const pricing = getModelPricing(model);
  const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1000000;
  sessionStats.inputTokens += inputTokens;
  sessionStats.outputTokens += outputTokens;
  sessionStats.cost += cost;
  sessionStats.calls += 1;
  return { cost, total: sessionStats.cost };
}

function getSessionStats() {
  return { ...sessionStats };
}

function resetSessionStats() {
  sessionStats = { inputTokens: 0, outputTokens: 0, cost: 0, calls: 0 };
}

function saveCostLog(entry) {
  try {
    const dir = path.dirname(COST_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const logs = fs.existsSync(COST_FILE) ? JSON.parse(fs.readFileSync(COST_FILE, 'utf8')) : [];
    logs.push({ ...entry, time: Date.now() });
    if (logs.length > 1000) logs.splice(0, logs.length - 1000);
    fs.writeFileSync(COST_FILE, JSON.stringify(logs, null, 2), 'utf8');
  } catch {}
}

module.exports = { recordUsage, getSessionStats, resetSessionStats, saveCostLog, getModelPricing, PRICING };
```

- [ ] **步骤 2：修改 api.js 注入 token 统计**

在 `lib/api.js` 中，修改 `chatStream` 函数，在返回结果中添加 token 统计：

```javascript
// 在 chatStream 函数开头添加
const { recordUsage } = require('./cost');

// 在 resolve 调用前添加 token 统计
// 在 data === '[DONE]' 分支中:
if (data === '[DONE]') {
  resolved = true;
  // 估算 token 用量
  const inputTokens = Math.ceil(JSON.stringify(messages).length / 4);
  const outputTokens = Math.ceil(full.length / 4);
  const usage = recordUsage(CFG.model, inputTokens, outputTokens);
  resolve({ text: full, toolCalls: Object.values(tcMap), usage });
  return;
}
```

- [ ] **步骤 3：修改 index.js 显示成本**

在 `lib/index.js` 的 `processLine` 函数末尾添加成本显示：

```javascript
// 在 ui.status 调用后添加
const { getSessionStats } = require('./lib/cost');
const stats = getSessionStats();
if (stats.calls > 0) {
  ui.status([
    {l:'消息',v:`${chatHistory.length}`,c:ui.C.muted},
    {l:'提问',v:`${turnCounters.user}`,c:ui.C.muted},
    {l:'Tokens',v:`${totalTokens}`,c:ui.C.muted},
    {l:'费用',v:`$${stats.cost.toFixed(4)}`,c:ui.C.green},
    {l:'时长',v:`${elapsed}s`,c:ui.C.subtle},
  ]);
}
```

- [ ] **步骤 4：修改 config.js 添加定价配置**

```javascript
// 在 DEFAULT_CONFIG 中添加
const DEFAULT_CONFIG = {
  apiKey: '',
  apiUrl: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-v4-flash',
  maxTokens: 2048,
  temperature: 0.3,
  tavilyKey: '',
  costTracking: true,  // 新增
};
```

- [ ] **步骤 5：运行测试验证**

运行：`node test_all.js`
预期：所有现有测试通过，无回归

---

### 任务 2：模型 Fallback 模块

**文件：**
- 创建：`lib/fallback.js`
- 修改：`lib/api.js:10-100`（添加 fallback 逻辑）
- 修改：`lib/config.js:12-19`（添加 fallback 模型配置）

- [ ] **步骤 1：创建 fallback.js 模块**

```javascript
// lib/fallback.js — 模型 Fallback 模块
const { CFG } = require('./config');

// 默认 fallback 顺序
const DEFAULT_FALLBACKS = [
  'deepseek-v4-flash',
  'deepseek-chat',
  'gpt-4o-mini',
];

let currentModel = null;
let fallbackIndex = 0;

function initFallback() {
  currentModel = CFG.model;
  fallbackIndex = 0;
}

function getModel() {
  return currentModel || CFG.model;
}

function shouldFallback(error) {
  const msg = (error.message || '').toLowerCase();
  // 触发 fallback 的错误模式
  return msg.includes('rate limit') ||
         msg.includes('429') ||
         msg.includes('503') ||
         msg.includes('overloaded') ||
         msg.includes('timeout') ||
         msg.includes('context length');
}

function getNextModel() {
  const fallbacks = CFG.fallbackModels || DEFAULT_FALLBACKS;
  const currentIdx = fallbacks.indexOf(currentModel);
  const nextIdx = currentIdx + 1;
  if (nextIdx < fallbacks.length) {
    currentModel = fallbacks[nextIdx];
    return currentModel;
  }
  return null; // 无更多模型
}

function resetToPrimary() {
  currentModel = CFG.model;
  fallbackIndex = 0;
}

function getModelChain() {
  const fallbacks = CFG.fallbackModels || DEFAULT_FALLBACKS;
  return fallbacks;
}

module.exports = { initFallback, getModel, shouldFallback, getNextModel, resetToPrimary, getModelChain };
```

- [ ] **步骤 2：修改 api.js 添加 fallback 逻辑**

```javascript
// 在 api.js 开头添加
const { getModel, shouldFallback, getNextModel, resetToPrimary } = require('./fallback');

// 修改 chatStream 函数，添加 fallback 参数
function chatStream(messages, tools = null, opts = {}, onToken = null) {
  return new Promise((resolve, reject) => {
    const model = opts.model || getModel();
    const body = JSON.stringify({
      model,  // 使用 fallback 模型
      messages,
      max_tokens: opts.maxTokens ?? CFG.maxTokens ?? 4096,
      temperature: CFG.temperature ?? 0.1,
      stream: true,
      ...(tools ? { tools, tool_choice: 'auto' } : {}),
    });

    // ... 现有代码 ...

    req.on('error', async (e) => {
      const error = new Error(`请求失败: ${e.message}`);
      if (shouldFallback(error) && !opts._isRetry) {
        const nextModel = getNextModel();
        if (nextModel) {
          console.log(`  ⚠ 模型 ${model} 不可用，切换到 ${nextModel}`);
          try {
            const result = await chatStream(messages, tools, { ...opts, model: nextModel, _isRetry: true }, onToken);
            resolve(result);
            return;
          } catch (fallbackErr) {
            reject(fallbackErr);
            return;
          }
        }
      }
      reject(error);
    });
  });
}
```

- [ ] **步骤 3：修改 config.js 添加 fallback 配置**

```javascript
// 在 DEFAULT_CONFIG 中添加
const DEFAULT_CONFIG = {
  // ... 现有配置 ...
  fallbackModels: ['deepseek-v4-flash', 'deepseek-chat', 'gpt-4o-mini'],
};
```

- [ ] **步骤 4：修改 index.js 添加模型切换命令**

在 `handleCommand` 函数中添加 `/fallback` 命令：

```javascript
if (first === '/fallback') {
  const { getModelChain, resetToPrimary } = require('./lib/fallback');
  const chain = getModelChain();
  console.log(`\n  ${ui.C.accent}${ui.C.bold}模型 Fallback 链${ui.C.reset}`);
  chain.forEach((m, i) => {
    const current = m === require('./lib/fallback').getModel();
    const prefix = current ? `${ui.C.green}→` : `  ${ui.C.dim}`;
    console.log(`  ${prefix} ${m}${ui.C.reset}`);
  });
  console.log('');
  rl.prompt();
  return true;
}
```

- [ ] **步骤 5：运行测试验证**

运行：`node test_all.js`
预期：所有现有测试通过

---

## 阶段二：项目上下文感知

### 任务 3：项目上下文模块

**文件：**
- 创建：`lib/context-project.js`
- 创建：`.aipypro.json`（项目配置模板）
- 修改：`lib/agent.js:378-393`（注入项目上下文）

- [ ] **步骤 1：创建 context-project.js 模块**

```javascript
// lib/context-project.js — 项目上下文感知模块
const fs = require('fs');
const path = require('path');

// 项目配置文件名
const PROJECT_CONFIG = '.aipypro.json';
const AGENTS_MD = 'AGENTS.md';
const RULES_FILES = ['.cursorrules', '.copilot', 'CLAUDE.md'];

// 默认项目配置
const DEFAULT_PROJECT = {
  name: '',
  rules: [],
  ignore: ['node_modules', '.git', 'dist', 'build', '__pycache__'],
  contextFiles: [],
  systemPrompt: '',
};

function findProjectRoot(startDir) {
  let dir = startDir || process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, PROJECT_CONFIG))) return dir;
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    if (fs.existsSync(path.join(dir, 'pyproject.toml'))) return dir;
    if (fs.existsSync(path.join(dir, 'Cargo.toml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir || process.cwd();
}

function loadProjectConfig(projectRoot) {
  const configPath = path.join(projectRoot, PROJECT_CONFIG);
  if (!fs.existsSync(configPath)) return { ...DEFAULT_PROJECT, root: projectRoot };
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { ...DEFAULT_PROJECT, ...config, root: projectRoot };
  } catch {
    return { ...DEFAULT_PROJECT, root: projectRoot };
  }
}

function loadProjectContext(projectRoot) {
  const config = loadProjectConfig(projectRoot);
  const contextParts = [];

  // 1. 加载 AGENTS.md
  const agentsPath = path.join(projectRoot, AGENTS_MD);
  if (fs.existsSync(agentsPath)) {
    try {
      const content = fs.readFileSync(agentsPath, 'utf8').substring(0, 4000);
      contextParts.push(`## 项目规则 (AGENTS.md)\n${content}`);
    } catch {}
  }

  // 2. 加载其他规则文件
  for (const file of RULES_FILES) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8').substring(0, 2000);
        contextParts.push(`## ${file}\n${content}`);
      } catch {}
    }
  }

  // 3. 加载自定义上下文文件
  for (const file of config.contextFiles || []) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8').substring(0, 2000);
        contextParts.push(`## ${file}\n${content}`);
      } catch {}
    }
  }

  // 4. 加载项目自定义规则
  if (config.rules && config.rules.length > 0) {
    contextParts.push(`## 自定义规则\n${config.rules.join('\n')}`);
  }

  // 5. 加载项目自定义系统提示
  if (config.systemPrompt) {
    contextParts.push(`## 项目特定指令\n${config.systemPrompt}`);
  }

  return {
    config,
    context: contextParts.join('\n\n'),
    hasContext: contextParts.length > 0,
  };
}

function getProjectInfo(projectRoot) {
  const config = loadProjectConfig(projectRoot);
  const info = {
    root: projectRoot,
    name: config.name || path.basename(projectRoot),
    hasAgentsMd: fs.existsSync(path.join(projectRoot, AGENTS_MD)),
    hasProjectConfig: fs.existsSync(path.join(projectRoot, PROJECT_CONFIG)),
    ignorePatterns: config.ignore,
  };

  // 检测项目类型
  if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
    info.type = 'node';
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
      info.name = pkg.name;
      info.version = pkg.version;
    } catch {}
  } else if (fs.existsSync(path.join(projectRoot, 'pyproject.toml'))) {
    info.type = 'python';
  } else if (fs.existsSync(path.join(projectRoot, 'Cargo.toml'))) {
    info.type = 'rust';
  } else {
    info.type = 'unknown';
  }

  return info;
}

module.exports = { loadProjectConfig, loadProjectContext, getProjectInfo, findProjectRoot };
```

- [ ] **步骤 2：创建 .aipypro.json 模板**

```json
{
  "name": "my-project",
  "rules": [
    "使用中文回复",
    "代码风格遵循 Airbnb 规范",
    "所有函数必须添加 JSDoc 注释"
  ],
  "ignore": ["node_modules", ".git", "dist", "build"],
  "contextFiles": ["docs/API.md", "CONTRIBUTING.md"],
  "systemPrompt": "这是一个 React + TypeScript 项目，使用 Vite 构建。"
}
```

- [ ] **步骤 3：修改 agent.js 注入项目上下文**

在 `lib/agent.js` 的 `callAI` 函数开头添加项目上下文加载：

```javascript
// 在 callAI 函数开头添加
const { loadProjectContext, findProjectRoot } = require('./context-project');

// 在 SYSTEM_PROMPT 定义前添加
const projectRoot = findProjectRoot();
const projectCtx = loadProjectContext(projectRoot);

// 修改 SYSTEM_PROMPT
const SYSTEM_PROMPT = `你是 AiPyPro Pro v5，运行在用户 Windows 终端中的 AI 编码助手。
可直接读写文件、执行命令、搜索代码。可用工具: read_file, write_file, edit_file, delete_file, rename_file, list_dir, glob, search_content, grep, exec, run_code, web_search, web_fetch, project_info, git。

行为守则:
1. 直接执行用户指令，不要教用户如何操作。
2. 写 .html 文件后自动用 exec 打开预览。
3. 回复简洁准确，用中文。
4. 直接调用工具函数，不要用文字描述工具调用。
5. 使用纯文本，不要用 Markdown 格式（不用 **加粗**、- 列表、# 标题）。代码块用 \`\`\`语言 包裹。
6. 文件写入当前工作目录，不要写桌面或系统目录。
7. 大文件代码会由系统自动保存并重命名到目标路径，无需重复调用 write_file。

${projectCtx.hasContext ? `\n## 项目上下文\n${projectCtx.context}` : ''}
`;
```

- [ ] **步骤 4：修改 index.js 添加项目信息命令**

在 `handleCommand` 函数中添加 `/project` 命令：

```javascript
if (first === '/project') {
  const { getProjectInfo, findProjectRoot } = require('./lib/context-project');
  const root = findProjectRoot();
  const info = getProjectInfo(root);
  console.log(`\n  ${ui.C.accent}${ui.C.bold}项目信息${ui.C.reset}`);
  console.log(`  ${ui.C.muted}名称:   ${info.name}${ui.C.reset}`);
  console.log(`  ${ui.C.muted}类型:   ${info.type}${ui.C.reset}`);
  console.log(`  ${ui.C.muted}根目录: ${info.root}${ui.C.reset}`);
  console.log(`  ${ui.C.muted}AGENTS.md: ${info.hasAgentsMd ? '✓' : '✗'}${ui.C.reset}`);
  console.log(`  ${ui.C.muted}项目配置: ${info.hasProjectConfig ? '✓' : '✗'}${ui.C.reset}`);
  console.log('');
  rl.prompt();
  return true;
}
```

- [ ] **步骤 5：运行测试验证**

运行：`node test_all.js`
预期：所有现有测试通过

---

## 阶段三：Diff 可视化 + 交互式编辑

### 任务 4：Diff 可视化模块

**文件：**
- 创建：`lib/diff.js`
- 修改：`lib/plugins/edit.js:1-26`（添加 diff 显示）
- 修改：`lib/plugins/write.js:1-17`（添加 diff 显示）
- 修改：`lib/ui.js:200-212`（添加 diff 渲染）

- [ ] **步骤 1：创建 diff.js 模块**

```javascript
// lib/diff.js — Diff 可视化模块

// 简单的行级 diff 算法
function computeDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const diff = [];

  // 简单的 LCS 算法
  const lcs = longestCommonSubsequence(oldLines, newLines);
  let oldIdx = 0, newIdx = 0, lcsIdx = 0;

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    if (lcsIdx < lcs.length) {
      // 输出删除的行
      while (oldIdx < oldLines.length && oldLines[oldIdx] !== lcs[lcsIdx]) {
        diff.push({ type: 'remove', line: oldLines[oldIdx], oldLine: oldIdx + 1 });
        oldIdx++;
      }
      // 输出新增的行
      while (newIdx < newLines.length && newLines[newIdx] !== lcs[lcsIdx]) {
        diff.push({ type: 'add', line: newLines[newIdx], newLine: newIdx + 1 });
        newIdx++;
      }
      // 输出相同的行
      if (lcsIdx < lcs.length) {
        diff.push({ type: 'same', line: lcs[lcsIdx], oldLine: oldIdx + 1, newLine: newIdx + 1 });
        oldIdx++;
        newIdx++;
        lcsIdx++;
      }
    } else {
      // 剩余的行
      while (oldIdx < oldLines.length) {
        diff.push({ type: 'remove', line: oldLines[oldIdx], oldLine: oldIdx + 1 });
        oldIdx++;
      }
      while (newIdx < newLines.length) {
        diff.push({ type: 'add', line: newLines[newIdx], newLine: newIdx + 1 });
        newIdx++;
      }
    }
  }

  return diff;
}

function longestCommonSubsequence(a, b) {
  const m = a.length, n = b.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // 回溯构建 LCS
  const lcs = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      lcs.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return lcs;
}

// 格式化 diff 为可显示的字符串
function formatDiff(diff, options = {}) {
  const { contextLines = 3, showLineNumbers = true } = options;
  const lines = [];
  let lastShownLine = -1;

  for (let i = 0; i < diff.length; i++) {
    const item = diff[i];
    
    // 显示上下文
    if (item.type !== 'same') {
      // 显示前几行上下文
      const start = Math.max(0, i - contextLines);
      for (let j = start; j < i; j++) {
        if (diff[j].type === 'same' && diff[j].oldLine > lastShownLine) {
          lines.push(`  ${showLineNumbers ? String(diff[j].oldLine).padStart(4) + ' ' : ''}  ${diff[j].line}`);
          lastShownLine = diff[j].oldLine;
        }
      }
    }

    if (item.type === 'add') {
      lines.push(`+ ${showLineNumbers ? String(item.newLine).padStart(4) + ' ' : ''}${item.line}`);
    } else if (item.type === 'remove') {
      lines.push(`- ${showLineNumbers ? String(item.oldLine).padStart(4) + ' ' : ''}${item.line}`);
    } else if (item.type === 'same') {
      if (item.oldLine > lastShownLine) {
        lines.push(`  ${showLineNumbers ? String(item.oldLine).padStart(4) + ' ' : ''}  ${item.line}`);
        lastShownLine = item.oldLine;
      }
    }
  }

  return lines.join('\n');
}

// 获取 diff 统计
function getDiffStats(diff) {
  let added = 0, removed = 0, unchanged = 0;
  for (const item of diff) {
    if (item.type === 'add') added++;
    else if (item.type === 'remove') removed++;
    else unchanged++;
  }
  return { added, removed, unchanged, total: added + removed + unchanged };
}

module.exports = { computeDiff, formatDiff, getDiffStats };
```

- [ ] **步骤 2：修改 edit.js 添加 diff 显示**

```javascript
// lib/plugins/edit.js — 修改后的版本
const fs = require('fs');
const path = require('path');
const { computeDiff, formatDiff, getDiffStats } = require('../diff');

module.exports = {
  name: 'edit_file',
  desc: '精确替换文件内容（old_str 必须唯一）',
  schema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      old_str: { type: 'string' },
      new_str: { type: 'string' },
      confirm: { type: 'boolean', description: '是否确认应用更改' },
    },
    required: ['path', 'old_str', 'new_str'],
  },
  exec: (args) => {
    if (!args?.path) return '请提供 path 参数';
    const fp = path.resolve(args.path);
    if (!fs.existsSync(fp)) return `文件不存在: ${args.path}`;
    const content = fs.readFileSync(fp, 'utf8');
    const esc = args.old_str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(esc, 'g');
    const matches = [...content.matchAll(regex)];
    
    if (matches.length === 0) {
      const idx = content.toLowerCase().indexOf(args.old_str.substring(0, 30).toLowerCase());
      if (idx >= 0) return `old_str 未精确匹配。附近: ...${content.substring(Math.max(0, idx - 20), idx + 60)}...`;
      return '未找到匹配文本';
    }
    if (matches.length > 1) return `匹配 ${matches.length} 处，不是唯一匹配。请包含更多上下文`;
    
    const newContent = content.replace(regex, () => args.new_str || '');
    
    // 生成 diff
    const diff = computeDiff(content, newContent);
    const stats = getDiffStats(diff);
    
    // 如果未确认，返回 diff 预览
    if (!args.confirm) {
      const diffStr = formatDiff(diff, { contextLines: 2, showLineNumbers: true });
      return `[预览] ${stats.added} 行新增, ${stats.removed} 行删除\n${diffStr}\n\n确认应用? 设置 confirm=true 执行`;
    }
    
    // 确认后执行
    fs.writeFileSync(fp, newContent, 'utf8');
    return `OK 已编辑 ${args.path} (+${stats.added} -${stats.removed})`;
  },
};
```

- [ ] **步骤 3：修改 write.js 添加 diff 显示**

```javascript
// lib/plugins/write.js — 修改后的版本
const fs = require('fs');
const path = require('path');
const { computeDiff, formatDiff, getDiffStats } = require('../diff');

module.exports = {
  name: 'write_file',
  desc: '写文件（创建或覆盖）',
  schema: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
      confirm: { type: 'boolean', description: '是否确认写入' },
    },
    required: ['path', 'content'],
  },
  exec: (args) => {
    if (!args?.path) return '请提供 path 参数';
    if (!args?.content) return '请提供 content 参数（文件内容不能为空）';
    const fp = path.resolve(args.path);
    const dir = path.dirname(fp);
    
    // 如果文件已存在，显示 diff
    if (fs.existsSync(fp)) {
      const oldContent = fs.readFileSync(fp, 'utf8');
      const diff = computeDiff(oldContent, args.content);
      const stats = getDiffStats(diff);
      
      if (!args.confirm) {
        const diffStr = formatDiff(diff, { contextLines: 2, showLineNumbers: true });
        return `[预览] 文件已存在，${stats.added} 行新增, ${stats.removed} 行删除\n${diffStr}\n\n确认覆盖? 设置 confirm=true 执行`;
      }
    }
    
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fp, args.content || '', 'utf8');
    const actualSize = fs.statSync(fp).size;
    return `OK 已写入 ${args.path} (${actualSize} 字符)`;
  },
};
```

- [ ] **步骤 4：修改 ui.js 添加 diff 渲染**

在 `lib/ui.js` 中添加 diff 渲染函数：

```javascript
// 在 module.exports 前添加
function renderDiffLine(line) {
  if (line.startsWith('+')) {
    return `${C.green}${line}${C.reset}`;
  } else if (line.startsWith('-')) {
    return `${C.red}${line}${C.reset}`;
  } else if (line.startsWith('@@')) {
    return `${C.cyan}${line}${C.reset}`;
  }
  return `${C.dim}${line}${C.reset}`;
}

function showDiff(diffStr) {
  const lines = diffStr.split('\n');
  for (const line of lines) {
    console.log(`  ${renderDiffLine(line)}`);
  }
}

// 添加到 module.exports
module.exports = {
  // ... 现有导出 ...
  renderDiffLine, showDiff,
};
```

- [ ] **步骤 5：运行测试验证**

运行：`node test_all.js`
预期：所有现有测试通过

---

### 任务 5：交互式编辑模块

**文件：**
- 创建：`lib/interactive.js`
- 修改：`lib/agent.js:367-531`（集成交互式编辑）
- 修改：`lib/plugins/edit.js`（支持交互模式）

- [ ] **步骤 1：创建 interactive.js 模块**

```javascript
// lib/interactive.js — 交互式编辑模块
const readline = require('readline');
const ui = require('./ui');

// 交互式编辑选项
const EDIT_OPTIONS = [
  { key: '1', label: '查看完整文件', action: 'view' },
  { key: '2', label: '选择行范围编辑', action: 'range' },
  { key: '3', label: '搜索并替换', action: 'replace' },
  { key: '4', label: '在指定位置插入', action: 'insert' },
  { key: '5', label: '确认当前更改', action: 'confirm' },
  { key: '6', label: '取消', action: 'cancel' },
];

// 创建交互式 readline
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
}

// 显示文件内容（带行号）
function showFileContent(content, options = {}) {
  const { startLine = 1, endLine = null, highlight = null } = options;
  const lines = content.split('\n');
  const end = endLine || lines.length;
  
  console.log(`\n  ${ui.C.accent}${ui.C.bold}文件内容${ui.C.reset}`);
  console.log(`  ${ui.C.dim}${'─'.repeat(40)}${ui.C.reset}`);
  
  for (let i = startLine - 1; i < Math.min(end, lines.length); i++) {
    const lineNum = String(i + 1).padStart(4);
    const line = lines[i];
    
    // 高亮匹配行
    if (highlight && line.toLowerCase().includes(highlight.toLowerCase())) {
      console.log(`  ${ui.C.green}${lineNum}${ui.C.reset} ${ui.C.green}${line}${ui.C.reset}`);
    } else {
      console.log(`  ${ui.C.dim}${lineNum}${ui.C.reset} ${line}`);
    }
  }
  
  console.log(`  ${ui.C.dim}${'─'.repeat(40)}${ui.C.reset}`);
  console.log(`  ${ui.C.dim}共 ${lines.length} 行${ui.C.reset}\n`);
}

// 显示编辑菜单
function showEditMenu() {
  console.log(`\n  ${ui.C.accent}${ui.C.bold}编辑选项${ui.C.reset}`);
  for (const opt of EDIT_OPTIONS) {
    console.log(`  ${ui.C.muted}${opt.key}${ui.C.reset} ${opt.label}`);
  }
  console.log('');
}

// 获取用户选择
async function getUserChoice(rl, prompt = '选择操作: ') {
  return new Promise((resolve) => {
    rl.question(`  ${ui.C.amber}${prompt}${ui.C.reset}`, (answer) => {
      resolve(answer.trim());
    });
  });
}

// 获取行范围
async function getLineRange(rl, totalLines) {
  return new Promise((resolve) => {
    rl.question(`  ${ui.C.amber}行范围 (如 1-10 或 5): ${ui.C.reset}`, (answer) => {
      const parts = answer.split('-').map(Number);
      if (parts.length === 1 && !isNaN(parts[0])) {
        resolve({ start: parts[0], end: parts[0] });
      } else if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        resolve({ start: Math.max(1, parts[0]), end: Math.min(totalLines, parts[1]) });
      } else {
        resolve({ start: 1, end: totalLines });
      }
    });
  });
}

// 获取搜索替换参数
async function getReplaceParams(rl) {
  return new Promise((resolve) => {
    rl.question(`  ${ui.C.amber}搜索文本: ${ui.C.reset}`, (search) => {
      rl.question(`  ${ui.C.amber}替换为: ${ui.C.reset}`, (replace) => {
        resolve({ search, replace });
      });
    });
  });
}

// 获取插入位置和内容
async function getInsertParams(rl, totalLines) {
  return new Promise((resolve) => {
    rl.question(`  ${ui.C.amber}插入位置 (行号): ${ui.C.reset}`, (pos) => {
      const lineNum = parseInt(pos) || totalLines;
      console.log(`  ${ui.C.dim}输入内容（空行结束）:${ui.C.reset}`);
      const lines = [];
      const readLine = () => {
        rl.question(`  ${ui.C.muted}> ${ui.C.reset}`, (line) => {
          if (line === '') {
            resolve({ position: lineNum, content: lines.join('\n') });
          } else {
            lines.push(line);
            readLine();
          }
        });
      };
      readLine();
    });
  });
}

// 交互式编辑主流程
async function interactiveEdit(filePath, content) {
  const rl = createInterface();
  let currentContent = content;
  let changes = [];
  
  console.log(`\n  ${ui.C.accent}${ui.C.bold}交互式编辑模式${ui.C.reset}`);
  console.log(`  ${ui.C.dim}文件: ${filePath}${ui.C.reset}`);
  
  showFileContent(currentContent);
  
  let running = true;
  while (running) {
    showEditMenu();
    const choice = await getUserChoice(rl);
    
    switch (choice) {
      case '1': // 查看完整文件
        showFileContent(currentContent);
        break;
        
      case '2': // 选择行范围编辑
        const range = await getLineRange(rl, currentContent.split('\n').length);
        const lines = currentContent.split('\n');
        const selectedLines = lines.slice(range.start - 1, range.end);
        console.log(`\n  ${ui.C.accent}选中行 ${range.start}-${range.end}:${ui.C.reset}`);
        selectedLines.forEach((l, i) => {
          console.log(`  ${ui.C.dim}${String(range.start + i).padStart(4)}${ui.C.reset} ${l}`);
        });
        // 这里可以添加更复杂的编辑逻辑
        break;
        
      case '3': // 搜索并替换
        const { search, replace } = await getReplaceParams(rl);
        if (search) {
          const count = (currentContent.match(new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
          if (count > 0) {
            currentContent = currentContent.split(search).join(replace);
            changes.push({ type: 'replace', search, replace, count });
            console.log(`  ${ui.C.green}✓ 替换了 ${count} 处${ui.C.reset}`);
            showFileContent(currentContent);
          } else {
            console.log(`  ${ui.C.orange}未找到匹配文本${ui.C.reset}`);
          }
        }
        break;
        
      case '4': // 在指定位置插入
        const insertParams = await getInsertParams(rl, currentContent.split('\n').length);
        if (insertParams.content) {
          const lines = currentContent.split('\n');
          lines.splice(insertParams.position - 1, 0, insertParams.content);
          currentContent = lines.join('\n');
          changes.push({ type: 'insert', position: insertParams.position, content: insertParams.content });
          console.log(`  ${ui.C.green}✓ 已在第 ${insertParams.position} 行插入${ui.C.reset}`);
          showFileContent(currentContent);
        }
        break;
        
      case '5': // 确认当前更改
        if (changes.length > 0) {
          console.log(`\n  ${ui.C.green}${ui.C.bold}确认应用 ${changes.length} 项更改${ui.C.reset}`);
          running = false;
        } else {
          console.log(`  ${ui.C.orange}没有待应用的更改${ui.C.reset}`);
        }
        break;
        
      case '6': // 取消
        console.log(`  ${ui.C.orange}已取消编辑${ui.C.reset}`);
        currentContent = content; // 恢复原始内容
        running = false;
        break;
        
      default:
        console.log(`  ${ui.C.orange}无效选择${ui.C.reset}`);
    }
  }
  
  rl.close();
  return { content: currentContent, changes };
}

module.exports = { interactiveEdit, showFileContent, showEditMenu };
```

- [ ] **步骤 2：修改 agent.js 集成交互式编辑**

在 `lib/agent.js` 中添加交互式编辑支持：

```javascript
// 在 callAI 函数中，修改 write_file 处理逻辑
if (tc.name === 'write_file' && parsed.path && parsed.content) {
  // 检查是否需要交互式编辑
  if (parsed.interactive && fs.existsSync(path.resolve(parsed.path))) {
    const { interactiveEdit } = require('./interactive');
    const oldContent = fs.readFileSync(path.resolve(parsed.path), 'utf8');
    const result = await interactiveEdit(parsed.path, oldContent);
    if (result.changes.length > 0) {
      parsed.content = result.content;
    } else {
      lastOutput = '交互式编辑已取消';
      ui.tLine(tc.name, 'err');
      messages.push({ role: 'tool', tool_call_id: toolCallId, content: lastOutput });
      return;
    }
  }
}
```

- [ ] **步骤 3：修改 edit.js 支持交互模式**

在 `lib/plugins/edit.js` 中添加交互式编辑支持：

```javascript
// 在 schema 中添加 interactive 属性
schema: {
  type: 'object',
  properties: {
    path: { type: 'string' },
    old_str: { type: 'string' },
    new_str: { type: 'string' },
    confirm: { type: 'boolean', description: '是否确认应用更改' },
    interactive: { type: 'boolean', description: '是否启用交互式编辑' },
  },
  required: ['path', 'old_str', 'new_str'],
},
```

- [ ] **步骤 4：修改 index.js 添加交互式编辑命令**

在 `handleCommand` 函数中添加 `/edit` 命令：

```javascript
if (first === '/edit') {
  const parts = s.split(/\s+/);
  if (parts.length >= 2) {
    const filePath = parts[1];
    const fs = require('fs');
    const path = require('path');
    const fp = path.resolve(filePath);
    if (!fs.existsSync(fp)) {
      ui.er(`文件不存在: ${filePath}`);
    } else {
      const content = fs.readFileSync(fp, 'utf8');
      const { interactiveEdit } = require('./lib/interactive');
      interactiveEdit(fp, content).then(result => {
        if (result.changes.length > 0) {
          fs.writeFileSync(fp, result.content, 'utf8');
          ui.ok(`已保存 ${result.changes.length} 项更改到 ${filePath}`);
        }
      });
    }
  } else {
    ui.info('用法: /edit <文件路径>');
  }
  rl.prompt();
  return true;
}
```

- [ ] **步骤 5：运行测试验证**

运行：`node test_all.js`
预期：所有现有测试通过

---

## 阶段四：MCP 集成

### 任务 6：MCP 客户端模块

**文件：**
- 创建：`lib/mcp.js`
- 修改：`lib/tools.js:1-84`（集成 MCP 工具）
- 修改：`lib/config.js:12-19`（添加 MCP 配置）

- [ ] **步骤 1：创建 mcp.js 模块**

```javascript
// lib/mcp.js — MCP 客户端模块
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const { CFG } = require('./config');

// MCP 服务器配置
const DEFAULT_MCP_SERVERS = {
  filesystem: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
  },
  fetch: {
    command: 'npx',
    args: ['-y', '@anthropic/mcp-fetch'],
  },
};

class MCPManager {
  constructor() {
    this.clients = new Map();
    this.tools = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    const servers = CFG.mcpServers || DEFAULT_MCP_SERVERS;
    
    for (const [name, config] of Object.entries(servers)) {
      try {
        await this.connectServer(name, config);
      } catch (e) {
        console.warn(`MCP 服务器 ${name} 连接失败: ${e.message}`);
      }
    }
    
    this.initialized = true;
  }

  async connectServer(name, config) {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      env: { ...process.env, ...config.env },
    });

    const client = new Client({
      name: `aipypro-${name}`,
      version: '5.0.0',
    }, {
      capabilities: {},
    });

    await client.connect(transport);
    this.clients.set(name, client);

    // 获取服务器提供的工具
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const toolName = `mcp_${name}_${tool.name}`;
      this.tools.set(toolName, {
        name: toolName,
        desc: `[MCP:${name}] ${tool.description}`,
        schema: tool.inputSchema,
        server: name,
        originalName: tool.name,
        exec: async (args) => {
          try {
            const result = await client.callTool({
              name: tool.name,
              arguments: args,
            });
            return result.content?.[0]?.text || JSON.stringify(result);
          } catch (e) {
            return `MCP 工具执行错误: ${e.message}`;
          }
        },
      });
    }
  }

  async disconnectAll() {
    for (const [name, client] of this.clients) {
      try {
        await client.close();
      } catch {}
    }
    this.clients.clear();
    this.tools.clear();
    this.initialized = false;
  }

  getTools() {
    return Array.from(this.tools.values());
  }

  getTool(name) {
    return this.tools.get(name);
  }

  listServers() {
    return Array.from(this.clients.keys());
  }
}

// 单例
const mcpManager = new MCPManager();

module.exports = { mcpManager, MCPManager };
```

- [ ] **步骤 2：修改 tools.js 集成 MCP 工具**

```javascript
// lib/tools.js — 修改后的版本
const fs = require('fs');
const path = require('path');
const { mcpManager } = require('./mcp');

const PLUGIN_DIR = path.join(__dirname, 'plugins');

class ToolSystem {
  constructor() {
    this.tools = [];
    this.mcpTools = [];
    this._loadPlugins();
    this._initMCP();
  }

  async _initMCP() {
    try {
      await mcpManager.initialize();
      this.mcpTools = mcpManager.getTools();
      // 将 MCP 工具转换为 OpenAI 格式
      for (const tool of this.mcpTools) {
        tool.openaiSchema = {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.desc,
            parameters: tool.schema || { type: 'object', properties: {} },
          },
        };
      }
    } catch (e) {
      console.warn('MCP 初始化失败:', e.message);
    }
  }

  // ... 现有 _loadPlugins 方法 ...

  getSchemas() {
    const localSchemas = this.tools.map(t => t.openaiSchema);
    const mcpSchemas = this.mcpTools.map(t => t.openaiSchema);
    return [...localSchemas, ...mcpSchemas];
  }

  async execute(name, args) {
    // 先查找本地工具
    const localTool = this.tools.find(t => t.name === name);
    if (localTool) {
      try {
        return await localTool.exec(args);
      } catch (e) {
        return `执行错误: ${e.message}`;
      }
    }

    // 查找 MCP 工具
    const mcpTool = this.mcpTools.find(t => t.name === name);
    if (mcpTool) {
      try {
        return await mcpTool.exec(args);
      } catch (e) {
        return `MCP 工具执行错误: ${e.message}`;
      }
    }

    return `未知工具: ${name}`;
  }

  // ... 其他方法 ...
}

module.exports = ToolSystem;
```

- [ ] **步骤 3：修改 config.js 添加 MCP 配置**

```javascript
// 在 DEFAULT_CONFIG 中添加
const DEFAULT_CONFIG = {
  // ... 现有配置 ...
  mcpServers: {
    filesystem: {
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
    },
    fetch: {
      command: 'npx',
      args: ['-y', '@anthropic/mcp-fetch'],
    },
  },
};
```

- [ ] **步骤 4：修改 index.js 添加 MCP 管理命令**

在 `handleCommand` 函数中添加 `/mcp` 命令：

```javascript
if (first === '/mcp') {
  const { mcpManager } = require('./lib/mcp');
  const servers = mcpManager.listServers();
  const tools = mcpManager.getTools();
  
  console.log(`\n  ${ui.C.accent}${ui.C.bold}MCP 服务器${ui.C.reset}`);
  if (servers.length === 0) {
    console.log(`  ${ui.C.dim}无已连接的服务器${ui.C.reset}`);
  } else {
    for (const server of servers) {
      console.log(`  ${ui.C.green}✓${ui.C.reset} ${server}`);
    }
  }
  
  console.log(`\n  ${ui.C.accent}${ui.C.bold}MCP 工具 (${tools.length})${ui.C.reset}`);
  for (const tool of tools) {
    console.log(`  ${ui.C.muted}◆${ui.C.reset} ${tool.name} - ${tool.desc}`);
  }
  console.log('');
  rl.prompt();
  return true;
}
```

- [ ] **步骤 5：安装 MCP SDK 依赖**

运行：`npm install @modelcontextprotocol/sdk`
预期：依赖安装成功

- [ ] **步骤 6：运行测试验证**

运行：`node test_all.js`
预期：所有现有测试通过

---

## 阶段五：子代理系统

### 任务 7：子代理调度模块

**文件：**
- 创建：`lib/subagent.js`
- 修改：`lib/agent.js:367-531`（集成子代理调度）
- 修改：`lib/tools.js:1-84`（添加子代理工具）

- [ ] **步骤 1：创建 subagent.js 模块**

```javascript
// lib/subagent.js — 子代理调度模块
const { EventEmitter } = require('events');
const { callAI } = require('./agent');
const ui = require('./ui');

// 子代理状态
const STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

class SubAgent extends EventEmitter {
  constructor(id, task, options = {}) {
    super();
    this.id = id;
    this.task = task;
    this.status = STATUS.PENDING;
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.options = {
      timeout: options.timeout || 300000, // 5 分钟
      maxTokens: options.maxTokens || 4096,
      tools: options.tools !== false,
      ...options,
    };
  }

  async run() {
    this.status = STATUS.RUNNING;
    this.startTime = Date.now();
    this.emit('start', this);

    try {
      // 创建子代理的消息历史
      const messages = [
        { role: 'system', content: `你是子代理 ${this.id}，负责执行以下任务：\n${this.task}` },
        { role: 'user', content: this.task },
      ];

      // 调用 AI 执行任务
      this.result = await callAI(messages, {
        maxTokens: this.options.maxTokens,
        tools: this.options.tools,
      });

      this.status = STATUS.COMPLETED;
      this.endTime = Date.now();
      this.emit('complete', this);
    } catch (e) {
      this.error = e;
      this.status = STATUS.FAILED;
      this.endTime = Date.now();
      this.emit('error', this);
    }

    return this;
  }

  cancel() {
    this.status = STATUS.CANCELLED;
    this.endTime = Date.now();
    this.emit('cancel', this);
  }

  getDuration() {
    if (!this.startTime) return 0;
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }

  toJSON() {
    return {
      id: this.id,
      task: this.task,
      status: this.status,
      result: this.result,
      error: this.error?.message,
      duration: this.getDuration(),
    };
  }
}

class SubAgentManager extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map();
    this.maxConcurrent = 5;
    this.running = 0;
  }

  async spawn(task, options = {}) {
    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agent = new SubAgent(id, task, options);

    this.agents.set(id, agent);

    // 监听事件
    agent.on('start', () => {
      this.running++;
      this.emit('agentStart', agent);
    });

    agent.on('complete', () => {
      this.running--;
      this.emit('agentComplete', agent);
    });

    agent.on('error', () => {
      this.running--;
      this.emit('agentError', agent);
    });

    agent.on('cancel', () => {
      this.running--;
      this.emit('agentCancel', agent);
    });

    // 并发控制
    if (this.running >= this.maxConcurrent) {
      await new Promise(resolve => {
        const check = () => {
          if (this.running < this.maxConcurrent) {
            resolve();
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    }

    // 启动子代理
    agent.run();
    return agent;
  }

  async spawnParallel(tasks, options = {}) {
    const agents = await Promise.all(
      tasks.map(task => this.spawn(task, options))
    );
    return agents;
  }

  getAgent(id) {
    return this.agents.get(id);
  }

  listAgents() {
    return Array.from(this.agents.values());
  }

  getStats() {
    const agents = this.listAgents();
    return {
      total: agents.length,
      running: agents.filter(a => a.status === STATUS.RUNNING).length,
      completed: agents.filter(a => a.status === STATUS.COMPLETED).length,
      failed: agents.filter(a => a.status === STATUS.FAILED).length,
    };
  }

  cancelAll() {
    for (const agent of this.agents.values()) {
      if (agent.status === STATUS.RUNNING) {
        agent.cancel();
      }
    }
  }
}

// 单例
const subAgentManager = new SubAgentManager();

module.exports = { SubAgent, SubAgentManager, subAgentManager, STATUS };
```

- [ ] **步骤 2：修改 tools.js 添加子代理工具**

在 `lib/tools.js` 中添加子代理工具：

```javascript
// 在 _loadPlugins 方法后添加
_addSubAgentTools() {
  const subAgentTools = [
    {
      name: 'spawn_subagent',
      desc: '创建子代理执行独立任务',
      schema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: '任务描述' },
          timeout: { type: 'integer', description: '超时时间(毫秒)' },
        },
        required: ['task'],
      },
      exec: async (args) => {
        const { subAgentManager } = require('./subagent');
        const agent = await subAgentManager.spawn(args.task, {
          timeout: args.timeout,
        });
        return `子代理 ${agent.id} 已启动，状态: ${agent.status}`;
      },
    },
    {
      name: 'list_subagents',
      desc: '列出所有子代理',
      schema: { type: 'object', properties: {} },
      exec: async () => {
        const { subAgentManager, STATUS } = require('./subagent');
        const agents = subAgentManager.listAgents();
        if (agents.length === 0) return '无子代理';
        return agents.map(a => `${a.id}: ${a.status} - ${a.task.substring(0, 50)}`).join('\n');
      },
    },
    {
      name: 'get_subagent_result',
      desc: '获取子代理结果',
      schema: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: '子代理 ID' },
        },
        required: ['agent_id'],
      },
      exec: async (args) => {
        const { subAgentManager } = require('./subagent');
        const agent = subAgentManager.getAgent(args.agent_id);
        if (!agent) return `子代理 ${args.agent_id} 不存在`;
        return JSON.stringify(agent.toJSON(), null, 2);
      },
    },
    {
      name: 'cancel_subagent',
      desc: '取消子代理',
      schema: {
        type: 'object',
        properties: {
          agent_id: { type: 'string', description: '子代理 ID' },
        },
        required: ['agent_id'],
      },
      exec: async (args) => {
        const { subAgentManager } = require('./subagent');
        const agent = subAgentManager.getAgent(args.agent_id);
        if (!agent) return `子代理 ${args.agent_id} 不存在`;
        agent.cancel();
        return `子代理 ${args.agent_id} 已取消`;
      },
    },
  ];

  // 添加到 tools 数组
  for (const tool of subAgentTools) {
    tool.openaiSchema = {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.desc,
        parameters: tool.schema,
      },
    };
    this.tools.push(tool);
  }
}
```

在构造函数中调用：

```javascript
constructor() {
  this.tools = [];
  this.mcpTools = [];
  this._loadPlugins();
  this._addSubAgentTools(); // 新增
  this._initMCP();
}
```

- [ ] **步骤 3：修改 agent.js 集成子代理调度**

在 `lib/agent.js` 中添加子代理支持：

```javascript
// 在 callAI 函数中，添加子代理工具调用处理
if (tc.name === 'spawn_subagent') {
  const { subAgentManager } = require('./subagent');
  const agent = await subAgentManager.spawn(parsed.task, {
    timeout: parsed.timeout,
  });
  
  // 等待子代理完成（可选）
  if (parsed.wait) {
    ui.tOut(`等待子代理 ${agent.id} 完成...`);
    await new Promise(resolve => {
      agent.on('complete', resolve);
      agent.on('error', resolve);
      agent.on('cancel', resolve);
    });
  }
  
  lastOutput = JSON.stringify(agent.toJSON(), null, 2);
  ui.tLine(tc.name, 'done');
  messages.push({ role: 'tool', tool_call_id: toolCallId, content: lastOutput.substring(0, 4000) });
  return;
}
```

- [ ] **步骤 4：修改 index.js 添加子代理管理命令**

在 `handleCommand` 函数中添加 `/agents` 命令：

```javascript
if (first === '/agents') {
  const { subAgentManager } = require('./lib/subagent');
  const stats = subAgentManager.getStats();
  const agents = subAgentManager.listAgents();
  
  console.log(`\n  ${ui.C.accent}${ui.C.bold}子代理统计${ui.C.reset}`);
  console.log(`  ${ui.C.muted}总计:   ${stats.total}${ui.C.reset}`);
  console.log(`  ${ui.C.muted}运行中: ${stats.running}${ui.C.reset}`);
  console.log(`  ${ui.C.muted}完成:   ${stats.completed}${ui.C.reset}`);
  console.log(`  ${ui.C.muted}失败:   ${stats.failed}${ui.C.reset}`);
  
  if (agents.length > 0) {
    console.log(`\n  ${ui.C.accent}${ui.C.bold}子代理列表${ui.C.reset}`);
    for (const agent of agents.slice(-10)) {
      const status = agent.status === 'running' ? `${ui.C.green}●` :
                     agent.status === 'completed' ? `${ui.C.green}✓` :
                     agent.status === 'failed' ? `${ui.C.red}✗` : `${ui.C.dim}○`;
      console.log(`  ${status} ${ui.C.muted}${agent.id}${ui.C.reset} ${agent.task.substring(0, 40)}...`);
    }
  }
  console.log('');
  rl.prompt();
  return true;
}
```

- [ ] **步骤 5：运行测试验证**

运行：`node test_all.js`
预期：所有现有测试通过

---

## 阶段六：集成测试与文档

### 任务 8：集成测试

**文件：**
- 修改：`test_all.js:1-90`（添加新模块测试）
- 创建：`test_v5.js`（v5 新功能测试）

- [ ] **步骤 1：创建 test_v5.js 测试文件**

```javascript
// test_v5.js — AiPyPro Pro v5 新功能测试
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅', name); }
  catch (e) { failed++; console.log('  ❌', name, '-', e.message); }
}

// ── cost.js ──
console.log('\n📦 cost.js');
const { recordUsage, getSessionStats, resetSessionStats, getModelPricing } = require('./lib/cost');
test('recordUsage 返回成本', () => {
  resetSessionStats();
  const result = recordUsage('deepseek-v4-flash', 1000, 500);
  assert.ok(result.cost >= 0);
  assert.ok(result.total >= 0);
});
test('getSessionStats 返回统计', () => {
  const stats = getSessionStats();
  assert.ok(typeof stats.inputTokens === 'number');
  assert.ok(typeof stats.outputTokens === 'number');
  assert.ok(typeof stats.cost === 'number');
});
test('getModelPricing 返回定价', () => {
  const pricing = getModelPricing('deepseek-v4-flash');
  assert.ok(pricing.input >= 0);
  assert.ok(pricing.output >= 0);
});

// ── fallback.js ──
console.log('\n📦 fallback.js');
const { initFallback, getModel, shouldFallback, getNextModel, resetToPrimary } = require('./lib/fallback');
test('initFallback 初始化', () => {
  initFallback();
  assert.ok(getModel());
});
test('shouldFallback 检测错误', () => {
  assert.ok(shouldFallback(new Error('rate limit exceeded')));
  assert.ok(shouldFallback(new Error('429')));
  assert.ok(!shouldFallback(new Error('success')));
});
test('getNextModel 返回下一个模型', () => {
  resetToPrimary();
  const next = getNextModel();
  assert.ok(next !== null);
});

// ── diff.js ──
console.log('\n📦 diff.js');
const { computeDiff, formatDiff, getDiffStats } = require('./lib/diff');
test('computeDiff 计算差异', () => {
  const diff = computeDiff('line1\nline2', 'line1\nline3');
  assert.ok(diff.length > 0);
});
test('formatDiff 格式化输出', () => {
  const diff = computeDiff('a\nb', 'a\nc');
  const formatted = formatDiff(diff);
  assert.ok(formatted.includes('+') || formatted.includes('-'));
});
test('getDiffStats 统计', () => {
  const diff = computeDiff('a\nb', 'a\nc');
  const stats = getDiffStats(diff);
  assert.ok(stats.added >= 0);
  assert.ok(stats.removed >= 0);
});

// ── context-project.js ──
console.log('\n📦 context-project.js');
const { loadProjectConfig, getProjectInfo, findProjectRoot } = require('./lib/context-project');
test('findProjectRoot 查找根目录', () => {
  const root = findProjectRoot();
  assert.ok(root);
});
test('getProjectInfo 获取项目信息', () => {
  const info = getProjectInfo(process.cwd());
  assert.ok(info.root);
  assert.ok(info.type);
});

// ── interactive.js ──
console.log('\n📦 interactive.js');
const { showFileContent } = require('./lib/interactive');
test('showFileContent 不抛异常', () => {
  try {
    showFileContent('line1\nline2\nline3');
  } catch (e) {
    assert.fail('抛异常: ' + e.message);
  }
});

// ── 总结 ──
console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${passed}  |  失败: ${failed}  |  共 ${passed + failed} 项`);
process.exit(failed > 0 ? 1 : 0);
```

- [ ] **步骤 2：运行 v5 测试**

运行：`node test_v5.js`
预期：所有测试通过

- [ ] **步骤 3：运行完整测试**

运行：`node test_all.js && node test_v5.js`
预期：所有测试通过

---

### 任务 9：文档更新

**文件：**
- 修改：`README.md:1-71`（更新功能说明）
- 修改：`ARCHITECTURE.md:1-115`（更新架构文档）

- [ ] **步骤 1：更新 README.md**

```markdown
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
```

- [ ] **步骤 2：更新 ARCHITECTURE.md**

在 ARCHITECTURE.md 末尾添加：

```markdown
## v5 新增模块

### 成本追踪 (cost.js)
- 记录每次 API 调用的 token 用量
- 计算 USD 成本（基于模型定价）
- 会话统计和历史日志

### 模型 Fallback (fallback.js)
- 主模型失败自动切换备用模型
- 支持自定义 Fallback 链
- 错误检测和模型切换逻辑

### 项目上下文 (context-project.js)
- 自动查找项目根目录
- 加载 AGENTS.md、.cursorrules 等规则文件
- 注入项目特定系统提示

### Diff 可视化 (diff.js)
- 行级 diff 算法
- 彩色 diff 显示
- 编辑前预览确认

### 交互式编辑 (interactive.js)
- 文件内容查看（带行号）
- 搜索并替换
- 行范围编辑
- 交互式菜单

### MCP 集成 (mcp.js)
- MCP 客户端管理
- 自动发现 MCP 工具
- 工具调用代理

### 子代理系统 (subagent.js)
- 子代理创建和调度
- 并发控制
- 状态管理和结果获取
```

- [ ] **步骤 3：验证文档**

检查 README.md 和 ARCHITECTURE.md 内容完整无误

---

## 完成检查清单

- [ ] 所有 9 个任务完成
- [ ] `node test_all.js` 通过
- [ ] `node test_v5.js` 通过
- [ ] 无 TypeScript 错误（如果有 TS）
- [ ] 无 ESLint 错误（如果有 lint）
- [ ] README.md 更新
- [ ] ARCHITECTURE.md 更新

---

## 执行方式

**计划已完成并保存到 `docs/superpowers/plans/2026-06-13-aipypro-v5-upgrade.md`。两种执行方式：**

**1. 子代理驱动（推荐）** - 每个任务调度一个新的子代理，任务间进行审查，快速迭代

**2. 内联执行** - 在当前会话中使用 executing-plans 执行任务，批量执行并设有检查点

**选哪种方式？**
