// qq_usage：这个会话的累计 token 用量 + 当前上下文压力。
//
// 只返回数字，不生成图 —— 图那版依赖 mcp-md 的渲染器，先摘掉。
import { defineQQTool } from './shell.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

export function usage({ ctx, sessions, projections }) {
  return defineQQTool({
    ctx,
    name: 'qq_usage',
    description: 'Report this conversation\'s cumulative token usage (all turns, not the current context window) and '
      + 'its current context pressure. Returns totalTokens, cacheHitRate (percent), uncachedInputTokens, '
      + 'cacheReadTokens, cacheWriteTokens, outputTokens, and context '
      + '{ usedTokens, windowTokens, percent, systemTokens, toolsTokens, messageTokens }.',
    parameters: {},
    run: async ({ sessionId }) => {
      const session = sessions?.get?.(sessionId) ?? null;
      if (!projections || !session) {
        throw new Error('这个会话不在内存里，拿不到用量（冷会话先发一条消息唤醒）。');
      }

      const raw = projections.stateOf?.(session, 'tokenUsage') ?? {};
      const totals = raw.totals ?? raw;
      const uncached = num(totals.uncachedInputTokens);
      const cacheRead = num(totals.cacheReadTokens);
      const cacheWrite = num(totals.cacheWriteTokens);
      const output = num(totals.outputTokens);
      const total = uncached + cacheRead + cacheWrite + output;
      const rate = pct(cacheRead, cacheRead + uncached);

      const pressure = projections.stateOf?.(session, 'contextPressure') ?? {};
      const breakdownRaw = projections.stateOf?.(session, 'contextBreakdown') ?? {};
      const bd = breakdownRaw.breakdown ?? breakdownRaw;
      const usedTokens = num(pressure.pressureTokens ?? pressure.projectedTokens ?? pressure.surfaceTokens);
      const windowTokens = num(pressure.contextWindow);

      return {
        totalTokens: total,
        cacheHitRate: rate,
        uncachedInputTokens: uncached,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        outputTokens: output,
        context: {
          usedTokens,
          windowTokens,
          percent: pct(usedTokens, windowTokens),
          systemTokens: num(bd.systemTokens),
          toolsTokens: num(bd.toolsTokens),
          messageTokens: num(bd.messageTokens),
        },
      };
    },
  });
}
