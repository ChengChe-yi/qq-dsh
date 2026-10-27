// qq_usage：这个会话的累计 token 用量 + 当前上下文压力 + 一张可直接发的卡片图。
//
// 累计用量来自 sessionProjections.tokenUsage；上下文来自 contextPressure /
// contextBreakdown。卡片样式复用 mcp-md 的 Chrome 渲染器。
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineQQTool } from './shell.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const comma = (n) => Number(n).toLocaleString('en-US');
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

let rendererPromise = null;
function loadRenderer(bridgeRoot) {
  if (!rendererPromise) {
    rendererPromise = import(pathToFileURL(path.join(bridgeRoot, 'mcp-md', 'render.mjs')).href);
  }
  return rendererPromise;
}

function usageMarkdown({ total, rate, uncached, cacheRead, output, context }) {
  const lines = [
    `| Token 用量 | ${comma(total)} tok |`,
    '|---|---|',
    `| 缓存命中 | ${rate}% |`,
    `| 未缓存输入 | ${comma(uncached)} tok |`,
    `| 缓存读取 | ${comma(cacheRead)} tok |`,
    `| 输出 | ${comma(output)} tok |`,
  ];

  if (context.windowTokens > 0) {
    lines.push(
      '',
      '---',
      '',
      `| 上下文已用 | ${context.percent}% |`,
      '|---|---|',
      `| 已用 / 窗口 | ${comma(context.usedTokens)} / ${comma(context.windowTokens)} tok |`,
      `| 系统提示词 | ${comma(context.systemTokens)} tok |`,
      `| 工具定义 | ${comma(context.toolsTokens)} tok |`,
      `| 对话消息 | ${comma(context.messageTokens)} tok |`,
    );
  }

  return lines.join('\n');
}

export function usage({ bridge, ctx, bridgeRoot, sessions, projections }) {
  return defineQQTool({
    ctx,
    name: 'qq_usage',
    description: 'Report this conversation\'s cumulative token usage (all turns, not the current context window) and '
      + 'its current context pressure, then return a ready-to-send card image. Returns totalTokens, cacheHitRate '
      + '(percent), uncachedInputTokens, cacheReadTokens, cacheWriteTokens, outputTokens, and context '
      + '{ usedTokens, windowTokens, percent, systemTokens, toolsTokens, messageTokens }. Send the image with qq_send: '
      + '{ "messages": [{ "image": "http://127.0.0.1:3110/m/…" }] }. '
      + 'If rendering fails, the numbers are still returned with a warning and image is empty.',
    parameters: {},
    run: async ({ key, sessionId }) => {
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
      const context = {
        usedTokens,
        windowTokens,
        percent: pct(usedTokens, windowTokens),
        systemTokens: num(bd.systemTokens),
        toolsTokens: num(bd.toolsTokens),
        messageTokens: num(bd.messageTokens),
      };

      const result = {
        totalTokens: total,
        cacheHitRate: rate,
        uncachedInputTokens: uncached,
        cacheReadTokens: cacheRead,
        cacheWriteTokens: cacheWrite,
        outputTokens: output,
        context,
      };

      try {
        const { renderMarkdown } = await loadRenderer(bridgeRoot);
        const img = await renderMarkdown(
          usageMarkdown({ total, rate, uncached, cacheRead, output, context }),
          { width: 620 },
        );
        const pub = await bridge('imagePublish', key, {
          base64: img.png.toString('base64'),
          mimeType: 'image/png',
        });
        return {
          ...result,
          image: pub.url,
          note: '累计用量 + 当前上下文。发图：`{ "messages": [{ "image": "<image>" }] }`。',
        };
      } catch (error) {
        return {
          ...result,
          image: '',
          warning: `卡片图生成失败：${error?.message ?? error}`,
        };
      }
    },
  });
}
