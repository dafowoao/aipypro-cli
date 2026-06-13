const assert = require('assert');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✅', name); }
  catch (e) { failed++; console.log('  ❌', name, '-', e.message); }
}

// ── cost.js ──
console.log('\n📦 cost.js');
const { recordUsage, getSessionStats, resetSessionStats, getModelPricing } = require('./lib/cost');
test('recordUsage 返回成本', () => {
  resetSessionStats();
  const result = recordUsage('deepseek-v4-flash', 1000, 500);
  assert.ok(result.cost >= 0);
  assert.ok(result.total >= 0);
});
test('getSessionStats 返回统计', () => {
  const stats = getSessionStats();
  assert.ok(typeof stats.inputTokens === 'number');
  assert.ok(typeof stats.outputTokens === 'number');
  assert.ok(typeof stats.cost === 'number');
});
test('getModelPricing 返回定价', () => {
  const pricing = getModelPricing('deepseek-v4-flash');
  assert.ok(pricing.input >= 0);
  assert.ok(pricing.output >= 0);
});
test('getModelPricing 未知模型', () => {
  const pricing = getModelPricing('unknown-model');
  assert.ok(pricing.input === 1.0);
});

// ── fallback.js ──
console.log('\n📦 fallback.js');
const { initFallback, getModel, shouldFallback, getNextModel, resetToPrimary, getModelChain } = require('./lib/fallback');
test('initFallback 初始化', () => {
  initFallback();
  assert.ok(getModel());
});
test('shouldFallback 检测错误', () => {
  assert.ok(shouldFallback(new Error('rate limit exceeded')));
  assert.ok(shouldFallback(new Error('429')));
  assert.ok(!shouldFallback(new Error('success')));
});
test('getNextModel 返回下一个模型', () => {
  resetToPrimary();
  const next = getNextModel();
  assert.ok(next !== null);
});
test('getModelChain 返回模型链', () => {
  const chain = getModelChain();
  assert.ok(Array.isArray(chain));
  assert.ok(chain.length >= 2);
});

// ── diff.js ──
console.log('\n📦 diff.js');
const { computeDiff, formatDiff, getDiffStats } = require('./lib/diff');
test('computeDiff 计算差异', () => {
  const diff = computeDiff('line1\nline2', 'line1\nline3');
  assert.ok(diff.length > 0);
});
test('formatDiff 格式化输出', () => {
  const diff = computeDiff('a\nb', 'a\nc');
  const formatted = formatDiff(diff);
  assert.ok(formatted.includes('+') || formatted.includes('-'));
});
test('getDiffStats 统计', () => {
  const diff = computeDiff('a\nb', 'a\nc');
  const stats = getDiffStats(diff);
  assert.ok(stats.added >= 0);
  assert.ok(stats.removed >= 0);
});
test('computeDiff 空文本', () => {
  const diff = computeDiff('', 'new');
  assert.ok(diff.length > 0);
});

// ── context-project.js ──
console.log('\n📦 context-project.js');
const { loadProjectConfig, getProjectInfo, findProjectRoot, loadProjectContext } = require('./lib/context-project');
test('findProjectRoot 查找根目录', () => {
  const root = findProjectRoot();
  assert.ok(root);
});
test('getProjectInfo 获取项目信息', () => {
  const info = getProjectInfo(process.cwd());
  assert.ok(info.root);
  assert.ok(info.type);
});
test('loadProjectContext 返回上下文', () => {
  const ctx = loadProjectContext(process.cwd());
  assert.ok(typeof ctx.hasContext === 'boolean');
});
test('loadProjectConfig 返回配置', () => {
  const config = loadProjectConfig(process.cwd());
  assert.ok(config.root);
});

// ── interactive.js ──
console.log('\n📦 interactive.js');
const { showFileContent, showEditMenu } = require('./lib/interactive');
test('showFileContent 不抛异常', () => {
  showFileContent('line1\nline2\nline3');
});
test('showEditMenu 不抛异常', () => {
  showEditMenu();
});

// ── subagent.js ──
console.log('\n📦 subagent.js');
const { SubAgent, SubAgentManager, subAgentManager, STATUS } = require('./lib/subagent');
test('STATUS 常量存在', () => {
  assert.ok(STATUS.PENDING === 'pending');
  assert.ok(STATUS.RUNNING === 'running');
  assert.ok(STATUS.COMPLETED === 'completed');
});
test('SubAgentManager 可实例化', () => {
  const manager = new SubAgentManager();
  assert.ok(manager);
  assert.ok(manager.agents);
});
test('subAgentManager 是单例', () => {
  assert.ok(subAgentManager instanceof SubAgentManager);
});
test('getStats 返回统计', () => {
  const stats = subAgentManager.getStats();
  assert.ok(typeof stats.total === 'number');
  assert.ok(typeof stats.running === 'number');
});

// ── mcp.js ──
console.log('\n📦 mcp.js');
const { mcpManager } = require('./lib/mcp');
test('mcpManager 存在', () => {
  assert.ok(mcpManager);
});
test('mcpManager.getTools 返回数组', () => {
  const tools = mcpManager.getTools();
  assert.ok(Array.isArray(tools));
});
test('mcpManager.listServers 返回数组', () => {
  const servers = mcpManager.listServers();
  assert.ok(Array.isArray(servers));
});

// ── 工具集成 ──
console.log('\n📦 工具集成');
const ToolSystem = require('./lib/tools');
const tools = new ToolSystem();
test('工具数量 >= 16', () => {
  assert.ok(tools.tools.length >= 16);
});
test('包含子代理工具', () => {
  const names = tools.tools.map(t => t.name);
  assert.ok(names.includes('spawn_subagent'));
  assert.ok(names.includes('list_subagents'));
});
test('getSchemas 返回 OpenAI 格式', async () => {
  const schemas = await tools.getSchemas();
  assert.ok(Array.isArray(schemas));
  assert.ok(schemas.length > 0);
  assert.ok(schemas[0].function?.name);
});

// ── 总结 ──
console.log(`\n${'='.repeat(40)}`);
console.log(`通过: ${passed}  |  失败: ${failed}  |  共 ${passed + failed} 项`);
process.exit(failed > 0 ? 1 : 0);
