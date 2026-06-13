const fs = require('fs');
const path = require('path');
const { computeDiff, formatDiff, getDiffStats } = require('../diff');
const { interactiveEdit } = require('../interactive');
module.exports = {
  name: 'edit_file',
  desc: '精确替换文件内容（old_str 必须唯一）',
  schema: { type: 'object', properties: { path: { type: 'string' }, old_str: { type: 'string' }, new_str: { type: 'string' }, confirm: { type: 'boolean', description: '是否确认应用更改' }, interactive: { type: 'boolean', description: '是否启用交互式编辑' } }, required: ['path', 'old_str', 'new_str'] },
  exec: async (args) => {
    if (!args?.path) return '请提供 path 参数';
    const fp = path.resolve(args.path);
    if (!fs.existsSync(fp)) return `文件不存在: ${args.path}`;
    const content = fs.readFileSync(fp, 'utf8');

    if (args.interactive) {
      const result = await interactiveEdit(fp, content);
      if (result.changes.length > 0) {
        fs.writeFileSync(fp, result.content, 'utf8');
        return `OK 交互式编辑完成，应用了 ${result.changes.length} 项更改`;
      }
      return '未做任何更改';
    }

    const esc = args.old_str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(esc, 'g');
    const matches = [...content.matchAll(regex)];
    if (matches.length === 0) {
      const idx = content.toLowerCase().indexOf(args.old_str.substring(0, 30).toLowerCase());
      if (idx >= 0) return `old_str 未精确匹配。附近: ...${content.substring(Math.max(0, idx - 20), idx + 60)}...`;
      return '未找到匹配文本';
    }
    if (matches.length > 1) return `匹配 ${matches.length} 处，不是唯一匹配。请包含更多上下文`;
    const safeNewStr = args.new_str || '';
    const newContent = content.replace(regex, () => safeNewStr);
    const diff = computeDiff(content, newContent);
    const stats = getDiffStats(diff);
    if (!args.confirm) {
      const diffStr = formatDiff(diff, { contextLines: 2, showLineNumbers: true });
      return `[预览] ${stats.added} 行新增, ${stats.removed} 行删除\n${diffStr}\n\n确认应用? 设置 confirm=true 执行`;
    }
    fs.writeFileSync(fp, newContent, 'utf8');
    return `OK 已编辑 ${args.path} (+${stats.added} -${stats.removed})`;
  },
};
