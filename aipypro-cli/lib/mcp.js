// ============================================================
// MCP 客户端模块 — Model Context Protocol 工具集成
// ============================================================
const { CFG } = require('./config');

let Client, StdioClientTransport;
try {
  ({ Client } = require('@modelcontextprotocol/sdk/client/index.js'));
  ({ StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js'));
} catch {}

const DEFAULT_MCP_SERVERS = {
  filesystem: {
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
  },
  fetch: {
    command: 'npx',
    args: ['-y', '@anthropic/mcp-fetch'],
  },
};

class MCPManager {
  constructor() {
    this.clients = new Map();
    this.tools = new Map();
    this.initialized = false;
    this.sdkAvailable = !!(Client && StdioClientTransport);
  }

  async initialize() {
    if (this.initialized) return;
    if (!this.sdkAvailable) {
      this.initialized = true;
      return;
    }
    const servers = (CFG.mcpServers && Object.keys(CFG.mcpServers).length > 0)
      ? CFG.mcpServers
      : DEFAULT_MCP_SERVERS;
    for (const [name, config] of Object.entries(servers)) {
      try {
        await this.connectServer(name, config);
      } catch (e) {
        console.warn(`MCP 服务器 ${name} 连接失败: ${e.message}`);
      }
    }
    this.initialized = true;
  }

  async connectServer(name, config) {
    if (!this.sdkAvailable) return;
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args || [],
      env: { ...process.env, ...config.env },
    });
    const client = new Client({ name: `aipypro-${name}`, version: '5.0.0' }, { capabilities: {} });
    await client.connect(transport);
    this.clients.set(name, client);
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const toolName = `mcp_${name}_${tool.name}`;
      this.tools.set(toolName, {
        name: toolName,
        desc: `[MCP:${name}] ${tool.description}`,
        schema: tool.inputSchema,
        server: name,
        originalName: tool.name,
        exec: async (args) => {
          try {
            const result = await client.callTool({ name: tool.name, arguments: args });
            return result.content?.[0]?.text || JSON.stringify(result);
          } catch (e) {
            return `MCP 工具执行错误: ${e.message}`;
          }
        },
      });
    }
  }

  async disconnectAll() {
    for (const [name, client] of this.clients) {
      try { await client.close(); } catch {}
    }
    this.clients.clear();
    this.tools.clear();
    this.initialized = false;
  }

  getTools() { return Array.from(this.tools.values()); }
  getTool(name) { return this.tools.get(name); }
  listServers() { return Array.from(this.clients.keys()); }
}

const mcpManager = new MCPManager();
module.exports = { mcpManager, MCPManager };
