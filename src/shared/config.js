// 三个组件共用的桥接路径解析。

import path from 'node:path';

export const BRIDGE_HOME_ENV = 'QQ_DSH_BRIDGE_HOME';
export const DEFAULT_TOOLS_URL = 'http://127.0.0.1:3110';
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_HOST_PORT = 3130;


export const str = (v) => String(v ?? '').trim();


export function bridgeRoot(config) {
  return str(config?.bridgeRoot) || str(process.env[BRIDGE_HOME_ENV]);
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


export function promptPaths(config, owner) {
  const c = config ?? {};
  const root = bridgeRoot(c);
  const pick = (explicit, ...parts) => str(explicit) || (root ? path.join(root, ...parts) : '');
  const out = {
    bridgeRoot: root,
    dir: pick(c.dir, 'prompts'),
    rolesDir: pick(c.rolesDir, 'roles'),
    bridgeConfigFile: pick(c.bridgeConfigFile, 'config.json'),
    sessionsFile: pick(c.sessionsFile, 'state', 'sessions.json'),
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


export function isLoopbackHost(host) {
  const h = String(host ?? '').toLowerCase();
  return h === 'localhost' || h === '::1' || h === '[::1]' || /^127\./.test(h);
}


export function bridgeUrlOf(config, owner) {
  const raw = str(config?.bridgeUrl) || DEFAULT_TOOLS_URL;
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
      `  要么给 bridgeRoot 让默认的 <bridgeRoot>/state/host-token 生效。`,
    );
  }
  return path.join(root, 'state', 'host-token');
}
