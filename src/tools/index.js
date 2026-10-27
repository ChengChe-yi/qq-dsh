// qq-dsh-tools：QQ 工具插件，挂在 preset 里


import { VERSION } from '../shared/version.js';
import { resolveConfig } from './config.js';
import { createBridge } from './bridge.js';

// ── 目录 = 契约（与桥接侧 `src/api/handlers/` 同一套）
//
//   `read/`   **不改外部可见状态**（桥接侧这些 op 没有 needsAllow）
//   `write/`  **会改外部可见状态**（桥接侧 needsAllow）
//   根目录    不绑某个会话的工具：`where`（本地解析会话）与 `usage`（用量卡片，走 authFree 的 imagePublish）
//
// 为什么按"读/写"而不是"消息/表情/成员"：读写是**契约**，桥接侧已经用 needsAllow 编码了；
// 对象归属是口味，新工具放哪儿每次都要重新讨论。

// ── read/
import { unread } from './read/unread.js';
import { readChat } from './read/read-chat.js';
import { wait } from './read/wait.js';
import { getContent } from './read/get-content.js';
import { listStickers } from './read/list-stickers.js';
import { groupInfo } from './read/group-info.js';
import { userInfo } from './read/user-info.js';
import { memberList } from './read/member-list.js';

// ── write/
import { send } from './write/send.js';
import { recall } from './write/recall.js';
import { setNickname } from './write/set-nickname.js';
import { setGroupCard } from './write/set-group-card.js';
import { stickerCollect } from './write/sticker-collect.js';
import { stickerRename } from './write/sticker-rename.js';

// ── 根目录：不绑会话
import { where } from './where.js';
import { usage } from './usage.js';

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
