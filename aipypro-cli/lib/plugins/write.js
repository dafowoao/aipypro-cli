const fs = require('fs');
const path = require('path');
const { computeDiff, formatDiff, getDiffStats } = require('../diff');
module.exports = {
  name: 'write_file', desc: '写文件（创建或覆盖）',
  schema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' }, confirm: { type: 'boolean', description: '是否确认覆盖' } }, required: ['path', 'content'] },
  exec: (args) => {
    if (!args?.path) return '请提供 path 参数';
    if (!args?.content) return '请提供 content 参数（文件内容不能为空）';
    const fp = path.resolve(args.path);
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(fp)) {
      const oldContent = fs.readFileSync(fp, 'utf8');
      const diff = computeDiff(oldContent, args.content);
      const stats = getDiffStats(diff);
      if (!args.confirm) {
        const diffStr = formatDiff(diff, { contextLines: 2, showLineNumbers: true });
        return `[预览] 文件已存在，${stats.added} 行新增, ${stats.removed} 行删除\n${diffStr}\n\n确认覆盖? 设置 confirm=true 执行`;
      }
    }
    fs.writeFileSync(fp, args.content || '', 'utf8');
    const actualSize = fs.statSync(fp).size;
    return `OK 已写入 ${args.path} (${actualSize} 字符)`;
  },
};
