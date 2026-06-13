const { EventEmitter } = require('events');

const STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

class SubAgent extends EventEmitter {
  constructor(id, task, options = {}) {
    super();
    this.id = id;
    this.task = task;
    this.status = STATUS.PENDING;
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.options = {
      timeout: options.timeout || 300000,
      maxTokens: options.maxTokens || 4096,
      tools: options.tools !== false,
      ...options,
    };
  }

  async run() {
    this.status = STATUS.RUNNING;
    this.startTime = Date.now();
    this.emit('start', this);
    try {
      const { callAI } = require('./agent');
      const messages = [
        { role: 'system', content: `你是子代理 ${this.id}，负责执行以下任务：\n${this.task}` },
        { role: 'user', content: this.task },
      ];
      this.result = await callAI(messages, {
        maxTokens: this.options.maxTokens,
        tools: this.options.tools,
      });
      this.status = STATUS.COMPLETED;
      this.endTime = Date.now();
      this.emit('complete', this);
    } catch (e) {
      this.error = e;
      this.status = STATUS.FAILED;
      this.endTime = Date.now();
      this.emit('error', this);
    }
    return this;
  }

  cancel() {
    this.status = STATUS.CANCELLED;
    this.endTime = Date.now();
    this.emit('cancel', this);
  }

  getDuration() {
    if (!this.startTime) return 0;
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }

  toJSON() {
    return {
      id: this.id,
      task: this.task,
      status: this.status,
      result: this.result,
      error: this.error?.message,
      duration: this.getDuration(),
    };
  }
}

class SubAgentManager extends EventEmitter {
  constructor() {
    super();
    this.agents = new Map();
    this.maxConcurrent = 5;
    this.running = 0;
  }

  async spawn(task, options = {}) {
    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const agent = new SubAgent(id, task, options);
    this.agents.set(id, agent);
    agent.on('start', () => { this.running++; this.emit('agentStart', agent); });
    agent.on('complete', () => {
      this.running--;
      this.emit('agentComplete', agent);
      // 完成后延迟清理，避免引用丢失
      setTimeout(() => { this.agents.delete(id); }, 60000);
    });
    agent.on('error', () => {
      this.running--;
      this.emit('agentError', agent);
      setTimeout(() => { this.agents.delete(id); }, 60000);
    });
    agent.on('cancel', () => {
      this.running--;
      this.emit('agentCancel', agent);
      setTimeout(() => { this.agents.delete(id); }, 60000);
    });
    if (this.running >= this.maxConcurrent) {
      await new Promise(resolve => {
        const check = () => {
          if (this.running < this.maxConcurrent) resolve();
          else setTimeout(check, 100);
        };
        check();
      });
    }
    agent.run().catch(err => {
      this.emit('agentError', agent);
      console.error(`子代理 ${id} 执行异常: ${err.message}`);
    });
    return agent;
  }

  getAgent(id) { return this.agents.get(id); }
  listAgents() { return Array.from(this.agents.values()); }
  getStats() {
    const agents = this.listAgents();
    return {
      total: agents.length,
      running: agents.filter(a => a.status === STATUS.RUNNING).length,
      completed: agents.filter(a => a.status === STATUS.COMPLETED).length,
      failed: agents.filter(a => a.status === STATUS.FAILED).length,
    };
  }
  cancelAll() {
    for (const agent of this.agents.values()) {
      if (agent.status === STATUS.RUNNING) agent.cancel();
    }
  }
}

const subAgentManager = new SubAgentManager();
module.exports = { SubAgent, SubAgentManager, subAgentManager, STATUS };
