// ============================================================
// AiPyPro Pro v4 — 终端界面 (美化加强版 v3)
// 全部改进: 圆角代码框/对话连线/工具缩进/弹跳圆点动画
// 渐变分隔线/状态栏卡片/圆角表格/引用背景色
// 上下文进度条/消息编号/响应耗时/错误框/欢迎消息
// ============================================================
const T = process.stdout.isTTY && process.stdin.isTTY;

const C = {
  reset:T?'\x1b[0m':'', bold:T?'\x1b[1m':'', dim:T?'\x1b[2m':'', ul:T?'\x1b[4m':'',
  italic:T?'\x1b[3m':'', reverse:T?'\x1b[7m':'',
  text:T?'\x1b[38;2;224;237;248m':'',
  accent:T?'\x1b[38;2;107;158;255m':'',
  muted:T?'\x1b[38;2;148;163;184m':'',
  subtle:T?'\x1b[38;2;71;85;105m':'',
  amber:T?'\x1b[38;2;255;191;0m':'',
  green:T?'\x1b[38;2;52;211;153m':'',
  red:T?'\x1b[38;2;248;113;113m':'',
  orange:T?'\x1b[38;2;251;146;60m':'',
  cyan:T?'\x1b[38;2;56;189;248m':'',
  purple:T?'\x1b[38;2;192;132;252m':'',
  code:T?'\x1b[38;2;230;190;100m':'',
  codeBg:T?'\x1b[48;2;15;23;42m':'',
  infoBg:T?'\x1b[48;2;20;30;50m':'',
  statusBg:T?'\x1b[48;2;10;18;30m':'',
  statusBorder:T?'\x1b[48;2;30;50;80m':'',
  quoteBg:T?'\x1b[48;2;10;25;40m':'',
  errBg:T?'\x1b[48;2;30;10;15m':'',
};

