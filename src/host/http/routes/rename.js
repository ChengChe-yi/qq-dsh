// POST /rename { sessionId, title } → { title, seq }
import { readJson } from '../body.js';
import { fail } from '../fail.js';

export function rename({ host }) {
  return {
    method: 'POST',
    path: '/rename',
    handler: async ({ req }) => {
      try {
        const body = await readJson(req);
        return { body: { ok: true, ...(await host.renameSession({ sessionId: body.sessionId, title: body.title })) } };
      } catch (error) {
        return fail(error);
      }
    },
  };
}
