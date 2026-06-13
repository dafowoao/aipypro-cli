// ============================================================
// AiPyPro Pro v4 — codenano 混合引擎（正式版）
// 使用 codenano 的：token估算 / compact / session / memory
// 保留自研的：API客户端 / 插件工具 / UI / 自愈
// ============================================================
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const ui = require('./ui');
const ToolSystem = require('./tools');
const { chatStream } = require('./api');
const { loadProjectContext, findProjectRoot } = require('./context-project');

const tools = new ToolSystem();
let cn = null; // codenano
let lastAutoSaved = null; // 最近自动保存的文件路径（用于 write_file 回退）

const CODE_RE = /(?:读|写|编辑|创建|改|修|删除|执行|运行|搜索|查找|git|文件|目录|代码|函数|class|def|import|require|npm|pip|编译|打包|部署|docker|clone|init|add|commit|push|pull|branch|merge|rebase|read|write|edit|delete|list|search|grep|exec|run|rename|glob)/;

// 自愈专用错误标记（避免与用户输出冲突）
const HEAL_ERR = '[AIPYPRO_HEAL_ERR]';

// ── 初始化 codenano ──
async function initCN() {
  if (cn) return cn;
  try {
    cn = await import('codenano');
    return cn;
  } catch {
    return null;
  }
}

// ── 语法验证 ──
function verifySyntax(filePath, content) {
  const ext = filePath?.split('.').pop()?.toLowerCase();
  let tmp = null;
  try {
    if (ext === 'py') {
      tmp = path.join(os.tmpdir(), `_apv_${Date.now()}.py`);
      fs.writeFileSync(tmp, content, 'utf8');
      execSync(`python -m py_compile "${tmp}"`, { stdio: 'pipe', timeout: 10000 });
      return { ok: true, msg: 'Python 语法通过' };
    }
    if (['js', 'mjs'].includes(ext)) {
      tmp = path.join(os.tmpdir(), `_apv_${Date.now()}.${ext}`);
      fs.writeFileSync(tmp, content, 'utf8');
      execSync(`node --check "${tmp}"`, { stdio: 'pipe', timeout: 10000 });
      return { ok: true, msg: 'JS 语法通过' };
    }
  } catch (e) {
    return { ok: false, msg: `语法错误: ${(e.stderr || e.message || '').substring(0, 200)}` };
  } finally {
    if (tmp) { try { fs.unlinkSync(tmp); } catch {} }
  }
  return null;
}

// ── 全局 grep ──
function globalGrep(pattern, searchPath) {
  if (!pattern || pattern.length < 2) return [];
  try {
    const out = execSync(`findstr /s /n /c:"${pattern.replace(/"/g,'')}" "${(searchPath||process.cwd())}\\*"`,
      { encoding: 'utf8', timeout: 15000, windowsHide: true });
    return out.trim().split('\n').filter(Boolean).slice(0, 15);
  } catch { return []; }
}

// ── 预检 ──
function preCheck(tc, parsed) {
  if (!tc?.args) return null;
  const fp = parsed.path ? path.resolve(parsed.path) : null;
  if (['edit_file','delete_file'].includes(tc.name) && fp) {
    if (!fs.existsSync(fp)) return `⚠ 文件不存在: ${parsed.path}`;
    if (tc.name === 'edit_file' && parsed.old_str) {
      const content = fs.readFileSync(fp, 'utf8');
      if (!content.includes(parsed.old_str)) {
        const idx = content.toLowerCase().indexOf(parsed.old_str.substring(0,20).toLowerCase());
        if (idx >= 0) return `⚠ old_str 未精确匹配。附近: ...${content.substring(Math.max(0,idx-20),idx+60)}...`;
        return `⚠ old_str 未找到`;
      }
    }
  }
  return null;
}

