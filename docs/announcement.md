# 【社区插件】ds-balance-card — 界面常驻的多平台余额 / Coding Plan 额度卡片

> 复制本文件内容,粘贴到 [DeepSeek Harness 的 GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 的「Show and tell」分类即可发布。
> 建议标题:`[Show and tell] ds-balance-card — 界面常驻的多平台余额 / Coding Plan 额度卡片`

## 简介

**ds-balance-card** 是一个 DeepSeek Harness 社区插件:在 Web 界面右下角常驻显示一张可拖拽的额度卡片,自动识别你在 DSH 凭证库中配置的平台 API Key,逐平台显示**账户余额**与 **Coding Plan 套餐额度**。

仓库:https://github.com/jasonsun29/ds-balance-card

## 支持矩阵

| 平台 | 余额 | Coding Plan / 套餐额度 |
| --- | --- | --- |
| DeepSeek | ✅ `GET /user/balance` | — |
| Moonshot Kimi | ✅(USD) | — |
| 阶跃星辰 StepFun | ✅ | — |
| MiniMax | — | ✅ Coding Plan(国内)/ Token Plan(国际),5h + 周窗口 |
| 智谱 Z.ai | — | ✅ Coding Plan,5h 窗口 / 周配额 / 工具额度,含档位 |
| OpenAI / Anthropic / Gemini / xAI / 火山方舟 / 百炼 / 千帆 / 混元 / 星火 | ❌ 配置了 Key 会显示「暂不支持查询」 | ❌ |

## 特性

- 每 5 分钟自动刷新;预警状态(余额低于阈值 / 套餐剩余 < 20%)加速到 1 分钟
- 余额与套餐额度分行区分;预警阈值卡片内可调
- 拖拽带视口边缘保护、可收起、双击复位
- **密钥安全**:API Key 不进入浏览器,Host 半经 DSH `credentials` 服务解析、以环境变量传给 curl,仅余额字段过线

## 安装(三步)

```bash
mkdir -p "$DSH_HOME/profiles/web/plugins" "$DSH_HOME/profiles/web/node_modules"
git clone https://github.com/jasonsun29/ds-balance-card.git "$DSH_HOME/profiles/web/plugins/ds-balance-card"
ln -sfn ../plugins/ds-balance-card "$DSH_HOME/profiles/web/node_modules/ds-balance-card"
```

在 `$DSH_HOME/profiles/web/cordis.patch.yml` 追加:

```yaml
- insert:
    - id: ds-balance-card
      name: ds-balance-card
```

重启 `dsh web` 并刷新页面即可。

## 实现要点(供 Harness 生态参考)

- Host 半通过 **Connection RPC 通道**(`ctx.connection.rpc.handle`,loopback-only)暴露 `fetch-all` 端点
- Client 半是标准的 `dsh.client` 双面包结构,注册在 `shell.overlay` 槽位
- 凭证枚举走 `credentials.resolve` 逐个探测已知平台键名(不缓存,凭证变更即时生效)

## 一个想法

官方目前没有公开的"账户余额"产品入口,而 DeepSeek / Moonshot / StepFun 等平台其实都有官方余额端点。如果 Harness 未来把「额度卡片」作为内置能力,社区这边会很乐意把各家接口的踩坑记录(响应结构、鉴权差异)整理贡献出来。

欢迎试用、star 和提 issue 🚀
