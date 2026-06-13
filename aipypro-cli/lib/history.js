// ============================================================
// 历史记录管理
// ============================================================
const fs = require('fs');
const path = require('path');
const { CONFIG_DIR } = require('./config');

const HISTORY_DIR = path.join(CONFIG_DIR, 'historyv3');

function ensureDir() {
  if (!fs.existsSync(HISTORY_DIR)) fs.mkdirSync(HISTORY_DIR, { recursive: true });
}

// 保存会话
function saveSession(messages) {
  try {
    ensureDir();
    const date = new Date().toISOString().slice(0, 10);
    const file = path.join(HISTORY_DIR, `${date}.json`);
    // P5-M3: 检查文件大小，避免大文件 OOM
    const sessions = (fs.existsSync(file) && fs.statSync(file).size < 5 * 1024 * 1024)
      ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    const title = messages.filter(m => m.role === 'user').slice(0, 2).map(m => m.content?.substring(0, 50) || '').join(' | ');
    sessions.push({
      time: Date.now(),
      title: title || '(空)',
      messages: messages.slice(-20), // 只保存最近20条
    });
    // 只保留最近50个会话
    if (sessions.length > 50) sessions.splice(0, sessions.length - 50);
    fs.writeFileSync(file, JSON.stringify(sessions, null, 2), 'utf8');
  } catch (e) { /* 保存失败忽略 */ }
}

// 列出会话
function listSessions(count = 10) {
  try {
    ensureDir();
    const files = fs.readdirSync(HISTORY_DIR).sort().reverse().slice(0, 5);
    const all = [];
    for (const f of files) {
      const fp = path.join(HISTORY_DIR, f);
      // P5-M3: 跳过过大的文件
      if (fs.statSync(fp).size > 5 * 1024 * 1024) continue;
      const sessions = JSON.parse(fs.readFileSync(fp, 'utf8'));
      for (let i = 0; i < sessions.length; i++) {
        all.push({ file: f, index: i, ...sessions[i] });
      }
    }
    return all.slice(-count);
  } catch { return []; }
}

// 加载指定会话
function loadSession(file, index) {
  try {
    const sessions = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, file), 'utf8'));
    return sessions[index]?.messages || null;
  } catch { return null; }
}

// ═══ 命名会话（/save /load /list）═══
const NAMED_DIR = path.join(CONFIG_DIR, 'named');

function ensureNamedDir() {
  if (!fs.existsSync(NAMED_DIR)) fs.mkdirSync(NAMED_DIR, { recursive: true });
}

// 保存命名会话
function saveNamed(name, messages) {
  try {
    ensureNamedDir();
    const file = path.join(NAMED_DIR, `${name}.json`);
    fs.writeFileSync(file, JSON.stringify({
      time: Date.now(),
      name,
      messages: messages.slice(-50),
    }, null, 2), 'utf8');
    return true;
  } catch (e) { return false; }
}

// 加载命名会话
function loadNamed(name) {
  try {
    const file = path.join(NAMED_DIR, `${name}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')).messages || null;
  } catch { return null; }
}

// 列出所有命名会话
function listNamed() {
  try {
    ensureNamedDir();
    return fs.readdirSync(NAMED_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace(/\.json$/, ''))
      .sort();
  } catch { return []; }
}

module.exports = { saveSession, listSessions, loadSession, saveNamed, loadNamed, listNamed };
