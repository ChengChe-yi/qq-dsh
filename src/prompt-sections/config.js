// prompt-sections 的配置：薄薄一层，真正的解析在 ../shared/config.js
// （`CONFIG_KEYS` 是三个组件共用的唯一一份配置项清单）。
//
// 这里只多给一个 `sources`：每个路径是**显式配的**还是**从 bridgeRoot 推的**。
// 启动日志会打出来 —— "我以为它读的是 roles/，结果它读的是别处"这种问题，
// 光看返回值看不出来。
import { bridgeRootOf, promptPaths, str } from '../shared/config.js';

export { BRIDGE_HOME_ENV } from '../shared/config.js';

const OWNER = 'qq-dsh-prompt-sections';
const PATHS = ['dir', 'rolesDir', 'bridgeConfigFile', 'sessionsFile'];

export function resolveConfig(config) {
  const c = config ?? {};
  const paths = promptPaths(c, OWNER);
  const root = bridgeRootOf(c);

  const sources = { bridgeRoot: root.source ?? 'missing' };
  for (const key of PATHS) sources[key] = str(c[key]) ? 'config' : 'derived';

  return { ...paths, sources };
}
