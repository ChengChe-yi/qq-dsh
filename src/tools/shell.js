// 通用外壳：所有 qq_* 工具都长这样 

import { defineTool } from '@deepseek-ai/dsh-tools';
import { raceAbort } from '../shared/abort.js';
import { convOf } from './conv.js';

// 从结果里剔掉二进制（没有附件服务时的兜底）。
function stripBinary(value) {
  if (Array.isArray(value)) return value.map(stripBinary);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === 'images' && Array.isArray(v)) {
      out.images = v.map((img) => ({
        mimeType: String(img?.mimeType ?? ''),
        note: '图片字节未放进上下文（工具结果只有文本）；要转发就用返回里的 url。',
      }));
      continue;
    }
    out[k] = stripBinary(v);
  }
  return out;
}


// 这里**没有**模块级的插件 ctx。
//
// 早先是一个 `let pluginCtx`，由 apply() 里的 bindContext(ctx) 赋值，所有工具在运行时
// 共享它。三个问题：挂多份时互相覆盖；热重载后可能指向已销毁的旧 ctx；"工具用的是哪个
// ctx"在调用点看不出来。
//
// 现在 ctx 在**构造期**由参数传进来，被每个工具自己的闭包捕获（见 defineQQTool），
// 运行期没有任何共享可变状态。

// #region 参数形状：ID / 定位符

// 一个 ID：整数或字符串。
export const ID_VALUE = Object.freeze({
  oneOf: [{ type: 'integer' }, { type: 'string' }],
});

// 一组 ID。
export const ID_LIST = Object.freeze({ type: 'array', items: ID_VALUE });

export const ID_ONE_OR_MANY = Object.freeze({
  oneOf: [
    { type: 'integer' },
    { type: 'string' },
    ID_LIST,
  ],
});

// 带说明的"一个或一组"。
export const idParam = (description) => ({ ...ID_ONE_OR_MANY, description });

// 单个 ID（必填与否由调用方补 `required: true`）。
export const idOnly = (description) => ({ ...ID_VALUE, description });
// #endregion

function isRef(item) {
  return Boolean(item && typeof item === 'object' && typeof item.attachmentId === 'string');
}


export function defineQQTool({ ctx, name, description, parameters = {}, run }) {
  // 图片块有两种来源：
  //   · `{ data: base64 }`  —— 老形状（渲染器、转发工具）
  //   · `{ url }`           —— 媒体库的短地址（`/m/<id>`，桥接本机）
  // 后者省掉桥接 JSON 里几百 KB 的 base64，也避免模型被诱着去复述那串字符。
  const bytesOf = async (img) => {
    if (img?.data) return Buffer.from(String(img.data), 'base64');
    const url = String(img?.url ?? '');
    if (!/^https?:\/\//i.test(url)) return null;
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) throw new Error(`取图失败 ${res.status}：${url}`);
    return Buffer.from(await res.arrayBuffer());
  };

  const liftImages = async (value) => {
    const images = value?.images;
    if (!Array.isArray(images) || images.length === 0) return value;
    if (images.every(isRef)) return value;

    const store = ctx?.get?.('attachments') ?? ctx?.attachments;
    if (!store?.saveImages) return value;

    try {
      const inputs = [];
      for (const img of images) {
        const data = await bytesOf(img);
        if (!data) continue;
        inputs.push({
          data,
          mediaType: img?.mimeType,
          ...(img?.name ? { name: String(img.name) } : {}),
        });
      }
      if (!inputs.length) return value;
      const refs = await store.saveImages(inputs);
      return { ...value, images: refs };
    } catch (error) {
      ctx?.logger?.warn?.('图片落成附件失败，退化成文本', { tool: name, error: String(error) });
      return value;
    }
  };

  return defineTool({
    name,
    description,
    parameters,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => (value == null
        ? []
        : [{ type: 'text', text: JSON.stringify(stripBinary(value)) }]),
    },
    async execute(args, exec) {
      const { key, sessionId } = convOf(exec);
      const signal = exec?.signal;
      if (signal?.aborted) throw new Error('aborted by user');
      const work = run({ key, sessionId, args: args ?? {}, signal });
      return liftImages(signal ? await raceAbort(signal, work) : await work);
    },
    projectContent: (_exec, result) => {
      if (result?.isError === true) return undefined;

      const value = result?.value ?? null;
      const refs = Array.isArray(value?.images) && value.images.every(isRef) ? value.images : [];
      if (!refs.length) return [{ type: 'text', text: JSON.stringify(stripBinary(value)) }];

      const payload = {
        ...value,
        images: refs.map((r) => ({ mediaType: r.mediaType, bytes: r.bytes, width: r.width, height: r.height })),
      };
      return [
        { type: 'text', text: JSON.stringify(payload) },
        ...refs.map((ref) => ({ type: 'image', attachment: ref })),
      ];
    },
  });
}
