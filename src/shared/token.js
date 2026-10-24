// 宿主令牌：桥接侧生成，插件只读。

import fs from 'node:fs';


export const MIN_TOKEN_LEN = 16;


export function readToken(file) {
  try {
    const raw = String(fs.readFileSync(file, 'utf8')).trim();
    return raw.length >= MIN_TOKEN_LEN ? raw : '';
  } catch {
    return '';
  }
}

export function requireToken(file, owner) {
  const token = readToken(file);
  if (!token) {
    throw new Error(
      `${owner}: 读不到可用令牌（${file || '未配置 tokenFile'}）。\n` +
      '  先跑桥接侧的 scripts 生成 state/host-token，再把路径或 bridgeRoot 配进来。',
    );
  }
  return token;
}
