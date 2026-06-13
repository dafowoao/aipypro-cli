const { execSync } = require('child_process');
const path = require('path');

const WORKSPACE = process.cwd();

function sanitizePath(p) {
  const resolved = path.resolve(p || WORKSPACE);
  if (!resolved.startsWith(WORKSPACE) && !resolved.startsWith(path.resolve(__dirname, '..', '..'))) {
    return null;
  }
  return resolved.replace(/"/g, '').replace(/[&|<>^%!`]/g, '');
}

function doGrep(args, maxLines) {
  const sp = sanitizePath(args?.path);
  if (!sp) return '路径越界';
  const esc = (args.pattern || '').replace(/"/g, '""').replace(/[&|<>^%!`]/g, '');
  if (!esc) return '请提供搜索关键词';
  try {
    const out = execSync(`findstr /s /n /c:"${esc}" "${sp}\\*"`, { encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 5 * 1024 * 1024 });
    return out.trim().split('\n').filter(Boolean).slice(0, maxLines).join('\n') || '无匹配';
  } catch { return '无匹配'; }
}

module.exports = {
  name: 'grep', desc: '快速搜索文件内容',
  schema: { type: 'object', properties: { pattern: { type: 'string' }, path: { type: 'string' } }, required: ['pattern'] },
  exec: (args) => doGrep(args, 20),
};
