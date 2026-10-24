// qq_sticker_collect：收一张图进表情库。
import { defineQQTool, idOnly } from '../shell.js';

export function stickerCollect({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_sticker_collect',
    description: 'Collect an image into the sticker library so qq_send can send it later as a sticker segment. '
      + 'The bytes are stored on disk, so it still works tomorrow. Source is either seq (+ index) from a message, '
      + 'or url from this bridge\'s short URL (external URLs are refused). desc is required and is the only way to '
      + 'pick it later - be specific ("cat hugging a fish"), not "sticker1". The same image (same md5) is not '
      + 'duplicated, only its description is updated. Returns { replaced, id, shortId, desc, file }.',
    parameters: {
      seq: idOnly('Locator of the message. Use either seq or url.'),
      index: { type: 'integer', description: 'Which image in that message, from 0. Default 0.' },
      url: { type: 'string', description: 'Short URL issued by this bridge. Use either seq or url.' },
      desc: { type: 'string', required: true, description: 'Description, required. Specific enough to pick by later.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Tags such as ["cat","funny"]. Optional.' },
      localNote: { type: 'string', description: 'Private note, e.g. when and who sent it. Optional.' },
    },
    run: ({ key, args }) => bridge('stickerCollect', key, args),
  });
}
