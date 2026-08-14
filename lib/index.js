/**
 * ds-balance-card Host half.
 *
 * Scans the DSH credential store for known platform API keys and queries each
 * configured platform's balance / plan quota through the loopback-only
 * Connection RPC channel `/dsbalance`.
 *
 * API keys never reach the browser: each key is resolved from the credentials
 * seam and passed to curl through an environment variable (never argv), and
 * only parsed balance/quota fields cross the wire.
 */

export const inject = ['connection', 'credentials', 'shell']

const CURL_TIMEOUT = 15

/** Run curl with the key in env and parse the JSON body. */
async function curlJson(ctx, url, key, extraArgs = '') {
  const command = `curl -sS --max-time ${CURL_TIMEOUT} -H "Authorization: Bearer $API_KEY" -H "Accept: application/json" ${extraArgs} "${url}"`
  let spec
  try {
    spec = ctx.shell.resolve({
      command,
      timeoutMs: (CURL_TIMEOUT + 5) * 1000,
      stdoutMaxBytes: 262144,
      env: { API_KEY: key },
    })
  } catch (error) {
    throw new Error('shell.resolve 失败: ' + String((error && error.message) || error))
  }
  let result
  try {
    result = await ctx.shell.run(spec)
  } catch (error) {
    throw new Error('shell.run 失败: ' + String((error && error.message) || error))
  }
  if (result.sandbox && result.sandbox.denied) {
    throw new Error('沙箱拒绝了查询命令')
  }
  if (result.exitCode !== 0) {
    const detail = result.stderr && result.stderr.text ? result.stderr.text.slice(0, 200) : ''
    throw new Error('curl 退出码 ' + String(result.exitCode) + (detail ? ': ' + detail : ''))
  }
  const text = result.stdout ? result.stdout.text : ''
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error('接口返回无法解析: ' + text.slice(0, 160))
  }
}

const num = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

const firstString = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value !== '') return value
  }
  return null
}

/** ---- Platform fetchers: each returns { balance?, plan? } or throws ---- */

async function fetchDeepSeek(ctx, key) {
  const body = await curlJson(ctx, 'https://api.deepseek.com/user/balance', key)
  const infos = Array.isArray(body && body.balance_infos) ? body.balance_infos : []
  const info = infos[0]
  if (info === undefined) throw new Error('余额接口返回异常结构')
  const total = num(info.total_balance)
  return {
    balance: {
      currency: typeof info.currency === 'string' ? info.currency : 'CNY',
      value: total,
      available: body.is_available === true,
      sub: [
        { label: '充值', value: String(info.topped_up_balance) },
        { label: '赠送', value: String(info.granted_balance) },
      ],
    },
  }
}

