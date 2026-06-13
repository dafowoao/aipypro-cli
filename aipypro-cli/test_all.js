// ============================================================
// AiPyPro Pro — 核心模块单元测试
// ============================================================
const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅', name); }
  catch (e) { failed++; console.log('  ❌', name, '-', e.message); }
}

// ── config.js ──
console.log('\n📦 config.js');
const { CFG, loadConfig, CONFIG_DIR } = require('./lib/config');
test('CFG 默认值存在', () => assert.ok(CFG.apiUrl));
test('CFG 默认模型', () => assert.equal(CFG.model, 'deepseek-v4-flash'));
test('CFG 默认 temperature', () => assert.equal(CFG.temperature, 0.3));
test('CFG 默认 maxTokens', () => assert.equal(CFG.maxTokens, 2048));

// ── context.js ──
console.log('\n📦 context.js');
const { estimateTokens, trimHistory, countMessages } = require('./lib/context');
test('estimateTokens 英文', () => assert.ok(estimateTokens('hello') > 0));
test('estimateTokens 中文', () => assert.ok(estimateTokens('你好世界') >= estimateTokens('hello')));
test('estimateTokens 空字符串', () => assert.equal(estimateTokens(''), 0));
test('countMessages 空数组', () => assert.equal(countMessages([]), 0));
test('countMessages 单条消息', () => assert.ok(countMessages([{ role: 'user', content: 'hi' }]) > 0));
test('trimHistory 短消息不裁剪', () => {
  const msgs = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }];
  assert.equal(trimHistory(msgs).length, 2);
});

// ── history.js ──
console.log('\n📦 history.js');
const { saveSession, listSessions, loadSession } = require('./lib/history');
test('listSessions 返回数组', () => assert.ok(Array.isArray(listSessions())));
test('saveSession 不抛异常', () => {
  try { saveSession([{ role: 'user', content: 'test' }]); } catch { assert.fail('抛异常'); }
});

// ── tools.js ──
console.log('\n📦 tools.js');
const ToolSystem = require('./lib/tools');
const tools = new ToolSystem();
test('tools 加载数量 >= 13', () => assert.ok(tools.tools.length >= 13));
test('getSchemas 返回数组', async () => {
  const schemas = await tools.getSchemas();
  assert.ok(Array.isArray(schemas));
});
test('getSchemas 每项有 function.name', async () => {
  const schemas = await tools.getSchemas();
  schemas.forEach(s => assert.ok(s.function?.name));
});
test('execute 未知工具返回错误', async () => {
  const r = await tools.execute('nonexistent', {});
  assert.ok(r.includes('未知'));
});
test('execute read_file 无参数返回提示', async () => {
  const r = await tools.execute('read_file', {});
  assert.ok(r.includes('path'));
});
test('getGroups 返回分组', () => {
  const g = tools.getGroups();
  assert.ok(Object.keys(g).length >= 3); // 至少3个分类
});

// ── ui.js ──
console.log('\n📦 ui.js');
const ui = require('./lib/ui');
test('C 对象存在', () => assert.ok(typeof ui.C === 'object'));
test('S 对象有符号', () => assert.ok(ui.S.b || ui.S.s));
test('banner 不抛异常', () => { try { ui.banner('test', 5); } catch { assert.fail('抛异常'); } });
test('er 不抛异常', () => { try { ui.er('test'); } catch { assert.fail('抛异常'); } });
test('gap 不抛异常', () => { try { ui.gap(); } catch { assert.fail('抛异常'); } });

// ── 插件测试 ──
console.log('\n📦 plugins/');
const fs = require('fs');
const plugins = fs.readdirSync('./lib/plugins').filter(f => f.endsWith('.js') && !f.startsWith('_'));
test('插件数量 >= 13', () => assert.ok(plugins.length >= 13));
for (const p of plugins) {
  const mod = require('./lib/plugins/' + p.replace('.js', ''));
  test(`${mod.name} 有 name/desc/exec/schema`, () => {
    assert.ok(mod.name);
    assert.ok(mod.desc);
    assert.ok(typeof mod.exec === 'function');
    assert.ok(mod.schema);
  });
}

// ── 总结 ──
console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${passed}  |  失败: ${failed}  |  共 ${passed + failed} 项`);
process.exit(failed > 0 ? 1 : 0);
