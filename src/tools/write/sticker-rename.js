// qq_sticker_rename：改已收藏表情的描述 / 标签 / 备注。
import { defineQQTool } from '../shell.js';

export function stickerRename({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_sticker_rename',
    description: 'Change the description, tags or note of a collected sticker; the image itself is untouched. '
      + 'For a QQ favorite (one with an emoji_id) the new description is also written back to QQ via '
      + 'modify_custom_face; older local-only entries are updated locally. Do it while you still remember the picture. '
      + 'ref accepts the full id, the shortId, or the current description - the same matching used when sending. '
      + 'Give at least one of desc / tags / localNote; tags replaces the whole array. Returns the old and new '
      + 'description, and lists the closest entries when nothing matches.',
    parameters: {
      ref: { type: 'string', required: true, description: 'Which sticker: full id, shortId, or its current description.' },
      desc: { type: 'string', description: 'New description. Cannot be empty.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'New tag array; replaces the old one.' },
      localNote: { type: 'string', description: 'New private note.' },
    },
    run: ({ key, args }) => bridge('stickerRename', key, args),
  });
}
