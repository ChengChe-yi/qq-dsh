// 路由表：加功能 = 加一个 routes/<name>.js + 这里一行。
// 默认需要 Bearer 令牌；只有确实要公开的端点才写 auth: false。
import { health } from './health.js';
import { ensure } from './ensure.js';
import { prompt } from './prompt.js';
import { cancel } from './cancel.js';
import { sessions } from './sessions.js';
import { sessionInfo } from './session-info.js';
import { workspace } from './workspace.js';
import { rename } from './rename.js';
import { archive } from './archive.js';
import { sessionConfig } from './session-config.js';
import { sessionModel } from './session-model.js';
import { sessionPermission } from './session-permission.js';
import { sessionSandbox } from './session-sandbox.js';
import { sessionUsage } from './session-usage.js';
import { models } from './models.js';
import { events } from './events.js';

export function createRoutes({ host, lifecycle }) {
  return [
    health({ host, lifecycle }),
    ensure({ host }),
    prompt({ host }),
    cancel({ host }),
    sessions({ host }),
    sessionInfo({ host }),
    workspace({ host }),
    rename({ host }),
    archive({ host }),
    sessionConfig({ host }),
    sessionModel({ host }),
    sessionPermission({ host }),
    sessionSandbox({ host }),
    sessionUsage({ host }),
    models({ host }),
    events({ host }),
  ].map((route) => ({ auth: true, ...route }));
}
