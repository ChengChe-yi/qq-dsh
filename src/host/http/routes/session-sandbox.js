// POST /session/sandbox { sessionId, mode } → { mode }
import { readJson } from '../body.js';
import { fail } from '../fail.js';

export function sessionSandbox({ host }) {
  return {
    method: 'POST',
    path: '/session/sandbox',
    handler: async ({ req }) => {
      try {
        const body = await readJson(req);
        if (!String(body.sessionId ?? '').trim()) {
          return { status: 400, body: { ok: false, error: 'bad-session', message: '缺少 sessionId' } };
        }
        return { body: { ok: true, ...host.setSandbox({ sessionId: body.sessionId, mode: body.mode }) } };
      } catch (error) {
        return fail(error);
      }
    },
  };
}
