// tools 的配置：桥接工具面地址 + 宿主令牌文件。
//
// 键名、默认值、推导规则全在 `../shared/config.js`（`CONFIG_KEYS` 是唯一清单）。
import { resolveBridgeConfig } from '../shared/config.js';

export function resolveConfig(config) {
  const base = resolveBridgeConfig(config ?? {}, 'qq-dsh-tools');
  return {
    bridgeUrl: base.bridgeUrl,
    tokenFile: base.tokenFile,
    // 值从哪来（config / env / default / derived）—— 启动日志打出来，排查时不用猜。
    sources: base.sources,
  };
}
