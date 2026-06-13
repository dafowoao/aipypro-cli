// ============================================================
// AiPyPro Pro v4 — 入口 (对话界面特大升级版)
// 新增: 多行输入 / 命令历史↑↓ / Tab补全 / /save /load /export
// ============================================================
const readline = require('readline');
const { loadConfig, CFG, CONFIG_FILE } = require('./lib/config');
const { estimateTokens, trimHistory } = require('./lib/context');
const { callAI, tools } = require('./lib/agent');
const ui = require('./lib/ui');
const history = require('./lib/history');
const { getSessionStats } = require('./lib/cost');
const { getModel, getModelChain, resetToPrimary } = require('./lib/fallback');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
let iconv = null;
try { iconv = require('iconv-lite'); } catch {}
let mcpManager;
try { mcpManager = require('./lib/mcp').mcpManager; } catch { mcpManager = null; }

if (process.platform === 'win32') {
  try { execSync('chcp 65001', { stdio: 'pipe' }); } catch {}
}
process.stdout.setDefaultEncoding('utf8');
process.stderr.setDefaultEncoding('utf8');
process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.name === 'Warning' && w.message.includes('TLS')) return; console.warn(w); });

// ─── 命令历史 ───
const cmdHistory = [];
let histIdx = -1;

// ─── 会话元数据 ───
let sessionMeta = {
  startTime: Date.now(),
  id: Date.now().toString(36),
  name: '',
};

// ─── ═══ 多行输入 ═══ ───
// 规则：
// - 输入 """ 开头 → 多行模式，以 """ 结束 或 连续空行结束
// - 单行直接回车发送
const MULTILINE_DELIM = '"""';

function isMultiLineStart(s) {
  return s.trim() === MULTILINE_DELIM;
}

function isMultiLineEnd(s) {
  return s.trim() === MULTILINE_DELIM;
}

// ─── ═══ Tab 补全 ─── ───
const COMMANDS = [
  '/help', '/tools', '/history', '/stats', '/clear', '/exit',
  '/undo', '/resume', '/save', '/load', '/export', '/tokens',
  '/model', '/session', '/config', '/fallback', '/project', '/edit',
  '/mcp', '/agents',
];

function tabComplete(partial) {
  if (!partial) return COMMANDS;
  return COMMANDS.filter(c => c.startsWith(partial));
}

// ─── ═══ 主循环 ─── ─── ───

async function main() {
  loadConfig();
  const args = process.argv.slice(2);
  const cmd = args[0] || '';
  switch (cmd) {
    case 'ask': return cmdAsk(args.slice(1).join(' '));
    case 'chat': case '': return cmdChat();
    case 'history': cmdHistoryCmd(); return;
    case 'tools': cmdTools(); return;
    case 'config': cmdConfig(args.slice(1)); return;
    case 'export': cmdExportCmd([]); return;
    case 'list': cmdListSessions(); return;
    default: showHelp();
  }
}

async function cmdAsk(q) {
  if (!q) return console.log('用法: aipypro ask <问题>');
  ui.banner(CFG.model, tools.tools.length);
  ui.userLabel();
  console.log(`  ${q}\n`);
  const msgs = [{ role: 'user', content: q }];
  try {
    await callAI(msgs);
    history.saveSession(msgs.filter(m => m.role !== 'system'));
  } catch (e) { ui.er(e.message); }
  console.log(''); ui.gap();
}

