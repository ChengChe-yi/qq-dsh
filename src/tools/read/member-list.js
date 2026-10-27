// qq_member_list：在群里筛人（不是全量列出）。
import { defineQQTool } from '../shell.js';

export function memberList({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_member_list',
    description: 'Filter members of the current group - not a full roster (large groups have thousands). '
      + 'Returns { total, matched, shown, members, note? }: total is the group size, so do not treat members as '
      + 'everyone. Each entry has the member fields of qq_user_info. Sorting decides who you see; only the first '
      + 'limit entries are returned.',
    parameters: {
      role: { type: 'string', enum: ['groupOwner', 'admin', 'member'], description: 'Only this group role.' },
      name: { type: 'string', description: 'Substring match on card and nickname, case-insensitive.' },
      hasTitle: { type: 'boolean', description: 'Only members with a custom title.' },
      sort: { type: 'string', enum: ['active', 'joinTime', 'level'], description: 'active (default) / joinTime / level.' },
      limit: { type: 'integer', description: 'Max entries. Default 30, cap 100.' },
    },
    run: ({ key, args }) => bridge('memberList', key, args),
  });
}
