// qq-dsh-host：桥接的 dsh 侧**连接**插件（只有传输，不含任何 QQ 工具）。
//
//   HTTP 端点 → host.js（会话/工作区/事件）→ harness 服务
//
// 工具面在独立插件 `qq-tools` 里（工具必须挂在 preset 作用域才可见，
// 而传输要在宿主平面只起一份）。
import { resolveConfig } from './config.js';
import { assertToken } from './auth.js';
import { createHost } from './host.js';
import { createRoutes } from './http/routes/index.js';
import { startServer } from './http/server.js';
import { VERSION } from '../shared/version.js';

const name = 'qq-dsh-host';

// 两个服务都在 web profile 的宿主平面上；缺任一个就不激活，
// 免得起来一个永远报 0 的假端点。
const inject = ['sessions', 'agents'];

// cordis 会把插件的**返回值**当成 effect 收集，返回 server 会报 Invalid effect。
// 所以测试用 boot()（返回 server），插件入口 apply() 只负责启动。
async function boot(ctx, config) {
  const cfg = resolveConfig(config);
  assertToken(cfg.tokenFile);

  const lifecycle = { startedAt: Date.now() };
  const host = createHost(ctx);
  const routes = createRoutes({ host, lifecycle });

  const server = await startServer({ ...cfg, routes, lifecycle, logger: ctx.logger });
  ctx.logger?.info?.('qq-dsh-host 已监听', { url: server.url, version: VERSION });

  // 卸载/热重载时关监听，否则下次加载会撞端口。
  ctx.effect(() => () => server.close(), 'qq-dsh-host.server');

  return server;
}

async function apply(ctx, config) {
  await boot(ctx, config);
}

export { apply, boot, inject, name, VERSION };
