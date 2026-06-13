// ============================================================
// 工具系统 — 插件加载器
// ============================================================
// 自动扫描 lib/plugins/ 目录，加载所有 .js 文件
// 加新工具 = 扔个文件到 plugins/，不用改代码
// ============================================================
const fs = require('fs');
const path = require('path');

let mcpManager;
try {
  mcpManager = require('./mcp').mcpManager;
} catch {
  mcpManager = { initialize: async () => {}, getTools: () => [] };
}

const PLUGIN_DIR = path.join(__dirname, 'plugins');

class ToolSystem {
  constructor() {
    this.tools = [];
    this._loadPlugins();
    this._addSubAgentTools();
    this._mcpReady = this._initMCP();
  }

  async _initMCP() {
    try {
      await mcpManager.initialize();
      for (const t of mcpManager.getTools()) {
        t.openaiSchema = {
          type: 'function',
          function: {
            name: t.name,
            description: t.desc || `MCP 工具 ${t.name}`,
            parameters: t.schema || { type: 'object', properties: {} },
          },
        };
        this.tools.push(t);
      }
    } catch {}
  }

  // 自动扫描 plugins 目录加载所有工具
  _loadPlugins() {
    if (!fs.existsSync(PLUGIN_DIR)) return;
    const files = fs.readdirSync(PLUGIN_DIR)
      .filter(f => f.endsWith('.js') && !f.startsWith('_')); // _开头的跳过（示例文件）
    const seen = new Set();

    for (const file of files) {
      try {
        const plugin = require(path.join(PLUGIN_DIR, file));
        // 校验插件格式
        if (!plugin.name || !plugin.exec) continue;
        // 检测重名插件（跳过并告警）
        if (seen.has(plugin.name)) {
          console.warn(`加载插件失败: ${file} - 工具名 "${plugin.name}" 与已有插件重名，跳过`);
          continue;
        }
        seen.add(plugin.name);
        // 注入 OpenAI 格式 schema
        plugin.openaiSchema = {
          type: 'function',
          function: {
            name: plugin.name,
            description: plugin.desc || `工具 ${plugin.name}`,
            parameters: plugin.schema || { type: 'object', properties: {} },
          },
        };
        this.tools.push(plugin);
      } catch (e) {
        console.warn(`加载插件失败: ${file} - ${e.message}`);
      }
    }
  }

  _addSubAgentTools() {
    const { subAgentManager } = require('./subagent');
    const subTools = [
      {
        name: 'spawn_subagent',
        desc: '创建并启动一个子代理执行独立任务',
        schema: {
          type: 'object',
          properties: {
            task: { type: 'string', description: '子代理要执行的任务描述' },
            timeout: { type: 'number', description: '超时时间(ms)，默认300000' },
            maxTokens: { type: 'number', description: '最大token数，默认4096' },
          },
          required: ['task'],
        },
        exec: async (args) => {
          const agent = await subAgentManager.spawn(args.task, {
            timeout: args.timeout,
            maxTokens: args.maxTokens,
          });
          return JSON.stringify(agent.toJSON());
        },
      },
      {
        name: 'list_subagents',
        desc: '列出所有子代理及其状态',
        schema: { type: 'object', properties: {} },
        exec: async () => {
          const agents = subAgentManager.listAgents().map(a => a.toJSON());
          const stats = subAgentManager.getStats();
          return JSON.stringify({ stats, agents });
        },
      },
      {
        name: 'get_subagent_result',
        desc: '获取指定子代理的执行结果',
        schema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '子代理ID' },
          },
          required: ['id'],
        },
        exec: async (args) => {
          const agent = subAgentManager.getAgent(args.id);
          if (!agent) return JSON.stringify({ error: `子代理 ${args.id} 不存在` });
          return JSON.stringify(agent.toJSON());
        },
      },
      {
        name: 'cancel_subagent',
        desc: '取消指定子代理或全部子代理',
        schema: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '子代理ID，不传则取消全部' },
          },
        },
        exec: async (args) => {
          if (args.id) {
            const agent = subAgentManager.getAgent(args.id);
            if (!agent) return JSON.stringify({ error: `子代理 ${args.id} 不存在` });
            agent.cancel();
            return JSON.stringify({ ok: true, message: `已取消 ${args.id}` });
          }
          subAgentManager.cancelAll();
          return JSON.stringify({ ok: true, message: '已取消所有子代理' });
        },
      },
    ];

    for (const t of subTools) {
      t.openaiSchema = {
        type: 'function',
        function: { name: t.name, description: t.desc, parameters: t.schema },
      };
      this.tools.push(t);
    }
  }

  // 获取 OpenAI 工具格式列表
  async getSchemas() {
    await this._mcpReady;
    return this.tools.map(t => t.openaiSchema);
  }

  // 执行工具
  async execute(name, args) {
    await this._mcpReady;
    const tool = this.tools.find(t => t.name === name);
    if (!tool) return `未知工具: ${name}`;
    try {
      return await tool.exec(args);
    } catch (e) {
      return `执行错误: ${e.message}`;
    }
  }

  // 查找工具
  find(name) { return this.tools.find(t => t.name === name); }

  // 按类别分组
  getGroups() {
    const groups = {};
    for (const t of this.tools) {
      const prefix = t.name.split('_')[0];
      const cat = t.name.startsWith('mcp_') ? 'MCP' :
                  /read|write|edit|delete|rename|list/.test(prefix) ? '文件' :
                  /search|grep|glob/.test(prefix) ? '搜索' :
                  /exec|run/.test(prefix) ? '执行' :
                  /web/.test(prefix) ? '网络' : '项目';
      (groups[cat] = groups[cat] || []).push(t.name);
    }
    return groups;
  }
}

module.exports = ToolSystem;
