// qq_get_message_images：看消息里的图（可以一次看好几条消息）。
import { defineQQTool, idParam } from '../shell.js';

export function getMessageImages({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_get_message_images',
    description: 'Show the images inside one or more messages. In context an image only shows as [image], so this '
      + 'is how you look. `seq` takes one locator or a list (up to 3 messages). '
      + 'When the request covers exactly one image it is attached right away; when it covers several you get a '
      + 'summary first (size, format, animated, which position) and no pixels - call again with `seq` + `index` '
      + 'and `view: true` for the ones you actually need. Every image is labelled with its seq and index so you '
      + 'never lose track of which message it came from. At most 4 images per call; a failed image comes back '
      + 'with an error and does not stop the others. Results also carry a local URL (usable as qq_send '
      + 'image.url) and a WSL path (usable from bash), valid for an hour; repeats are served from the local '
      + 'media cache.',
    parameters: {
      seq: idParam('Locator(s) of the message(s), e.g. 296094 / 1008#52 / [296094, 296100].'),
      index: { type: 'integer', description: 'Take only this image (0-based) from each message. Omit for all of them.' },
      view: { type: 'boolean', description: 'Fetch the pixels even when several images match (summary otherwise).' },
    },
    run: ({ key, args }) => bridge('getMessageImages', key, args),
  });
}
