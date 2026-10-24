// qq_set_group_card：改本号在当前群的群名片（传空串 = 清空）。
import { defineQQTool } from '../shell.js';

export function setGroupCard({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_set_group_card',
    description: 'Change this account\'s card in the current group; other groups are unaffected. Not available in '
      + 'private chats. Only your own card can be changed. An empty string clears the card (a legal call, not a '
      + 'missing argument), after which the global nickname shows. Only do it when the operator explicitly asks.',
    parameters: {
      card: { type: 'string', required: true, description: 'New card. Empty string clears it. One line, not a paragraph.' },
    },
    run: ({ key, args }) => bridge('setGroupCard', key, args),
  });
}
