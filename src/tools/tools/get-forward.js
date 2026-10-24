// qq_get_forward：展开一条合并转发（聊天记录卡片）。
import { defineQQTool, idOnly } from '../shell.js';

export function getForward({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_get_forward',
    description: 'Expand a merged forward (the "chat history" card), which only shows as [forward] in context. '
      + 'Returns each node\'s sender and textual body; a node with an images field has images (the count). '
      + 'To see an image in one node, call again with index (0-based, the position in messages) and imgIndex. '
      + 'An image failure does not fail the call: it falls back to text explaining why (expired / download failed).',
    parameters: {
      seq: idOnly('Locator of the forward message.'),
      id: idOnly('Id of the forward segment. Usually unnecessary; pass seq instead.'),
      index: { type: 'integer', description: 'Which node to pull an image from, from 0. Omit to just list nodes.' },
      imgIndex: { type: 'integer', description: 'Which image inside that node, from 0. Default 0.' },
    },
    run: ({ key, args }) => bridge('getForwardMessages', key, args),
  });
}