async function cmdChat() {
  ui.banner(CFG.model, tools.tools.length);
  const turnCounters = { total: 0, user: 0 };
  ui.setThread(true);
  ui.resetMsgCounter();
  // F. 欢迎消息
  const helpHint = `输入 ${ui.C.amber}"""${ui.C.reset} 多行 · ${ui.C.accent}↑↓${ui.C.reset} 历史 · ${ui.C.accent}Tab${ui.C.reset} 补全 · ${ui.C.green}/help${ui.C.reset} 更多`;
  ui.info(`/${CFG.model}  ·  ${helpHint}`);


  const chatHistory = [];
  let busy = false;

  // ─── 自定义 readline ───
  // 因 readline 不支持多行，我们模拟 TTY raw 模式实现增强输入
  const rl = readline.createInterface({
    input: process.stdin, output: process.stdout,
    prompt: `  ${ui.C.amber}>${ui.C.reset} `, terminal: true,
  });
  rl.prompt();

  // 输入历史相关
  let currentLine = '';

  rl.on('SIGINT', () => {
    console.log(`\n  ${ui.C.dim}再见${ui.C.reset}\n`);
    process.exit(0);
  });

  // 用来翻历史
  rl.input.on('keypress', (str, key) => {
    if (!key) return;
    // ↑ 历史上翻
    if (key.name === 'up' && cmdHistory.length > 0) {
      if (histIdx === -1) histIdx = cmdHistory.length - 1;
      else if (histIdx > 0) histIdx--;
      currentLine = cmdHistory[histIdx] || '';
      // G. 显示历史位置
      const posTag = ` ${ui.C.subtle}${histIdx+1}/${cmdHistory.length}${ui.C.reset}`;
      rl._deleteLine();
      rl._writeToOutput(currentLine + posTag);
      return;
    }
    // ↓ 历史下翻
    if (key.name === 'down') {
      if (histIdx >= 0 && histIdx < cmdHistory.length - 1) {
        histIdx++;
        currentLine = cmdHistory[histIdx] || '';
      } else {
        histIdx = -1;
        currentLine = '';
      }
      rl._deleteLine();
      rl._writeToOutput(currentLine);
      return;
    }
    // Tab 补全
    if (key.name === 'tab') {
      const line = rl.line;
      const word = line.split(/\s+/).pop() || '';
      const matches = tabComplete(word);
      if (matches.length === 1) {
        const rest = line.slice(0, -word.length);
        // 用后空格模拟补全
        rl._deleteLine();
        rl._writeToOutput(rest + matches[0] + ' ');
        return;
      } else if (matches.length > 1) {
        // 可选列表写到 stderr 不干扰 stdin buffer
        process.stderr.write(`\n  ${ui.C.muted}${matches.join('  ')}${ui.C.reset}\n`);
        rl._refreshLine();
        return;
      }
    }
  });

  // 用一个输入缓冲区支持多行
  const inputBuf = { lines: [], inMulti: false };

  rl.on('line', async (line) => {
    if (busy) return;

    let raw = line;
    if (!process.stdin.isTTY && iconv) {
      try { raw = iconv.decode(Buffer.from(line, 'binary'), 'gbk'); } catch {}
    }

    const s = raw.replace(/\r$/, '');

    // ─── 多行模式 ───
    if (inputBuf.inMulti) {
      if (isMultiLineEnd(s)) {
        // 结束多行
        inputBuf.inMulti = false;
        const fullText = inputBuf.lines.join('\n');
        inputBuf.lines = [];
        busy = true;
        processLine(fullText, rl, chatHistory, turnCounters);
        return;
      }
      inputBuf.lines.push(s);
      // 连续空行结束（仅多行模式下第一个非空后遇到空行退出——这里简化：遇到一个空行就存）
      if (s === '' && inputBuf.lines.length > 1) {
        // 空行=结束
        inputBuf.inMulti = false;
        // 移除最后一个空行
        if (inputBuf.lines[inputBuf.lines.length-1] === '') inputBuf.lines.pop();
        const fullText = inputBuf.lines.join('\n');
        inputBuf.lines = [];
        busy = true;
        processLine(fullText, rl, chatHistory, turnCounters);
        return;
      }
      rl.prompt();
      return;
    }

    // ─── 单行模式 ───
    const trimmed = s.trim();
    if (!trimmed) { rl.prompt(); return; }

    // 进入多行模式
    if (isMultiLineStart(trimmed)) {
      inputBuf.inMulti = true;
      inputBuf.lines = [];
      ui.info('多行模式 (输入 """ 或空行 结束)');
      rl.prompt();
      return;
    }

    // 命令处理
    if (handleCommand(trimmed, rl, chatHistory)) return;

    busy = true;
    processLine(trimmed, rl, chatHistory, turnCounters);
  });

  rl.on('close', () => {
    console.log(`\n  ${ui.C.dim}再见${ui.C.reset}\n`);
    process.exit(0);
  });
}

