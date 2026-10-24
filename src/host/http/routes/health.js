// GET /health —— 探活：活会话数 / 活 agent 数。
import { VERSION } from '../../../shared/version.js';

export function health({ host, lifecycle }) {
  return {
    method: 'GET',
    path: '/health',
    handler: () => ({
      body: {
        ok: true,
        protocol: 1,
        name: 'qq-dsh-host',
        version: VERSION,
        pid: process.pid,
        startedAt: new Date(lifecycle.startedAt).toISOString(),
        uptimeMs: Date.now() - lifecycle.startedAt,
        ...host.snapshot(),
      },
    }),
  };
}
