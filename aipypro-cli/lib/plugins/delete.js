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
  name: 'delete_file', desc: '删除文件',
  schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  exec: (args) => {
    if (!args?.path) return '请提供 path 参数';
    const fp = validatePath(args.path);
    if (!fp) return `路径越界: ${args.path} 不在工作区内`;
    if (!fs.existsSync(fp)) return `文件不存在: ${args.path}`;
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) return `错误: ${args.path} 是目录，请用其他方式删除`;
    fs.unlinkSync(fp);
    return `OK 已删除 ${args.path}`;
  },
};