// ─── 处理用户输入 ───
async function processLine(s, rl, chatHistory, turnCounters) {
  // 记录历史
  cmdHistory.push(s);
  histIdx = -1;

  turnCounters.total++;
  turnCounters.user++;
  const msgNum = ui.nextMsgNum();
  const msgs = [...chatHistory, { role: 'user', content: s }];
  try {
    const startTime = Date.now();
    ui.aiLabel(msgNum);
    const reply = await callAI(msgs);
    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    // D. 显示响应耗时
    ui.elapsed(elapsedSec);

    chatHistory.length = 0;
    chatHistory.push(...msgs.filter(m => m.role !== 'system'));

    const trimmed = trimHistory(chatHistory);
    if (trimmed.length < chatHistory.length) {
      const removed = chatHistory.length - trimmed.length;
      chatHistory.length = 0;
      chatHistory.push(...trimmed);
      history.saveSession(chatHistory.filter(m => m.role !== 'system'));
      ui.bottomBar(`上下文已裁剪 (移除了 ${removed} 条)`);
    }

    // 自动保存历史
    history.saveSession(chatHistory.filter(m => m.role !== 'system'));
  } catch (e) {
    ui.er(e.message);
  }
  console.log(''); ui.gap();

  // 令牌统计信息
  const totalTokens = estimateTokens(chatHistory.map(m => {
    if (m.tool_calls) return m.tool_calls.map(tc => tc.function?.arguments || '').join(' ');
    return m.content || '';
  }).join(' '));
  const elapsed = Math.floor((Date.now() - sessionMeta.startTime) / 1000);
  // A. 上下文进度条
  ui.contextBar(totalTokens, 64000);
  const stats = getSessionStats();
  ui.status([
    {l:'消息',v:`${chatHistory.length}`,c:ui.C.muted},
    {l:'提问',v:`${turnCounters.user}`,c:ui.C.muted},
    {l:'Tokens',v:`${totalTokens}`,c:ui.C.muted},
    {l:'费用',v:`$${stats.cost.toFixed(4)}`,c:ui.C.green},
    {l:'时长',v:`${elapsed}s`,c:ui.C.subtle},
  ]);
  rl.prompt();
}

