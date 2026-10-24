// POST /archive { sessionId, restore?, stopActivity? } → { archived, archivedSessionIds }
// QQ 里"重置上下文"就是：归档旧的 → /ensure 建新的。
import { readJson } from '../body.js';
import { fail } from '../fail.js';

export function archive({ host }) {
  return {
    method: 'POST',
    path: '/archive',
    handler: async ({ req }) => {
      try {
        const body = await readJson(req);
        const sessionId = String(body.sessionId ?? '').trim();
        if (!sessionId) return { status: 400, body: { ok: false, error: 'bad-session', message: '缺少 sessionId' } };

        const out = await host.setArchived({
          sessionId,
          archived: body.restore !== true,
          stopActivity: body.stopActivity !== false,
        });
        return { body: { ok: true, ...out } };
      } catch (error) {
        return fail(error);
      }
    },
  };
}
