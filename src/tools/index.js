// qq-dsh-tools：QQ 工具插件，挂在 preset 里


import { VERSION } from '../shared/version.js';
import { resolveConfig } from './config.js';
import { createBridge } from './bridge.js';
import { where } from './tools/where.js';
import { unread } from './tools/unread.js';
import { readChat } from './tools/read-chat.js';
import { send } from './tools/send.js';
import { setNickname } from './tools/set-nickname.js';
import { setGroupCard } from './tools/set-group-card.js';
import { recall } from './tools/recall.js';
import { wait } from './tools/wait.js';
import { getContent } from './tools/get-content.js';
import { listStickers } from './tools/list-stickers.js';
import { stickerCollect } from './tools/sticker-collect.js';
import { stickerRename } from './tools/sticker-rename.js';
import { groupInfo } from './tools/group-info.js';
import { userInfo } from './tools/user-info.js';
import { memberList } from './tools/member-list.js';
import { usage } from './tools/usage.js';

const name = 'qq-dsh-tools';
const inject = ['tools', 'sessions'];

// 同一次进程里这份插件被挂载的次数。
//   · 挂 preset → 每个会话挂一次（ESM 只加载一次，所以模块级变量是共享的，看这个数就对）
//   · 挂宿主平面 → 恒为 1
// 恒为 1 说明按宿主平面挂了一份；>1 说明有人又按会话挂了。
let mounts = 0;

function apply(ctx, config) {
  mounts += 1;
  const mount = mounts;

  // 自检：挂宿主平面时这里会打印 1；挂 preset 时会按会话累加。
  const hasAttachments = Boolean(ctx.get?.('attachments') ?? ctx.attachments);
  ctx.logger?.info?.('qq-dsh-tools 挂载', { mount, hasAttachments });
  const cfg = resolveConfig(config);
  const bridge = createBridge({ ...cfg, logger: ctx.logger });

  const tools = [
    where({ ctx }),
    unread({ bridge, ctx }),
    readChat({ bridge, ctx }),
    send({ bridge, ctx }),
    setNickname({ bridge, ctx }),
    setGroupCard({ bridge, ctx }),
    recall({ bridge, ctx }),
    wait({ bridge, ctx }),
    getContent({ bridge, ctx }),
    listStickers({ bridge, ctx }),
    stickerCollect({ bridge, ctx }),
    stickerRename({ bridge, ctx }),
    groupInfo({ bridge, ctx }),
    userInfo({ bridge, ctx }),
    memberList({ bridge, ctx }),
    usage({
      bridge,
      ctx,
      bridgeRoot: cfg.bridgeRoot,
      sessions: ctx.sessions,
      projections: typeof ctx.get === 'function' ? ctx.get('sessionProjections') : null,
    }),
  ];

  for (const tool of tools) {
    ctx.effect(() => ctx.tools.register(tool), `qq-dsh-tools.${tool.name}`);
  }

  ctx.logger?.info?.('qq-dsh-tools 已注册', {
    count: tools.length, bridge: cfg.bridgeUrl, mount,
  });

  ctx.effect(() => () => {
    mounts -= 1;
    ctx.logger?.debug?.('qq-dsh-tools 已卸载', { mount, left: mounts });
  }, 'qq-dsh-tools.lifecycle');
}

export { apply, inject, name, VERSION };
export { convKeyOf } from './conv.js';
