// GET /sessions[?cold=0][&titles=1] → { sessions, archived }
// 默认含磁盘上的冷会话；cold=0 只扫活会话；titles=1 连冷会话的标题也去日志里捞。
import { fail } from '../fail.js';

export function sessions({ host }) {
  return {
    method: 'GET',
    path: '/sessions',
    handler: async ({ req }) => {
      try {
        const url = new URL(req.url ?? '/', 'http://qq-dsh-host.invalid');
        const includeCold = url.searchParams.get('cold') !== '0';
        const includeTitles = url.searchParams.get('titles') === '1';
        return { body: { ok: true, ...(await host.listSessions({ includeCold, includeTitles })) } };
      } catch (error) {
        return fail(error);
      }
    },
  };
}
