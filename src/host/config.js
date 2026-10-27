// host 的配置校验：启动期报错，不把问题留到运行时的 503。
//
// 键名、默认值、回环判定全在 `../shared/config.js`（`CONFIG_KEYS` 是唯一清单）——
// 这里只组合出这个组件要的三个值，并补上"这个值从哪来"。
import {
  DEFAULT_HOST, DEFAULT_HOST_PORT, hostOf, hostTokenFile, isLoopbackHost, portOf, str,
} from '../shared/config.js';

export function resolveConfig(config) {
  const c = config ?? {};

  // 顺序有意：先校验令牌（缺了它连启动都不该继续），再校验监听地址。
  const tokenFile = hostTokenFile(c, 'qq-dsh-host');
  const host = hostOf(c, 'qq-dsh-host');
  const port = portOf(c, 'qq-dsh-host');

  return {
    host,
    port,
    tokenFile,
    sources: {
      tokenFile: str(c.tokenFile) ? 'config' : 'derived',
      host: str(c.host) ? 'config' : `default:${DEFAULT_HOST}`,
      port: c.port !== undefined ? 'config' : `default:${DEFAULT_HOST_PORT}`,
    },
  };
}

// 回环判断只有一份实现（shared/config.js）；这里保留别名，旧的 import 不用改。
export const isLoopback = isLoopbackHost;
