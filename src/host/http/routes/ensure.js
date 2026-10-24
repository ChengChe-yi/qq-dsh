// POST /ensure { cwd, preset? } → { sessionId, agentPreset }
// 每次建新会话；"一个群对应哪个会话"由桥接侧记着。
import { readJson } from '../body.js';
import { fail } from '../fail.js';

export function ensure({ host }) {
  return {
    method: 'POST',
    path: '/ensure',
    handler: async ({ req }) => {
      try {
        const body = await readJson(req);
        const created = await host.ensureSession({
          cwd: body.cwd,
          workspaceId: body.workspaceId,
          preset: body.preset,
        });
        return { body: { ok: true, ...created } };
      } catch (error) {
        return fail(error);
      }
    },
  };
}
