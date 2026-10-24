// POST /cancel { sessionId } → { accepted }
import { readJson } from '../body.js';
import { fail } from '../fail.js';

export function cancel({ host }) {
  return {
    method: 'POST',
    path: '/cancel',
    handler: async ({ req }) => {
      try {
        const body = await readJson(req);
        const sessionId = String(body.sessionId ?? '').trim();
        if (!sessionId) return { status: 400, body: { ok: false, error: 'bad-session', message: '缺少 sessionId' } };
        return { body: { ok: true, ...(await host.cancelTurn({ sessionId })) } };
      } catch (error) {
        return fail(error);
      }
    },
  };
}
