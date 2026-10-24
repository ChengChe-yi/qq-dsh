// 桥接工具面的客户端：POST /api { op, args }。
// 身份用宿主令牌（x-qq-host），会话 key 由调用方给出（来自会话 cwd）。
import { requireToken } from '../shared/token.js';

export function createBridge({ bridgeUrl, tokenFile, logger = null }) {
  // 每次调用现读 —— 令牌轮换不用重启（读法与 host 共用 shared/token.js）。
  const token = () => requireToken(tokenFile, 'qq-dsh-tools');

  return async function callBridge(op, key, args = {}, { signal } = {}) {
    const host = token();

    const res = await fetch(`${bridgeUrl}/api`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-qq-host': host },
      body: JSON.stringify({ op, args: { ...args, key } }),
      // 用户按"终止"时把在途请求一起断掉（桥接那边会自己超时收尾）。
      ...(signal ? { signal } : {}),
    });

    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { ok: false, error: text.slice(0, 200) };
    }

    if (!res.ok || body?.ok === false) {
      // 错误文本与 code 都来自桥接 —— 那一层知道"哪个工具、为什么失败、该怎么改"
      // （见 src/api/handlers/*）。插件这里只负责**原样透传**，一个字都不改写。
      const detail = body?.error ?? `HTTP ${res.status}`;
      const code = String(body?.code ?? '');
      logger?.warn?.('桥接工具调用失败', { op, key, status: res.status, code, error: detail });
      throw new Error(`桥接 ${op} 失败${code ? `（${code}）` : ''}：${detail}`);
    }
    return body.result;
  };
}
