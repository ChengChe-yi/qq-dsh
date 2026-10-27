// `qq-dsh/wslbash`：把 bash 工具交给 **WSL** 执行。
//
// ════════════════════════════════════════════════════════════════════════════
// 它替代的是什么
// ════════════════════════════════════════════════════════════════════════════
//
// 在 Windows 上，DSH 的 bash 执行器 spawn 的是 `"bash"`，而 Windows 没有 bash，
// 只能靠 **PATH 上排一个冒充者**（把 bash 转发进 WSL 的小可执行文件）。三个代价：
//
//   · 谁在 PATH 上排在前面谁赢（装了 Git Bash 就可能被抢走）；
//   · 转发层通常直接透传 stdout，没有输出上限、没有 spill 文件，
//     一条 `cat` 大文件就能把上下文打爆；
//   · 超时/取消只能 kill 那个转发进程，WSL 里的子进程可能活下来。
//
// 现在改成**插件**：DSH 的 shell 本来就是一个可替换的服务（`ctx.shell`，
// 见 `@deepseek-ai/dsh-shell` 的 `ShellExecutor`）。继承 `SandboxBashExecutor`、
// 只把最后拼出来的 argv 换掉，父类的生命周期（deadline / 取消 / 输出上限 /
// spill / SIGTERM→SIGKILL）全部照用。
//
// ════════════════════════════════════════════════════════════════════════════
// 配置没有任何"本机"默认值
// ════════════════════════════════════════════════════════════════════════════
//
// `winWorkspace` 与 `toolsh` **必填**，因为这个包里不存在一个对所有机器都成立的答案：
// 工作区挂在哪、WSL 里的入口脚本叫什么，都是部署事实，属于 profile 的 config，
// 不属于代码。缺了它们时不会在加载期炸（那会连累整棵插件树），
// 而是在第一次执行时给出指名道姓的报错。
//
// ════════════════════════════════════════════════════════════════════════════
// 沙箱语义（重要，别改）
// ════════════════════════════════════════════════════════════════════════════
//
// 这个执行器**只支持 `danger-full-access`**，其余模式直接抛错。
//
//   限制由 WSL 侧你自己安装的入口脚本（`toolsh`）负责 —— 常见做法是 Landlock
//   之类的只读/只写白名单。DSH 的 `ctx.sandbox` 管的是 Windows 侧的进程，
//   它给不出"进 WSL 之后还能读到什么"的答案，所以本执行器**不假设**
//   也不转述那边的白名单内容。
//
//   非 full-access 时**必须失败**：假装受限比不受限更危险。
//   要用 DSH 自己的沙箱，就关掉本插件、改用 `dsh-bash-sandbox`。
//
// ════════════════════════════════════════════════════════════════════════════
// 可关掉（这是刻意设计）
// ════════════════════════════════════════════════════════════════════════════
//
// 没装 WSL 的机器上这个插件应该 `disabled: true`，而不是留着一个必然报错的执行器。
// 关掉之后用哪个 shell 由那台机器的 profile 决定（`dsh-bash-local` /
// `dsh-bash-sandbox` / `dsh-pwsh-*`），甚至完全不给 shell。

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

import z from '@deepseek-ai/schemastery';
import { SandboxBashExecutor } from '@deepseek-ai/dsh-bash-sandbox';

import { buildArgv, dropStaged, stageScript, sweepStaged, toLinuxCwd } from './stage.js';

const FULL_ACCESS = 'danger-full-access';

// 与 `dsh-bash-local` 保持一致的工具输出环境：关颜色、关分页器。
const ENV_OVERRIDES = Object.freeze({
  NO_COLOR: '1',
  TERM: 'dumb',
  PAGER: 'cat',
  GIT_PAGER: 'cat',
});

const REQUIRED = ['winWorkspace', 'toolsh'];

