// GET /session-info?sessionId=… → { exists, live, status, seq, archived }
//
// 桥接每次投递前用它回答一个问题：**记着的那个会话还能不能用**。
// 三种"不能用"要区分开，因为处理方式都是重建，但日志里要说得清：
//   归档   archived=true      —— 从界面隐藏了，用户看不到任何动静
//   删除   exists=false      —— 会话没了
//   不存在 exists=false      —— 服务重启 / 换了实例
//
// 为什么不复用 /sessions：那个要扫全部会话（含磁盘快照），一条消息查一次太贵。
import { fail } from '../fail.js';

export function sessionInfo({ host }) {
  return {
    method: 'GET',
    path: '/session-info',
    handler: async ({ req }) => {
      try {
        const url = new URL(req.url ?? '/', 'http://qq-dsh-host.invalid');
        const sessionId = String(url.searchParams.get('sessionId') ?? '').trim();
        if (!sessionId) {
          return { status: 400, body: { ok: false, error: 'bad-session', message: '缺少 sessionId' } };
        }
        return { body: { ok: true, sessionId, ...(await host.sessionInfo({ sessionId })) } };
      } catch (error) {
        return fail(error);
      }
    },
  };
}
