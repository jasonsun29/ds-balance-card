# ds-balance-card

[中文](README.md) | **English**

A persistent quota card plugin for **DeepSeek Harness**: shows account balances and Coding Plan quotas for every configured model platform in the bottom-right corner of the web UI. Configure an API key in the DSH credential store and the plugin detects it automatically.

## Features

- 🪟 Persistent card in the bottom-right corner, always visible across sessions (mounted in the frame-wide `shell.overlay` slot)
- 🔍 **Multi-platform auto-detection**: scans the credential store and queries every platform whose API key is configured
- 💰 **Balance** and **Coding Plan quota** shown as separate rows
- ⚠️ **Warnings**: balance below threshold (⚙ adjustable, default 10) turns the row yellow; zero/unavailable turns it red; plan remaining below 20% turns yellow; exhausted turns red. Warning state pulses the dot and speeds up refresh to 1 minute
- ⏱️ Auto-refresh every 5 minutes
- 🖱️ Draggable with viewport edge clamping (cannot be dragged off-screen), double-click the header to reset, collapsible to a slim bar
- 🔒 Safe: API keys never reach the browser. The Host half resolves each key through the DSH `credentials` seam, passes it to curl via an environment variable (never argv), and only parsed balance/quota fields cross the wire

## Platform support matrix

| Platform | Credential name | Balance | Coding Plan / quota |
| --- | --- | --- | --- |
| DeepSeek | `DEEPSEEK_API_KEY` | ✅ `GET /user/balance` | — (no plan) |
| Moonshot Kimi | `MOONSHOT_API_KEY` | ✅ (USD, cash/voucher split) | — |
| StepFun | `STEPFUN_API_KEY` | ✅ (total top-up / grant split) | — |
| MiniMax | `MINIMAX_API_KEY` | — | ✅ Coding Plan (CN) / Token Plan (international), 5h + weekly remaining % |
| Zhipu Z.ai | `ZAI_API_KEY` / `ZHIPU_API_KEY` / `BIGMODEL_API_KEY` | — | ✅ Coding Plan, 5h window / weekly / tool quota remaining %, incl. plan tier |
| OpenAI / Anthropic / Google Gemini / xAI / Volcengine Ark / Aliyun Bailian / Baidu Qianfan / Tencent Hunyuan / iFlytek Spark | see `PLATFORMS` in source | ❌ | ❌ a configured key shows "暂不支持查询" (query not supported yet) |

> Platforms whose key is configured but which expose no official query API are listed explicitly as unsupported — never silently ignored.

## Install

Place the plugin anywhere, link it into the profile's `node_modules`, and insert one row into `cordis.patch.yml`.

```bash
# 1. Clone the plugin (web profile example)
mkdir -p "$DSH_HOME/profiles/web/plugins"
git clone https://github.com/jasonsun29/ds-balance-card.git "$DSH_HOME/profiles/web/plugins/ds-balance-card"

# 2. Link it into the profile's node_modules (created on demand)
mkdir -p "$DSH_HOME/profiles/web/node_modules"
ln -sfn ../plugins/ds-balance-card "$DSH_HOME/profiles/web/node_modules/ds-balance-card"
```

Edit `$DSH_HOME/profiles/web/cordis.patch.yml` and append:

```yaml
- insert:
    - id: ds-balance-card
      name: ds-balance-card
```

Then refresh the page (or restart `dsh web`). After a first-time install, restarting the process is the most reliable way to activate the patch row.

> npm works too: run `npm install ds-balance-card` (or `file:./plugins/ds-balance-card`) inside the profile directory, with the same patch row.

## Usage

- Drag the header to move; double-click to reset to the bottom-right corner
- `−`/`+` collapse/expand; `⟳` refresh now; `⚙` set the balance warning threshold
- Each row is one platform: status dot (green = ok / yellow = warning / red = exhausted or failed / gray = unsupported) + platform name + balance or plan remaining
- Balance rows show the top-up/grant split underneath; plan rows show per-window remaining percentages and the plan tier

## Prerequisites

- At least one platform API key stored in the DSH credential store (written via the Models page, or in `$DSH_HOME/.credentials.yaml`; key names follow the matrix above)
- Designed for the **web profile** (needs a browser UI); not needed for headless profiles
- Host-half code changes require a `dsh web` restart to take effect (a restart is also recommended after first inserting the patch row)

## How it works

- **Host half** (`lib/index.js`): registers a loopback-only Connection RPC channel `/dsbalance` (endpoint `fetch-all`), scans the credential store for configured platform keys, and queries each platform's balance/quota API through the `credentials` + `shell` services
- **Client half** (`lib/client.js`): a React card in the `shell.overlay` slot that talks to the Host via `ctx.connection.rpc`, refreshed by the `timer` service

## License

MIT
