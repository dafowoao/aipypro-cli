// ============================================================
// AiPyPro Pro v4 — 终端界面 (豪华升级版)
// 支持: Markdown 渲染 / 状态栏 / 多行输入 / 语法高亮
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
};

// ─── 符号 ───
const S = T ? {
  b:'◆', d:'·', ok:'✓', er:'✗', wa:'!', ar:'▸',
  hd:'━', hr:'─', vt:'│', br:'┃',
  quote:'▎', bullet:'●', arrow:'→',
} : {
  b:'*', d:'.', ok:'+', er:'x', wa:'!', ar:'>',
  hd:'=', hr:'-', vt:'|', br:'|',
  quote:'|', bullet:'*', arrow:'->',
};

function _(t){if(T||!t)return t||'';return t.replace(/[^\x20-\x7E]/g,'');}

// ─── 品牌横幅 (动态增强版) ───
function banner(model='',tools=0) {
  if(T){
    console.log(`\n  ${C.accent}${C.bold}   ╔═══╗╔═╗ ╔╗╔═══╗╔═══╗${C.reset}`);
    console.log(`  ${C.accent}${C.bold}   ╚══╗║║║╚╗║║║ ══╗║╚══╗║${C.reset}`);
    console.log(`  ${C.accent}${C.bold}   ╔══╝║║╔╗╚╝║║╔══╝║╔══╝║${C.reset}`);
    console.log(`  ${C.accent}${C.bold}   ╚═══╝╚╝╚═╝╚╝╚═╝ ╚╝╚═══╝${C.reset}${C.dim} v4${C.reset}`);
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
function gap(){console.log(`  ${C.subtle}${S.hr.repeat(30)}${C.reset}\n`);}

// ─── 角色标签 ───
function userLabel(){
  console.log(`  ${C.amber}${S.hr.repeat(3)}${C.reset} ${C.amber}${C.bold}You${C.reset}  ${C.subtle}${new Date().toLocaleTimeString('zh-CN')}${C.reset}`);
}
function aiLabel(){
  console.log(`  ${C.accent}${S.hr.repeat(3)}${C.reset} ${C.accent}${C.bold}AiPyPro${C.reset}  ${C.subtle}${new Date().toLocaleTimeString('zh-CN')}${C.reset}`);
}
function toolSection(name){
  console.log(`  ${C.subtle}${S.hr.repeat(3)}${C.reset} ${C.dim}${name}${C.reset} ${C.subtle}${S.hr.repeat(3)}${C.reset}`);
}

// ─── 思考动画 ───
let timer=null;
function thinking(){
  stopThinking();
  if(!T){process.stdout.write('  ... ');return;}
  const f=['   ','·  ',' · ','  ·','   '];let i=0;
  process.stdout.write(`  ${C.accent}${f[i]}${C.reset}`);
  timer=setInterval(()=>{i=(i+1)%f.length;process.stdout.write(`\r\x1b[K${C.subtle}${S.hr.repeat(3)}${C.reset} ${C.accent}${C.bold}思考中${C.reset} ${C.accent}${f[i]}${C.reset}`);},150);
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

// ─── 流式输出（Markdown 感知）───
const MB=50000;
let ss={c:false,l:'',n:0,b:'',inBlockquote:false,inList:false};

function stStart(){ss={c:false,l:'',n:0,b:'',inBlockquote:false,inList:false};}

function renderMarkdownLine(l) {
  // 表格渲染
  if (/^\|.+\|$/.test(l.trim())) {
    const cells = l.split('|').filter(Boolean);
    const isSep = /^[\s:-]+$/.test(cells.join('').trim());
    if (isSep) return `  ${C.subtle}${S.hr.repeat(36)}${C.reset}`;
    const rendered = cells.map(c => c.trim()).join(` ${C.subtle}${S.vt}${C.reset} `);
    return `  ${C.subtle}${S.vt}${C.reset} ${rendered} ${C.subtle}${S.vt}${C.reset}`;
  }
  // 分隔线
  if (/^[-*_]{3,}\s*$/.test(l.trim())) return `  ${C.subtle}${S.hr.repeat(36)}${C.reset}`;
  // 引用
  if (/^>\s?/.test(l)) return `  ${C.cyan}${S.quote}${C.reset} ${C.italic}${l.replace(/^>\s?/, '')}${C.reset}`;
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

function stWrite(t){
  if(ss===undefined||ss.b===undefined)ss={c:false,l:'',n:0,b:'',inBlockquote:false,inList:false};
  if(ss.b.length>MB)ss.b=ss.b.slice(-MB/2);
  ss.b+=t;
  const ls=ss.b.split(/\r?\n/);ss.b=ls.pop()||'';
  for(const l of ls){
    const x=l.trimEnd();
    // 代码块开关
    if(x.startsWith('```')){
      if(!ss.c){
        ss.c=true;ss.l=x.replace(/```(\w*)/,'$1').trim()||'code';ss.n=0;
        const langColor = LANG_COLORS[ss.l.toLowerCase()] || C.muted;
        console.log(`  ${C.subtle}${S.hr.repeat(3)}${C.reset} ${langColor}${C.bold}${ss.l}${C.reset} ${C.subtle}${S.hr.repeat(3)}${C.reset}`);
      } else {
        ss.c=false;
        const langColor = LANG_COLORS[ss.l.toLowerCase()] || C.muted;
        console.log(`  ${C.subtle}${S.hr.repeat(3)}${C.reset} ${langColor}${ss.n} lines${C.reset} ${C.subtle}${S.hr.repeat(3)}${C.reset}`);
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
      console.log(`  ${C.subtle}${S.hr.repeat(3)}${C.reset} ${C.muted}${ss.n} lines${C.reset} ${C.subtle}${S.hr.repeat(3)}${C.reset}`);
      ss.c=false;
    } else {
      console.log(renderMarkdownLine(x));
    }
    ss.b='';
  }
  if(ss.c){
    ss.n++;
    console.log(`  ${C.subtle}${S.hr.repeat(3)} ${ss.n} lines ${S.hr.repeat(3)}${C.reset}`);
    ss.c=false;
  }
}

// ─── 工具调用 ───
function tLine(name,st='run'){
  const co={'run':C.accent,'done':C.green,'err':C.red};
  const lb=st==='run'?'':st==='done'?` ${C.green}${S.ok}${C.reset}`:` ${C.red}${S.er}${C.reset}`;
  process.stdout.write(`\r\x1b[K ${co[st]}${S.b}${C.reset} ${C.dim}${name}${lb}${C.reset}`);
  if(st!=='run')process.stdout.write('\n');
}
function tOut(text){
  if(!text||text.length<2)return;
  const ls=text.split('\n');
  if(ls.length>6){ls.splice(3,ls.length-4,`  ${C.dim}... ${ls.length-3} lines ...${C.reset}`);}
  console.log(ls.map(l=>`  ${C.dim}${l.substring(0,120)}${C.reset}`).join('\n'));
}

// ─── 消息 ───
function ok(m){console.log(` ${C.green}${S.ok}${C.reset} ${_(m)}`);}
function er(m){console.log(` ${C.red}${S.er}${C.reset} ${C.red}${_(m)}${C.reset}`);}
function tip(m){console.log(`  ${C.accent}${S.b}${C.reset} ${C.dim}${_(m)}${C.reset}`);}
function warn(m){console.log(` ${C.orange}${S.wa}${C.reset} ${C.dim}${_(m)}${C.reset}`);}
function info(m){console.log(`  ${C.dim}${_(m)}${C.reset}`);}

// ─── 状态栏 (多段信息) ───
function status(items){
  const p=items.map(i=>`${C.dim}${i.l}${C.reset} ${i.c||C.text}${i.v}${C.reset}`);
  console.log(`  ${p.join(` ${C.subtle}${S.d}${C.reset} `)}`);
}

// ─── 分隔标题 ───
function sectionTitle(title){
  console.log(`  ${C.subtle}${S.hr.repeat(3)}${C.reset} ${C.muted}${title}${C.reset} ${C.subtle}${S.hr.repeat(3)}${C.reset}`);
}

// ─── 底部状态信息条（简短一行提示）───
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
  userLabel,aiLabel,toolSection,sectionTitle,
  thinking,stopThinking,
  stStart,stWrite,stFlush,
  tLine,tOut,
  ok,er,tip,warn,info,status,
  bottomBar, inputPrompt,
  renderMarkdownLine, renderInline, LANG_COLORS,
};
