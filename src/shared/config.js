// 三个组件共用的桥接配置解析。
//
// ════════════════════════════════════════════════════════════════════════════
// 插件的配置项**只有这一份清单**（`CONFIG_KEYS`）
// ════════════════════════════════════════════════════════════════════════════
//
// 三个组件（prompt-sections / host / tools）共用同一套键名与同一套推导规则：
//
//     bridgeRoot ← 唯一必填（或环境变量 QQ_DSH_BRIDGE_HOME）
//         ├── tokenFile          <bridgeRoot>/state/host-token        （host / tools 用）
//         ├── dir                <bridgeRoot>/prompts                 （prompt-sections 用）
//         ├── rolesDir           <bridgeRoot>/roles
//         ├── bridgeConfigFile   <bridgeRoot>/config.json
//         └── sessionsFile       <bridgeRoot>/state/sessions.json
//
//     bridgeUrl  http://127.0.0.1:3110   只允许回环   （tools 用）
//     host       127.0.0.1               只允许回环   （host 用）
//     port       3130                                （host 用）
//
// ⚠️ 除了 `bridgeRoot`，**每一个都有默认值**。所以 yml 里最省的写法是三个组件
//    各给 `bridgeRoot`（同一个值，可用 YAML anchor 只写一遍），其余全部省略。
//    以前 yml 里重复写 `tokenFile` / `bridgeUrl` / `host` / `port` 是纯噪音，
//    而且一旦改了目录忘了改 tokenFile，两份就会不一致。
//
// ⚠️ `sources` 是刻意的：每个解析结果都带"这个值从哪来"（config / env / default /
//    derived）。排查"为什么它连的是 3110"时，日志里那行就够了，不用猜。

import path from 'node:path';

export const BRIDGE_HOME_ENV = 'QQ_DSH_BRIDGE_HOME';
export const DEFAULT_BRIDGE_URL = 'http://127.0.0.1:3110';
export const DEFAULT_TOOLS_URL = DEFAULT_BRIDGE_URL;   // 旧名，保留
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_HOST_PORT = 3130;

// 令牌文件的**固定形状**（`<bridgeRoot>/state/host-token`）。反推根目录时要靠它。
const STATE_DIR = 'state';
const HOST_TOKEN_NAME = 'host-token';

export const str = (v) => String(v ?? '').trim();

// ────────────────────────────────────────────────────────────── 配置项清单

// 唯一一份"插件有哪些配置项"的答案。三个组件都从这里读，别在别处再列一遍。
//
// `used` 是"哪个组件会读它"，`default` 是"不给时是什么"。没有 `default`
// 的（`bridgeRoot`）就是必填。
export const CONFIG_KEYS = Object.freeze({
  bridgeRoot: { used: ['prompt-sections', 'host', 'tools'], default: null, note: `必填，或设环境变量 ${BRIDGE_HOME_ENV}` },
  tokenFile: { used: ['host', 'tools'], default: '<bridgeRoot>/state/host-token' },
  bridgeUrl: { used: ['tools'], default: DEFAULT_BRIDGE_URL, note: '只允许回环' },
  host: { used: ['host'], default: DEFAULT_HOST, note: '只允许回环' },
  port: { used: ['host'], default: String(DEFAULT_HOST_PORT) },
  dir: { used: ['prompt-sections'], default: '<bridgeRoot>/prompts' },
  rolesDir: { used: ['prompt-sections'], default: '<bridgeRoot>/roles' },
  bridgeConfigFile: { used: ['prompt-sections'], default: '<bridgeRoot>/config.json' },
  sessionsFile: { used: ['prompt-sections'], default: '<bridgeRoot>/state/sessions.json' },
});

// ────────────────────────────────────────────────────────────── 根目录

// `{ value, source }`。三种来源：config / env / 缺失。
export function bridgeRootOf(config) {
  const explicit = str(config?.bridgeRoot);
  if (explicit) return { value: explicit, source: 'config' };
  const env = str(process.env[BRIDGE_HOME_ENV]);
  if (env) return { value: env, source: `env:${BRIDGE_HOME_ENV}` };
  return { value: '', source: null };
}

// 兼容旧调用点（其它模块 import 过这个名字）。
export function bridgeRoot(config) {
  return bridgeRootOf(config).value;
}

function missingRoot(owner) {
  return new Error(
    `${owner}: 没有配置桥接根目录。\n` +
    '  请在这一行的 config 里写 bridgeRoot（指向 qq-dsh-bridge 目录），\n' +
    `  或者设置环境变量 ${BRIDGE_HOME_ENV}。`,
  );
}

export function requireBridgeRoot(config, owner) {
  const root = bridgeRoot(config);
  if (!root) throw missingRoot(owner);
  return root;
}

