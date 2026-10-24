// GET /session/config?session=<id> → 模型 / 思考强度 / 权限档 / 沙箱覆盖
import { fail } from '../fail.js';

export function sessionConfig({ host }) {
  return {
    method: 'GET',
    path: '/session/config',
    handler: ({ req }) => {
      try {
        const url = new URL(req.url ?? '/', 'http://qq-dsh-host.invalid');
        const sessionId = url.searchParams.get('session') ?? '';
        if (!sessionId) return { status: 400, body: { ok: false, error: 'bad-session', message: '缺少 session 参数' } };
        return { body: { ok: true, ...host.sessionConfig({ sessionId }) } };
      } catch (error) {
        return fail(error);
      }
    },
  };
}
