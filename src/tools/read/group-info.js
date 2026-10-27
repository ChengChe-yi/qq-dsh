// qq_group_info：当前群的信息（私聊不可用）。
import { defineQQTool } from '../shell.js';

export function groupInfo({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_group_info',
    description: 'Info about the current group: id, name, member count and cap, level, creation time, description, '
      + 'and allMuted (whether everyone is muted, so nobody can reply). Not available in private chats.',
    run: ({ key }) => bridge('groupInfo', key),
  });
}
