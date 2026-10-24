// 统一错误 → HTTP：HostError 带自己的状态码，JSON 语法错算 400，其余 500。
import { HostError } from '../host.js';

export function fail(error) {
  if (error instanceof HostError) {
    return { status: error.status, body: { ok: false, error: error.code, message: error.message } };
  }
  if (error instanceof SyntaxError) {
    return { status: 400, body: { ok: false, error: 'bad-json', message: error.message } };
  }
  return { status: 500, body: { ok: false, error: 'internal', message: String(error?.message ?? error) } };
}