// ── 智能筛选工具包 ──
function selectTools(input, allTools) {
  if (!input || !allTools.length) return allTools;
  const t = input.toLowerCase();
  const groups = {
    read:    /读|取|查|看|cat|type|more|打开|查看|显示/,
    write:   /写|创建|保存|生成|新建/,
    edit:    /改|修|编辑|替换|替|换/,
    delete:  /删|移除|清理|清除/,
    list:    /列|目录|文件夹|ls|dir/,
    search:  /搜索|查找|搜|找|包含|grep/,
    exec:    /执行|运行|跑|启动|命令|cmd|安装/,
    code:    /代码|py|python|js|函数|class/,
    web:     /联网|网页|网址|网络|在线|查资料|上网|浏览器/,
    git:     /git|commit|push|pull|branch|合并/,
    project: /项目|工程|信息|结构/,
  };
  const scores = {};
  for (const [g, re] of Object.entries(groups)) {
    const m = t.match(re);
    if (m) scores[g] = m.length;
  }
  const matched = Object.keys(scores);
  if (!matched.length) return allTools;

  const filtered = allTools.filter(tool => {
    const name = (tool.function?.name || tool.name || '').toLowerCase();
    if (name.includes('read') && scores.read) return true;
    if (name.includes('write') && scores.write) return true;
    if (name.includes('edit') && scores.edit) return true;
    if (name.includes('delete') && scores.delete) return true;
    if (name.includes('list') && scores.list) return true;
    if (name.includes('search') && scores.search) return true;
    if (name.includes('grep') && scores.search) return true;
    if (name.includes('exec') && (scores.exec || scores.code)) return true;
    if (name.includes('run') && scores.code) return true;
    if (name.includes('web') && scores.web) return true;
    if (name.includes('git') && scores.git) return true;
    if (name.includes('project') && scores.project) return true;
    return false;
  });

  return filtered.length > 0 ? filtered : allTools;
}

// ── 工具成功判断（按工具类型区分）──
function isToolOk(toolName, output) {
  // 通用失败模式
  if (/^(错误|x )|未知工具|执行错误/.test(output)) return false;
  if (output.startsWith('请提供')) return false;
  // write_file: 0 字节写入视为失败
  if (toolName === 'write_file' && /\(0 字符\)/.test(output)) return false;
  // exec: 自愈占位命令不算成功
  if (toolName === 'exec' && output.includes(HEAL_ERR)) return false;
  // 文件类工具才检查"不存在"
  if (/^(read_file|write_file|edit_file|delete_file|rename_file|list_dir)$/.test(toolName) && output.includes('不存在')) return false;
  return true;
}

