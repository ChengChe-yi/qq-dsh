// qq_unread：未读概览。只读，先看再决定要不要 qq_read_chat。
import { defineQQTool } from '../shell.js';

export function unread({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_unread',
    description: 'Unread overview for the current conversation: total unread count, per-day distribution, '
      + 'and the dates that have records. Call this before qq_read_chat to decide what to read. Takes no arguments.',
    run: ({ key }) => bridge('unread', key),
  });
}
