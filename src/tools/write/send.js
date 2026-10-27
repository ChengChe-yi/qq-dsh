// qq_send：往当前会话发消息（唯一能让群里看见的途径）。
import { defineQQTool, idParam, idOnly } from '../shell.js';

// 引用 / @ 既可给一个值也可给数组；桥接自己会归一。
const qqList = (description) => idParam(description);

const IMAGE = {
  type: 'string',
  description: 'Image URL, or a path in your workspace (not a host path). '
    + 'External URLs are downloaded and cached before sending; prefer the /m/... URL from '
    + 'qq_get_* / latex_to_image / md_to_image. Base64 is not accepted.',
};

const VIDEO = {
  type: 'string',
  description: 'Video URL, or a path in your workspace (not a host path). '
    + 'External URLs are downloaded and cached before sending; prefer the /m/... URL. '
    + 'Base64 is not accepted. A video must be the only segment in its bubble.',
};

const SEGMENT = {
  type: 'object',
  additionalProperties: true,
  properties: {
    text: { type: 'string' },
    at: qqList('QQ number to notify.'),
    reply: idOnly('Message locator (seq) to quote. A bubble can quote only one message.'),
    image: IMAGE,
    voice: { type: 'string', description: 'Voice source: /m/... URL or a local path in your workspace (not a host path); external URLs are cached first. A voice segment must be the only one.' },
    video: VIDEO,
    sticker: { type: 'string', description: 'Collected sticker: ref / shortId / description. Sent as a QQ favorite (custom face) when it has an emoji_id; otherwise as an image. Must be the only segment.' },
    face: { type: 'integer', description: 'QQ built-in face id.' },
  },
  description: 'One segment; each element carries exactly one key. A voice, video or sticker segment must be the only one.',
};

const BUBBLE = {
  type: 'object',
  additionalProperties: true,
  properties: {
    reply: idOnly('Quote this message: the locator from [seq:…] at the start of its line '
      + '(a group number such as 296094, or 1008#52 in private) — not a message id. One per bubble.'),
    at: qqList('Notify these QQ numbers.'),
    text: { type: 'string', description: 'Message text.' },
    image: IMAGE,
    voice: { type: 'string', description: 'Send a voice: /m/... URL or a workspace path (not a host path); external URLs are cached first. Must be the ONLY key in this bubble.' },
    video: VIDEO,
    sticker: { type: 'string', description: 'Collected sticker: ref / shortId / description. Sent as a QQ favorite (custom face) when it has an emoji_id; otherwise as an image. Must be the ONLY key in this bubble.' },
    face: { type: 'integer', description: 'QQ built-in face id.' },
    forward: {
      type: 'array',
      description: 'A merged chat record (聊天记录), one card per bubble. Array of nodes, same grammar as messages: '
        + '{ "seqs": [1860, 1861] } forwards real messages (preserves sender/time/media); a normal node '
        + '(text / image / face / segments) is authored by this account; { "forward": [...] } nests another card. '
        + 'reply / at / voice / video / sticker are rejected inside it. Max 2 forward bubbles per send. '
        + 'Must be the ONLY key in this bubble.',
      items: { type: 'object', additionalProperties: true },
    },
    segments: { type: 'array', items: SEGMENT, description: 'Fully custom order of segments.' },
  },
  description: 'One bubble: either property style (reply/at/image/voice/video/sticker/face/forward/text) or segments, not both. Reply at most once; voice, video, sticker and forward can only be sent alone.',
};

export function send({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_send',
    description: 'Send messages to the current conversation. This is the only way the group sees you: plain text output is not sent to QQ. '
      + 'messages is an array, one element = one bubble; each bubble is either property style (expanded in the fixed order '
      + 'reply -> at -> media -> text) or segments (custom order). Do not mix the two in one bubble. '
      + 'reply and at are different things: reply says "this is what I am talking about", at says "notify this person". '
      + 'reply takes a locator seq, not a QQ messageId. Each bubble carries its own reply/at; put them on the bubble they belong to. '
      + 'A bubble quotes at most one message; voice, video, sticker and forward must be alone in their bubble. '
      + 'Image, voice and video addresses are downloaded into the local media store before sending; if one cannot be fetched the send fails. '
      + 'A forward bubble builds a merged chat record: { "forward": [{ "seqs": [1860, 1861] }] } forwards real messages, '
      + 'while normal nodes are authored by this account; nested { "forward": [...] } is allowed. '
      + 'QQ has no LaTeX: render formulas to an image first and send it in an image segment. '
      + 'For more than 2 bubbles, long text, or tables, render one image instead of flooding the chat. '
      + 'Hard limits: one bubble about 60 characters, one send at most 2 bubbles / about 120 characters. Past that do not split - '
      + 'run md_to_image and send that image; a short caption may share the bubble when the image is small, '
      + 'but a table or a long figure goes alone. '
      + 'Returns { sent, failed, notSent, messages }; each entry has seq (usable in reply / qq_recall) or error. '
      + 'One failure does not mean all failed: resend only the entries with error, never the whole batch. '
      + 'segmentsText is the text actually sent - read it once for typos or wrong @.',
    parameters: {
      messages: { type: 'array', items: BUBBLE, description: 'Messages to send, one element = one bubble.' },
      text: { type: 'string', description: 'Shortcut for a single plain-text bubble; do not use it with at/reply/image.' },
      dryRun: {
        type: 'boolean',
        description: 'true = render what would be sent and send nothing. Use it to proofread long or quoted messages, '
          + 'then repeat with dryRun off.',
      },
    },
    run: ({ key, args }) => bridge('send', key, args),
  });
}
