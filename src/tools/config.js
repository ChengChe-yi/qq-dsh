// tools 的配置：桥接工具面地址 + 宿主令牌文件 + 渲染器所在的桥接根。
//
// 键名、默认值、推导规则全在 `../shared/config.js`（`CONFIG_KEYS` 是唯一清单）。
// 这里只做两件本项目特有的事：
//   · `bridgeRoot` 允许从**标准布局**的 tokenFile 反推（`<root>/state/host-token`）；
//   · 反推不出来也不报错 —— `bridgeRoot` 只被 `qq_usage` 用来加载 mcp-md 渲染器，
//     缺了它用量卡片退回纯文本，不该让整个工具挂掉（但启动日志里会 WARN）。
import { resolveBridgeConfig, rootFromTokenFile } from '../shared/config.js';

export function resolveConfig(config) {
  const c = config ?? {};
  const base = resolveBridgeConfig(c, 'qq-dsh-tools');

  let bridgeRoot = base.bridgeRoot;
  if (!bridgeRoot) {
    const derived = rootFromTokenFile(base.tokenFile);
    if (derived) {
      bridgeRoot = derived;
      base.sources.bridgeRoot = 'derived:tokenFile';
    }
  }

  return {
    bridgeUrl: base.bridgeUrl,
    tokenFile: base.tokenFile,
    bridgeRoot,
    // 值从哪来（config / env / default / derived）—— 启动日志打出来，排查时不用猜。
    sources: base.sources,
  };
}
