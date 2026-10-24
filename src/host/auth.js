// 令牌校验：读法在 ../shared/token.js（与 tools 共用一份），这里只管 Bearer 比较。
import crypto from 'node:crypto';
import { MIN_TOKEN_LEN, readToken } from '../shared/token.js';

export { MIN_TOKEN_LEN, readToken };

// 启动期检查：读不到就别起服务（fail-closed）。
export function assertToken(file) {
  if (!readToken(file)) {
    throw new Error(
      `qq-dsh-host: 读不到令牌文件 ${file}（先跑 node scripts/make-host-token.mjs）`,
    );
  }
}

// 常量时间比较；长度不同直接失败。
export function tokenMatches(header, token) {
  const got = String(header ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!got || !token) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