// ─── 命令处理 ───
function handleCommand(s, rl, chatHistory) {
  const first = s.split(/\s+/)[0];

  if (/^(exit|quit)$/i.test(first)) process.exit(0);
  if (first === 'clear') { console.clear(); ui.banner(CFG.model, tools.tools.length); rl.prompt(); return true; }
  if (first === '/help') { showHelp(); rl.prompt(); return true; }
  if (first === '/tools') { cmdTools(); rl.prompt(); return true; }
  if (first === '/history') { cmdHistoryCmd(); rl.prompt(); return true; }
  if (first === '/stats' || first === '/tokens') {
    const userMsgs = chatHistory.filter(m => m.role === 'user').length;
    const totalTokens = estimateTokens(chatHistory.map(m => {
      if (m.tool_calls) return m.tool_calls.map(tc => tc.function?.arguments || '').join(' ');
      return m.content || '';
    }).join(' '));
    const elapsed = Math.floor((Date.now() - sessionMeta.startTime) / 1000);
    ui.status([
      {l:'消息',v:chatHistory.length},
      {l:'提问',v:userMsgs},
      {l:'Tokens',v:totalTokens,c:ui.C.muted},
      {l:'时长',v:`${elapsed}s`,c:ui.C.subtle},
    ]);
    rl.prompt(); return true;
  }
  if (first === '/session') {
    const elapsed = Math.floor((Date.now() - sessionMeta.startTime) / 1000);
    console.log(`\n  ${ui.C.accent}${ui.C.bold}当前会话${ui.C.reset}`);
    console.log(`  ${ui.C.muted}ID:     ${sessionMeta.id}${ui.C.reset}`);
    console.log(`  ${ui.C.muted}时间:   ${new Date(sessionMeta.startTime).toLocaleString('zh-CN')}${ui.C.reset}`);
    console.log(`  ${ui.C.muted}时长:   ${elapsed}s${ui.C.reset}`);
    console.log(`  ${ui.C.muted}消息:   ${chatHistory.length}${ui.C.reset}\n`);
    rl.prompt(); return true;
  }
  if (first === '/resume' || s.startsWith('/resume ')) {
    const parts = s.split(/\s+/);
    if (parts.length >= 3) {
      const loaded = history.loadSession(parts[1], parseInt(parts[2]));
      if (loaded && loaded.length) {
        chatHistory.length = 0;
        chatHistory.push(...loaded.filter(m => m.role !== 'system'));
        ui.ok(`已恢复会话 ${parts[1]}:${parts[2]} (${chatHistory.length} 条消息)`);
      } else {
        ui.er('会话不存在');
      }
    } else {
      ui.info('用法: /resume <文件名> <序号>');
    }
    rl.prompt(); return true;
  }
  if (first === '/save' && s.length > 5) {
    const name = s.slice(6).trim();
    if (name) {
      const saved = history.saveNamed(name, chatHistory.filter(m => m.role !== 'system'));
      if (saved) ui.ok(`已保存会话 "${name}"`);
      else ui.er('保存失败');
    } else {
      ui.info('用法: /save <名称>');
    }
    rl.prompt(); return true;
  }
  if (first === '/load' && s.length > 5) {
    const name = s.slice(6).trim();
    if (name) {
      const loaded = history.loadNamed(name);
      if (loaded && loaded.length) {
        chatHistory.length = 0;
        chatHistory.push(...loaded.filter(m => m.role !== 'system'));
        ui.ok(`已加载会话 "${name}" (${chatHistory.length} 条消息)`);
      } else {
        ui.er(`未找到会话 "${name}"`);
      }
    } else {
      ui.info('用法: /load <名称>');
    }
    rl.prompt(); return true;
  }
  if (first === '/export') {
    const exportPath = cmdExportCmd(chatHistory);
    if (exportPath) ui.ok(`已导出到 ${exportPath}`);
    rl.prompt(); return true;
  }
  if (first === '/model') {
    const parts = s.split(/\s+/);
    if (parts.length >= 2) {
      const newModel = parts.slice(1).join(' ');
      try {
        const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        cfg.model = newModel;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
        CFG.model = newModel;
        ui.ok(`模型已切换为: ${newModel}`);
      } catch (e) { ui.er(e.message); }
    } else {
      console.log(`  ${ui.C.dim}当前模型: ${CFG.model}${ui.C.reset}`);
      console.log(`  ${ui.C.muted}用法: /model <模型名>${ui.C.reset}`);
    }
    rl.prompt(); return true;
  }
  if (s.startsWith('/config ') || s.startsWith('config ')) {
    const parts = s.match(/(?:[^\s"]+|"[^"]*")+/g) || s.split(/\s+/);
    const cleanParts = parts.map(p => p.startsWith('"') && p.endsWith('"') ? p.slice(1, -1) : p);
    cmdConfig(cleanParts.slice(1));
    rl.prompt(); return true;
  }
  if (/^(undo|\/undo)$/i.test(first)) {
    let removed = 0;
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      if (chatHistory[i].role === 'user') {
        const rm = chatHistory.splice(i);
        removed = rm.length;
        const preview = (rm[0]?.content || '').substring(0, 50);
        ui.ok(`已撤回 ${removed} 条: ${preview}${preview.length >= 50 ? '...' : ''}`);
        break;
      }
    }
    if (removed === 0) ui.warn('无可撤回消息');
    rl.prompt(); return true;
  }
  if (first === '/list') {
    cmdListSessions();
    rl.prompt(); return true;
  }
  if (first === '/fallback') {
    const current = getModel();
    const chain = getModelChain();
    console.log(`\n  ${ui.C.accent}${ui.C.bold}Fallback 模型链${ui.C.reset}`);
    for (let i = 0; i < chain.length; i++) {
      const marker = chain[i] === current ? `${ui.C.green} ◀ 当前${ui.C.reset}` : '';
      console.log(`  ${ui.C.dim}${i + 1}. ${chain[i]}${marker}${ui.C.reset}`);
    }
    console.log(`\n  ${ui.C.muted}当前活跃模型: ${ui.C.accent}${current}${ui.C.reset}`);
    console.log(`  ${ui.C.muted}主模型: ${CFG.model}${ui.C.reset}\n`);
    rl.prompt(); return true;
  }
  if (first === '/project') {
    const { getProjectInfo, findProjectRoot } = require('./lib/context-project');
    const root = findProjectRoot();
    const info = getProjectInfo(root);
    console.log(`\n  ${ui.C.accent}${ui.C.bold}项目信息${ui.C.reset}`);
    console.log(`  ${ui.C.muted}名称:   ${info.name}${ui.C.reset}`);
    console.log(`  ${ui.C.muted}类型:   ${info.type}${ui.C.reset}`);
    console.log(`  ${ui.C.muted}根目录: ${info.root}${ui.C.reset}`);
    console.log(`  ${ui.C.muted}AGENTS.md: ${info.hasAgentsMd ? '✓' : '✗'}${ui.C.reset}`);
    console.log(`  ${ui.C.muted}.aipypro.json: ${info.hasProjectConfig ? '✓' : '✗'}${ui.C.reset}`);
    if (info.version) console.log(`  ${ui.C.muted}版本:   ${info.version}${ui.C.reset}`);
    console.log(`  ${ui.C.muted}忽略:   ${info.ignorePatterns.join(', ')}${ui.C.reset}\n`);
    rl.prompt(); return true;
  }
  if (first === '/edit' && s.length > 6) {
    const editPath = s.slice(6).trim().replace(/^["']|["']$/g, '');
    if (!editPath) { ui.info('用法: /edit <文件路径>'); rl.prompt(); return true; }
    const fp = require('path').resolve(editPath);
    if (!fs.existsSync(fp)) { ui.er(`文件不存在: ${editPath}`); rl.prompt(); return true; }
    const { interactiveEdit } = require('./lib/interactive');
    const content = fs.readFileSync(fp, 'utf8');
    interactiveEdit(fp, content).then(result => {
      if (result.changes.length > 0) {
        fs.writeFileSync(fp, result.content, 'utf8');
        ui.ok(`已应用 ${result.changes.length} 项更改到 ${editPath}`);
      } else {
        ui.info('未做任何更改');
      }
      rl.prompt();
    }).catch(e => { ui.er(e.message); rl.prompt(); });
    return true;
  }
  if (first === '/agents') {
    const { subAgentManager } = require('./lib/subagent');
    const agents = subAgentManager.listAgents();
    const stats = subAgentManager.getStats();
    console.log(`\n  ${ui.C.accent}${ui.C.bold}子代理状态${ui.C.reset}`);
    console.log(`  ${ui.C.muted}总数: ${stats.total}  运行: ${stats.running}  完成: ${stats.completed}  失败: ${stats.failed}${ui.C.reset}`);
    if (agents.length > 0) {
      console.log(`\n  ${ui.C.accent}ID${ui.C.reset}  ${ui.C.accent}状态${ui.C.reset}  ${ui.C.accent}任务${ui.C.reset}`);
      for (const a of agents) {
        const s = a.toJSON();
        const statusIcon = s.status === 'completed' ? `${ui.C.green}✓${ui.C.reset}` :
                          s.status === 'running' ? `${ui.C.amber}●${ui.C.reset}` :
                          s.status === 'failed' ? `${ui.C.red}✗${ui.C.reset}` :
                          `${ui.C.dim}-${ui.C.reset}`;
        console.log(`  ${statusIcon} ${ui.C.dim}${s.id}${ui.C.reset}  ${s.task.substring(0, 50)}${s.task.length > 50 ? '...' : ''}`);
      }
    }
    console.log('');
    rl.prompt(); return true;
  }
  if (first === '/mcp') {
    if (!mcpManager) {
      ui.warn('MCP SDK 未安装，运行 npm install @modelcontextprotocol/sdk');
    } else if (!mcpManager.sdkAvailable) {
      ui.warn('MCP SDK 不可用（加载失败）');
    } else {
      const parts = s.split(/\s+/);
      const sub = parts[1] || 'list';
      if (sub === 'list') {
        const servers = mcpManager.listServers();
        const tools = mcpManager.getTools();
        console.log(`\n  ${ui.C.accent}${ui.C.bold}MCP 服务器${ui.C.reset}`);
        if (servers.length === 0) {
          console.log(`  ${ui.C.muted}无已连接服务器${ui.C.reset}`);
        } else {
          for (const srv of servers)
            console.log(`  ${ui.C.green}◆${ui.C.reset} ${srv}`);
        }
        console.log(`\n  ${ui.C.accent}${ui.C.bold}MCP 工具 (${tools.length}个)${ui.C.reset}`);
        for (const t of tools)
          console.log(`  ${ui.C.green}◆${ui.C.reset} ${t.name}  ${ui.C.dim}${t.desc}${ui.C.reset}`);
        console.log('');
      } else if (sub === 'disconnect') {
        mcpManager.disconnectAll().then(() => ui.ok('已断开所有 MCP 服务器'));
      } else {
        ui.info('用法: /mcp [list|disconnect]');
      }
    }
    rl.prompt(); return true;
  }

  return false; // 不是命令
}

// ─── 配置 ───
function cmdConfig(args) {
  if (args.length === 0) {
    console.log(`\n  ${ui.C.accent}${ui.C.bold}当前配置${ui.C.reset}`);
    console.log(`  ${ui.C.dim}${JSON.stringify(CFG, null, 2).split('\n').join('\n  ')}${ui.C.reset}\n`);
    console.log(`  ${ui.C.muted}用法: config set <key> <value>${ui.C.reset}`);
    return;
  }
  if (args[0] === 'set' && args[1] && args.length >= 3) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      const keys = args[1].split('.');
      let obj = cfg;
      for (let i = 0; i < keys.length - 1; i++) { if (!obj[keys[i]]) obj[keys[i]] = {}; obj = obj[keys[i]]; }
      let val = args.slice(2).join(' ');
      if (val === 'true') val = true;
      else if (val === 'false') val = false;
      else if (val === 'null') val = null;
      else if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);
      obj[keys[keys.length - 1]] = val;
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
      Object.assign(CFG, cfg);
      ui.ok(`${args[1]} = ${args[2]}`);
    } catch (e) { ui.er(e.message); }
    return;
  }
  if (args[0] === 'get' && args[1]) {
    const keys = args[1].split('.');
    let val = CFG;
    for (const k of keys) if (val) val = val[k];
    console.log(val !== undefined ? `  ${ui.C.accent}${args[1]}${ui.C.reset} = ${ui.C.green}${JSON.stringify(val)}${ui.C.reset}` : `  ${ui.C.muted}未找到: ${args[1]}${ui.C.reset}`);
    return;
  }
  ui.er('用法: config set <key> <value>  或  config get <key>');
}

