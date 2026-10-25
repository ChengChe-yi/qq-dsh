// qq-prompt-sections：把 QQ 桥接的**静态规则段**注册成 system prompt section。

import fs from 'node:fs';
import path from 'node:path';
import { resolveConfig } from './config.js';
import { VERSION } from '../shared/version.js';

// #region 常量

const name = 'qq-prompt-sections';
const inject = ['systemPrompt'];

const SECTIONS = [
  { id: 'qq:intro', file: '1-intro.md', order: 100, vars: true },
  { id: 'qq:read-format', file: '2-read-format.md', order: 200 },
  { id: 'qq:safety', file: '3-safety.md', order: 300 },
  { id: 'qq:qq-tools', file: '4-qq-tools.md', order: 400 },
  { id: 'qq:anchor', file: '5-anchor.md', order: 10300 },
];

// 角色卡正文单列：它是**动态**的（当前角色可被控制台切换），且允许缺失。
const ROLE_CARD = { id: 'qq:role-card', order: 11 };
// #endregion

// #region 读文件


const textCache = new Map();

// 注入前去掉**第一行的标题**。

function stripLeadingHeading(text) {
  const lines = text.split('\n');
  if (/^#{1,6}\s/.test(lines[0] ?? '')) lines.shift();
  return lines.join('\n').trim();
}

// 读一个文本文件。`required` 时缺文件直接抛 —— 静默跳过的后果是"防注入规则凭空消失"。
function readText(file, { required = true } = {}) {
  try {
    const { mtimeMs, size } = fs.statSync(file);
    const key = `${mtimeMs}:${size}`;
    const hit = textCache.get(file);
    if (hit && hit.key === key) return hit.text;
    // 顺序很重要：先剥注释，再剥标题。
    // 注释常在首行（`<!-- owner-title: … -->`），若先剥标题，标题就成了"第二行"
    // 被留下 —— 不同卡的头一行就长得不一样了。
    const text = stripLeadingHeading(stripComments(fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n')));
    textCache.set(file, { key, text });
    return text;
  } catch (error) {
    if (!required) return '';
    throw new Error(
      `qq-prompt-sections: 读不到 ${file}（${error.code ?? error.message}）。`
      + '这个文件承载的是防注入规则，缺失必须显式失败，不能静默变成空段。',
    );
  }
}

// 元数据要用**原文**（注释已经被 readText 剥掉了）。单独一份缓存，键加前缀。
const rawCache = new Map();

function readRawText(file) {
  try {
    const { mtimeMs, size } = fs.statSync(file);
    const key = `${mtimeMs}:${size}`;
    const hit = rawCache.get(file);
    if (hit && hit.key === key) return hit.text;
    const text = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
    rawCache.set(file, { key, text });
    return text;
  } catch {
    return '';
  }
}

// 桥接 config.json 的缓存（同理，也按 mtime 失效）。
// 为什么需要：intro 与角色卡每步各读一次，同一个文件解析两遍没有意义；
// 而按 mtime 判断能让"控制台保存配置"在下一步就看到新值。
const configCache = new Map();

function readBridgeConfig(file) {
  if (!file) return null;
  try {
    const { mtimeMs } = fs.statSync(file);
    const hit = configCache.get(file);
    if (hit && hit.mtimeMs === mtimeMs) return hit.value;
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    configCache.set(file, { mtimeMs, value });
    return value;
  } catch {
    // 配置读不到不是致命错误：本号/角色拿不到就退化成占位符/空段。
    return null;
  }
}

// ── 会话 → 角色

const sessionsCache = new Map();

function readSessionRoles(file) {
  if (!file) return null;
  try {
    const { mtimeMs } = fs.statSync(file);
    const hit = sessionsCache.get(file);
    if (hit && hit.mtimeMs === mtimeMs) return hit.value;
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rev = new Map();
    for (const byRole of Object.values(doc?.sessions ?? {})) {
      // v3 起是 { 角色: sessionId }；更早的形态是裸字符串（不知道角色，跳过）。
      if (!byRole || typeof byRole !== 'object') continue;
      for (const [role, id] of Object.entries(byRole)) {
        if (typeof id !== 'string' || !id) continue;
        if (role === '*' || role === '') continue;   // 兜底槽：不代表角色
        rev.set(id, role);
      }
    }
    sessionsCache.set(file, { mtimeMs, value: rev });
    return rev;
  } catch {
    return null;   // 没这个文件也不致命：退回 role.current
  }
}

// 这一份提示词该用哪张卡：先看会话，再看全局。

function sessionIdOf(context) {
  const agent = context?.agent ?? context?.scope;
  return String(agent?.id ?? agent?.sessionId ?? '').trim();
}

function roleFor(config, sessionId) {
  const id = String(sessionId ?? '').trim();
  if (id) {
    const rev = readSessionRoles(sessionsFileOf(config));
    const hit = rev?.get(id);
    if (hit) return hit;
  }
  return currentRole(config);
}

// `sessions.json` 在哪：能显式配就配，配不到按 `<config.json 所在目录>/state/sessions.json` 猜
// —— 那是桥接的固定布局，猜错也只是退回 `role.current`，不会炸。
function sessionsFileOf(config) {
  const explicit = String(config?.sessionsFile ?? '').trim();
  if (explicit) return explicit;
  const cfgFile = String(config?.bridgeConfigFile ?? '').trim();
  return cfgFile ? path.join(path.dirname(cfgFile), 'state', 'sessions.json') : '';
}
// #endregion

// #region 段落内容

// 当前角色名（`config.json` 的 `role.current`）。
//
// 2026-10-23 起角色选择住在配置里（控制台切角色走的也是同一套校验+备份+原子写），
// 不再有 `state/current-role.json` 那条老路。
function currentRole(config) {
  return String(readBridgeConfig(config?.bridgeConfigFile)?.role?.current ?? '').trim();
}

// 角色卡顶部的元数据注释：`<!-- owner-title: 主人 -->`。
//
// 为什么用注释：它在渲染出来的 Markdown 里不可见，人看着不碍事，机器能读；
// 而"改成正文一行"会污染人设正文，模型也会把那一行当成人设的一部分。
//
// ⚠️ 它必须在进提示词之前**整段删掉** —— 否则模型会看到一行不知道是什么的
//    指令，而且可能把它当成"用户说过的话"。
const META_RE = '<!--\\s*([a-zA-Z][\\w-]*)\\s*:\\s*([\\s\\S]*?)-->';

/** 取一个元数据（没有就空串）。 */
function metaOf(text, key) {
  // 键名被替换进模板，所以值在**第 1 个**捕获组（不是第 2 个 —— 踩过）。
  const re = new RegExp(META_RE.replace('([a-zA-Z][\\w-]*)', key), 'i');
  const m = re.exec(String(text ?? ''));
  return m ? String(m[1] ?? '').trim() : '';
}

/** 删掉所有 HTML 注释，顺手压掉因此多出来的空行。 */
function stripComments(text) {
  return String(text ?? '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// 角色卡正文；没有启用角色或读不到时返回空串。
//
// 返回空串而不是抛错：没有人设不是致命错误（模型用默认口吻），
// 而抛错会让整个 prompt 组装失败、消息一条都发不出去。
// 只取 basename：`config.json` 是手可改的，别让角色名变成 `../../.credentials`。
function loadRoleCardRaw(config, sessionId) {
  const dir = String(config?.rolesDir ?? '').trim();
  const role = roleFor(config, sessionId);
  if (!dir || !role) return '';
  return readText(path.join(dir, `${path.basename(role)}.md`), { required: false });
}

/** 进提示词的那份（注释已在 readText 里剥掉）。 */
function loadRoleCard(config, sessionId) {
  return loadRoleCardRaw(config, sessionId);
}

/** 这个会话该叫他什么 —— 角色卡里的 `owner-title` 优先。 */
function ownerTitleOf(config, sessionId) {
  const dir = String(config?.rolesDir ?? '').trim();
  const role = roleFor(config, sessionId);
  if (!dir || !role) return '';
  return metaOf(readRawText(path.join(dir, `${path.basename(role)}.md`)), 'owner-title');
}

// 填运行时占位符（`{selfName}` / `{selfQq}` / `{ownerQq}` / `{ownerTitle}`）。
//
// 四个都是**跨重启不变**的事实，放 system 层不会打断前缀缓存：
//   {selfName}   当前角色名（`config.json` 的 `role.current`）—— 身份声明用它
//   {selfQq}     本号
//   {ownerQq}    管理者
//   {ownerTitle} 怎么称呼管理者（角色卡的 `<!-- owner-title: X -->` > `config.json` 的 `owner.title` > 默认「主人」）——
//                提示词里「你主人」「他说」这类措辞靠它，换称呼不用改 md
//
// （曾经还有 {convKey} / {token}：令牌每次进程启动都变，放这里会让整段 system prompt
//  每次重启都变、前缀缓存全废。那条已经搬回 user 消息。）
//
//  替换不上的占位符**原样留着**（字面的 `{selfQq}`）：那比填个空值更容易被发现，
//    模型看到它也知道是配置没接上，不会瞎编一个号。
function fillVars(text, config, sessionId) {
  const cfg = readBridgeConfig(config?.bridgeConfigFile);
  const name = roleFor(config, sessionId) || 'this account';
  const selfQq = String(cfg?.snowluma?.selfQq ?? '').trim();
  const ownerQq = String(cfg?.owner?.qq ?? '').trim();
  // 称呼：角色卡里的 `<!-- owner-title: X -->` 优先，其次 config，最后「主人」。
  // 角色卡优先的理由：换角色时称呼本就该跟着换（玥叫「主人」，别的卡可能叫别的），
  // 而 config.json 只有一个全局值。
  const ownerTitle = ownerTitleOf(config, sessionId)
    || String(cfg?.owner?.title ?? '').trim()
    || '主人';
  return text
    .replaceAll('{selfName}', name)
    .replaceAll('{selfQq}', selfQq || '(未知)')
    .replaceAll('{ownerQq}', ownerQq || '(未知)')
    .replaceAll('{ownerTitle}', ownerTitle);
}
// #endregion

// #region 注册

// 注册时 `text` 一律传**函数**，每步重新读盘（缓存见 readText）。
//
// dsh-system-prompt 的 assemble 里处理了 `typeof text === 'function' ? text(context) : text`，
// 所以改完 .md 下一步就生效，不必重启、更不必重新打包。
//
// `interpolate: false`：规则文本应当原样呈现。将来若有人在 .md 里写 `{{x}}` 举例，
// 开着插值会让整个 prompt 组装报错 —— 那种失败离原因太远。
function apply(ctx, config) {
  // 先把 bridgeRoot 展开成四个确定路径，下面所有 helper 拿到的都是规整过的对象。
  config = resolveConfig(config);
  const dir = config.dir;
  if (!dir) {
    throw new Error(
      'qq-prompt-sections: 必须配置 `dir`（存放 prompts/*.md 的目录），'
      + `当前需要 ${SECTIONS.map((s) => s.file).join(' / ')}。`,
    );
  }

  // 装配期就把缺文件找出来（一次报全），而不是等第一次组装提示词时才炸。
  const missing = SECTIONS.filter((s) => !fs.existsSync(path.join(dir, s.file))).map((s) => s.file);
  if (missing.length) {
    throw new Error(`qq-prompt-sections: ${dir} 下缺少 ${missing.join('、')}。`);
  }

  for (const { id, file, order, vars } of SECTIONS) {
    const raw = () => readText(path.join(dir, file));
    ctx.effect(
      () => ctx.systemPrompt.section({
        name: id,
        order,
        interpolate: false,
        // `context.agent` 是 dsh-agent 在装配时塞进来的（`assembleContextFor`：
        // `{ agent, scope: agent }`）；会话 id 取 `agent.id`。
        // 同一个群挂着几个角色时，`{selfName}` 必须按会话走，不能按 `role.current`。
        text: vars ? (context) => fillVars(raw(), config, sessionIdOf(context)) : raw,
      }),
      `qq-prompt-sections.${id}`,
    );
  }

  // 角色卡正文：与上面几段的差别是它**允许为空**（没启用角色 / 卡读不到）。
  ctx.effect(
    () => ctx.systemPrompt.section({
      name: ROLE_CARD.id,
      order: ROLE_CARD.order,
      interpolate: false,
      // 会话能对上就用**那个会话的角色**；对不上（新会话还没落盘）退回 `role.current`。
      text: (context) => loadRoleCard(config, sessionIdOf(context)),
    }),
    `qq-prompt-sections.${ROLE_CARD.id}`,
  );

  ctx.logger?.debug?.('qq-prompt-sections 已注册', {
    version: VERSION,
    dir,
    sections: SECTIONS.length + 1,
    role: currentRole(config) || '(未启用)',
  });
}
// #endregion

export { apply, inject, name, SECTIONS, roleFor, sessionIdOf, sessionsFileOf, VERSION };
