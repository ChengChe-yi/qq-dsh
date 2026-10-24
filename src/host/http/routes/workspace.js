// POST /workspace { path, title? } → { workspaceId, path, title, sessionIds }
import { readJson } from '../body.js';
import { fail } from '../fail.js';

export function workspace({ host }) {
  return {
    method: 'POST',
    path: '/workspace',
    handler: async ({ req }) => {
      try {
        const body = await readJson(req);
        return { body: { ok: true, ...(await host.ensureWorkspace({ path: body.path, title: body.title })) } };
      } catch (error) {
        return fail(error);
      }
    },
  };
}