// ─── 历史 ───
function cmdHistoryCmd() {
  const list = history.listSessions(10);
  if (!list.length) return console.log(`  ${ui.C.muted}暂无历史${ui.C.reset}\n`);
  console.log(`\n  ${ui.C.accent}${ui.C.bold}最近会话${ui.C.reset}`);
  for (const s of list)
    console.log(`  ${ui.C.subtle}[${s.file}:${s.index}]${ui.C.reset} ${ui.C.dim}${(s.title||'').substring(0,60)}${ui.C.reset} ${ui.C.muted}${new Date(s.time).toLocaleString('zh-CN')}${ui.C.reset}`);
  console.log('');
}

// ─── 列出所有已命名会话 ───
function cmdListSessions() {
  const names = history.listNamed();
  if (!names.length) return ui.info('没有命名会话');
  console.log(`\n  ${ui.C.accent}${ui.C.bold}命名会话${ui.C.reset}`);
  for (const n of names) {
    console.log(`  ${ui.C.green}${ui.S.b}${ui.C.reset} ${n}`);
  }
  console.log('');
}

// ─── 导出会话 ───
function cmdExportCmd(chatHistory) {
  if (!chatHistory.length) { ui.warn('会话为空，已跳过导出'); return ''; }
  const date = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
  const file = `aipypro_export_${date}.md`;
  let md = `# AiPyPro Pro 会话导出\n\n日期: ${new Date().toLocaleString('zh-CN')}\n消息数: ${chatHistory.length}\n\n---\n\n`;
  for (const m of chatHistory) {
    const role = m.role === 'user' ? 'You' : m.role === 'assistant' ? 'AiPyPro' : m.role;
    const content = m.content || '(工具调用)';
    md += `### ${role}\n\n${content}\n\n`;
  }
  fs.writeFileSync(file, md, 'utf8');
  return path.resolve(file);
}

