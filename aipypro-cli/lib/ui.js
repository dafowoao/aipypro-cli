// ============================================================
// AiPyPro Pro v4 — 终端界面 (美化加强版 v2)
// 改进: 圆角代码框 / 对话连线 / 工具缩进 / 弹跳圆点思考动画
//       渐变分隔线 / 状态栏卡片 / 圆角表格 / 引用背景
// ============================================================
const T = process.stdout.isTTY && process.stdin.isTTY;

// ─── 色彩体系 ───
const C = {
  reset:T?'\x1b[0m':'', bold:T?'\x1b[1m':'', dim:T?'\x1b[2m':'', ul:T?'\x1b[4m':'',
  italic:T?'\x1b[3m':'', reverse:T?'\x1b[7m':'',
  text:T?'\x1b[38;2;224;237;248m':'',      // 正文
  accent:T?'\x1b[38;2;107;158;255m':'',    // 蓝色强调
  muted:T?'\x1b[38;2;148;163;184m':'',     // 灰色
  subtle:T?'\x1b[38;2;71;85;105m':'',       // 暗灰
  amber:T?'\x1b[38;2;255;191;0m':'',       // 琥珀（用户）
  green:T?'\x1b[38;2;52;211;153m':'',      // 成功
  red:T?'\x1b[38;2;248;113;113m':'',       // 错误
  orange:T?'\x1b[38;2;251;146;60m':'',     // 警告
  cyan:T?'\x1b[38;2;56;189;248m':'',       // 青色
  purple:T?'\x1b[38;2;192;132;252m':'',    // 紫色
  code:T?'\x1b[38;2;230;190;100m':'',      // 代码金色
  codeBg:T?'\x1b[48;2;15;23;42m':'',       // 代码块背景
  infoBg:T?'\x1b[48;2;20;30;50m':'',       // 信息背景
  statusBg:T?'\x1b[48;2;10;18;30m':'',     // 状态栏背景
  statusBorder:T?'\x1b[48;2;30;50;80m':'', // 状态栏边框
  // ⑧ 引用新增背景色
  quoteBg:T?'\x1b[48;2;10;25;40m':'',
};

// ─── 符号 ───
const S = T ? {
  b:'◆', d:'·', ok:'✓', er:'✗', wa:'!', ar:'▸',
  hd:'━', hr:'─', vt:'│', br:'┃',
  quote:'▎', bullet:'●', arrow:'→',
  // ① 圆角代码块符号
  tl:'╭', tr:'╮', bl:'╰', brn:'╯',
  // ⑦ 表格符号
  tbl_tl:'┌', tbl_tr:'┐', tbl_bl:'└', tbl_br:'┘',
  tbl_h:'┬', tbl_b:'┴', tbl_v:'│', tbl_x:'┼',
} : {
  b:'*', d:'.', ok:'+', er:'x', wa:'!', ar:'>',
  hd:'=', hr:'-', vt:'|', br:'|',
  quote:'|', bullet:'*', arrow:'->',
  tl:'+', tr:'+', bl:'+', brn:'+',
  tbl_tl:'+', tbl_tr:'+', tbl_bl:'+', tbl_br:'+',
  tbl_h:'+', tbl_b:'+', tbl_v:'|', tbl_x:'+',
};

function _(t){if(T||!t)return t||'';return t.replace(/[^\x20-\x7E]/g,'');}

// ─── 品牌横幅 ───
function banner(model='',tools=0) {
  if(T){
    console.log(`\n  ${C.accent}${C.bold}        █████╗ ██╗██████╗ ██╗   ██╗${C.reset}`);
    console.log(`  ${C.accent}${C.bold}       ██╔══██╗██║██╔══██╗╚██╗ ██╔╝${C.reset}`);
    console.log(`  ${C.accent}${C.bold}       ███████║██║██████╔╝ ╚████╔╝ ${C.reset}`);
    console.log(`  ${C.accent}${C.bold}       ██╔══██║██║██╔═══╝   ╚██╔╝  ${C.reset}`);
    console.log(`  ${C.accent}${C.bold}       ██║  ██║██║██║        ██║   ${C.reset}`);
    console.log(`  ${C.accent}${C.bold}       ╚═╝  ╚═╝╚═╝╚═╝        ╚═╝   ${C.reset}${C.dim} v4${C.reset}`);
  } else {
    console.log(`\n  ${C.accent}${C.bold}AiPyPro Pro${C.reset} ${C.dim}v4${C.reset}`);
  }
  console.log(`  ${C.subtle}${S.hd.repeat(40)}${C.reset}`);
  if(tools) {
    const m=model?`${C.muted}${_(model)}${C.reset} ${C.subtle}${S.d}${C.reset} `:'';
    console.log(`  ${m}${C.dim}${tools} tools  ${S.d}  /help /tools /history /exit${C.reset}`);
  }
  console.log('');
}

