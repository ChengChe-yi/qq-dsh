// 宿主能力门面：路由层只认这里的方法，不直接碰 ctx 服务。
// 用 sessionController 的**进程内 Remote**（与 web 同一个实现：preset 解析、模型选择、
// 冷会话 resume 都由它负责），而不是自己 ctx.agents.create —— 后者会漏掉这些。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class HostError extends Error {
  constructor(code, message, { status = 400 } = {}) {
    super(message);
    this.name = 'HostError';
    this.code = code;
    this.status = status;
  }
}

// RemoteError → HTTP：not-found 类 404，gateway/* 是请求问题 400，其余 500。
function mapError(error) {
  if (error instanceof HostError) return error;
  const code = String(error?.code ?? '');
  const message = String(error?.message ?? error);
  if (code.endsWith('not-found')) return new HostError(code, message, { status: 404 });
  if (code.startsWith('gateway/') || code.endsWith('invalid') || code.endsWith('conflict')) {
    return new HostError(code, message, { status: 400 });
  }
  return new HostError(code || 'internal', message, { status: 500 });
}

export function createHost(ctx) {
  const controller = () => {
    const found = typeof ctx.get === 'function' ? ctx.get('sessionController') : null;
    if (!found || typeof found.create !== 'function' || typeof found.prompt !== 'function') {
      throw new HostError('no-controller', '宿主没有 sessionController（只有 web profile 提供）', { status: 503 });
    }
    return found;
  };

  const workspaceRegistry = () => {
    const found = typeof ctx.get === 'function' ? ctx.get('workspaceRegistry') : null;
    if (!found || typeof found.create !== 'function') {
      throw new HostError('no-workspace-registry', '宿主没有 workspaceRegistry', { status: 503 });
    }
    return found;
  };

  // 冷会话的标题只能从日志里捞：sessionTitle.get() 要活 Session 实例。
  const coldTitle = async (sessionId) => {
    const query = typeof ctx.get === 'function' ? ctx.get('sessionQuery') : null;
    if (!query?.observeSession) return '';
    let obs = null;
    try {
      obs = await query.observeSession(sessionId);
      const events = obs?.events ?? [];
      for (let i = events.length - 1; i >= 0; i -= 1) {
        const e = events[i];
        if (e?.type !== 'session/title') continue;
        const t = e.data?.title ?? e.payload?.title ?? e.title;
        if (t) return String(t);
      }
      return '';
    } catch {
      return '';
    } finally {
      try { obs?.dispose?.(); } catch { /* 租约释放失败无所谓 */ }
    }
  };

  // 工作区快照（只带桥接需要对账的字段）
  const workspacesOf = () => {
    const registry = typeof ctx.get === 'function' ? ctx.get('workspaceRegistry') : null;
    return (registry?.list?.() ?? []).map((ws) => ({
      workspaceId: String(ws.id),
      path: String(ws.path ?? ''),
      title: String(ws.title ?? ''),
      sessions: Array.isArray(ws.sessionIds) ? ws.sessionIds.length : 0,
    }));
  };

  // 有些操作（权限、沙箱、append）只能作用于内存里的会话；冷会话先 prompt 唤醒
  const liveSession = (sessionId) => {
    const id = String(sessionId ?? '');
    const session = ctx.sessions.get(id);
    if (!session) throw new HostError('session/not-live', `会话不在内存里（冷会话先 /prompt 唤醒）：${id}`, { status: 404 });
    return session;
  };

  return {
    // 探活：活会话数 + 有 agent 挂着的会话数
    snapshot() {
      const list = ctx.sessions.list();
      let agents = 0;
      for (const session of list) if (ctx.agents.get(session.id)) agents += 1;
      return { sessions: list.length, agents };
    },

    // 建会话：复用由桥接侧记 sessionId（插件不持有映射）
    // workspaceId 与 cwd 只能给一个（controller.create 的硬约束）
    async ensureSession({ cwd, workspaceId, preset }) {
      const ws = String(workspaceId ?? '').trim();
      const dir = String(cwd ?? '').trim();
      if (ws && dir) throw new HostError('bad-location', 'workspaceId 与 cwd 只能给一个');

      let location;
      if (ws) {
        const registry = workspaceRegistry();
        if (!registry.get(ws)) throw new HostError('workspace/not-found', `workspace 不存在：${ws}`, { status: 404 });
        location = { workspaceId: ws };
      } else {
        if (!dir || !path.isAbsolute(dir)) throw new HostError('bad-cwd', `cwd 必须是绝对路径：${dir || '(空)'}`);
        if (!fs.existsSync(dir)) throw new HostError('bad-cwd', `cwd 不存在：${dir}`);
        location = { cwd: dir };
      }

      try {
        const created = await controller().create({
          ...location,
          ...(preset ? { agentPreset: String(preset) } : {}),
        });
        return { sessionId: String(created.sessionId), agentPreset: String(created.agentPreset ?? '') };
      } catch (error) {
        throw mapError(error);
      }
    },

    // 注册/复用 workspace（按规范化路径幂等），并在给了 title 时改标题
    async ensureWorkspace({ path: dir, title }) {
      const target = String(dir ?? '').trim();
      if (!target || !path.isAbsolute(target)) throw new HostError('bad-path', `path 必须是绝对路径：${target || '(空)'}`);
      if (!fs.existsSync(target)) throw new HostError('bad-path', `目录不存在：${target}`);
      if (!fs.statSync(target).isDirectory()) throw new HostError('bad-path', `不是目录：${target}`);

      try {
        const ws = await workspaceRegistry().create(target, title ? String(title) : undefined);
        // create 只在新建时用 title；已经有标题的复用者要显式改
        if (title && ws.title !== String(title)) await ws.setTitle(String(title));
        return {
          workspaceId: String(ws.id),
          path: String(ws.path),
          title: String(ws.title),
          sessionIds: Array.isArray(ws.sessionIds) ? ws.sessionIds.map(String) : [],
        };
      } catch (error) {
        throw mapError(error);
      }
    },

    // 改会话标题（自动命名盖掉群名时用）
    async renameSession({ sessionId, title }) {
      const name = String(title ?? '').trim();
      if (!name) throw new HostError('bad-title', 'title 为空');
      if (name.length > 200) throw new HostError('bad-title', 'title 过长（最多 200 字符）');

      try {
        const out = await controller().rename({ sessionId: String(sessionId), title: name });
        return { title: String(out?.title ?? name), seq: Number(out?.seq) || 0 };
      } catch (error) {
        throw mapError(error);
      }
    },

    // 投一条 user 消息：Remote 的 prompt 会先 resume 冷会话，再进 inbox 唤醒驱动
    async sendPrompt({ sessionId, text }) {
      const requestId = crypto.randomUUID();
      try {
        // Remote 的 prompt 签名是 (request, signal)：缺 signal 会直接 TypeError
        const out = await controller().prompt({
          sessionId: String(sessionId),
          mode: 'queue',
          content: [{ type: 'text', text: String(text) }],
          requestId,
        }, new AbortController().signal);
        return { accepted: out?.accepted !== false, requestId };
      } catch (error) {
        throw mapError(error);
      }
    },

    // 列会话：活会话 + 磁盘上已持久化的冷会话，附归档 / 标题 / 所属 workspace。
    // includeCold=false 只扫活会话；includeTitles=true 时冷会话也会去日志里捞标题（较慢）。
    async listSessions({ includeCold = true, includeTitles = false } = {}) {
      const registry = typeof ctx.get === 'function' ? ctx.get('workspaceRegistry') : null;
      const titles = typeof ctx.get === 'function' ? ctx.get('sessionTitle') : null;

      const archived = new Set(
        Array.isArray(registry?.archivedSessionIds) ? registry.archivedSessionIds.map(String) : [],
      );

      const workspaceOf = new Map();
      for (const ws of registry?.list?.() ?? []) {
        for (const id of ws.sessionIds ?? []) workspaceOf.set(String(id), String(ws.id));
      }

      const live = new Map();
      for (const session of ctx.sessions.list()) live.set(String(session.id), session);

      // 持久化快照：冷会话也在里面（重启后桥接要靠它判断"记着的 id 还在不在"）
      const stored = new Map();
      if (includeCold) {
        try {
          const snapshots = await ctx.get('sessionPersistence')?.list?.() ?? [];
          for (const snap of snapshots) stored.set(String(snap.header.id), snap);
        } catch {
          // 持久化层不可用就只报活会话 —— 不要让整个端点失败
        }
      }

      const ids = new Set([...stored.keys(), ...live.keys()]);
      const sessions = [];
      for (const id of ids) {
        const session = live.get(id);
        const snap = stored.get(id);
        const header = session?.header ?? snap?.header;

        let title = '';
        if (session) {
          try {
            title = String(titles?.get?.(session)?.title ?? '');
          } catch {
            title = '';
          }
        } else if (includeTitles) {
          title = await coldTitle(id);
        }

        sessions.push({
          sessionId: id,
          cwd: String(header?.cwd ?? ''),
          preset: String(header?.agentPreset ?? ''),
          createdAt: Number(header?.createdAt) || 0,
          live: Boolean(session),
          // running / idle / detached：detached = 没有 agent（冷会话，prompt 时会自动 resume）
          status: (session && ctx.agents.get(id)?.status) || (session ? 'idle' : 'detached'),
          archived: archived.has(id),
          title,
          workspaceId: workspaceOf.get(id) ?? '',
          seq: session ? Number(session.seq) || 0 : 0,
          formatStatus: String(snap?.formatStatus ?? ''),
        });
      }

      sessions.sort((a, b) => b.createdAt - a.createdAt);
      return { sessions, archived: [...archived] };
    },

    // 单个会话的当前快照：是否存在 / 是否活着 / 忙闲 / 最后 seq / 是否已归档
    async sessionInfo({ sessionId }) {
      const id = String(sessionId);
      const registry = typeof ctx.get === 'function' ? ctx.get('workspaceRegistry') : null;
      const archived = new Set(Array.isArray(registry?.archivedSessionIds) ? registry.archivedSessionIds.map(String) : []);

      const live = ctx.sessions.get(id);
      if (live) {
        const agent = ctx.agents.get(id);
        return {
          exists: true, live: true, status: agent?.status ?? 'idle', seq: Number(live.seq) || 0, archived: archived.has(id),
        };
      }

      let exists = false;
      try {
        exists = Boolean(await ctx.get('sessionPersistence')?.stat?.(id));
      } catch {
        exists = false;
      }
      return { exists, live: false, status: 'detached', seq: 0, archived: archived.has(id) };
    },

    // 从日志里取 since 之后的事件（只对活会话；冷会话没有内存日志）
    replayEvents({ sessionId, since }) {
      const live = ctx.sessions.get(String(sessionId));
      if (!live) return [];
      const from = Math.max(0, Number(since) || 0);
      try {
        return live.snapshotEvents(from + 1) ?? [];
      } catch {
        return [];
      }
    },

    // 取消当前回合（保留 inbox，与 web 的 cancel 同义）
    async cancelTurn({ sessionId }) {
      try {
        const out = await controller().cancel({ sessionId: String(sessionId) });
        return { accepted: out?.accepted !== false };
      } catch (error) {
        throw mapError(error);
      }
    },

    // 当前归档集合（内存里的权威列表，不在事件总线上 —— 只能轮询比对）
    archivedSet() {
      const registry = typeof ctx.get === 'function' ? ctx.get('workspaceRegistry') : null;
      return new Set(Array.isArray(registry?.archivedSessionIds) ? registry.archivedSessionIds.map(String) : []);
    },

    // 工作区列表（给轮询与事件用）：只带桥接需要对齐的字段
    workspaces() {
      return workspacesOf();
    },

    // 变更签名：只要它变了就推一次 workspace.changed（避免逐字段比较）
    workspaceSignature() {
      return JSON.stringify(workspacesOf().map((w) => [w.workspaceId, w.path, w.title, w.sessions]));
    },

    // 归档 / 恢复一个会话（QQ 里"重置上下文"就靠它：归档旧的，再 /ensure 建新的）
    async setArchived({ sessionId, archived = true, stopActivity = true }) {
      const registry = workspaceRegistry();
      const id = String(sessionId);
      try {
        if (archived) await registry.archiveSession(id, { stopActivity: Boolean(stopActivity) });
        else await registry.unarchiveSession(id);
      } catch (error) {
        throw mapError(error);
      }
      return {
        archived: Boolean(archived),
        archivedSessionIds: (registry.archivedSessionIds ?? []).map(String),
      };
    },

    // 可用模型目录（provider 分组 + 每个模型的思考强度 + 当前默认）
    async modelCatalog() {
      try {
        return await controller().modelCatalog();
      } catch (error) {
        throw mapError(error);
      }
    },

    // 会话用量：累计 token / 上下文压力 / 上下文构成
    sessionUsage({ sessionId }) {
      const session = liveSession(sessionId);
      const projections = typeof ctx.get === 'function' ? ctx.get('sessionProjections') : null;
      return {
        usage: projections?.stateOf?.(session, 'tokenUsage') ?? null,
        pressure: projections?.stateOf?.(session, 'contextPressure') ?? null,
        breakdown: projections?.stateOf?.(session, 'contextBreakdown') ?? null,
      };
    },

    // 会话当前配置：模型 / 思考强度 / 权限档 / 沙箱模式（全部只读，现取）
    sessionConfig({ sessionId }) {
      const session = liveSession(sessionId);
      const header = session.requestHeader?.()?.config ?? null;
      const fallback = (typeof ctx.get === 'function' ? ctx.get('agentDefaultModel') : null)?.currentSelection?.() ?? {};
      const projections = typeof ctx.get === 'function' ? ctx.get('sessionProjections') : null;
      const permissions = projections?.stateOf?.(session, 'permissions') ?? null;
      const sandboxOverride = projections?.stateOf?.(session, 'sandboxMode') ?? null;
      // 刚切过但还没发出请求时，"下次要用的"在 modelSelection.pending 里，
      // requestHeader 记的是**上一次实际请求**用的，不能当当前值。
      const pending = projections?.stateOf?.(session, 'modelSelection')?.pending ?? null;
      const presets = typeof ctx.get === 'function' ? ctx.get('permissionPresets') : null;

      return {
        model: {
          provider: String(pending?.provider ?? header?.provider ?? fallback.provider ?? ''),
          model: String(pending?.model ?? header?.model ?? fallback.model ?? ''),
          reasoningEffort: String(pending?.reasoningEffort ?? header?.reasoningEffort ?? fallback.reasoningEffort ?? ''),
        },
        permission: {
          preset: String(presets?.current?.(session) ?? ''),
          names: Array.isArray(presets?.names) ? presets.names.map(String) : [],
          sandbox: permissions?.sandbox ?? null,
          approval: permissions?.approval ?? null,
        },
        sandbox: {
          // 会话级覆盖；null = 没覆盖过（用部署默认）
          override: sandboxOverride ?? null,
        },
      };
    },

    // 切模型 / 思考强度（controller 会校验并写进默认选择）
    async selectModel({ sessionId, provider, model, reasoningEffort }) {
      if (!provider || !model) throw new HostError('bad-model', 'provider 与 model 必填');
      try {
        const out = await controller().selectModel({
          sessionId: String(sessionId),
          provider: String(provider),
          model: String(model),
          ...(reasoningEffort ? { reasoningEffort: String(reasoningEffort) } : {}),
        });
        return { model: out?.selected ?? null };
      } catch (error) {
        throw mapError(error);
      }
    },

    // 切权限档（sandbox + approval 一起换，走 permissionPresets 的官方写路径）
    setPermission({ sessionId, preset }) {
      const session = liveSession(sessionId);
      const presets = typeof ctx.get === 'function' ? ctx.get('permissionPresets') : null;
      if (!presets?.set) throw new HostError('no-permissions', '宿主没有 permissionPresets', { status: 503 });

      const name = String(preset ?? '').trim();
      if (!name) throw new HostError('bad-preset', 'preset 为空');
      try {
        presets.set(session, name);
      } catch (error) {
        throw mapError(error);
      }
      return { preset: String(presets.current(session)), names: presets.names.map(String) };
    },

    // 单独改沙箱模式（高级用法：权限档之外的手动覆盖）
    setSandbox({ sessionId, mode }) {
      const session = liveSession(sessionId);
      const allowed = ['read-only', 'workspace-write', 'danger-full-access'];
      const value = String(mode ?? '').trim();
      if (!allowed.includes(value)) throw new HostError('bad-mode', `mode 只能是 ${allowed.join(' / ')}`);

      session.append('sandbox/mode', { mode: value });
      return { mode: value };
    },

    // 订阅会话事件 + agent 忙闲 + 会话生死；不传 sessionId 就是全部会话
    subscribe({ sessionId, onEvent }) {
      const filter = sessionId ? String(sessionId) : '';

      const offSession = ctx.on('session/event', (session, event) => {
        if (filter && session.id !== filter) return;
        onEvent({ sessionId: String(session.id), kind: 'session', event });
      });

      // 忙/闲是**推**的（替代原来 $events 的 api-session/status）：桥接靠它判断
      // "它在不在跑"，不用轮询 /sessions。
      const offStatus = ctx.on('agent/status', (payload) => {
        const id = String(payload?.agent?.id ?? '');
        if (!id || (filter && id !== filter)) return;
        onEvent({
          sessionId: id,
          kind: 'status',
          event: {
            type: 'agent/status',
            status: String(payload.status ?? ''),
            // 游标统一：状态帧也带会话的当前 seq，客户端据此判断漏没漏
            seq: Number(ctx.sessions.get(id)?.seq) || 0,
            time: Date.now(),
          },
        });
      });

      // 会话生死：新建 / 被回收（归档带 stopActivity 时也会走这里）
      const created = (session) => {
        const id = String(session.id);
        if (filter && id !== filter) return;
        onEvent({ sessionId: id, kind: 'lifecycle', event: { type: 'session/created', seq: 0, time: Date.now() } });
      };
      const disposed = (session) => {
        const id = String(session.id);
        if (filter && id !== filter) return;
        onEvent({ sessionId: id, kind: 'lifecycle', event: { type: 'session/disposed', seq: 0, time: Date.now() } });
      };
      const offCreated = ctx.on('session/created', created);
      const offDisposed = ctx.on('session/disposed', disposed);

      // agent 被回收（会话还在）：桥接该把它当"没有驱动"处理
      const offAgentGone = ctx.on('agent/disposed', (payload) => {
        const id = String(payload?.agent?.id ?? '');
        if (!id || (filter && id !== filter)) return;
        onEvent({ sessionId: id, kind: 'lifecycle', event: { type: 'agent/disposed', seq: 0, time: Date.now() } });
      });

      return () => {
        if (typeof offSession === 'function') offSession();
        if (typeof offStatus === 'function') offStatus();
        if (typeof offCreated === 'function') offCreated();
        if (typeof offDisposed === 'function') offDisposed();
        if (typeof offAgentGone === 'function') offAgentGone();
      };
    },
  };
}
