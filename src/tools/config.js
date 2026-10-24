// tools 的配置：桥接工具面地址 + 宿主令牌文件。
//
// 两项都能从 bridgeRoot 推出来，所以换机器通常只改 profile 里的一行：
//   · bridgeUrl  默认 http://127.0.0.1:3110，只允许回环（归一化掉结尾斜杠）
//   · tokenFile  默认 <bridgeRoot>/state/host-token
// bridgeRoot 本身不进返回值 —— 它只是推导来源，别让调用方以为它有用。
import { bridgeUrlOf, hostTokenFile } from '../shared/config.js';

export function resolveConfig(config) {
  const c = config ?? {};
  return {
    bridgeUrl: bridgeUrlOf(c, 'qq-dsh-tools'),
    tokenFile: hostTokenFile(c, 'qq-dsh-tools'),
  };
}