// ── 自愈策略（按工具类型 + 错误类型）──
function applyHeal(toolName, parsed, lastOutput, attempt) {
  const errMsg = lastOutput.toLowerCase();

  if (toolName === 'exec') {
    if (!parsed.command) {
      if (parsed.path) { parsed.command = `start "" "${parsed.path}"`; ui.tOut('自愈: 用 path 补全命令'); return true; }
      if (parsed.file) { parsed.command = `start "" "${parsed.file}"`; ui.tOut('自愈: 用 file 补全命令'); return true; }
      parsed.command = `echo ${HEAL_ERR} 缺少命令参数`;
      ui.tOut('自愈: 缺省提示（无法自愈）'); return true;
    }
    // python3 替换（同时检查命令和错误信息）
    if ((parsed.command.includes('python3') || errMsg.includes('python3')) && parsed.command.includes('python3')) {
      parsed.command = parsed.command.replace(/python3/gi, 'python');
      ui.tOut('自愈: python3 替换为 python'); return true;
    }
    if ((errMsg.includes('modulenotfound') || errMsg.includes('no module')) && parsed.command.includes('python')) {
      // 提取文件路径：支持引号包裹的含空格路径
      let fp = '';
      const qm = parsed.command.match(/"([^"]+\.py)"/);
      if (qm) { fp = qm[1]; }
      else {
        const parts = parsed.command.split(' ');
        fp = parts[parts.length - 1]?.replace(/"/g, '');
      }
      const dir = fp?.substring(0, fp.lastIndexOf('\\')) || fp?.substring(0, fp.lastIndexOf('/'));
      if (dir) {
        const targetDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
        parsed.command = `cd /d "${targetDir}" && python "${fp?.split(/[\\/]/).pop()}"`;
        ui.tOut('自愈: 切换到文件目录执行'); return true;
      }
    }
    if (errMsg.includes('start') && (errMsg.includes('找不到') || errMsg.includes('cannot find'))) {
      const m = parsed.command.match(/start\s+(?:"([^"]+)"|(\S+))/);
      const fn = m?.[1] || m?.[2] || '';
      if (fn && !fs.existsSync(path.resolve(fn))) {
        parsed.command = `echo ${HEAL_ERR} 文件 ${fn} 不存在，无法打开`;
        ui.tOut(`自愈: 文件 ${fn} 不存在`); return true;
      }
    }
    // 补全路径（大小写不敏感，防止 cd/d 无限叠加）
    if ((errMsg.includes('找不到') || errMsg.includes('not recognized')) && !parsed.command.toLowerCase().startsWith('cd /d')) {
      parsed.command = `cd /d "${process.cwd()}" && ${parsed.command}`;
      ui.tOut('自愈: 补全路径'); return true;
    }
    return false;
  }

  if (toolName === 'write_file') {
    if (!parsed.path) {
      const c = parsed.content || '';
      const ext = /<!doctype/i.test(c) ? '.html'
                : /\bimport\s+\w+|from\s+\w+\s+import|\bdef\s+\w+\s*\(/.test(c) ? '.py'
                : /\bfunction\s+\w+\s*\(|\bconst\s+\w+\s*=/.test(c) ? '.js'
                : '.txt';
      parsed.path = `aipypro_output_${Date.now()}${ext}`;
      ui.tOut('自愈: 自动生成文件名'); return true;
    }
    if (!parsed.content && lastAutoSaved && fs.existsSync(lastAutoSaved)) {
      // content 缺失但有 auto-save 文件 → 重命名 auto-save 到目标路径
      try {
        const targetDir = path.dirname(path.resolve(parsed.path));
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
        fs.renameSync(lastAutoSaved, path.resolve(parsed.path));
        ui.tOut(`自愈: 从 ${path.basename(lastAutoSaved)} 恢复 → ${parsed.path}`);
        lastAutoSaved = null;
        return true;
      } catch {}
    }
    if (errMsg.includes('eperm') || errMsg.includes('permission')) {
      const oldName = parsed.path?.split(/[\\/]/).pop() || `aipypro_output_${Date.now()}.txt`;
      parsed.path = path.join(process.cwd(), oldName);
      ui.tOut('自愈: 权限不足改写到当前目录'); return true;
    }
    return false;
  }

  if (toolName === 'read_file' && parsed.path) {
    parsed.path = parsed.path.replace(/\\/g, '/');
    ui.tOut('自愈: 路径格式修正'); return true;
  }
  if (toolName === 'edit_file' && parsed.old_str?.length > 20) {
    parsed.old_str = parsed.old_str.split('\n')[0];
    ui.tOut('自愈: 缩短匹配文本'); return true;
  }
  return false;
}

// ── 按工具类型获取输出截断长度 ──
function getTruncateLimit(toolName) {
  if (toolName === 'read_file' || toolName === 'search_content' || toolName === 'grep') return 8000;
  if (toolName === 'web_search' || toolName === 'web_fetch') return 6000;
  if (toolName === 'exec' || toolName === 'run_code') return 2000;
  return 4000;
}

// ── 自愈执行 ──
async function execWithHeal(tc, messages, round) {
  let parsed = {};
  let argsTruncated = false;
  try {
    parsed = JSON.parse(tc.args);
  } catch {
    argsTruncated = true;
    // JSON 解析失败：从截断原始字符串暴力提取
    const raw = tc.args || '';
    const pathIdx = raw.indexOf('"path"');
    const contentIdx = raw.indexOf('"content"');
    if (pathIdx >= 0) {
      const afterPath = raw.substring(pathIdx + 6);
      const valMatch = afterPath.match(/:\s*"([^"]+)"/);
      if (valMatch) parsed.path = valMatch[1];
    }
    if (contentIdx >= 0) {
      const afterContent = raw.substring(contentIdx + 9);
      // 截断的 JSON 中 content 没有闭合引号，取到末尾即可
      const startQuote = afterContent.indexOf('"');
      if (startQuote >= 0) {
        parsed.content = afterContent.substring(startQuote + 1);
      }
    }
    if (!parsed.path && !parsed.content) {
      ui.tOut(`⚠ 工具参数异常: ${raw.substring(0, 60)}...`);
    }
  }
  let lastOutput = '';

  // 使用预生成的 ID（与 assistant 消息中的 tool_calls[].id 一致）
  const toolCallId = tc.id;

  // write_file 特殊预检：path 和 content 都缺失则尝试从对话历史找代码块
  if (tc.name === 'write_file' && !parsed.path && !parsed.content) {
    // 回溯最近一条 assistant 消息，尝试提取代码块
    let saved = false;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && m.content) {
        const codeBlock = m.content.match(/```(?:\w+)?\r?\n([\s\S]*?)```/);
        if (codeBlock && codeBlock[1].length > 50) {
          const fn = `aipypro_fallback_${Date.now()}.py`;
          try {
            fs.writeFileSync(fn, codeBlock[1], 'utf8');
            const vr = verifySyntax(fn, codeBlock[1]);
            if (vr && vr.ok) {
              ui.tOut(`已从对话历史恢复保存: ${fn}`);
              lastOutput = `OK 已写入 ${fn} (${codeBlock[1].length} 字符)\n${vr.msg}`;
              saved = true;
              break;
            } else {
              try { fs.unlinkSync(fn); } catch {}
            }
          } catch {}
        }
        break; // 只检查最近一条 assistant 消息
      }
    }
    if (!saved) {
      lastOutput = '错误: write_file 缺少 path 和 content 参数，且无法从对话历史恢复';
    }
    ui.tLine(tc.name, saved ? 'done' : 'err');
    ui.tOut(lastOutput);
    messages.push({ role: 'tool', tool_call_id: toolCallId, content: lastOutput });
    return;
  }

  const MAX_ATTEMPTS = 3;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    ui.tLine(`${tc.name}${attempt > 0 ? `(重试${attempt})` : ''}`, 'run');

    // 每次执行前（包括自愈后）做预检
    const check = preCheck(tc, parsed);
    if (check) ui.tOut(check);

    lastOutput = await tools.execute(tc.name, parsed);

    if (isToolOk(tc.name, lastOutput)) {
      // 语法验证：失败时拒绝成功判定
      if (tc.name === 'write_file' && parsed.content) {
        const vr = verifySyntax(parsed.path, parsed.content);
        if (vr) {
          ui.tOut(vr.ok ? `✓ ${vr.msg}` : `✗ ${vr.msg}`);
          if (!vr.ok) {
            // 语法错误 → 标记为失败，触发自愈重写
            lastOutput = `错误: ${vr.msg}`;
            if (attempt < MAX_ATTEMPTS - 1) {
              ui.tLine(tc.name, 'err');
              continue;
            }
          }
        }
      }
      if (lastOutput.startsWith('错误')) {
        if (attempt < MAX_ATTEMPTS - 1) { ui.tLine(tc.name, 'err'); continue; }
      } else {
        ui.tLine(tc.name, 'done');
        if (lastOutput.length > 0 && lastOutput.length < 200) ui.tOut(lastOutput);
        if (tc.name === 'rename_file' && parsed.old_path) {
          const refs = globalGrep(path.basename(parsed.old_path), path.dirname(path.resolve(parsed.old_path)));
          if (refs.length) {
            ui.tOut(`旧名称还有 ${refs.length} 处引用:`);
            refs.slice(0, 5).forEach(l => ui.tOut(`  ${l.substring(0, 100)}`));
          }
        }
        const limit = getTruncateLimit(tc.name);
        messages.push({ role: 'tool', tool_call_id: toolCallId, content: lastOutput.substring(0, limit) });
        return;
      }
    }

    // 所有非最后一次尝试都允许自愈
    if (attempt < MAX_ATTEMPTS - 1) {
      ui.tLine(tc.name, 'err');
      const fixed = applyHeal(tc.name, parsed, lastOutput, attempt);
      if (!fixed) break;
    }
  }
  ui.tLine(tc.name, 'err');
  const limit = getTruncateLimit(tc.name);
  messages.push({ role: 'tool', tool_call_id: toolCallId, content: lastOutput.substring(0, limit) });
}

