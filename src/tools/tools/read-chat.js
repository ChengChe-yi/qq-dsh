// qq_read_chat：查聊天记录（只读，默认不改已读）。
// 参数透传给桥接，插件不校验。
//
//  这份 `PARAMETERS` 是**唯一真源** —— 桥接的 `readChat()` 只按名字读 `args`，
//    不维护第二份 schema。加筛选条件只改这里（见 chatlog/query.js 的注释）。
import { defineQQTool, idParam } from '../shell.js';

const PARAMETERS = {
  seq: idParam('Message locator(s): one locator, or a range [from, to] (limit is ignored for a range).'),
  dates: {
    type: 'array',
    items: { type: 'string' },
    description: "Whole days to look in, 'YYYY-MM-DD'. See availableDates from qq_unread. For a time window inside a day use from/to.",
  },
  from: {
    type: 'string',
    description: "Lower time bound, 'YYYY-MM-DD HH:mm' (local) or an ISO timestamp. Independent of dates.",
  },
  to: {
    type: 'string',
    description: 'Upper time bound, same format as from (inclusive).',
  },
  contains: {
    type: 'string',
    description: 'Keyword over message text and sender nickname, case-insensitive. This is how you find "who said that thing".',
  },
  kinds: {
    type: 'array',
    items: { type: 'string', enum: ['text', 'mixed', 'image', 'record', 'video', 'forward', 'json', 'face'] },
    description: 'Only messages of these types. image/record pairs with qq_get_message_images / qq_get_voice.',
  },
  unreadOnly: { type: 'boolean', description: 'Only messages not read yet.' },
  sender: idParam('Filter by sender: one QQ number or several.'),
  role: {
    type: 'string',
    enum: ['owner', 'admin', 'member'],
    description: 'Only senders with this group role (owner = 群主, admin = 管理员).',
  },
  excludeRecalled: { type: 'boolean', description: 'Skip messages that were recalled. Default includes them, flagged recalled.' },
  order: {
    type: 'string',
    enum: ['asc', 'desc'],
    description: 'desc = newest first (default). asc = the same newest-N slice, returned in time order '
      + '(to read forward through an older stretch, narrow it with seq range or from/to first).',
  },
  limit: { type: 'integer', description: 'Newest N messages (default 20). Ignored when seq is a range.' },
  markRead: { type: 'boolean', description: 'Accepted but currently ignored - reading never changes read state.' },
};

export function readChat({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_read_chat',
    description: 'Read chat history of the current conversation. Returns { messages, count, marked, unreadRemaining, '
      + 'availableDates }; each message is { seq, time, sender, segmentsText, msgType, recalled?, quote? }. '
      + 'seq is the locator to use when quoting. Filters combine with AND. Read state is unchanged by default. '
      + 'You can filter by keyword (contains), type (kinds), time window (from/to), sender, group role, unread, '
      + 'seq range, and order the result ascending to read forward.',
    parameters: PARAMETERS,
    run: ({ key, args }) => bridge('readChat', key, args),
  });
}
