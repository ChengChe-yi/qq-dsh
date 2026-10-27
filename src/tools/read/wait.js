// qq_wait：在当前回合里等下一个触发（@ / 引用 / 免 @ 名单）。
import { defineQQTool, idParam } from '../shell.js';

export function wait({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_wait',
    description: 'Wait inside the current turn for the next trigger (by default: someone @ you or quotes you). '
      + 'Returns when it arrives, or times out. No context is resent. qq is the no-mention list: people on it '
      + 'count as calling you without @; leave it out to require @ or a quote. '
      + 'It is only a trigger - messages said meanwhile are included in newMessages anyway. '
      + 'You do not choose the duration: about 5 minutes per call, with a per-turn cap; when the cap is used up it '
      + 'returns budgetExhausted. Timeouts slide while people keep talking. '
      + 'Returns { arrived, timeout, from, newMessages, omitted?, budgetExhausted?, waitedMs }. '
      + 'A timeout is not an error.',
    parameters: {
      qq: idParam('No-mention list: these people count as calling you without @.'),
    },
    run: ({ key, args, signal }) => bridge('wait', key, args, { signal }),
  });
}
