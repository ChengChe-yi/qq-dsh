// qq_recall：撤回本号自己发的消息（2 分钟内，可多条）。
import { defineQQTool, idParam } from '../shell.js';

export function recall({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_recall',
    description: 'Recall messages this account just sent; several at once is fine. Only your own messages can be '
      + 'recalled. QQ only allows recall within about 2 minutes; when it is too late, say so instead of retrying. '
      + 'seq takes one locator or an array. Returns recalled / failed / notRecalled plus messages matching the input, '
      + 'each with seq or the reason it failed (too late / not yours / already recalled). '
      + 'One failure does not affect the others - retry only the failed ones.',
    parameters: {
      seq: idParam('Locator(s) of the messages to recall, e.g. 296094 / 1008#52 / [1, 2, 3].'),
    },
    run: ({ key, args }) => bridge('recall', key, args),
  });
}
