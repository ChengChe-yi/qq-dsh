// qq_user_info：查任意 QQ 的资料（不限于本群成员）。
//
// 一次答三件事：这个号在不在当前群、群内身份、账号资料 + 头像地址。
// 返回按 include 分组，不传就全给；组内字段仍然判空，不凑数。
import { defineQQTool, idOnly } from '../shell.js';

const INCLUDE = ['basic', 'member', 'avatar'];

export function userInfo({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_user_info',
    description: 'Profile of any QQ number - not only current group members. '
      + 'Returns { qq, inGroup, ... } where inGroup says whether that number is in this group '
      + '(absent in private chats). Groups: basic = nickname/sex/age/qqLevel/qage/signature/loginDays; '
      + 'member = { groupId, member: { card, groupRole, title, level, joinTime, lastSentTime, mutedUntil? } }; '
      + 'avatar = { small, large } qlogo URLs. Empty fields are omitted rather than returned blank. '
      + 'It does not report "is a bot" - that OneBot flag only covers officially registered accounts '
      + 'and would mislead for the many self-hosted bots.',
    parameters: {
      qq: { ...idOnly('Target QQ number, digits only.'), required: true },
      include: {
        type: 'array',
        items: { type: 'string', enum: INCLUDE },
        description: 'Field groups to return: basic / member / avatar. Default all three. '
          + 'Ask for less when you only need one thing (cheaper context).',
      },
    },
    run: ({ key, args }) => bridge('userInfo', key, args),
  });
}
