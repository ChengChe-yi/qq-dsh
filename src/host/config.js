// host 的配置校验：启动期报错，不把问题留到运行时的 503。
//
// tokenFile 可以显式给，也可以只给 bridgeRoot，让默认的
// <bridgeRoot>/state/host-token 生效（与 tools 共用同一套解析）。
import { DEFAULT_HOST, DEFAULT_HOST_PORT, hostTokenFile, isLoopbackHost, str } from '../shared/config.js';

export function resolveConfig(config) {
  const c = config ?? {};

  const tokenFile = hostTokenFile(c, 'qq-dsh-host');

  const host = str(c.host) || DEFAULT_HOST;
  if (!isLoopbackHost(host)) {
    throw new Error(`qq-dsh-host: 只允许回环地址，收到 "${host}"（这个端点能驱动 agent，不能绑到网络上）`);
  }

  const port = Number(c.port ?? DEFAULT_HOST_PORT);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error(`qq-dsh-host: port 不合法（${c.port}）`);
  }

  return { host, port, tokenFile };
}

// 回环判断只有一份实现（shared/config.js）；这里保留别名，旧的 import 不用改。
export const isLoopback = isLoopbackHost;
