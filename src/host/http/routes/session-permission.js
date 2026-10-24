// POST /session/permission { sessionId, preset } → { preset, names }
import { readJson } from '../body.js';
import { fail } from '../fail.js';

export function sessionPermission({ host }) {
  return {
    method: 'POST',
    path: '/session/permission',
    handler: async ({ req }) => {
      try {
        const body = await readJson(req);
        if (!String(body.sessionId ?? '').trim()) {
          return { status: 400, body: { ok: false, error: 'bad-session', message: '缺少 sessionId' } };
        }
        return { body: { ok: true, ...host.setPermission({ sessionId: body.sessionId, preset: body.preset }) } };
      } catch (error) {
        return fail(error);
      }
    },
  };
}
