// 传输层：监听、鉴权、分发、兜底。业务在 routes/，这里不认识任何端点名。
import http from 'node:http';
import { readToken, tokenMatches } from '../auth.js';
import { json } from './respond.js';

export async function startServer({ host, port, tokenFile, routes, lifecycle, logger }) {
  const startedAt = Date.now();
  const server = http.createServer((req, res) => {
    dispatch(req, res).catch((error) => {
      logger?.warn?.('qq-dsh-host 请求失败', { url: req.url, error: String(error?.message ?? error) });
      if (!res.headersSent) json(res, 500, { ok: false, error: 'internal' });
      else res.end();
    });
  });

  async function dispatch(req, res) {
    const { pathname } = new URL(req.url ?? '/', 'http://qq-dsh-host.invalid');
    const route = routes.find((r) => r.path === pathname);

    if (!route) return json(res, 404, { ok: false, error: 'not-found' });
    if (route.method !== req.method) return json(res, 405, { ok: false, error: 'method-not-allowed' });

    if (route.auth !== false) {
      const token = readToken(tokenFile);
      if (!token) return json(res, 503, { ok: false, error: 'token-unavailable' });
      if (!tokenMatches(req.headers.authorization, token)) {
        return json(res, 401, { ok: false, error: 'unauthorized' });
      }
    }

    // handler 返回 { status?, body } = 由这里发；返回 undefined = 已自行处理（如 SSE）。
    const out = await route.handler({ req, res, lifecycle });
    if (out) json(res, out.status ?? 200, out.body);
  }

  await new Promise((resolve, reject) => {
    const onError = (error) => reject(new Error(`qq-dsh-host: 监听 ${host}:${port} 失败：${error.message}`));
    server.once('error', onError);
    server.listen(port, host, () => {
      server.removeListener('error', onError);
      resolve();
    });
  });

  // 桥接的回合可能很长，但连接本身不该被 keep-alive 拖住 close()。
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 70_000;

  const bound = server.address();
  const boundPort = typeof bound === 'object' && bound ? bound.port : port;
  const urlHost = host.includes(':') ? `[${host}]` : host;

  return {
    url: `http://${urlHost}:${boundPort}`,
    port: boundPort,
    startedAt,
    async close() {
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    },
  };
}
