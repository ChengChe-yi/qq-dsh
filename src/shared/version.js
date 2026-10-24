// 版本号的**唯一来源**是包的 package.json。
import { readFileSync } from 'node:fs';

const FALLBACK = 'unknown';

function readVersion() {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
    const v = String(pkg.version ?? '').trim();
    return v || FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export const VERSION = readVersion();
