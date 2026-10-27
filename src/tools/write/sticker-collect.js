// qq_sticker_collect：把图片/动图收进 QQ 收藏表情（custom face）。
import { defineQQTool, idOnly } from '../shell.js';

const ITEM = {
  type: 'object',
  additionalProperties: false,
  properties: {
    seq: idOnly('Message locator: collect an image from that message. Use either seq or path.'),
    index: { type: 'integer', description: 'Which image in that message, from 0. Default 0.' },
    path: {
      type: 'string',
      description: 'Local file in your workspace (e.g. /ws/pic.gif). Not a URL, not /m/...; host paths are rejected when a workspace mapping exists.',
    },
    desc: {
      type: 'string',
      description: 'Description of this sticker; how you will pick it later (e.g. "cat hugging a fish"). Required and must be unique among your stickers.',
    },
    tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags such as ["cat","funny"].' },
    localNote: { type: 'string', description: 'Optional private note, e.g. who sent it and when.' },
  },
};

export function stickerCollect({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_sticker_collect',
    description: 'Collect one or more images or GIFs into THIS ACCOUNT\'s QQ favorites (custom faces), so they can be sent '
      + 'later as stickers. Each item is either a message seq (+ index) or a local workspace path; one item failing does '
      + 'not stop the rest. desc is required for every item - it is how you will pick the sticker later. '
      + 'Returns { total, collected: [{ emoji_id, md5, desc, from }], failed: [{ index, error }] }. '
      + 'Forwarded chat records are not supported yet.',
    parameters: {
      items: {
        type: 'array',
        description: 'Stickers to collect.',
        items: ITEM,
      },
    },
    run: ({ key, args }) => bridge('stickerCollect', key, args),
  });
}
