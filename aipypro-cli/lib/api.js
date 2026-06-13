// ============================================================
// API 客户端 — 支持流式和非流式
// ============================================================
const https = require('https');
const { CFG } = require('./config');
const { recordUsage } = require('./cost');
const { getModel, shouldFallback, getNextModel } = require('./fallback');

// ======================= 流式调用（SSE）=======================
// 返回 { text, toolCalls } 的 Promise
// onToken 回调每收到一个 token 就被调用
function chatStream(messages, tools = null, opts = {}, onToken = null) {
  return new Promise((resolve, reject) => {
    const model = opts.model || getModel();
    const body = JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxTokens ?? CFG.maxTokens ?? 4096,
      temperature: CFG.temperature ?? 0.1,
      stream: true,
      ...(tools ? { tools, tool_choice: 'auto' } : {}),
    });

    const url = new URL(CFG.apiUrl);
    const req = https.request({
      hostname: url.hostname, path: url.pathname,
      method: 'POST', timeout: 120000,
      headers: {
        'Authorization': `Bearer ${CFG.apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      // 检查 HTTP 状态码，非 2xx 直接报错
      if (res.statusCode >= 400) {
        let errBody = '';
        res.on('data', c => errBody += c);
        res.on('end', () => {
          let msg = `API 错误 ${res.statusCode}`;
          try { const j = JSON.parse(errBody); msg = j.error?.message || msg; } catch {}
          reject(new Error(msg));
        });
        return;
      }

      const MAX_SSE_BUF = 100000; // SSE 缓冲区上限（P5-M7）
      let buf = '', full = '';
      const tcMap = {};  // key: 自增序号，确保不碰撞
      let tcSeq = 0;     // 自增计数器
      let resolved = false;

      res.on('data', chunk => {
        buf += chunk.toString();
        // 缓冲区保护（P5-M7）
        if (buf.length > MAX_SSE_BUF) buf = buf.slice(-MAX_SSE_BUF / 2);
        const lines = buf.split('\n');
        buf = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') {
            resolved = true;
            const inputTokens = Math.ceil(JSON.stringify(messages).length / 4);
            const outputTokens = Math.ceil(full.length / 4);
            const usage = recordUsage(CFG.model, inputTokens, outputTokens);
            resolve({ text: full, toolCalls: Object.values(tcMap), usage });
            return;
          }
          try {
            const j = JSON.parse(data);
            const delta = j.choices?.[0]?.delta;

            // 工具调用（使用自增计数器，避免 index 缺失/碰撞）
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index != null ? tc.index : tcSeq++;
                if (!tcMap[idx]) tcMap[idx] = { id: '', name: '', args: '' };
                if (tc.id) tcMap[idx].id = tc.id;
                if (tc.function?.name) tcMap[idx].name = tc.function.name;
                if (tc.function?.arguments) tcMap[idx].args += tc.function.arguments;
              }
            }

            // 文本内容（独立 if，不因 tool_calls 的 continue 跳过）
            if (delta?.content) {
              full += delta.content;
              if (onToken) onToken(delta.content);
            }
          } catch { /* 跳过 */ }
        }
      });

      res.on('end', () => {
        if (resolved) return;
        const inputTokens = Math.ceil(JSON.stringify(messages).length / 4);
        const outputTokens = Math.ceil(full.length / 4);
        const usage = recordUsage(CFG.model, inputTokens, outputTokens);
        resolve({ text: full, toolCalls: Object.values(tcMap), usage });
      });
    });

    req.on('error', async (e) => {
      const error = new Error(`请求失败: ${e.message}`);
      if (shouldFallback(error) && !opts._isRetry) {
        const nextModel = getNextModel();
        if (nextModel) {
          console.log(`  ⚠ 模型 ${model} 不可用，切换到 ${nextModel}`);
          try {
            const result = await chatStream(messages, tools, { ...opts, model: nextModel, _isRetry: true }, onToken);
            resolve(result);
            return;
          } catch (fallbackErr) {
            reject(fallbackErr);
            return;
          }
        }
      }
      reject(error);
    });
    req.setTimeout(120000, () => { req.destroy(); reject(new Error('API 超时')); });
    req.write(body); req.end();
  });
}

module.exports = { chatStream };