export default class WslBashExecutor extends SandboxBashExecutor {
  // ⚠️ 必须**平铺重写**，不能用 `z.intersect([父类 Config, 我的])`：
  //    父类那 6 个字段全是 `.volatile()`，schemastery 要求它们有固定的对象路径，
  //    一 intersect 就抛 `volatile fields require a fixed object path`。
  //    代价是默认值要跟着上游走一遍 —— `tests/wslbash.mjs` 里有一条断言拿
  //    `dsh-bash-local` 的默认值逐项比对，抄错了会红。
  static Config = z.object({
    // ── 父类字段（原样；改默认值要同步上面的测试）
    cwd: z.string().volatile(),
    timeoutMs: z.number().default(12e4).volatile(),
    maxTimeoutMs: z.number().default(6e5).volatile(),
    maxOutputBytes: z.number().default(64e3).volatile(),
    maxSpillBytes: z.number().default(64 * 1024 * 1024).volatile(),
    graceMs: z.number().default(3e3).volatile(),
    // ── 这个执行器自己的
    distro: z.string().default('Ubuntu').description('WSL 发行版名（`wsl -l -q` 里那个）'),
    toolsh: z.string().description('必填：WSL 里的入口脚本绝对路径（负责那台机器的沙箱策略）'),
    wslExe: z.string().default('wsl.exe').description('wsl.exe 的路径或名字'),
    winWorkspace: z.string().description('必填：工作区在 Windows 侧的根（暂存脚本放这里）'),
    linuxWorkspace: z.string().default('/ws').description('同一个目录在 WSL 里的挂载点'),
    sweepOnStart: z.boolean().default(true).description('启动时清掉上次留下的暂存脚本'),
  });

  // ⚠️ 这里**不能**用 `#private` 字段或方法。
  //
  // cordis 把服务包成 Proxy 再暴露成 `ctx.shell`（`new Proxy(target, …)`，见
  // cordis/index.js 的 createTraceable），调用 `ctx.shell.execute()` 时 `this`
  // 是那个 **Proxy**，而 `#private` 要求 this 必须是"真正的实例"，于是第一次
  // bash 调用就抛：
  //     TypeError: Receiver must be an instance of class WslBashExecutor
  //
  // 上游 `dsh-bash-local` / `dsh-bash-sandbox` 全用普通属性，原因就在这里。
  // `state` 是普通对象：探针结果与"只警告一次"的标记都放进去。
  state = { probe: null, warnedUnmapped: false };

  constructor(ctx, config) {
    super(ctx, config);
    if (config.sweepOnStart) {
      const removed = sweepStaged(config);
      if (removed > 0) {
        ctx.logger?.info?.('qq-dsh/wslbash: 清掉了上次留下的暂存脚本', { removed });
      }
    }
    ctx.logger?.info?.('qq-dsh/wslbash 就绪', {
      distro: config.distro,
      configured: REQUIRED.every((key) => String(config[key] ?? '').trim() !== ''),
    });
  }

  /**
   * 父类在 `danger-full-access` 下走 `["bash","-c",cmd]`（依赖 PATH）；
   * 这里整个换掉：命令写进 workspace 的暂存脚本，argv 指向 `wsl.exe`。
   */
  async execute(spec) {
    const policy = spec.sandboxPolicy;
    const mode = policy?.mode;
    if (mode !== FULL_ACCESS) {
      throw new Error(
        `qq-dsh/wslbash: 只支持 ${FULL_ACCESS}（收到 ${mode ?? '(未指定)'}）。\n`
        + '  这个执行器把命令交给 WSL，限制由 WSL 侧的入口脚本负责，不经过 ctx.sandbox —— '
        + '所以它无法承诺别的模式。\n'
        + '  要用 DSH 自己的沙箱：把本插件 disabled，改用 dsh-bash-sandbox。',
      );
    }

    this.assertUsable();

    const config = this.config;
    const { cwd, mapped } = toLinuxCwd(spec.workdir, config);
    if (!mapped && !this.state.warnedUnmapped) {
      this.state.warnedUnmapped = true;
      this.ctx.logger?.warn?.('qq-dsh/wslbash: workdir 不在工作区里，已退到 linuxWorkspace', {
        workdir: spec.workdir, linuxWorkspace: config.linuxWorkspace,
      });
    }

    // env 要**在 Linux 里生效**，所以不只是传给 wsl.exe（那只是 Windows 侧的环境），
    // 还要写成 export 行放进脚本。`dshEnv` 是 DSH 自己的会话事实，丢了工具会瞎。
    const env = { ...ENV_OVERRIDES, ...spec.env, ...spec.dshEnv };
    const staged = stageScript(spec.command, { ...config, env });
    let handle;
    try {
      handle = await this.executeArgv(spec, buildArgv(config, cwd, staged.remotePath));
    } catch (error) {
      dropStaged(staged);
      throw error;
    }
    // `done` 按契约永不 reject，所以这里不会产生未处理的 rejection。
    handle.done.then(() => dropStaged(staged), () => dropStaged(staged));

    return SandboxBashExecutor.decorateResult(handle, (result) => ({
      ...result,
      sandbox: { mode, denied: false },
    }));
  }

