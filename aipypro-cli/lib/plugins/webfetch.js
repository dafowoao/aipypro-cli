const https = require('https');
const http = require('http');
const { URL } = require('url');

const MAX_BODY = 500000; // 500KB 响应上限（P4-M9）

module.exports = {
  name: 'web_fetch', desc: '读取网页内容',
  schema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  exec: async (args) => {
    if (!args?.url) return '请提供 url 参数';
    try {
      return await new Promise((resolve) => {
        let currentUrl = args.url;
        let redirectCount = 0;
        const MAX_REDIRECTS = 5;

        function doFetch(url) {
          const mod = url.startsWith('https://') ? https : http;
          const req = mod.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 15000,
          }, (res) => {
            // 处理重定向
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
              res.resume();
              req.destroy();
              redirectCount++;
              if (redirectCount > MAX_REDIRECTS) { resolve('重定向次数过多'); return; }
              try {
                currentUrl = new URL(res.headers.location, url).href;
              } catch {
                currentUrl = res.headers.location;
              }
              doFetch(currentUrl);
              return;
            }
            let d = '', exceeded = false;
            res.on('data', (c) => {
              if (exceeded) return;
              d += c;
              if (d.length > MAX_BODY) { exceeded = true; req.destroy(); resolve(extractText(d.substring(0, MAX_BODY))); }
            });
            res.on('end', () => { if (!exceeded) resolve(extractText(d)); });
          });
          req.on('timeout', () => { req.destroy(); resolve('请求超时'); });
          req.on('error', () => resolve('读取失败'));
        }

        doFetch(currentUrl);
      });
    } catch { return '读取失败'; }
  },
};

function extractText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 5000);
}