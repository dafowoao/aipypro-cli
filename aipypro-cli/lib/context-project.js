const fs = require('fs');
const path = require('path');

const PROJECT_CONFIG = '.aipypro.json';
const AGENTS_MD = 'AGENTS.md';
const RULES_FILES = ['.cursorrules', '.copilot', 'CLAUDE.md'];

const DEFAULT_PROJECT = {
  name: '',
  rules: [],
  ignore: ['node_modules', '.git', 'dist', 'build', '__pycache__'],
  contextFiles: [],
  systemPrompt: '',
};

function findProjectRoot(startDir) {
  let dir = startDir || process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, PROJECT_CONFIG))) return dir;
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    if (fs.existsSync(path.join(dir, 'pyproject.toml'))) return dir;
    if (fs.existsSync(path.join(dir, 'Cargo.toml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return startDir || process.cwd();
}

function loadProjectConfig(projectRoot) {
  const configPath = path.join(projectRoot, PROJECT_CONFIG);
  if (!fs.existsSync(configPath)) return { ...DEFAULT_PROJECT, root: projectRoot };
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { ...DEFAULT_PROJECT, ...config, root: projectRoot };
  } catch {
    return { ...DEFAULT_PROJECT, root: projectRoot };
  }
}

function loadProjectContext(projectRoot) {
  const config = loadProjectConfig(projectRoot);
  const contextParts = [];

  const agentsPath = path.join(projectRoot, AGENTS_MD);
  if (fs.existsSync(agentsPath)) {
    try {
      const content = fs.readFileSync(agentsPath, 'utf8').substring(0, 4000);
      contextParts.push(`## 项目规则 (AGENTS.md)\n${content}`);
    } catch {}
  }

  for (const file of RULES_FILES) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8').substring(0, 2000);
        contextParts.push(`## ${file}\n${content}`);
      } catch {}
    }
  }

  for (const file of config.contextFiles || []) {
    const filePath = path.join(projectRoot, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8').substring(0, 2000);
        contextParts.push(`## ${file}\n${content}`);
      } catch {}
    }
  }

  if (config.rules && config.rules.length > 0) {
    contextParts.push(`## 自定义规则\n${config.rules.join('\n')}`);
  }

  if (config.systemPrompt) {
    contextParts.push(`## 项目特定指令\n${config.systemPrompt}`);
  }

  return {
    config,
    context: contextParts.join('\n\n'),
    hasContext: contextParts.length > 0,
  };
}

function getProjectInfo(projectRoot) {
  const config = loadProjectConfig(projectRoot);
  const info = {
    root: projectRoot,
    name: config.name || path.basename(projectRoot),
    hasAgentsMd: fs.existsSync(path.join(projectRoot, AGENTS_MD)),
    hasProjectConfig: fs.existsSync(path.join(projectRoot, PROJECT_CONFIG)),
    ignorePatterns: config.ignore,
  };

  if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
    info.type = 'node';
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
      info.name = pkg.name;
      info.version = pkg.version;
    } catch {}
  } else if (fs.existsSync(path.join(projectRoot, 'pyproject.toml'))) {
    info.type = 'python';
  } else if (fs.existsSync(path.join(projectRoot, 'Cargo.toml'))) {
    info.type = 'rust';
  } else {
    info.type = 'unknown';
  }

  return info;
}

module.exports = { loadProjectConfig, loadProjectContext, getProjectInfo, findProjectRoot };