// 从令牌文件**反推**根目录 —— 只认标准布局 `<root>/state/host-token`。
//
// ⚠️ 以前是无条件 `dirname(dirname(tokenFile))`：给一个 `/tmp/tok` 就会推出 `/`，
//    然后 `qq_usage` 拿着它去加载渲染器，报的错会离真正的原因很远。
//    形状不对就**不猜**（返回空），让调用方决定是降级还是报错。
export function rootFromTokenFile(tokenFile) {
  const file = path.normalize(str(tokenFile));
  if (!file) return '';
  if (path.basename(file) !== HOST_TOKEN_NAME) return '';
  if (path.basename(path.dirname(file)) !== STATE_DIR) return '';
  return path.dirname(path.dirname(file));
}

// ────────────────────────────────────────────────────────────── 各个键

export function isLoopbackHost(host) {
  const h = String(host ?? '').toLowerCase();
  return h === 'localhost' || h === '::1' || h === '[::1]' || /^127\./.test(h);
}

export function bridgeUrlOf(config, owner) {
  const raw = str(config?.bridgeUrl) || DEFAULT_BRIDGE_URL;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${owner}: bridgeUrl 不是合法 URL（${JSON.stringify(raw)}）`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${owner}: bridgeUrl 只支持 http/https（收到 ${url.protocol}）`);
  }
  if (!isLoopbackHost(url.hostname)) {
    throw new Error(`${owner}: bridgeUrl 只允许回环地址，收到 "${url.host}"（这个端点能驱动 agent）`);
  }
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, '')}`;
}

export function hostTokenFile(config, owner) {
  const explicit = str(config?.tokenFile);
  if (explicit) return explicit;
  const root = bridgeRoot(config);
  if (!root) {
    throw new Error(
      `${owner}: 缺 tokenFile。要么直接给绝对路径，\n` +
      `  要么给 bridgeRoot 让默认的 <bridgeRoot>/state/${HOST_TOKEN_NAME} 生效。`,
    );
  }
  return path.join(root, STATE_DIR, HOST_TOKEN_NAME);
}

export function hostOf(config, owner = 'qq-dsh-host') {
  const host = str(config?.host) || DEFAULT_HOST;
  if (!isLoopbackHost(host)) {
    throw new Error(`${owner}: 只允许回环地址，收到 "${host}"（这个端点能驱动 agent，不能绑到网络上）`);
  }
  return host;
}

export function portOf(config, owner = 'qq-dsh-host') {
  const port = Number(config?.port ?? DEFAULT_HOST_PORT);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new Error(`${owner}: port 不合法（${config?.port}）`);
  }
  return port;
}

export function promptPaths(config, owner) {
  const c = config ?? {};
  const root = bridgeRoot(c);
  const pick = (explicit, ...parts) => str(explicit) || (root ? path.join(root, ...parts) : '');
  const out = {
    bridgeRoot: root,
    dir: pick(c.dir, 'prompts'),
    rolesDir: pick(c.rolesDir, 'roles'),
    bridgeConfigFile: pick(c.bridgeConfigFile, 'config.json'),
    sessionsFile: pick(c.sessionsFile, STATE_DIR, 'sessions.json'),
  };
  if (!root) {
    const relative = Object.entries(out)
      .filter(([key, value]) => key !== 'bridgeRoot' && !path.isAbsolute(value))
      .map(([key]) => key);
    if (relative.length > 0) {
      throw new Error(
        `${owner}: 没有 bridgeRoot 时，这四项必须给绝对路径：${relative.join(', ')}\n` +
        '  要么设 bridgeRoot（其余四项留空即可推导），要么四项都写全。',
      );
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────── 一次解析

// 三个组件共用的**公共部分**（prompt-sections 额外要 `promptPaths`，host 额外要
// host/port —— 各自的 `resolveConfig` 在这之上补，但推导逻辑只在这里）。
//
// @returns `{ bridgeRoot, tokenFile, bridgeUrl, sources }`
export function resolveBridgeConfig(config, owner) {
  const c = config ?? {};
  const sources = {};

  const root = bridgeRootOf(c);
  sources.bridgeRoot = root.source ?? 'missing';

  const explicitToken = str(c.tokenFile);
  const tokenFile = hostTokenFile(c, owner);
  if (explicitToken) {
    sources.tokenFile = 'config';
  } else if (root.value) {
    sources.tokenFile = 'derived';
  }

  const bridgeUrl = bridgeUrlOf(c, owner);
  sources.bridgeUrl = str(c.bridgeUrl) ? 'config' : 'default';

  return { bridgeRoot: root.value, tokenFile, bridgeUrl, sources };
}
