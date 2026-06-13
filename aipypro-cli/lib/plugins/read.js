const fs = require('fs');
const path = require('path');

const WORKSPACE = process.cwd();

function validatePath(filePath) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(WORKSPACE) && !resolved.startsWith(path.resolve(__dirname, '..', '..'))) {
    return null;
  }
  return resolved;
}

module.exports = {
  name: 'read_file',
  desc: '读取文件内容',
  schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: '文件路径' },
      offset: { type: 'integer', description: '起始行号' },
      limit: { type: 'integer', description: '读取行数' },
    },
    required: ['path'],
  },
  exec: (args) => {
    if (!args?.path) return '请提供 path 参数';
    const fp = validatePath(args.path);
    if (!fp) return `路径越界: ${args.path} 不在工作区内`;
    if (!fs.existsSync(fp)) return `文件不存在: ${args.path}`;
    const content = fs.readFileSync(fp, 'utf8');
    const lines = content.split('\n');

    if (args.offset !== undefined || args.limit !== undefined) {
      const start = parseInt(args.offset) || 0;
      const limitVal = args.limit != null ? parseInt(args.limit) : null;
      const end = limitVal != null ? Math.min(start + limitVal, lines.length) : lines.length;
      return lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n');
    }

    if (content.length > 8000) {
      const funcs = [], imports = [];
      for (let i = 0; i < Math.min(lines.length, 1000); i++) {
        const t = lines[i].trim();
        if (/^(async\s+)?function\s+\w+/.test(t)) funcs.push(`L${i + 1}: ${t}`);
        else if (/^(const|let|var|import|require)\s/.test(t) && t.length < 150) imports.push(`L${i + 1}: ${t}`);
      }
      let s = `[F] ${args.path} (${lines.length}行, ${content.length}字)\n`;
      if (imports.length) s += `\n[导入] ${imports.slice(0, 12).join('\n')}`;
      if (funcs.length) s += `\n[函数] ${funcs.slice(0, 15).join('\n')}`;
      s += '\n用 offset/limit 分段读取';
      return s;
    }
    return lines.map((l, i) => `${i + 1}: ${l}`).join('\n');
  },
};