function line(n=40){console.log(`  ${C.subtle}${S.hr.repeat(n)}${C.reset}`);}

// ⑤ 渐变分隔线 — 居中 ◆ + 两侧淡出
function gap(){
  if(T){
    const w = process.stdout.columns || 80;
    const n = Math.max(Math.floor((w - 10) / 2), 15);
    console.log(`  ${C.subtle}${S.hr.repeat(n)} ${C.accent}${S.b}${C.reset} ${C.subtle}${S.hr.repeat(n)}${C.reset}\n`);
  } else {
    console.log(`  ${S.hr.repeat(30)}\n`);
  }
}

// ② 对话竖线标签 ───
// 新增 threadLabel 模式：用户和 AI 消息之间用 ┃ 竖线连接
let threadMode = false; // 由 index.js 控制开关

function setThread(v) { threadMode = v; }

function userLabel(){
  const line = threadMode ? `  ${C.subtle}${S.br}${C.reset}` : `  ${C.amber}${S.hr.repeat(3)}${C.reset}`;
  console.log(`${line} ${C.amber}${C.bold}You${C.reset}  ${C.subtle}${new Date().toLocaleTimeString('zh-CN')}${C.reset}`);
}
function aiLabel(){
  const line = threadMode ? `  ${C.subtle}${S.br}${C.reset}` : `  ${C.accent}${S.hr.repeat(3)}${C.reset}`;
  console.log(`${line} ${C.accent}${C.bold}AiPyPro${C.reset}  ${C.subtle}${new Date().toLocaleTimeString('zh-CN')}${C.reset}`);
}
function toolSection(name){
  console.log(`  ${C.subtle}${S.hr.repeat(3)}${C.reset} ${C.dim}${name}${C.reset} ${C.subtle}${S.hr.repeat(3)}${C.reset}`);
}

// ④ 弹跳圆点思考动画 ───
let timer=null;
function thinking(){
  stopThinking();
  if(!T){process.stdout.write('  ... ');return;}
  const dots = ['○ ○ ○', '◔ ◔ ◔', '◑ ◑ ◑', '◕ ◕ ◕', '● ● ●', '◕ ◕ ◕', '◑ ◑ ◑', '◔ ◔ ◔'];
  let i=0;
  process.stdout.write(`  ${C.subtle}${S.br}${C.reset} ${C.accent}${C.bold}思考中${C.reset} ${C.accent}${dots[i]}${C.reset}`);
  timer=setInterval(() => {
    i = (i + 1) % dots.length;
    process.stdout.write(`\r\x1b[K${C.subtle}${S.br}${C.reset} ${C.accent}${C.bold}思考中${C.reset} ${C.accent}${dots[i]}${C.reset}`);
  }, 180);
}
function stopThinking(){
  if(timer){clearInterval(timer);timer=null;}
  if(T)process.stdout.write('\r\x1b[K');else process.stdout.write('\r');
}

// ============================================================
// Markdown 渲染引擎 (改造版)
// ① 代码块 ╭──╮ 圆角
// ⑦ 表格 ┌─┬─┐ 圆角
// ⑧ 引用 背景色
// ============================================================
const LANG_COLORS = {
  'python':C.cyan,'javascript':C.amber,'js':C.amber,'typescript':C.accent,'ts':C.accent,
  'html':C.orange,'css':C.purple,'json':C.green,'bash':C.muted,'sh':C.muted,
  'yaml':C.cyan,'yml':C.cyan,'xml':C.orange,'sql':C.accent,'rust':C.orange,
  'go':C.cyan,'java':C.orange,'cpp':C.purple,'c':C.purple,'ruby':C.red,
  'php':C.purple,'swift':C.orange,'kotlin':C.purple,'scala':C.red,
  'shell':C.muted,'powershell':C.accent,'ps1':C.accent,'bat':C.muted,
  'diff':C.green,'dockerfile':C.accent,'docker':C.accent,
  'makefile':C.orange,'ini':C.muted,'toml':C.green,
};

// ─── 流式输出 ───
const MB=50000;
let ss={c:false,l:'',n:0,b:''};

function stStart(){ss={c:false,l:'',n:0,b:''};}

