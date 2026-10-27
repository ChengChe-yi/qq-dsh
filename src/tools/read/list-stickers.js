// qq_list_stickers：列出收藏表情。
import { defineQQTool } from '../shell.js';

export function listStickers({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_list_stickers',
    description: 'List THIS ACCOUNT\'s QQ favorites (custom faces) and rebuild the local sticker index from them. '
      + 'Each entry has ref (full id), shortId (first 8 chars of the md5) and a description; ref / shortId / description '
      + 'are all accepted on send. Entries with an emoji_id are sent as real QQ favorites; older local-only entries fall '
      + 'back to an image. If nothing fits, collect one with qq_sticker_collect; fix a bad description with qq_sticker_rename.',
    parameters: {
      limit: { type: 'integer', description: 'How many to list. Default 50.' },
    },
    run: ({ key, args }) => bridge('listStickers', key, args),
  });
}
