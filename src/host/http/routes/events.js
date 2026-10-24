// GET /events?session=a,b&since=<seq>&snapshot=<n>&lean=1
//
// 帧：
//   event: hello          data: { sessionId, live, status, seq }
//   event: session.event  data: { sessionId, event }        id: <seq>
//   event: agent.status   data: { sessionId, status, seq }  id: <seq>
//
// since   —— 先回放 (since, last] 的日志事件，再接实时（断线续传）
// snapshot —— 不带 since 时，回放最近 n 条
// lean    —— assistant/message 只留 text（丢掉 reasoning / replayState，省带宽）
// 客户端断开即退订；写不动时排队等 drain，不硬堆内存。
export function events({ host }) {
  return {
    method: 'GET',
    path: '/events',
    handler: async ({ req, res }) => {
      const url = new URL(req.url ?? '/', 'http://qq-dsh-host.invalid');
      const ids = String(url.searchParams.get('session') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const sinceRaw = url.searchParams.get('since');
      const since = sinceRaw === null ? null : Number(sinceRaw);
      const snapshot = Math.max(0, Number(url.searchParams.get('snapshot') ?? '0') || 0);
      const lean = url.searchParams.get('lean') === '1';

      // 有 session 参数就先确认存在 —— 不存在的会话别开一条永远没事件的流
      const infos = [];
      for (const id of ids) {
        const info = await host.sessionInfo({ sessionId: id });
        if (!info.exists) {
          return { status: 404, body: { ok: false, error: 'session/not-found', sessionId: id } };
        }
        infos.push({ sessionId: id, ...info });
      }

      res.writeHead(200, {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      });

      const frame = (event, data, id) => {
        const head = id === undefined ? '' : `id: ${id}\n`;
        return `${head}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      };

      // 背压：write 返回 false 就排队，等 drain 再写
      let blocked = false;
      const pending = [];
      const write = (chunk) => {
        if (blocked) {
          pending.push(chunk);
          return;
        }
        blocked = !res.write(chunk);
      };
      res.on('drain', () => {
        blocked = false;
        while (pending.length && !blocked) blocked = !res.write(pending.shift());
      });

      // 首帧：每个会话的当前状态
      for (const info of infos) {
        write(frame('hello', info, info.seq));
      }

      // 回放
      for (const info of infos) {
        if (!info.live) continue;
        const from = since !== null ? Math.max(0, since) : (snapshot > 0 ? Math.max(0, info.seq - snapshot) : null);
        if (from === null) continue;
        for (const event of host.replayEvents({ sessionId: info.sessionId, since: from })) {
          write(frame('session.event', { sessionId: info.sessionId, event: lean ? leanify(event) : event }, event.seq));
        }
      }

      const wanted = new Set(ids);
      const off = host.subscribe({
        sessionId: '',
        onEvent: ({ sessionId, kind, event }) => {
          if (wanted.size && !wanted.has(sessionId)) return;
          if (kind === 'status') {
            // sessionId 必须带上：客户端靠它把忙闲对到具体会话上（早先漏了，
            // 于是桥接收到一帧没有归属的状态，只能整帧丢掉）。
            write(frame('agent.status', { sessionId, ...event }, event.seq));
            return;
          }
          if (kind === 'lifecycle') {
            write(frame('session.lifecycle', { sessionId, ...event }, event.seq));
            return;
          }
          write(frame('session.event', { sessionId, event: lean ? leanify(event) : event }, event.seq));
        },
      });

      // 归档 / 工作区都没有事件源（registry 的 archiveSession 与 list 都是直调），
      // 只能轮询内存快照做差集。桥接靠 session.archived 知道"该重开会话"。
      let lastArchived = host.archivedSet();
      let lastWorkspaces = host.workspaceSignature();
      const archTimer = setInterval(() => {
        const now = host.archivedSet();
        for (const id of new Set([...lastArchived, ...now])) {
          if (lastArchived.has(id) === now.has(id)) continue;
          if (wanted.size && !wanted.has(id)) continue;
          write(frame('session.archived', { sessionId: id, archived: now.has(id) }, undefined));
        }
        lastArchived = now;

        const wsSig = host.workspaceSignature();
        if (wsSig !== lastWorkspaces) {
          lastWorkspaces = wsSig;
          write(frame('workspace.changed', { workspaces: host.workspaces() }, undefined));
        }
      }, 2000);

      const beat = setInterval(() => write(': ping\n\n'), 15_000);
      const done = () => {
        clearInterval(beat);
        clearInterval(archTimer);
        off();
        res.end();
      };
      req.on('close', done);

      return undefined; // 自己接管响应
    },
  };
}

// 只留模型真正说的话：reasoning 与 replayState 对桥接没用，却可能几十 KB
function leanify(event) {
  if (event?.type !== 'assistant/message') return event;
  const parts = event.data?.message?.content ?? [];
  const content = parts.filter((p) => p?.type === 'text').map((p) => ({ type: 'text', text: String(p.text ?? '') }));
  return {
    type: event.type,
    seq: event.seq,
    time: event.time,
    data: {
      turn: event.data?.turn,
      step: event.data?.step,
      message: { role: 'assistant', content },
    },
  };
}
