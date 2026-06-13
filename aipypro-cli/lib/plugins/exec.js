const { execSync } = require('child_process');
module.exports = {
  name: 'exec', desc: '执行系统命令',
  schema: { type: 'object', properties: { command: { type: 'string' }, timeout: { type: 'integer' } }, required: ['command'] },
  exec: (args) => {
    if (!args?.command) return '请提供 command 参数';
    // 危险命令黑名单
    const blocked = ['rm -rf /', 'del /f C:', 'mkfs', 'dd if=', 'format C:', '> /dev/sda', 'shutdown', 'reboot'];
    const cmdLower = args.command.toLowerCase();
    for (const b of blocked) {
      if (cmdLower.includes(b)) return `错误: 危险命令已拦截 — "${b}"`;
    }
    // 校验 timeout 范围
    const timeout = Math.min(Math.max(parseInt(args.timeout) || 30000, 5000), 120000);
    try {
      const out = execSync(args.command, {
        encoding: 'utf8', timeout,
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
        shell: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });
      return out.trim() || '(完成)';
    } catch (e) {
      const stderr = (e.stderr || '').toString().trim().substring(0, 500);
      const stdout = (e.stdout || '').toString().trim().substring(0, 200);
      return `错误: ${e.message.substring(0, 200)}\n${stderr ? `stderr: ${stderr}` : ''}${stdout ? `\nstdout: ${stdout}` : ''}`;
    }
  },
};