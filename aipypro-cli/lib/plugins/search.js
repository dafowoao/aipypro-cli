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
  name: 'search_content', desc: '递归搜索文件内容（支持按扩展名过滤）',
  schema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: '搜索模式' },
      path: { type: 'string', description: '搜索目录' },
      exts: { type: 'string', description: '逗号分隔的扩展名，如 .js,.py' },
    },
    required: ['pattern'],
  },
  exec: (args) => {
    const sp = sanitizePath(args?.path);
    if (!sp) return '路径越界';
    const esc = (args.pattern || '').replace(/"/g, '""').replace(/[&|<>^%!`]/g, '');
    if (!esc) return '请提供搜索关键词';
    const exts = args?.exts ? args.exts.split(',').map(e => e.trim().replace(/^\./, '')) : [];
    const filePatterns = exts.length > 0 ? exts.map(e => `*.${e}`) : ['*'];
    try {
      let allLines = [];
      for (const pattern of filePatterns) {
        try {
          const out = execSync(`findstr /s /n /c:"${esc}" "${sp}\\${pattern}"`, { encoding: 'utf8', timeout: 15000, windowsHide: true, maxBuffer: 5 * 1024 * 1024 });
          allLines.push(...out.trim().split('\n').filter(Boolean));
        } catch {}
      }
      return allLines.length > 0 ? allLines.slice(0, 30).join('\n') : '无匹配';
    } catch { return '无匹配'; }
  },
};
