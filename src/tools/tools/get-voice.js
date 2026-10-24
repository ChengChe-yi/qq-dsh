// qq_get_voice：把消息里的语音存进媒体库（模型听不到音频）。
import { defineQQTool, idParam } from '../shell.js';

export function getVoice({ bridge, ctx }) {
  return defineQQTool({
    ctx,
    name: 'qq_get_voice',
    description: 'Save the voice message(s) inside one or more messages into the local media library, and hand '
      + 'back a URL plus a WSL path. `seq` takes one locator or a list (up to 3 messages); without `index` '
      + 'every voice in them is saved, with `index` just that one. You CANNOT hear audio: this does not '
      + 'transcribe anything and you must not pretend to know what was said. It is for keeping the file - to '
      + 'forward it later, or to process it with ffmpeg. At most 4 voices per call; one failure does not stop '
      + 'the rest. Prefers the server-side transcode to mp3, falls back to the original file; repeats are '
      + 'served from the media cache.',
    parameters: {
      seq: idParam('Locator(s) of the message(s), e.g. 296094 / 1008#52 / [296094, 296100].'),
      index: { type: 'integer', description: 'Take only this voice (0-based) from each message. Omit for all of them.' },
    },
    run: ({ key, args }) => bridge('getVoice', key, args),
  });
}
