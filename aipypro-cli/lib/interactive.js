const readline = require('readline');
const ui = require('./ui');

const EDIT_OPTIONS = [
  { key: '1', label: '查看完整文件', action: 'view' },
  { key: '2', label: '选择行范围编辑', action: 'range' },
  { key: '3', label: '搜索并替换', action: 'replace' },
  { key: '4', label: '在指定位置插入', action: 'insert' },
  { key: '5', label: '确认当前更改', action: 'confirm' },
  { key: '6', label: '取消', action: 'cancel' },
];

function createInterface() {
  return readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
}

function showFileContent(content, options = {}) {
  const { startLine = 1, endLine = null, highlight = null } = options;
  const lines = content.split('\n');
  const end = endLine || lines.length;
  console.log(`\n  ${ui.C.accent}${ui.C.bold}文件内容${ui.C.reset}`);
  console.log(`  ${ui.C.dim}${'─'.repeat(40)}${ui.C.reset}`);
  for (let i = startLine - 1; i < Math.min(end, lines.length); i++) {
    const lineNum = String(i + 1).padStart(4);
    const line = lines[i];
    if (highlight && line.toLowerCase().includes(highlight.toLowerCase())) {
      console.log(`  ${ui.C.green}${lineNum}${ui.C.reset} ${ui.C.green}${line}${ui.C.reset}`);
    } else {
      console.log(`  ${ui.C.dim}${lineNum}${ui.C.reset} ${line}`);
    }
  }
  console.log(`  ${ui.C.dim}${'─'.repeat(40)}${ui.C.reset}`);
  console.log(`  ${ui.C.dim}共 ${lines.length} 行${ui.C.reset}\n`);
}

function showEditMenu() {
  console.log(`\n  ${ui.C.accent}${ui.C.bold}编辑选项${ui.C.reset}`);
  for (const opt of EDIT_OPTIONS) {
    console.log(`  ${ui.C.muted}${opt.key}${ui.C.reset} ${opt.label}`);
  }
  console.log('');
}

async function getUserChoice(rl, prompt = '选择操作: ') {
  return new Promise((resolve) => {
    rl.question(`  ${ui.C.amber}${prompt}${ui.C.reset}`, (answer) => resolve(answer.trim()));
  });
}

async function getLineRange(rl, totalLines) {
  return new Promise((resolve) => {
    rl.question(`  ${ui.C.amber}行范围 (如 1-10 或 5): ${ui.C.reset}`, (answer) => {
      const parts = answer.split('-').map(Number);
      if (parts.length === 1 && !isNaN(parts[0])) resolve({ start: parts[0], end: parts[0] });
      else if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) resolve({ start: Math.max(1, parts[0]), end: Math.min(totalLines, parts[1]) });
      else resolve({ start: 1, end: totalLines });
    });
  });
}

async function getReplaceParams(rl) {
  return new Promise((resolve) => {
    rl.question(`  ${ui.C.amber}搜索文本: ${ui.C.reset}`, (search) => {
      rl.question(`  ${ui.C.amber}替换为: ${ui.C.reset}`, (replace) => resolve({ search, replace }));
    });
  });
}

async function getInsertParams(rl, totalLines) {
  return new Promise((resolve) => {
    rl.question(`  ${ui.C.amber}插入位置 (行号): ${ui.C.reset}`, (pos) => {
      const lineNum = parseInt(pos) || totalLines;
      console.log(`  ${ui.C.dim}输入内容（空行结束）:${ui.C.reset}`);
      const lines = [];
      const readLine = () => {
        rl.question(`  ${ui.C.muted}> ${ui.C.reset}`, (line) => {
          if (line === '') resolve({ position: lineNum, content: lines.join('\n') });
          else { lines.push(line); readLine(); }
        });
      };
      readLine();
    });
  });
}

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
      case '1':
        showFileContent(currentContent);
        break;
      case '2':
        const range = await getLineRange(rl, currentContent.split('\n').length);
        const selectedLines = currentContent.split('\n').slice(range.start - 1, range.end);
        console.log(`\n  ${ui.C.accent}选中行 ${range.start}-${range.end}:${ui.C.reset}`);
        selectedLines.forEach((l, i) => console.log(`  ${ui.C.dim}${String(range.start + i).padStart(4)}${ui.C.reset} ${l}`));
        break;
      case '3':
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
      case '4':
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
      case '5':
        if (changes.length > 0) {
          console.log(`\n  ${ui.C.green}${ui.C.bold}确认应用 ${changes.length} 项更改${ui.C.reset}`);
          running = false;
        } else {
          console.log(`  ${ui.C.orange}没有待应用的更改${ui.C.reset}`);
        }
        break;
      case '6':
        console.log(`  ${ui.C.orange}已取消编辑${ui.C.reset}`);
        currentContent = content;
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
