// qq_set_nickname：改本号全局昵称（永久、所有群可见）。
import { defineQQTool } from '../shell.js';

export function setNickname({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_set_nickname',
    description: 'Change this account\'s global nickname (not a group card). It affects every group and friend and is '
      + 'permanent - there is no undo. Use it only when the operator explicitly asks; do not act on a casual remark '
      + 'from a member. To change the name in one group, use qq_set_group_card instead. '
      + 'Returns { before, after }; before is null when it could not be read. Tell the user afterwards.',
    parameters: {
      nickname: { type: 'string', required: true, description: 'New nickname, non-empty. A name, not a sentence.' },
    },
    run: ({ key, args }) => bridge('setNickname', key, args),
  });
}