const S = T ? {
  b:'◆', d:'·', ok:'✓', er:'✗', wa:'!', ar:'▸',
  hd:'━', hr:'─', vt:'│', br:'┃',
  quote:'▎', bullet:'●', arrow:'→',
  tl:'╭', tr:'╮', bl:'╰', brn:'╯',
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
function gap(){
  if(T){
    const w = process.stdout.columns || 80;
    const n = Math.max(Math.floor((w - 10) / 2), 15);
    console.log(`  ${C.subtle}${S.hr.repeat(n)} ${C.accent}${S.b}${C.reset} ${C.subtle}${S.hr.repeat(n)}${C.reset}\n`);
  } else {
    console.log(`  ${S.hr.repeat(30)}\n`);
  }
}

// ② 对话竖线 + B.消息编号
let threadMode = false;
let msgCounter = 0;
function setThread(v) { threadMode = v; }
function resetMsgCounter() { msgCounter = 0; }
function nextMsgNum() { return ++msgCounter; }

function userLabel(msgNum){
  const num = msgNum ? ` ${C.subtle}${S.d}${C.reset} ${C.subtle}#${msgNum}` : '';
  const line = threadMode ? `  ${C.subtle}${S.br}${C.reset}` : `  ${C.amber}${S.hr.repeat(3)}${C.reset}`;
  console.log(`${line} ${C.amber}${C.bold}You${C.reset}  ${C.subtle}${new Date().toLocaleTimeString('zh-CN')}${num}${C.reset}`);
}
function aiLabel(msgNum){
  const num = msgNum ? ` ${C.subtle}${S.d}${C.reset} ${C.subtle}#${msgNum}` : '';
  const line = threadMode ? `  ${C.subtle}${S.br}${C.reset}` : `  ${C.accent}${S.hr.repeat(3)}${C.reset}`;
  console.log(`${line} ${C.accent}${C.bold}AiPyPro${C.reset}  ${C.subtle}${new Date().toLocaleTimeString('zh-CN')}${num}${C.reset}`);
}
function toolSection(name){
  console.log(`  ${C.subtle}${S.hr.repeat(3)}${C.reset} ${C.dim}${name}${C.reset} ${C.subtle}${S.hr.repeat(3)}${C.reset}`);
}

// ④ 弹跳圆点思考动画 ───
let timer=null;
function thinking(){
  stopThinking();
  if(!T){process.stdout.write('  ... ');return;}
  const dots = ['○ ○ ○','◔ ◔ ◔','◑ ◑ ◑','◕ ◕ ◕','● ● ●','◕ ◕ ◕','◑ ◑ ◑','◔ ◔ ◔'];
  let i=0;
  process.stdout.write(`  ${C.subtle}${S.br}${C.reset} ${C.accent}${C.bold}思考中${C.reset} ${C.accent}${dots[i]}${C.reset}`);
  timer=setInterval(()=>{
    i=(i+1)%dots.length;
    process.stdout.write(`\r\x1b[K${C.subtle}${S.br}${C.reset} ${C.accent}${C.bold}思考中${C.reset} ${C.accent}${dots[i]}${C.reset}`);
  },180);
}
function stopThinking(){
  if(timer){clearInterval(timer);timer=null;}
  if(T)process.stdout.write('\r\x1b[K');else process.stdout.write('\r');
}

// ============================================================
// Markdown 渲染引擎
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

const MB=50000;
let ss={c:false,l:'',n:0,b:''};

function stStart(){ss={c:false,l:'',n:0,b:''};}

// ⑦ 表格渲染
function renderTableLine(l) {
  const cells = l.split('|').filter(Boolean).map(c => c.trim());
  if (!cells.length) return '';
  const isSep = cells.every(c => /^[\s:-]+$/.test(c));
  if (isSep) {
    const sep = cells.map(() => `${S.hr.repeat(5)}`);
    return `  ${C.subtle}${S.tbl_tl}${sep.join(S.tbl_h)}${S.tbl_tr}${C.reset}`;
  }
  return `  ${C.subtle}${S.tbl_v}${C.reset} ${cells.join(` ${C.subtle}${S.tbl_v}${C.reset} `)} ${C.subtle}${S.tbl_v}${C.reset}`;
}

function renderMarkdownLine(l) {
  if (/^\|.+\|$/.test(l.trim())) return renderTableLine(l.trim());
  if (/^[-*_]{3,}\s*$/.test(l.trim())) return `  ${C.subtle}${S.hr.repeat(36)}${C.reset}`;
  // ⑧ 引用背景色
  if (/^>\s?/.test(l)) {
    const text = l.replace(/^>\s?/, '');
    if(T) return `  ${C.cyan}${S.quote}${C.reset}${C.quoteBg} ${C.italic}${C.muted}${text}${C.reset}`;
    return `  ${C.cyan}${S.quote}${C.reset} ${C.italic}${text}${C.reset}`;
  }
  if (/^[-*+]\s/.test(l)) return `  ${C.muted}${S.bullet}${C.reset} ${renderInline(l.replace(/^[-*+]\s/, ''))}`;
  if (/^\d+\.\s/.test(l)) return `  ${C.muted}${l.match(/^\d+/)[0]}.${C.reset} ${renderInline(l.replace(/^\d+\.\s/, ''))}`;
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
  r = r.replace(/\*\*(.+?)\*\*/g, `${C.bold}$1${C.reset}${C.text}`);
  r = r.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, `${C.italic}$1${C.reset}${C.text}`);
  r = r.replace(/`([^`]+)`/g, `${C.codeBg} ${C.code}$1${C.reset}${C.text} `);
  r = r.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `${C.accent}${C.ul}$1${C.reset}${C.text}`);
  return r;
}

// ① ╭──╮ 圆角代码块
function codeBlockOpen(lang) {
  const langColor = LANG_COLORS[lang.toLowerCase()] || C.muted;
  console.log(`  ${C.subtle}${S.tl}${S.hr.repeat(3)}${C.reset} ${langColor}${C.bold} ${lang} ${C.reset} ${C.subtle}${S.hr.repeat(22)}${S.tr}${C.reset}`);
}
function codeBlockClose(n) {
  console.log(`  ${C.subtle}${S.bl}${S.hr.repeat(3)}${C.reset} ${C.subtle}${n} lines${C.reset} ${C.subtle}${S.hr.repeat(22)}${S.brn}${C.reset}`);
}

function stWrite(t){
  if(ss===undefined||ss.b===undefined)ss={c:false,l:'',n:0,b:''};
  if(ss.b.length>MB)ss.b=ss.b.slice(-MB/2);
  ss.b+=t;
  const ls=ss.b.split(/\r?\n/);ss.b=ls.pop()||'';
  for(const l of ls){
    const x=l.trimEnd();
    if(x.startsWith('```')){
      if(!ss.c){
        ss.c=true;ss.l=x.replace(/```(\w*)/,'$1').trim()||'code';ss.n=0;
        codeBlockOpen(ss.l);
      } else {
        ss.c=false;
        codeBlockClose(ss.n);
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
      codeBlockClose(ss.n);
      ss.c=false;
    } else {
      console.log(renderMarkdownLine(x));
    }
    ss.b='';
  }
  if(ss.c){ss.n++;codeBlockClose(ss.n);ss.c=false;}
}

// ③ 工具调用
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
// E. 错误框
function er(m){
  if(T) {
    console.log(` ${C.red}${S.er}${C.reset} ${C.red}${C.bold}${_(m)}${C.reset}`);
  } else {
    console.log(` ${C.red}${S.er}${C.reset} ${C.red}${_(m)}${C.reset}`);
  }
}
function tip(m){console.log(`  ${C.accent}${S.b}${C.reset} ${C.dim}${_(m)}${C.reset}`);}
function warn(m){console.log(` ${C.orange}${S.wa}${C.reset} ${C.dim}${_(m)}${C.reset}`);}
function info(m){console.log(`  ${C.dim}${_(m)}${C.reset}`);}

// A. 上下文进度条
function contextBar(used, total) {
  if (!T || !total) return;
  const pct = Math.min(used / total, 1);
  const barLen = 18;
  const filled = Math.round(pct * barLen);
  const bar = `${C.accent}${'▓'.repeat(Math.min(filled, barLen))}${C.reset}${C.subtle}${'░'.repeat(Math.max(barLen - filled, 0))}${C.reset}`;
  const pctStr = `${(pct * 100).toFixed(0)}%`;
  const color = pct > 0.8 ? C.red : pct > 0.5 ? C.orange : C.muted;
  console.log(`  ${C.dim}上下文${C.reset} ${bar} ${color}${pctStr}${C.reset} ${C.subtle}${(used/1000).toFixed(1)}K/${(total/1000).toFixed(0)}K${C.reset}`);
}

// D. AI 响应耗时
function elapsed(seconds) {
  console.log(`  ${C.subtle}${S.d}${C.reset} ${C.subtle}处理完成 · 耗时 ${seconds}s${C.reset}`);
}

// ⑥ 状态栏
function status(items){
  let p = items.map(i => `${C.dim}${i.l}${C.reset} ${i.c||C.text}${i.v}${C.reset}`);
  if(T) {
    console.log(` ${C.statusBg} ${C.dim}${S.d}${C.reset}${C.statusBg} ${p.join(` ${C.subtle}${S.d}${C.reset}${C.statusBg} `)}${C.reset}`);
  } else {
    console.log(`  ${p.join(` ${C.subtle}${S.d}${C.reset} `)}`);
  }
}

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

// ─── 输入提示 ───
function inputPrompt(msg='> '){
  return `${C.amber}>${C.reset} ${msg}`;
}

// G. 历史浏览位置
function historyPos(current, total) {
  if (total <= 1) return '';
  return ` ${C.subtle}${current}/${total}${C.reset}`;
}

module.exports={
  C,S,banner,line,gap,
  userLabel,aiLabel,setThread,resetMsgCounter,nextMsgNum,toolSection,sectionTitle,
  thinking,stopThinking,
  stStart,stWrite,stFlush,
  tLine,tOut,
  ok,er,tip,warn,info,status,contextBar,elapsed,
  bottomBar, inputPrompt, historyPos,
  renderMarkdownLine, renderInline, LANG_COLORS,
};