// ⑦ 表格渲染（使用 ┌─┬─┐ 四边框）
function renderTableLine(l) {
  const cells = l.split('|').filter(Boolean).map(c => c.trim());
  if (!cells.length) return '';
  const isSep = cells.every(c => /^[\s:-]+$/.test(c));
  if (isSep) {
    const sep = cells.map(c => {
      const align = c.startsWith(':') && c.endsWith(':') ? `${S.hr.repeat(Math.max(c.length,3))}` :
                   c.startsWith(':') ? `${S.hr.repeat(Math.max(c.length,2))}` :
                   c.endsWith(':') ? `${S.hr.repeat(Math.max(c.length,2))}` :
                   `${S.hr.repeat(Math.max(c.length,3))}`;
      return sep;
    });
    return `  ${C.subtle}${S.tbl_tl}${sep.join(S.tbl_h)}${S.tbl_tr}${C.reset}`;
  }
  return `  ${C.subtle}${S.tbl_v}${C.reset} ${cells.join(` ${C.subtle}${S.tbl_v}${C.reset} `)} ${C.subtle}${S.tbl_v}${C.reset}`;
}

function renderMarkdownLine(l) {
  // ⑦ 表格（优先检测）
  if (/^\|.+\|$/.test(l.trim())) return renderTableLine(l.trim());
  // ⑤ 分隔线（纯分隔线）
  if (/^[-*_]{3,}\s*$/.test(l.trim())) return `  ${C.subtle}${S.hr.repeat(36)}${C.reset}`;
  // ⑧ 引用（带背景色）
  if (/^>\s?/.test(l)) {
    const text = l.replace(/^>\s?/, '');
    if(T) return `  ${C.cyan}${S.quote}${C.reset}${C.quoteBg} ${C.italic}${C.muted}${text}${C.reset}`;
    return `  ${C.cyan}${S.quote}${C.reset} ${C.italic}${text}${C.reset}`;
  }
  // 无序列表
  if (/^[-*+]\s/.test(l)) return `  ${C.muted}${S.bullet}${C.reset} ${renderInline(l.replace(/^[-*+]\s/, ''))}`;
  // 有序列表
  if (/^\d+\.\s/.test(l)) return `  ${C.muted}${l.match(/^\d+/)[0]}.${C.reset} ${renderInline(l.replace(/^\d+\.\s/, ''))}`;
  // 标题
  if (/^#{1,4}\s/.test(l)) {
    const level = l.match(/^#+/)[0].length;
    const text = l.replace(/^#+\s*/, '');
    const prefix = level <= 2 ? `${C.bold}${C.accent}` : `${C.bold}${C.muted}`;
    return `  ${prefix}${C.ul}${text}${C.reset}`;
  }
  return `  ${renderInline(l)}`;
}

function renderInline(t) {
  let r = t;
  // 粗体 **text**
  r = r.replace(/\*\*(.+?)\*\*/g, `${C.bold}$1${C.reset}${C.text}`);
  // 斜体 *text*
  r = r.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, `${C.italic}$1${C.reset}${C.text}`);
  // 行内代码 `code`
  r = r.replace(/`([^`]+)`/g, `${C.codeBg} ${C.code}$1${C.reset}${C.text} `);
  // 链接 [text](url)
  r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `${C.accent}${C.ul}$1${C.reset}${C.text}`);
  return r;
}

// ① 代码块渲染（╭──╮ 圆角风格）
function codeBlockOpen(lang) {
  const langColor = LANG_COLORS[lang.toLowerCase()] || C.muted;
  const padded = ` ${lang} `.length > 3 ? ` ${lang} ` : ` ${lang}  `;
  const left = `  ${C.subtle}${S.tl}${S.hr.repeat(3)}${C.reset}`;
  const label = `${langColor}${C.bold}${padded}${C.reset}`;
  const right = `${C.subtle}${S.hr.repeat(20)}${S.tr}${C.reset}`;
  console.log(`${left}${label}${C.subtle}${S.hr.repeat(20)}${S.tr}${C.reset}`);
}
function codeBlockClose(n, lang) {
  const langColor = LANG_COLORS[(lang||'').toLowerCase()] || C.muted;
  const left = `  ${C.subtle}${S.bl}${S.hr.repeat(3)}${C.reset}`;
  const label = `${langColor}${n} lines${C.reset}`;
  const right = `${C.subtle}${S.hr.repeat(20)}${S.brn}${C.reset}`;
  console.log(`${left} ${C.subtle}${n} lines${C.reset} ${C.subtle}${S.hr.repeat(20)}${S.brn}${C.reset}`);
}

function stWrite(t){
  if(ss===undefined||ss.b===undefined)ss={c:false,l:'',n:0,b:''};
  if(ss.b.length>MB)ss.b=ss.b.slice(-MB/2);
  ss.b+=t;
  const ls=ss.b.split(/\r?\n/);ss.b=ls.pop()||'';
  for(const l of ls){
    const x=l.trimEnd();
    // 代码块开关
    if(x.startsWith('```')){
      if(!ss.c){
        ss.c=true;
        ss.l = x.replace(/```(\w*)/,'$1').trim() || 'code';
        ss.n = 0;
        codeBlockOpen(ss.l);
      } else {
        ss.c=false;
        codeBlockClose(ss.n, ss.l);
      }
      continue;
    }
    if(ss.c){
      ss.n++;
      const lineNum = String(ss.n).padStart(3,' ');
      console.log(` ${C.codeBg}${C.subtle}${lineNum}${C.reset}${C.codeBg} ${C.code}${l}${C.reset}`);
    } else {
      console.log(renderMarkdownLine(x));
    }
  }
}

function stFlush(){
  if(ss.b){
    const x = ss.b.trimEnd();
    if(ss.c){
      ss.n++;
      const lineNum = String(ss.n).padStart(3,' ');
      console.log(` ${C.codeBg}${C.subtle}${lineNum}${C.reset}${C.codeBg} ${C.code}${x}${C.reset}`);
      codeBlockClose(ss.n, ss.l);
      ss.c=false;
    } else {
      console.log(renderMarkdownLine(x));
    }
    ss.b='';
  }
  if(ss.c){
    ss.n++;
    codeBlockClose(ss.n, ss.l);
    ss.c=false;
  }
}

// ③ 工具调用（缩进 + 清理）───
function tLine(name,st='run'){
  const co={'run':C.accent,'done':C.green,'err':C.red};
  const lb=st==='run'?'':st==='done'?` ${C.green}${S.ok}${C.reset}`:` ${C.red}${S.er}${C.reset}`;
  process.stdout.write(`\r\x1b[K  ${co[st]}${S.b}${C.reset} ${C.dim}${name}${lb}${C.reset}`);
  if(st!=='run')process.stdout.write('\n');
}
function tOut(text){
  if(!text||text.length<2)return;
  const ls=text.split('\n');
  if(ls.length>6){ls.splice(3,ls.length-4,`  ${C.dim}... ${ls.length-3} lines ...${C.reset}`);}
  console.log(ls.map(l=>`    ${C.dim}${l.substring(0,120)}${C.reset}`).join('\n'));
}

// ─── 消息 ───
function ok(m){console.log(` ${C.green}${S.ok}${C.reset} ${_(m)}`);}
function er(m){console.log(` ${C.red}${S.er}${C.reset} ${C.red}${_(m)}${C.reset}`);}
function tip(m){console.log(`  ${C.accent}${S.b}${C.reset} ${C.dim}${_(m)}${C.reset}`);}
function warn(m){console.log(` ${C.orange}${S.wa}${C.reset} ${C.dim}${_(m)}${C.reset}`);}
function info(m){console.log(`  ${C.dim}${_(m)}${C.reset}`);}

// ⑥ 状态栏（背景卡片）───
function status(items){
  let p = items.map(i => `${C.dim}${i.l}${C.reset} ${i.c||C.text}${i.v}${C.reset}`);
  if(T) {
    console.log(` ${C.statusBg} ${C.dim}${S.d}${C.reset}${C.statusBg} ${p.join(` ${C.subtle}${S.d}${C.reset}${C.statusBg} `)}${C.reset}`);
  } else {
    console.log(`  ${p.join(` ${C.subtle}${S.d}${C.reset} `)}`);
  }
}

// ─── 分隔标题 ───
function sectionTitle(title){
  console.log(`  ${C.subtle}${S.hr.repeat(3)}${C.reset} ${C.muted}${title}${C.reset} ${C.subtle}${S.hr.repeat(3)}${C.reset}`);
}

// ─── 底部状态信息条 ───
function bottomBar(text, color=C.muted){
  if(!T) return console.log(`  ${color}${text}${C.reset}`);
  const w = process.stdout.columns || 80;
  const prefix = `  ${S.d} `;
  const max = Math.max(w - prefix.length - 4, 10);
  const t = text.length > max ? text.substring(0, max-3) + '...' : text;
  console.log(`  ${color}${S.d}${C.reset} ${color}${t}${C.reset}`);
}

// ─── 输入提示增强 ───
function inputPrompt(msg='> '){
  return `${C.amber}>${C.reset} ${msg}`;
}

module.exports={
  C,S,banner,line,gap,
  userLabel,aiLabel,setThread,toolSection,sectionTitle,
  thinking,stopThinking,
  stStart,stWrite,stFlush,
  tLine,tOut,
  ok,er,tip,warn,info,status,
  bottomBar, inputPrompt,
  renderMarkdownLine, renderInline, LANG_COLORS,
};