  /** 第一次执行时确认配置齐、wsl.exe 在、toolsh 可执行；结果缓存，失败信息指名道姓。 */
  /** 第一次执行时确认配置齐、wsl.exe 在、toolsh 可执行；结果缓存。 */
  assertUsable() {
    if (this.state.probe?.ok) return;
    if (this.state.probe && !this.state.probe.ok) throw new Error(this.state.probe.reason);

    const { distro, toolsh, wslExe, winWorkspace } = this.config;

    const missing = REQUIRED.filter((key) => String(this.config[key] ?? '').trim() === '');
    if (missing.length) {
      this.state.probe = {
        ok: false,
        reason: `qq-dsh/wslbash: 缺配置 ${missing.join(', ')}。\n`
          + '  这两项没有默认值 —— 工作区挂在哪、WSL 里的入口脚本叫什么，都是部署事实。\n'
          + '  在 profile 的这个条目下补上，例如：\n'
          + '    config:\n'
          + '      winWorkspace: <工作区在 Windows 侧的根>\n'
          + '      toolsh: <WSL 里的入口脚本绝对路径>',
      };
      throw new Error(this.state.probe.reason);
    }

    const probe = spawnSync(wslExe, ['-d', distro, '-e', 'test', '-x', toolsh], {
      encoding: 'utf8',
      timeout: 20_000,
      windowsHide: true,
    });

    if (probe.error) {
      this.state.probe = {
        ok: false,
        reason: `qq-dsh/wslbash: 起不了 ${wslExe}（${probe.error.message}）。\n`
          + '  这台机器大概没有 WSL：把本插件 disabled，改用 dsh-bash-local / dsh-bash-sandbox，'
          + '或者干脆不给 shell。',
      };
      throw new Error(this.state.probe.reason);
    }
    if (probe.status !== 0) {
      const stderr = String(probe.stderr ?? '').trim();
      this.state.probe = {
        ok: false,
        reason: `qq-dsh/wslbash: WSL 里找不到可执行的 ${toolsh}（distro=${distro}，退出码 ${probe.status}）。\n`
          + `  先确认 \`wsl -d ${distro} -e ls -l ${toolsh}\` 能跑通；初次部署要把它装进发行版里。\n`
          + (stderr ? `  WSL 说：${stderr.split('\n')[0]}\n` : ''),
      };
      throw new Error(this.state.probe.reason);
    }
    // winWorkspace 也要真的存在，否则暂存脚本写不出去（报错会指向一个奇怪的 FileNotFound）。
    if (!this.workspaceReady(winWorkspace)) {
      this.state.probe = {
        ok: false,
        reason: `qq-dsh/wslbash: winWorkspace 不可写：${winWorkspace}`,
      };
      throw new Error(this.state.probe.reason);
    }
    this.state.probe = { ok: true };
  }

  workspaceReady(dir) {
    try {
      return fs.statSync(dir).isDirectory();
    } catch {
      return false;
    }
  }
}
