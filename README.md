# qq-dsh

QQ ↔ dsh桥接的 **dsh 侧组件包**：把一个真实的 QQ 号变成 agent 的一个会话。

配套的另一半是桥接仓库 **[`qq-dsh-bridge`](https://github.com/qq-dsh-bridge/qq-dsh-bridge)** —— 所有路径（令牌、提示词、人格卡、会话文件）都从它的目录推导，见下文「配置」。

本包有**四个入口**：`prompt-sections` / `host` / `tools` 三个常驻，`wslbash` 是可选入口、**默认关闭**（原因见下一节）。

| 入口 | 干什么 |
|---|---|
| `qq-dsh/prompt-sections` | 往 system prompt 里塞桥接的提示词段（从 `<bridgeRoot>/prompts` 读） |
| `qq-dsh/host` | 回环 HTTP（3130），给桥接调 dsh 用 |
| `qq-dsh/tools` | 16 个 `qq_*` 工具 |
| `qq-dsh/wslbash` | **bash 执行器**：把命令交给 WSL（替代"在 PATH 上放一个 bash 转发 exe"的老做法） |

## bash 执行器（`qq-dsh/wslbash`）

DSH 的 shell 是一个可替换的服务（`ctx.shell`，基类 `ShellExecutor`）。这个入口继承
`@deepseek-ai/dsh-bash-sandbox` 的 `SandboxBashExecutor`，只把最后拼出来的 argv 换掉：

```
wsl.exe -d <distro> -e <toolsh> <linuxCwd> <linuxScript>
```

命令原文先写成 `<winWorkspace>/_toolsh_<token>.sh`，再让 WSL 里的 bash 去 source 它 ——
命令要穿过 Node → wsl.exe → bash 三个进程，任何一层做引号转义都可能被下一层吃掉，
写文件就没有转义问题。进程结束时删掉，启动时扫一遍残留。

| 键 | 默认 |
|---|---|
| `distro` | `Ubuntu` |
| `wslExe` | `wsl.exe` |
| `linuxWorkspace` | `/ws` |
| `sweepOnStart` | `true` |
| **`winWorkspace`** | **必填** —— 工作区在 Windows 侧的根（暂存脚本写这里） |
| **`toolsh`** | **必填** —— WSL 里的入口脚本绝对路径（沙箱策略由它负责） |
| `timeoutMs` / `maxTimeoutMs` / `maxOutputBytes` / `maxSpillBytes` / `graceMs` / `cwd` | 与 `dsh-bash-local` 相同（输出上限与 spill 直接继承 `ctx.subprocess`） |

`winWorkspace` 与 `toolsh` **故意没有默认值**：工作区挂在哪、WSL 里那个入口脚本叫什么，
都是部署事实，不属于这个包。缺了它们时不会在加载期炸（那会连累整棵插件树），
而是第一次执行时把该补的两项指名道姓报出来。

```yaml
- insert:
    - id: wsl-bash
      name: qq-dsh/wslbash
      config:
        winWorkspace: <工作区在 Windows 侧的根>
        toolsh: <WSL 里的入口脚本绝对路径>
```

### 沙箱：只接受 `danger-full-access`

限制由 WSL 侧你自己装的 `toolsh` 负责（常见做法是 Landlock 之类的白名单）。
DSH 的 `ctx.sandbox` 管的是 Windows 侧的进程，给不出"进 WSL 之后还能读到什么"，
所以这个执行器**不假设**那边的白名单，也**不转述**它。

非 full-access 时**必须失败**：假装受限比不受限更危险。
要用 DSH 自己的沙箱，就把本插件 `disabled: true`，改用 `bash-sandbox`。

### 没装 WSL 的机器

**把这个入口关掉**，再决定用 `dsh-bash-local` / `dsh-bash-sandbox`，或者干脆不给 shell：

```yaml
- insert:
    - id: wsl-bash
      name: qq-dsh/wslbash
      disabled: true     # 没有 WSL 就关掉，别留一个必然报错的执行器
```

它**不在加载期抛错**（那会让 DSH 起不来），只在第一次执行时给准确诊断：
缺 `wsl.exe` 就指名 `wsl.exe`，缺 `toolsh` 就把该跑的那条验证命令一起打出来。

### 跑它的测试

纯逻辑那一层仓库里就能跑；另外两层靠环境变量指过去（没给就跳过）：

```
DSH_STANDALONE=<dsh-standalone 目录>            # 校验 Config 默认值与上游一致
QQ_DSH_TEST_WORKSPACE=<工作区 Windows 根>
QQ_DSH_TEST_TOOLSH=<WSL 入口脚本>
QQ_DSH_TEST_WSL_PATH=<挂载点，默认 /ws>
QQ_DSH_TEST_DISTRO=<发行版，默认 Ubuntu>         # 真在这台机器上跑一次
```

## 安装

四个入口里，`prompt-sections` / `host` / `tools` **都跑在 DSH 进程里**，所以没有"启动服务"这一步：装好插件、重启 DSH 实例即生效。Node 由 DSH 自带，`engines`（`>= 22.13.0`）只是声明最低版本。`wslbash` 是第四个入口，默认关闭，见上一节。

前置三样（都是本包推导路径的锚点）：

1. DSH 桌面端已装好；
2. 桥接仓库 `qq-dsh-bridge` 已克隆到某个目录；
3. 该目录下 `state/host-token` 已生成（`node scripts/make-host-token.mjs`）。

### 方式 A：作为 bundle（推荐）

本包的 `package.json` 声明了：

```json
"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
```

DSH 装上本包时会按 `cordis.patch.yml` 自动 insert 那三个条目。你要做的只是**在 profile 里补 `bridgeRoot`**：

```yaml
# <dsh home>/profiles/web/cordis.patch.yml
- insert:
    - id: qq-prompt-sections
      name: qq-dsh/prompt-sections
      config: &qqBridge
        bridgeRoot: 'D:/path/to/qq-dsh-bridge'

    - id: qq-dsh-host
      name: qq-dsh/host
      config: *qqBridge

    - id: qq-dsh-tools
      name: qq-dsh/tools
      config: *qqBridge
```

### 方式 B：手工放进 DSH

把本包拷到下面**两个**位置（DSH 从 `plugins/` 加载，preset 从 `node_modules/` 解析名字，少一个就"找不到插件"）：

```
<dsh home>/plugins/qq-dsh/
<dsh home>/profiles/web/node_modules/qq-dsh/
```

再把上一步那三个条目写进 `<dsh home>/profiles/web/cordis.patch.yml`，重启该 home 的 DSH 实例。

> 桥接仓库里的 `scripts/install-plugins.mjs` 自动化了方式 B，但它是**早期写法**（条目名 `qq-dsh-host` / `qq-dsh-tools`，并把 `tokenFile` / `port` / `bridgeUrl` 逐项写进 yml，还会替换 preset 里的 `mcp-qq`）。用当前的 bundle 方式时不要再用它，否则同一个插件会以两个不同的名字出现。

### 怎么确认装好了

- 三个插件启动时各打一行日志，`config` 标注每个值的来源（`config` / `derived` / `default` / `missing`）；出现 `missing` 就是 `bridgeRoot` 没给对。
- `host` 在 `127.0.0.1:3130` 上有监听；桥接那边启动日志会出现 `dsh 插件（qq-dsh-host）正常`。
- 工具面：`qq_usage` 能返回卡片图 ⇒ `tokenFile` 与 `bridgeUrl` 都对；退回纯文本 ⇒ 令牌不一致或桥接没起。

### 与 `mcp-qq` 的关系

两者工具同名。**只留一套**：想让本包接管工具面，就把 preset 里的 `mcp-qq` 条目删掉（或换成 `qq-dsh/tools`），并存会得到两份同名工具。

### 卸载 / 回滚

删掉 profile `cordis.patch.yml` 里那三个条目、删掉方式 B 提到的那两个目录，重启 DSH。曾经开过 `wslbash` 的话，把 `wsl-bash` 条目也一并删掉（或改回 `disabled: true`）。

## 配置

`prompt-sections` / `host` / `tools` 三个共用同一套配置键（`wslbash` 那几项单独列在上一节），清单只有 `src/shared/config.js` 的 `CONFIG_KEYS` 一个地方。

| 键 | 谁用 | 默认 |
|---|---|---|
| `bridgeRoot` | 三个都读 | **必填**（或设环境变量 `QQ_DSH_BRIDGE_HOME`） |
| `tokenFile` | host / tools | `<bridgeRoot>/state/host-token` |
| `bridgeUrl` | tools | `http://127.0.0.1:3110`（只允许回环） |
| `host` / `port` | host | `127.0.0.1` / `3130`（只允许回环） |
| `dir` / `rolesDir` / `bridgeConfigFile` / `sessionsFile` | prompt-sections | 都在 `<bridgeRoot>` 下推导 |

**除了 `bridgeRoot`，其余全部有默认值。** 所以 `cordis.patch.yml` 里最省的写法是
三个条目各给一个 `bridgeRoot`（同一个值），别的都不用写：

```yaml
- id: qq-prompt-sections
  name: qq-dsh/prompt-sections
  config: &qqBridge
    bridgeRoot: 'D:/…/qq-dsh-bridge'

- id: qq-dsh-host
  name: qq-dsh/host
  config: *qqBridge

- id: qq-dsh-tools
  name: qq-dsh/tools
  config: *qqBridge
```

> 不想用 YAML 锚点就把 `config:` 块各写一遍 —— 只有 `bridgeRoot` 一个键，重复也不容易错。
> 反过来说，**不要**再重复写 `tokenFile` / `bridgeUrl` / `host` / `port`：它们的值要么等于默认值，
> 要么能从 `bridgeRoot` 推导，写两遍只会在改目录时忘改一处。

### 为什么以前要写那么多

`tokenFile` 早期没有推导（host 那侧只认绝对路径），于是同一个事实在 yml 里出现了两次
（tools 给 `bridgeRoot`、host 给 `tokenFile`）。现在两个组件都走同一套推导，
`tokenFile` 只在你把令牌放在非标准位置时才需要写。

**反推只认标准布局**（`<bridgeRoot>/state/host-token`）。给一个 `/tmp/tok` 不会猜出
`bridgeRoot` —— 它返回空，`qq_usage` 的卡片图退回纯文本，并在启动日志里 WARN。

### 排查用：值从哪来

三个组件启动时都会把 `config: { 键: 来源 }` 打进日志（`config` / `env:…` / `default:…` /
`derived` / `derived:tokenFile` / `missing`）。所以"为什么它连的是 3110"这类问题，
看那一行就够了，不用再回去翻 yml。

```
qq-dsh-tools 已注册 { count: 16, bridge: 'http://127.0.0.1:3110',
                      config: { bridgeRoot: 'config', tokenFile: 'derived', bridgeUrl: 'default' } }
```
