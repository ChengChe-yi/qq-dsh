// POST /session/model { sessionId, provider, model, reasoningEffort? } → { model }
import { readJson } from '../body.js';
import { fail } from '../fail.js';

export function sessionModel({ host }) {
  return {
    method: 'POST',
    path: '/session/model',
    handler: async ({ req }) => {
      try {
        const body = await readJson(req);
        const out = await host.selectModel({
          sessionId: body.sessionId,
          provider: body.provider,
          model: body.model,
          reasoningEffort: body.reasoningEffort,
        });
        return { body: { ok: true, ...out } };
      } catch (error) {
        return fail(error);
      }
    },
  };
}
