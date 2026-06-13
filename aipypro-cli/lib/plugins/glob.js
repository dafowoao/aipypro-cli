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

module.exports = {
  name: 'glob', desc: '按通配符匹配文件名（如 *.py, **/*.txt）',
  schema: { type: 'object', properties: { pattern: { type: 'string', description: '通配符模式' }, path: { type: 'string', description: '搜索目录' } }, required: ['pattern'] },
  exec: (args) => {
    if (!args?.pattern) return '请提供 pattern 参数';
    const safe = args.pattern.replace(/[<>|"&;`$%!^]/g, '');
    const sp = sanitizePath(args.path);
    if (!sp) return '路径越界';
    try {
      const out = execSync(`dir "${sp}\\${safe}" /s /b 2>nul`, { encoding: 'utf8', timeout: 10000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
      return out.trim().split('\n').filter(Boolean).slice(0, 100).join('\n') || '无匹配';
    } catch { return '无匹配'; }
  },
};
