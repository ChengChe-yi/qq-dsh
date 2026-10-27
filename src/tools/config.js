// tools 的配置：桥接工具面地址 + 宿主令牌文件 + 渲染器所在的桥接根。
//
// bridgeRoot 用于按需加载 mcp-md 的渲染器（qq_usage 的卡片图）；
// 不给就按 tokenFile 反推 <bridgeRoot>/state/host-token。
import path from 'node:path';
import { bridgeUrlOf, hostTokenFile, str } from '../shared/config.js';

export function resolveConfig(config) {
  const c = config ?? {};
  const tokenFile = hostTokenFile(c, 'qq-dsh-tools');
  return {
    bridgeUrl: bridgeUrlOf(c, 'qq-dsh-tools'),
    tokenFile,
    bridgeRoot: str(c.bridgeRoot) || path.dirname(path.dirname(tokenFile)),
  };
}
