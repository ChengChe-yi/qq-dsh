// POST /prompt { sessionId, text } → { accepted: true }
import { readJson } from '../body.js';
import { fail } from '../fail.js';

const MAX_TEXT = 20_000;

export function prompt({ host }) {
  return {
    method: 'POST',
    path: '/prompt',
    handler: async ({ req }) => {
      try {
        const body = await readJson(req);
        const sessionId = String(body.sessionId ?? '').trim();
        const text = String(body.text ?? '');
        if (!sessionId) return { status: 400, body: { ok: false, error: 'bad-session', message: '缺少 sessionId' } };
        if (!text.trim()) return { status: 400, body: { ok: false, error: 'bad-text', message: 'text 为空' } };
        if (text.length > MAX_TEXT) {
          return { status: 413, body: { ok: false, error: 'text-too-long', message: `${text.length} > ${MAX_TEXT}` } };
        }
        return { body: { ok: true, ...(await host.sendPrompt({ sessionId, text })) } };
      } catch (error) {
        return fail(error);
      }
    },
  };
}
