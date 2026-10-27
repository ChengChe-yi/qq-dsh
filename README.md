# qq-dsh

QQ ↔ dsh桥接的 **dsh 侧组件包**：把一个真实的 QQ 号变成 agent 的一个会话

## 配置

包里有三个 dsh 插件（`prompt-sections` / `host` / `tools`），**共用同一套配置键**，
清单只有 `src/shared/config.js` 的 `CONFIG_KEYS` 一个地方。

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