async function fetchMoonshot(ctx, key) {
  const urls = [
    { url: 'https://api.moonshot.cn/v1/users/me/balance', currency: 'CNY' },
    { url: 'https://api.moonshot.ai/v1/users/me/balance', currency: 'USD' },
  ]
  let lastError = null
  for (const entry of urls) {
    try {
      const body = await curlJson(ctx, entry.url, key)
      const errMsg = body && body.error && body.error.message
      if (errMsg) throw new Error(String(errMsg))
      const data = body && body.data
      if (!data || typeof data !== 'object') throw new Error('余额接口返回异常结构')
      const available = num(data.available_balance)
      return {
        balance: {
          currency: entry.currency,
          value: available,
          available: available !== null && available > 0,
          sub: [
            { label: '现金', value: data.cash_balance === undefined ? null : String(data.cash_balance) },
            { label: '赠送', value: data.voucher_balance === undefined ? null : String(data.voucher_balance) },
          ],
        },
      }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('Moonshot 余额查询失败')
}

async function fetchStepFun(ctx, key) {
  const body = await curlJson(ctx, 'https://api.stepfun.com/v1/accounts', key)
  if (!body || typeof body !== 'object') throw new Error('账户接口返回异常结构')
  const balance = num(body.balance)
  return {
    balance: {
      currency: 'CNY',
      value: balance,
      available: body.type === 'prepaid' ? (balance !== null && balance > 0) : true,
      sub: [
        { label: '总充值', value: body.total_cash_balance === undefined ? null : String(body.total_cash_balance) },
        { label: '总赠送', value: body.total_voucher_balance === undefined ? null : String(body.total_voucher_balance) },
      ],
    },
  }
}

async function fetchMiniMax(ctx, key) {
  const urls = [
    { url: 'https://api.minimaxi.com/v1/api/openplatform/coding_plan/remains', kind: 'Coding Plan' },
    { url: 'https://www.minimaxi.com/v1/api/openplatform/coding_plan/remains', kind: 'Coding Plan' },
    { url: 'https://www.minimax.io/v1/token_plan/remains', kind: 'Token Plan' },
    { url: 'https://api.minimax.io/v1/api/openplatform/coding_plan/remains', kind: 'Coding Plan' },
  ]
  let lastError = null
  for (const { url, kind } of urls) {
    try {
      const body = await curlJson(ctx, url, key)
      const baseResp = body && body.base_resp ? body.base_resp : (body && body.data && body.data.base_resp)
      const statusCode = num(baseResp && baseResp.status_code)
      if (statusCode === null || statusCode !== 0) {
        const message = firstString(baseResp && baseResp.status_msg)
        throw new Error(message || '套餐接口返回错误')
      }
      const remains = (body && body.model_remains) || (body && body.data && body.data.model_remains)
      if (!Array.isArray(remains) || remains.length === 0) throw new Error('套餐接口未返回配额数据')
      const rows = []
      for (const item of remains) {
        const name = firstString(item.model_name) || '模型'
        const pct = num(item.current_interval_remaining_percent)
        const weekPct = num(item.current_weekly_remaining_percent)
        if (pct !== null) rows.push({ label: name + ' · 5h', remainingPct: pct })
        if (weekPct !== null) rows.push({ label: name + ' · 周', remainingPct: weekPct })
      }
      if (rows.length === 0) throw new Error('套餐接口缺少百分比字段')
      return { plan: { kind: kind, rows } }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('MiniMax 配额查询失败')
}

async function fetchZai(ctx, key) {
  const bases = ['https://api.z.ai', 'https://open.bigmodel.cn']
  let lastError = null
  for (const base of bases) {
    try {
      const body = await curlJson(ctx, `${base}/api/monitor/usage/quota/limit`, key)
      const data = body && body.data
      if (!data || !Array.isArray(data.limits)) throw new Error('配额接口返回异常结构')
      const rows = []
      for (const lim of data.limits) {
        if (lim.type === 'TOKENS_LIMIT' && lim.unit === 3) {
          rows.push({ label: '5h 窗口', remainingPct: num(lim.percentage) })
        } else if (lim.type === 'TOKENS_LIMIT' && lim.unit === 6) {
          rows.push({ label: '周配额', remainingPct: num(lim.percentage) })
        } else if (lim.type === 'TIME_LIMIT') {
          rows.push({ label: '工具额度', remainingPct: num(lim.percentage) })
        }
      }
      if (rows.length === 0) throw new Error('配额接口未返回限额数据')
      return { plan: { kind: 'Coding Plan', level: firstString(data.level), rows } }
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || new Error('智谱配额查询失败')
}

/** ---- Platform registry ---- */

const PLATFORMS = [
  { id: 'deepseek', name: 'DeepSeek', credentials: ['DEEPSEEK_API_KEY'], fetch: fetchDeepSeek },
  { id: 'moonshot', name: 'Moonshot Kimi', credentials: ['MOONSHOT_API_KEY', 'MOONSHOTAI_API_KEY'], fetch: fetchMoonshot },
  { id: 'stepfun', name: '阶跃星辰', credentials: ['STEPFUN_API_KEY'], fetch: fetchStepFun },
  { id: 'minimax', name: 'MiniMax', credentials: ['MINIMAX_API_KEY', 'MINIMAX_CN_API_KEY', 'MINIMAX_INTL_API_KEY'], fetch: fetchMiniMax },
  { id: 'zai', name: '智谱 Z.ai', credentials: ['ZAI_API_KEY', 'ZHIPU_API_KEY', 'BIGMODEL_API_KEY'], fetch: fetchZai },
  // 以下平台已能识别凭证,但尚无官方/稳定的查询接口
  { id: 'openai', name: 'OpenAI', credentials: ['OPENAI_API_KEY'], fetch: null },
  { id: 'anthropic', name: 'Anthropic', credentials: ['ANTHROPIC_API_KEY'], fetch: null },
  { id: 'google', name: 'Google Gemini', credentials: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], fetch: null },
  { id: 'xai', name: 'xAI Grok', credentials: ['XAI_API_KEY'], fetch: null },
  { id: 'ark', name: '火山方舟', credentials: ['ARK_API_KEY', 'ARK_ACCESS_KEY', 'VOLC_ACCESSKEY'], fetch: null },
  { id: 'dashscope', name: '阿里云百炼', credentials: ['DASHSCOPE_API_KEY'], fetch: null },
  { id: 'qianfan', name: '百度千帆', credentials: ['QIANFAN_API_KEY', 'BAIDU_QIANFAN_API_KEY'], fetch: null },
  { id: 'hunyuan', name: '腾讯混元', credentials: ['HUNYUAN_API_KEY'], fetch: null },
  { id: 'spark', name: '讯飞星火', credentials: ['SPARK_API_KEY', 'IFLYTEK_API_KEY'], fetch: null },
]

async function fetchAll(ctx) {
  const platforms = []
  await Promise.all(PLATFORMS.map(async (platform) => {
    let key = undefined
    for (const name of platform.credentials) {
      const resolved = await ctx.credentials.resolve(name)
      if (resolved !== undefined && typeof resolved.value === 'string' && resolved.value.length > 0) {
        key = resolved.value
        break
      }
    }
    if (key === undefined) return // 未配置 → 不显示
    const entry = { id: platform.id, name: platform.name, configured: true }
    if (platform.fetch === null) {
      entry.supported = false
      platforms.push(entry)
      return
    }
    entry.supported = true
    try {
      const outcome = await platform.fetch(ctx, key)
      entry.balance = outcome.balance || null
      entry.plan = outcome.plan || null
    } catch (error) {
      entry.error = String((error && error.message) || error)
    }
    platforms.push(entry)
  }))
  platforms.sort((a, b) => (a.id === 'deepseek' ? -1 : b.id === 'deepseek' ? 1 : a.id.localeCompare(b.id)))
  return { ok: true, platforms, fetchedAt: Date.now() }
}

export function apply(ctx) {
  ctx.connection.rpc.handle('/dsbalance', async (endpoint, _payload, _signal) => {
    try {
      if (endpoint === 'fetch-all') return { ok: true, value: await fetchAll(ctx) }
      // 兼容旧版客户端的单平台端点(仅 DeepSeek 余额)
      if (endpoint === 'fetch') {
        const entry = (await fetchAll(ctx)).platforms.find((p) => p.id === 'deepseek')
        if (entry === undefined) {
          return { ok: false, error: { code: 'internal', message: '未配置 DEEPSEEK_API_KEY 凭证', details: {} } }
        }
        if (entry.error) {
          return { ok: false, error: { code: 'internal', message: entry.error, details: {} } }
        }
        const balance = entry.balance
        return {
          ok: true,
          value: balance === null ? null : {
            isAvailable: balance.available,
            currency: balance.currency,
            totalBalance: String(balance.value),
            grantedBalance: '',
            toppedUpBalance: '',
            fetchedAt: Date.now(),
          },
        }
      }
      return { ok: false, error: { code: 'internal', message: 'unknown endpoint: ' + String(endpoint), details: {} } }
    } catch (error) {
      return { ok: false, error: { code: 'internal', message: String((error && error.message) || error), details: {} } }
    }
  }, { authority: 'loopback' })
}
