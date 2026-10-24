// GET /session/usage?session=<id> → { usage, pressure, breakdown }
// usage   累计 token；pressure 最近一次请求的 prompt 大小与上下文窗口；
// breakdown 系统提示 / 工具 / 消息各占多少。
import { fail } from '../fail.js';

export function sessionUsage({ host }) {
  return {
    method: 'GET',
    path: '/session/usage',
    handler: ({ req }) => {
      try {
        const url = new URL(req.url ?? '/', 'http://qq-dsh-host.invalid');
        const sessionId = url.searchParams.get('session') ?? '';
        if (!sessionId) return { status: 400, body: { ok: false, error: 'bad-session', message: '缺少 session 参数' } };
        return { body: { ok: true, ...host.sessionUsage({ sessionId }) } };
      } catch (error) {
        return fail(error);
      }
    },
  };
}
