const { execSync } = require('child_process');
const ALLOWED_GIT = ['status', 'log', 'diff', 'branch', 'checkout', 'commit', 'push', 'pull', 'add', 'reset', 'stash', 'merge', 'rebase', 'remote', 'tag', 'show', 'reflog', 'stash'];
module.exports = {
  name: 'git', desc: 'Git 操作',
  schema: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] },
  exec: (args) => {
    if (!args?.command) return '请提供 command 参数';
    const cmd = args.command.trim();
    const subCmd = cmd.split(/\s+/)[0];
    if (!ALLOWED_GIT.includes(subCmd)) {
      return `错误: 不允许的 git 子命令 "${subCmd}"。允许: ${ALLOWED_GIT.join(', ')}`;
    }
    try {
      const out = execSync(`git ${cmd}`, { encoding: 'utf8', timeout: 30000, windowsHide: true });
      return out.trim() || '(完成)';
    } catch (e) {
      const detail = (e.stderr || e.stdout || e.message || '').toString().substring(0, 500);
      return `错误: ${detail}`;
    }
  },
};