// ── 主入口 ──
async function callAI(messages, opts = {}) {
  const maxRounds = 6;
  const useTools = opts.tools !== false && messages.some(m => m.role === 'user' && CODE_RE.test(m.content?.toLowerCase() || ''));
  const maxTokens = opts.maxTokens || (useTools ? 4096 : 1024);

  // 死循环检测：连续同工具失败计数
  let consecutiveFails = 0;
  let lastFailedTool = '';
  const MAX_CONSECUTIVE_FAILS = 3;

  // 项目上下文
  const projectRoot = findProjectRoot();
  const projectCtx = loadProjectContext(projectRoot);

  // 系统提示词
  const SYSTEM_PROMPT = `你是 AiPyPro Pro v4，运行在用户 Windows 终端中的 AI 编码助手。
可直接读写文件、执行命令、搜索代码。可用工具: read_file, write_file, edit_file, delete_file, rename_file, list_dir, glob, search_content, grep, exec, run_code, web_search, web_fetch, project_info, git。

行为守则:
1. 直接执行用户指令，不要教用户如何操作。
2. 写 .html 文件后自动用 exec 打开预览。
3. 回复简洁准确，用中文。
4. 直接调用工具函数，不要用文字描述工具调用。
5. 使用纯文本，不要用 Markdown 格式（不用 **加粗**、- 列表、# 标题）。代码块用 \`\`\`语言 包裹。
6. 文件写入当前工作目录，不要写桌面或系统目录。
7. 大文件代码会由系统自动保存并重命名到目标路径，无需重复调用 write_file。
${projectCtx.hasContext ? `\n## 项目上下文\n${projectCtx.context}` : ''}`;

  if (!messages.some(m => m.role === 'system')) {
    messages.unshift({ role: 'system', content: SYSTEM_PROMPT });
  }

  // codenano 上下文管理
  try {
    const c = await initCN();
    if (c?.estimateTokens) {
      const total = messages.reduce((s, m) => s + c.estimateTokens(m.content || ''), 0);
      if (total > 32000) {
        ui.tip(`上下文 ${total} tokens，自动精简...`);
        if (c.compactMessages) {
          messages = c.compactMessages(messages, { maxTokens: 24000 });
        }
      }
    }
  } catch (e) {
    // codenano 非必需，加载失败不影响核心功能
    if (opts.verbose) console.warn('codenano 未加载:', e.message);
  }

  for (let r = 0; r < maxRounds; r++) {
    let full = '', hasContent = false;
    const allSchemas = await tools.getSchemas();
    const filteredSchemas = useTools ? selectTools(messages.filter(m => m.role === 'user').map(m => m.content || '').join(' '), allSchemas) : null;
    // 避免空数组传给 API（部分 API 会拒绝）
    const schemas = (filteredSchemas && filteredSchemas.length > 0) ? filteredSchemas : null;
    ui.stStart();
    ui.thinking();

    const result = await chatStream(messages, schemas, { maxTokens }, (tok) => {
      if (!hasContent) { hasContent = true; ui.stopThinking(); }
      full += tok;
      ui.stWrite(tok);
    });

    if (!hasContent) ui.stopThinking();
    ui.stFlush();

    // ═══ 无条件自动保存：在任何文本中检测代码块 ═══
    if (full) {
      const extMap = { 'python':'.py','javascript':'.js','js':'.js','typescript':'.ts','css':'.css','html':'.html','json':'.json','xml':'.xml','yaml':'.yml','bash':'.sh','shell':'.bat','powershell':'.ps1' };
      const cm = full.match(/```(\w+)\r?\n([\s\S]*?)```/);
      if (cm && cm[2].length > 80) {
        const lang = cm[1].toLowerCase();
        const ext = extMap[lang] || '.txt';
        // 尝试从回复文本中提取文件名
        let fn = `aipypro_output_${Date.now()}${ext}`;
        const fileMatch = full.match(/(?:保存|写入|文件|file)?\s*[:：]?\s*"?([a-zA-Z0-9_\-]+\.\w+)"?/);
        const mentionedFile = fileMatch?.[1];
        if (mentionedFile && extMap[path.extname(mentionedFile).slice(1)]) {
          fn = mentionedFile; // 使用模型提到的文件名
        }
        fs.writeFileSync(fn, cm[2], 'utf8');
        lastAutoSaved = path.resolve(fn);
        ui.tOut(`自动保存 ${fn}`);
        if (ext === '.html') try { execSync(`start "" "${fn}"`, { windowsHide: true }); } catch {}
      }
    }

    if (full && (!result.toolCalls || !result.toolCalls.length)) {
      // 文本回退：检测模型在代码块中描述工具调用而非实际调用
      let textToolName = '', textToolArgs = {};
      // 格式1: tool_name("path") 或 tool_name("arg")
      const fnMatch = full.match(/(read_file|write_file|edit_file|delete_file|list_dir|exec|run_code|grep|search_content|glob|project_info|rename_file)\s*\(\s*"([^"]+)"\s*\)/);
      if (fnMatch) { textToolName = fnMatch[1]; textToolArgs = { path: fnMatch[2], command: fnMatch[2] }; }
      // 格式2: {"tool": "name", ...} 或 "tool": "name"
      if (!textToolName) {
        const jsonMatch = full.match(/"(?:tool|action|command|function)"\s*:\s*"(read_file|write_file|edit_file|delete_file|list_dir|exec|run_code|grep|search_content|glob|project_info|rename_file)"/);
        if (jsonMatch) textToolName = jsonMatch[1];
      }
      if (textToolName) {
        const found = tools.tools.find(t => t.name === textToolName);
        if (found) {
          ui.tLine(`${textToolName}(文本回退)`, 'run');
          const out = await tools.execute(textToolName, textToolArgs);
          const ok = isToolOk(textToolName, out);
          ui.tLine(textToolName, ok ? 'done' : 'err');
          if (ok && out.length < 200) ui.tOut(out);
          messages.push({ role: 'assistant', content: full });
          messages.push({ role: 'tool', tool_call_id: `fb_${r}`, content: out.substring(0, 4000) });
          continue;
        }
      }
      return full;
    }

    if (result.toolCalls && result.toolCalls.length) {
      // 预生成 tool_call ID（确保 assistant 消息和 tool 响应使用相同 ID）
      const callDefs = result.toolCalls.map((t, i) => ({
        id: t.id || `c${r}_${i}_${Date.now()}`,
        name: t.name,
        args: t.args,
      }));

      messages.push({
        role: 'assistant', content: null,
        tool_calls: callDefs.map(t => ({
          id: t.id, type: 'function',
          function: { name: t.name, arguments: t.args },
        })),
      });

      // 并行执行独立工具（Promise.all 自动处理并发安全）
      const readTools = ['read_file','list_dir','grep','search_content','glob','project_info'];
      const roTools = callDefs.filter(t => readTools.includes(t.name));
      const rwTools = callDefs.filter(t => !readTools.includes(t.name));
      if (roTools.length) await Promise.all(roTools.map(tc => execWithHeal(tc, messages, r)));
      if (rwTools.length) await Promise.all(rwTools.map(tc => execWithHeal(tc, messages, r)));

      // 死循环检测：检查本轮所有工具是否全部失败
      const tcCount = callDefs.length;
      const recentToolMsgs = messages.slice(-tcCount);
      const allFailed = recentToolMsgs.every(m => m.role === 'tool' && /^错误/.test(m.content || ''));
      const firstToolName = callDefs[0]?.name || '';

      if (allFailed && tcCount > 0) {
        if (firstToolName === lastFailedTool) {
          consecutiveFails++;
          if (consecutiveFails >= MAX_CONSECUTIVE_FAILS) {
            ui.warn(`工具 ${firstToolName} 连续失败 ${consecutiveFails} 轮，终止循环`);
            return `工具 ${firstToolName} 连续执行失败，请检查参数后重试。`;
          }
        } else {
          consecutiveFails = 1;
          lastFailedTool = firstToolName;
        }
      } else {
        consecutiveFails = 0;
        lastFailedTool = '';
      }
      // 安全保护：消息数上限 100 条
      if (messages.length > 100) {
        messages.splice(1, messages.length - 80); // 保留 system + 最近 80 条
      }
      continue;
    }
    return full || '';
  }
  return '(工具循环超限)';
}

module.exports = { callAI, tools };