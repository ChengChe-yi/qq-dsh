// WSL 执行器的**纯逻辑**：路径映射、脚本暂存、残留清理。
//
// 这个文件刻意不 import 任何 @deepseek-ai/* —— 它是唯一能在仓库里（没有 dsh 宿主包）
// 直接跑测试的部分。入口 `index.js` 要继承 dsh 的壳，只能进到 dsh 里才加载。
//
// 为什么还要"暂存成文件"这一步：命令要穿过**两个**进程边界
// （Node → wsl.exe → bash），任何一层做引号转义都可能被下一层吃掉。
// 写完文件让 bash 自己去 source，就只剩"一个我们控制的路径"要传，
// 没有转义问题 —— 这比在 argv 里塞一整条命令稳得多。
//
// 所有路径都由调用方给（`winWorkspace` / `linuxWorkspace`），这个文件**不含**
// 任何与本机布局有关的值。

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** 暂存文件的前缀。清理/扫描都靠它识别"这是我们自己的"。 */
export const STAGE_PREFIX = '_toolsh_';

const isUnder = (child, parent) => {
  const c = path.resolve(child);
  const p = path.resolve(parent);
  if (c.toLowerCase() === p.toLowerCase()) return true;
  return c.toLowerCase().startsWith(`${p.toLowerCase()}${path.sep}`);
};

/**
 * Windows 工作目录 → WSL 里的路径。
 *
 * 只映射 `<winWorkspace>` 底下的目录（其它位置在 WSL 里根本不存在）。
 * 落空时**不报错**，退到 linuxWorkspace —— 与旧 shim 一致：agent 的任务目录
 * 总在 workspace 里，落到别处时"退到 /ws"比"整条命令失败"更有用。
 *
 * @returns `{ cwd, mapped }`；`mapped === false` 表示是按兜底给的
 */
export function toLinuxCwd(winCwd, { winWorkspace, linuxWorkspace }) {
  const fallback = { cwd: linuxWorkspace, mapped: false };
  const raw = String(winCwd ?? '').trim();
  if (!raw) return fallback;

  const normalized = path.resolve(raw).replace(/[\\/]+$/, '');
  if (!isUnder(normalized, winWorkspace)) return fallback;

  const base = path.resolve(winWorkspace);
  if (normalized.toLowerCase() === base.toLowerCase()) return { cwd: linuxWorkspace, mapped: true };

  // 保留大小写，只把分隔符换掉（WSL 里大小写敏感，别 lower）。
  const rest = normalized.slice(base.length).replace(/\\/g, '/');
  return { cwd: `${linuxWorkspace}${rest}`, mapped: true };
}

/**
 * 把命令（含要透传的环境变量）写成 workspace 里的一个 .sh。
 *
 * @param command 要执行的 bash 命令原文
 * @param env     额外环境变量；值会被单引号转义，`\n` 换成 `$'\n'` 那套不做 ——
 *                多行的值本来就该走文件，不该走变量
 * @returns `{ hostPath, remotePath, token }`
 */
export function stageScript(command, { winWorkspace, linuxWorkspace, env = {} }) {
  const token = crypto.randomBytes(6).toString('hex');
  const name = `${STAGE_PREFIX}${token}.sh`;
  const hostPath = path.join(winWorkspace, name);
  const remotePath = `${linuxWorkspace}/${name}`;

  const lines = [];
  for (const [key, value] of Object.entries(env)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;      // 不合法的变量名，导出也没用
    const text = String(value ?? '');
    if (text.includes('\n') || text.includes('\r')) continue;   // 多行值不该走环境变量
    // 单引号里除了单引号本身什么都不特殊；用 '\'' 关-转义-再开。
    lines.push(`export ${key}='${text.replace(/'/g, `'\\''`)}'`);
  }
  // 命令原文只做一件事：CRLF → LF。BOM 不要（bash 会把 BOM 当命令的一部分）。
  const body = `${lines.length ? `${lines.join('\n')}\n` : ''}${String(command ?? '').replace(/\r\n/g, '\n')}`;

  fs.mkdirSync(winWorkspace, { recursive: true });
  fs.writeFileSync(hostPath, body, { encoding: 'utf8' });
  return { hostPath, remotePath, token };
}

/** best-effort 删除；不存在也算成功（`done.finally` 里调用，不能抛）。 */
export function dropStaged(staged) {
  if (!staged?.hostPath) return false;
  try {
    fs.unlinkSync(staged.hostPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * 清掉上次崩溃/被杀留下的暂存文件。
 *
 * 不清理的话它们会一直躺在工作区根目录里 —— 那是 agent 能看见的地方，
 * 一个 `_toolsh_*.sh` 混进 `ls` 输出就够它困惑一阵了。
 *
 * @returns 删掉的个数
 */
export function sweepStaged({ winWorkspace }) {
  let removed = 0;
  let names;
  try {
    names = fs.readdirSync(winWorkspace);
  } catch {
    return 0;
  }
  for (const name of names) {
    if (!name.startsWith(STAGE_PREFIX) || !name.endsWith('.sh')) continue;
    try {
      fs.unlinkSync(path.join(winWorkspace, name));
      removed += 1;
    } catch {
      // 被占用就留着，下次再说
    }
  }
  return removed;
}

/** 拼 `wsl.exe ...` 的 argv。单独成函数是为了测试能比对**确切**的数组。 */
export function buildArgv({ distro, toolsh, wslExe = 'wsl.exe' }, linuxCwd, remoteScript) {
  return [wslExe, '-d', distro, '-e', toolsh, linuxCwd, remoteScript];
}
