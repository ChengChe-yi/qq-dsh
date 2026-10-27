// qq_get_content：取消息内容（图 / 语音 / 视频 / 文件 / 合并转发）。
//
// 合并了原来的 qq_get_message_images / qq_get_voice / qq_get_forward ——
// 三个工具的参数语义本来就不一致（`index` 在前两个里是"第几个同类段"、
// 在转发里是"第几个节点"），分开教模型只会让它猜。现在拆成两个正交维度：
//   `pick` = 该层级里第几个同类媒体段；`node` = 转发里的第几个节点。
import { defineQQTool, idParam } from '../shell.js';

export function getContent({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_get_content',
    description:
      'Read the content of one or more messages: images, voice, video, files, merged forwards. '
      + 'In context these only appear as markers like [image] / [record] / [video] / [file] / [forward], so this '
      + 'is how you actually reach them. `seq` takes one locator or a list (up to 3 messages); every result item '
      + 'is labelled with its seq and position so you never lose track of where it came from.\n'
      + '\n'
      + '`kind` picks what to pull (default "all" = everything in those messages):\n'
      + '  - "image": images come back as real pictures. One image is attached right away; several give a summary '
      + '(size, format, animated, position) first - call again with `pick` (or `view: true`) for the ones you need. '
      + 'At most 4 media per call. Each image also carries a local URL (usable as qq_send image.url) and a WSL '
      + 'path, valid for an hour; repeats are served from the local media cache.\n'
      + '  - "voice": saves the audio into the media library and returns a URL + WSL path. You CANNOT hear it - '
      + 'this does not transcribe anything, and you must never pretend to know what was said. It is for keeping '
      + 'the file: to forward it, or to process it with ffmpeg. Prefers the server-side mp3 transcode.\n'
      + '  - "video": same idea - you CANNOT see the picture. It returns a URL + WSL path only; if you really need '
      + 'a frame, extract it yourself with ffmpeg from that path.\n'
      + '  - "file": returns a URL + the original file name.\n'
      + '  - "forward": a merged forward (the "chat history" card) only shows as [forward] and its body is not in '
      + 'the event at all, so it must be expanded. Returns each node\'s sender, time, text and its media counts '
      + '(`media: {image, voice, video, file, forward}`). At most 30 nodes by default (`limit` to change). '
      + 'When a node itself can forward, `media.forward` > 0 - that is a nested card, and `node` is how you get in: '
      + 'it is a PATH, so [1] enters node 1 and [1, 0] enters node 0 of the card inside node 1 (up to 3 levels). '
      + 'Every listed node already carries its own path - pass it back verbatim.\n'
      + '\n'
      + 'Failures are honest and partial: a locator that does not exist, a missing kind, an out-of-range index or '
      + 'an over-budget call come back in `problems`; one item failing never fails the call. An empty `node` level '
      + 'says what is actually there (e.g. "there is a forward here") instead of a bare "nothing".',
    parameters: {
      seq: idParam('Locator(s) of the message(s), e.g. 296094 / 1008#52 / [296094, 296100].'),
      kind: {
        type: 'string',
        enum: ['all', 'image', 'voice', 'video', 'file', 'forward'],
        description: 'What to pull. Default "all". Use "forward" to expand a chat-history card first, '
          + 'including a card inside a node (with `node`).',
      },
      node: {
        // 两种都收：桥接侧同样两种都认（`parseNodePath`）。
        //
        // ⚠️ 别把它写成单一的 `type: 'array'` —— 2026-10-27 实测踩过死锁：
        //    插件（新）只认数组、桥接（旧）只认整数，而两边是**分别重启**的，
        //    于是 `node: 1` 被插件挡、`node: [1]` 被桥接挡，工具直接不可用。
        //    放宽到 oneOf 之后，任何一半落后都还能用。
        oneOf: [
          { type: 'integer' },
          { type: 'array', items: { type: 'integer' } },
        ],
        description: 'Path of nested forward nodes, from 0: 1 or [1] = node 1 of the card; '
          + '[1, 0] = node 0 of the card inside node 1. Max 3 levels. Given, the call reads that '
          + 'position\'s content. Combine with kind="forward" to expand the card found there.',
      },
      pick: {
        type: 'integer',
        description: 'Which item of that kind, from 0 (the 2nd image in the message, etc.). '
          + 'Omit for all of them. Do not combine with kind="forward".',
      },
      view: {
        type: 'boolean',
        description: 'Fetch image pixels even when several images match (summary otherwise).',
      },
      limit: {
        type: 'integer',
        description: 'kind="forward" only: how many nodes to list (default 30, max 100).',
      },
    },
    run: ({ key, args }) => bridge('getMessageContent', key, args),
  });
}
