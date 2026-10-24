// qq_send：往当前会话发消息（唯一能让群里看见的途径）。
import { defineQQTool, idParam } from '../shell.js';

// 引用 / @ 既可给一个值也可给数组；桥接自己会归一。
const qqList = (description) => idParam(description);

const IMAGE = {
  type: 'object',
  additionalProperties: true,
  properties: {
    url: {
      type: 'string',
      description: 'Image URL (one seen in context, or the /m/... URL from qq_get_*), '
        + 'or a workspace path like /ws/pic.png - local files are translated for you.',
    },
    base64: { type: 'string', description: 'base64 or data URL of an image you rendered. Copy it verbatim.' },
  },
  description: 'Image by url (URL or local path) or base64 (one of them).',
};

const SEGMENT = {
  type: 'object',
  additionalProperties: true,
  properties: {
    text: { type: 'string' },
    at: qqList('QQ number to notify.'),
    reply: qqList('Message locator (seq) to quote.'),
    image: IMAGE,
    voice: { type: 'string', description: 'Voice source: the /m/... URL from qq_get_voice. A voice segment must be the only one.' },
    sticker: { type: 'string', description: 'Collected sticker: ref / shortId / description.' },
    face: { type: 'integer', description: 'QQ built-in face id.' },
  },
  description: 'One segment; each element carries exactly one key. A voice segment must be the only one.',
};

const BUBBLE = {
  type: 'object',
  additionalProperties: true,
  properties: {
    reply: qqList('Quote this message: the locator from [seq:…] at the start of its line '
      + '(a group number such as 296094, or 1008#52 in private) — not a message id.'),
    at: qqList('Notify these QQ numbers.'),
    text: { type: 'string', description: 'Message text.' },
    image: IMAGE,
    voice: { type: 'string', description: 'Send a voice: the /m/... URL from qq_get_voice. Must be the ONLY key in this bubble.' },
    sticker: { type: 'string', description: 'Collected sticker: ref / shortId / description.' },
    face: { type: 'integer', description: 'QQ built-in face id.' },
    segments: { type: 'array', items: SEGMENT, description: 'Fully custom order of segments.' },
  },
  description: 'One bubble: either property style (reply/at/image/voice/sticker/face/text) or segments, not both. Voice can only be sent alone.',
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