// ─── 工具 ───
function cmdTools() {
  const groups = tools.getGroups();
  console.log(`\n  ${ui.C.accent}${ui.C.bold}可用工具 (${tools.tools.length}个)${ui.C.reset}`);
  for (const [c, n] of Object.entries(groups))
    console.log(`  ${ui.C.green}◆${ui.C.reset} ${c}  ${ui.C.dim}${n.join(', ')}${ui.C.reset}`);
  console.log(`  ${ui.C.muted}插件目录: lib/plugins/  — 加工具就是往里扔个 .js 文件${ui.C.reset}\n`);
}

// ─── 帮助 ───
function showHelp() {
  console.log(`
  ${ui.C.accent}${ui.C.bold}${ui.S.b} AiPyPro Pro v4${ui.C.reset}
  ${ui.C.muted}━━ 用法 ━━${ui.C.reset}
    ask <问题>          直接提问
    chat                交互对话（默认）
    history             历史记录
    tools               列出工具
    config [set/get]    查看/修改配置
    export              导出当前会话为 Markdown

  ${ui.C.muted}━━ 聊天命令 ━━${ui.C.reset}
    /help     帮助          /tools     工具列表
    /history  历史          /stats     会话统计
    /session  会话详情      /tokens    Token 用量
    /model    切换模型      /save      保存会话
    /load     加载会话      /export    导出会话
    /list     列出保存      /resume    恢复历史
    /fallback Fallback链     /project   项目信息
    /edit     交互式编辑    /mcp       MCP 服务器
    /agents   子代理状态    undo       撤回          clear      清屏
    exit      退出

  ${ui.C.muted}━━ 多行输入 ━━${ui.C.reset}
    输入 """ 进入多行模式，再输 """ 或空行结束。
    适合粘贴代码、写长文本。

  ${ui.C.muted}━━ 快捷键 ━━${ui.C.reset}
    ↑/↓      浏览命令历史     Tab      补全命令
  `);
}

main().catch(e => { ui.er(e.message); process.exit(1); });
