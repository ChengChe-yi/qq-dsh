// qq_where：不需要桥接，纯本地 —— 用来确认工具知道自己在哪个会话。
import { defineQQTool } from '../shell.js';

export function where({ ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_where',
    description: 'Return the identity of the current QQ conversation (session id and conversation key). '
      + 'Takes no arguments.',
    run: ({ key, sessionId }) => ({ sessionId, conv: key }),
  });
}
