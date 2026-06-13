const fs = require('fs');
const path = require('path');
const { CONFIG_DIR } = require('./config');

const COST_FILE = path.join(CONFIG_DIR, 'cost.json');

const PRICING = {
  'deepseek-v4-flash': { input: 0.27, output: 1.10 },
  'deepseek-chat': { input: 0.27, output: 1.10 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
};

let sessionStats = { inputTokens: 0, outputTokens: 0, cost: 0, calls: 0 };

function getModelPricing(model) {
  const base = model.split('/').pop().toLowerCase();
  return PRICING[base] || { input: 1.0, output: 3.0 };
}

function recordUsage(model, inputTokens, outputTokens) {
  const pricing = getModelPricing(model);
  const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1000000;
  sessionStats.inputTokens += inputTokens;
  sessionStats.outputTokens += outputTokens;
  sessionStats.cost += cost;
  sessionStats.calls += 1;
  return { cost, total: sessionStats.cost };
}

function getSessionStats() {
  return { ...sessionStats };
}

function resetSessionStats() {
  sessionStats = { inputTokens: 0, outputTokens: 0, cost: 0, calls: 0 };
}

function saveCostLog(entry) {
  try {
    const dir = path.dirname(COST_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const logs = fs.existsSync(COST_FILE) ? JSON.parse(fs.readFileSync(COST_FILE, 'utf8')) : [];
    logs.push({ ...entry, time: Date.now() });
    if (logs.length > 1000) logs.splice(0, logs.length - 1000);
    fs.writeFileSync(COST_FILE, JSON.stringify(logs, null, 2), 'utf8');
  } catch {}
}

module.exports = { recordUsage, getSessionStats, resetSessionStats, saveCostLog, getModelPricing, PRICING };
