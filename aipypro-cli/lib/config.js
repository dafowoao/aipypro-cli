// ============================================================
// 配置管理 — 加载 config.json + 环境变量
// ============================================================
const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.aipypro');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// 默认配置（apiKey 从环境变量或配置文件读取，禁止硬编码）
const DEFAULT_CONFIG = {
  apiKey: '',
  apiUrl: 'https://api.deepseek.com/chat/completions',
  model: 'deepseek-v4-flash',
  maxTokens: 2048,
  temperature: 0.3,
  tavilyKey: '',
  costTracking: true,
  fallbackModels: ['deepseek-v4-flash', 'deepseek-chat', 'gpt-4o-mini'],
  mcpServers: {},
};

// 全局配置对象（P5-M4：简单类型校验）
const CFG = { ...DEFAULT_CONFIG };

function validateConfig(cfg) {
  if (typeof cfg.apiKey !== 'string') cfg.apiKey = DEFAULT_CONFIG.apiKey;
  if (typeof cfg.apiUrl !== 'string' || !/^https?:\/\//.test(cfg.apiUrl)) cfg.apiUrl = DEFAULT_CONFIG.apiUrl;
  if (typeof cfg.model !== 'string') cfg.model = DEFAULT_CONFIG.model;
  if (typeof cfg.maxTokens !== 'number' || cfg.maxTokens < 100) cfg.maxTokens = DEFAULT_CONFIG.maxTokens;
  if (typeof cfg.temperature !== 'number') cfg.temperature = DEFAULT_CONFIG.temperature;
  if (typeof cfg.tavilyKey !== 'string') cfg.tavilyKey = DEFAULT_CONFIG.tavilyKey;
  return cfg;
}

function loadConfig() {
  try {
    // 确保配置目录存在
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    // 读取用户配置
    if (fs.existsSync(CONFIG_FILE)) {
      const userCfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      Object.assign(CFG, userCfg);
      validateConfig(CFG);
    } else {
      // 首次运行，写入默认配置
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf8');
      console.log('已创建默认配置文件:', CONFIG_FILE);
    }
    // 环境变量覆盖
    if (process.env.AIPYPRO_API_KEY) CFG.apiKey = process.env.AIPYPRO_API_KEY;
    if (process.env.TAVILY_API_KEY) CFG.tavilyKey = process.env.TAVILY_API_KEY;
  } catch (e) {
    console.warn('配置加载失败，使用默认:', e.message);
  }
}

module.exports = { CFG, loadConfig, CONFIG_DIR, CONFIG_FILE };
