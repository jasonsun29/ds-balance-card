# ds-balance-card

**中文** | [English](README.en.md)

DeepSeek Harness 常驻额度卡片插件:在界面右下角持续显示**各模型平台的账户余额与 Coding Plan 套餐额度**。只要在 DSH 凭证库中配置了对应平台的 API Key,插件会自动识别并逐平台查询。

![ds-balance-card 卡片截图](https://github.com/jasonsun29/ds-balance-card/raw/main/docs/screenshot.png)

## 功能

- 🪟 右下角常驻卡片,跨会话始终可见(挂在 `shell.overlay` 全帧浮动层)
- 🔍 **多平台自动识别**:扫描凭证库,已配置 Key 的平台自动查询并逐行显示
- 💰 **余额**与 **Coding Plan 额度**分行区分显示
- ⚠️ **预警**:余额低于阈值(⚙ 可调,默认 10)变黄、余额为 0/不可用变红;套餐剩余低于 20% 变黄、耗尽变红;预警状态圆点脉冲闪烁、刷新加速到 1 分钟
- ⏱️ 每 5 分钟自动刷新
- 🖱️ 可拖拽移动(带视口边缘保护,拖不出屏幕)、双击标题栏复位、可收起为最小条
- 🔒 安全:API Key 永不进入浏览器。Host 半通过 DSH `credentials` 服务解析各平台 Key,经环境变量传给 curl,仅把解析后的余额/配额字段发往页面

## 平台支持矩阵

凭证名**精确匹配**(大小写敏感),插件按表内顺序依次探测;不在名单里的名字不会被识别。

| 平台 | 扫描的凭证名(依次尝试) | 查询接口 | 余额 | Coding Plan / 套餐额度 |
| --- | --- | --- | --- | --- |
| DeepSeek | `DEEPSEEK_API_KEY` | `api.deepseek.com/user/balance` | ✅(CNY) | —(无套餐) |
| Moonshot Kimi | `MOONSHOT_API_KEY` → `MOONSHOTAI_API_KEY` | `api.moonshot.cn` → `api.moonshot.ai` | ✅(国内站 CNY / 国际站 USD,含现金/赠送拆分) | — |
| 阶跃星辰 StepFun | `STEPFUN_API_KEY` | `api.stepfun.com/v1/accounts` | ✅(含总充值/总赠送) | — |
| MiniMax | `MINIMAX_API_KEY` → `MINIMAX_CN_API_KEY` → `MINIMAX_INTL_API_KEY` | `api.minimaxi.com`(CN Coding Plan)→ `www.minimax.io`(Token Plan)→ `api.minimax.io` | — | ✅ 5h + 周窗口剩余 % |
| 智谱 Z.ai | `ZAI_API_KEY` → `ZHIPU_API_KEY` → `BIGMODEL_API_KEY` | `api.z.ai` → `open.bigmodel.cn` | — | ✅ 5h 窗口 / 周配额 / 工具额度剩余 %,含套餐档位 |
| OpenAI | `OPENAI_API_KEY` | — | ❌ | ❌ 显示「暂不支持查询」 |
| Anthropic | `ANTHROPIC_API_KEY` | — | ❌ | ❌ |
| Google Gemini | `GEMINI_API_KEY` → `GOOGLE_API_KEY` | — | ❌ | ❌ |
| xAI Grok | `XAI_API_KEY` | — | ❌ | ❌ |
| 火山方舟 | `ARK_API_KEY` → `ARK_ACCESS_KEY` → `VOLC_ACCESSKEY` | — | ❌ | ❌ |
| 阿里云百炼 | `DASHSCOPE_API_KEY` | — | ❌ | ❌ |
| 百度千帆 | `QIANFAN_API_KEY` → `BAIDU_QIANFAN_API_KEY` | — | ❌ | ❌ |
| 腾讯混元 | `HUNYUAN_API_KEY` | — | ❌ | ❌ |
| 讯飞星火 | `SPARK_API_KEY` → `IFLYTEK_API_KEY` | — | ❌ | ❌ |

> 配置了 Key 但平台暂无官方查询接口时,卡片会明确标注「暂不支持查询」,不会静默忽略。

## 安装

插件本体放进任意位置,链接到 profile 的 `node_modules`,再在 `cordis.patch.yml` 里插入一行即可。

```bash
# 1. 克隆插件(以 web profile 为例)
mkdir -p "$DSH_HOME/profiles/web/plugins"
git clone https://github.com/jasonsun29/ds-balance-card.git "$DSH_HOME/profiles/web/plugins/ds-balance-card"

# 2. 链接到 profile 的 node_modules(无 node_modules 目录会自动创建)
mkdir -p "$DSH_HOME/profiles/web/node_modules"
ln -sfn ../plugins/ds-balance-card "$DSH_HOME/profiles/web/node_modules/ds-balance-card"
```

编辑 `$DSH_HOME/profiles/web/cordis.patch.yml`,追加:

```yaml
- insert:
    - id: ds-balance-card
      name: ds-balance-card
```

最后刷新页面(或重启 `dsh web`)。首次安装后如需让补丁行立即生效,重启进程最稳妥。

> 用 npm 管理也可以:在 profile 目录执行 `npm install ds-balance-card`(或 `file:./plugins/ds-balance-card`),补丁行同上。

## 使用

- 拖动标题栏移动;双击复位到右下角
- `−`/`+` 收起/展开;`⟳` 立即刷新;`⚙` 设置余额预警阈值
- 每行 = 一个平台:状态点(绿=正常 / 黄=预警 / 红=耗尽或失败 / 灰=暂不支持)+ 平台名 + 余额或套餐剩余
- 余额行副行显示充值/赠送拆分;套餐行副行显示各窗口剩余百分比与套餐档位

## 前置条件

- 至少一个平台 API Key 已存入 DSH 凭证库(Web 界面 Models 页写入,或 `$DSH_HOME/.credentials.yaml`,键名见上方支持矩阵)
- 本插件为 **web profile** 设计(需要浏览器界面);headless profile 无需安装
- Host 半的代码改动需要重启 `dsh web` 生效(补丁行首次插入后同样建议重启)

## 原理

- **Host 半**(`lib/index.js`):注册 loopback-only 的 Connection RPC 通道 `/dsbalance`(`fetch-all` 端点),扫描凭证库中已配置的平台 Key,经 `credentials` + `shell` 服务逐一调用各平台余额/配额接口
- **Client 半**(`lib/client.js`):`shell.overlay` 槽位的 React 卡片,通过 `ctx.connection.rpc` 与 Host 通信,`timer` 服务驱动定时刷新

## License

MIT
