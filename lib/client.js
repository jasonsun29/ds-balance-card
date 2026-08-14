window.__ModuleLoader__.load({
  id: "ds-balance-card",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");

    const CSS = '.dsbc-card{position:fixed;right:20px;bottom:20px;z-index:400;width:260px;box-sizing:border-box;pointer-events:auto;user-select:none;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:13px;line-height:1.5;color:#e5e7eb;background:rgba(15,23,42,.94);border:1px solid rgba(148,163,184,.28);border-radius:12px;box-shadow:0 10px 28px rgba(0,0,0,.38);backdrop-filter:blur(10px);overflow:hidden}.dsbc-header{display:flex;align-items:center;gap:8px;padding:8px 10px;cursor:grab;touch-action:none}.dsbc-header:active{cursor:grabbing}.dsbc-dot{width:8px;height:8px;border-radius:50%;flex:none}.dsbc-pulse{animation:dsbc-pulse 2s ease-in-out infinite}.dsbc-title{flex:1;font-weight:600;font-size:12.5px;letter-spacing:.02em}.dsbc-btn{border:none;background:transparent;color:#94a3b8;cursor:pointer;font-size:14px;line-height:1;padding:4px 5px;border-radius:6px}.dsbc-btn:hover{background:rgba(148,163,184,.18);color:#f1f5f9}.dsbc-body{padding:2px 12px 12px;max-height:360px;overflow-y:auto}.dsbc-plat{padding:7px 0;border-bottom:1px solid rgba(148,163,184,.12)}.dsbc-plat:last-child{border-bottom:none}.dsbc-plat-top{display:flex;align-items:center;gap:6px}.dsbc-plat-dot{width:6px;height:6px;border-radius:50%;flex:none}.dsbc-plat-name{flex:1;font-weight:600;font-size:12.5px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dsbc-plat-main{font-weight:600;font-size:12.5px;font-variant-numeric:tabular-nums;color:#e5e7eb}.dsbc-plat-sub{margin:2px 0 0 12px;font-size:11px;color:#64748b;word-break:break-all}.dsbc-plat-sub b{color:#94a3b8;font-weight:600}.dsbc-note{margin-top:8px;padding-top:6px;border-top:1px solid rgba(148,163,184,.16);font-size:11px;color:#64748b}.dsbc-error{color:#fca5a5;font-size:12px;word-break:break-all}.dsbc-settings{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:12px;color:#94a3b8}.dsbc-input{width:60px;background:rgba(148,163,184,.12);border:1px solid rgba(148,163,184,.3);border-radius:6px;color:#e5e7eb;padding:3px 6px;font-size:12px}@keyframes dsbc-pulse{0%,100%{opacity:1}50%{opacity:.3}}'

    const STORAGE_KEY = "ds-balance-card:threshold"
    const DEFAULT_THRESHOLD = 10
    const PLAN_WARN_PCT = 20

    const inject = ["slots", "timer", "connection"]

    function apply(ctx) {
      let styleTag = null
      ctx.effect(() => {
        styleTag = document.createElement("style")
        styleTag.dataset.plugin = "ds-balance-card"
        styleTag.textContent = CSS
        document.head.append(styleTag)
        return () => {
          styleTag.remove()
          styleTag = null
        }
      })

      let drag = null
      let cardEl = null

      const readThreshold = () => {
        try {
          const raw = globalThis.localStorage.getItem(STORAGE_KEY)
          if (raw !== null) {
            const n = Number(raw)
            if (Number.isFinite(n) && n >= 0) return n
          }
        } catch (err) {}
        return DEFAULT_THRESHOLD
      }

      const findBounds = (el, cr) => {
        let node = el.parentElement
        while (node !== null) {
          const r = node.getBoundingClientRect()
          if (r.width > cr.width && r.height > cr.height) return r
          node = node.parentElement
        }
        return null
      }

      const symbolOf = (currency) => currency === "USD" ? "$" : currency === "CNY" ? "\u00A5" : (currency ? currency + " " : "")

      const platformLevel = (p, threshold) => {
        if (p.supported === false) return "muted"
        if (p.error) return "error"
        let level = "ok"
        if (p.balance) {
          const v = p.balance.value
          if (!p.balance.available || (typeof v === "number" && v <= 0)) level = "critical"
          else if (typeof v === "number" && v < threshold) level = "warn"
        }
        if (p.plan && Array.isArray(p.plan.rows)) {
          for (const row of p.plan.rows) {
            if (typeof row.remainingPct !== "number") continue
            if (row.remainingPct <= 0) {
              if (level !== "critical") level = "critical"
            } else if (row.remainingPct < PLAN_WARN_PCT && level === "ok") level = "warn"
          }
        }
        return level
      }

      const LEVEL_RANK = { muted: 0, ok: 1, error: 2, warn: 3, critical: 4 }
      const LEVEL_COLOR = { ok: "#34d399", warn: "#fbbf24", critical: "#f87171", error: "#f87171", muted: "#64748b" }

      function BalanceCard() {
        const [state, setState] = React.useState({ status: "loading", platforms: [], error: null, updatedAt: null })
        const [minimized, setMinimized] = React.useState(false)
        const [pos, setPos] = React.useState(null)
        const [threshold, setThreshold] = React.useState(readThreshold)
        const [editing, setEditing] = React.useState(false)
        const [draft, setDraft] = React.useState(String(readThreshold()))

        const applyLegacy = (value) => {
          if (value === null || value === undefined) {
            setState({ status: "error", platforms: [], error: "未配置 DEEPSEEK_API_KEY 凭证", updatedAt: Date.now() })
            return
          }
          setState({
            status: "ok",
            platforms: [{
              id: "deepseek", name: "DeepSeek", configured: true, supported: true,
              balance: {
                currency: value.currency,
                value: Number(value.totalBalance),
                available: value.isAvailable === true,
                sub: [
                  { label: "充值", value: value.toppedUpBalance },
                  { label: "赠送", value: value.grantedBalance },
                ],
              },
            }],
            error: null,
            updatedAt: Date.now(),
          })
        }

        const RETRY_MS = 10000
        let retryScheduled = false
        const scheduleRetry = () => {
          if (retryScheduled) return
          retryScheduled = true
          ctx.timeout(() => {
            retryScheduled = false
            load()
          }, RETRY_MS)
        }

        const load = () => {
          ctx.connection.rpc.call("/dsbalance", "fetch-all", null).then((result) => {
            if (result && result.ok === true) {
              const platforms = result.value && Array.isArray(result.value.platforms) ? result.value.platforms : []
              if (platforms.length === 0) {
                setState({ status: "ok", platforms: [], error: null, updatedAt: Date.now() })
                scheduleRetry()
                return
              }
              setState({ status: "ok", platforms: platforms, error: null, updatedAt: Date.now() })
              return
            }
            const message = result && result.error ? result.error.message : "查询失败"
            if (String(message).indexOf("unknown endpoint") !== -1) {
              return ctx.connection.rpc.call("/dsbalance", "fetch", null).then((legacy) => {
                if (legacy && legacy.ok === true) applyLegacy(legacy.value)
                else {
                  const legacyMessage = legacy && legacy.error ? legacy.error.message : "查询失败"
                  setState({ status: "error", platforms: [], error: String(legacyMessage), updatedAt: Date.now() })
                  scheduleRetry()
                }
              }).catch((error) => {
                setState({ status: "error", platforms: [], error: String((error && error.message) || error), updatedAt: Date.now() })
                scheduleRetry()
              })
            }
            setState({ status: "error", platforms: [], error: String(message), updatedAt: Date.now() })
            scheduleRetry()
          }).catch((error) => {
            setState({ status: "error", platforms: [], error: String((error && error.message) || error), updatedAt: Date.now() })
            scheduleRetry()
          })
        }

        React.useEffect(() => {
          load()
        }, [])

        let overallLevel = state.status === "error" ? "error" : "ok"
        for (const p of state.platforms) {
          const lv = platformLevel(p, threshold)
          if (LEVEL_RANK[lv] > LEVEL_RANK[overallLevel]) overallLevel = lv
        }
        if (state.status === "loading") overallLevel = "loading"

        const low = overallLevel === "warn" || overallLevel === "critical"
        React.useEffect(() => {
          return ctx.interval(load, low ? 60000 : 300000)
        }, [low])

        React.useEffect(() => {
          if (cardEl === null || pos === null) return
          const cr = cardEl.getBoundingClientRect()
          const bounds = findBounds(cardEl, cr)
          if (bounds === null) return
          const nx = Math.min(Math.max(pos.x, bounds.left), Math.max(bounds.left, bounds.right - cr.width))
          const ny = Math.min(Math.max(pos.y, bounds.top), Math.max(bounds.top, bounds.bottom - cr.height))
          if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny })
        }, [pos, minimized])

        const onPointerDown = (e) => {
          if (e.button !== 0) return
          const t = e.target
          if (t !== null && t.tagName === "BUTTON") return
          const header = e.currentTarget
          const card = header.parentElement
          if (card === null) return
          const cr = card.getBoundingClientRect()
          let minX = -Infinity
          let maxX = Infinity
          let minY = -Infinity
          let maxY = Infinity
          const bounds = findBounds(card, cr)
          if (bounds !== null) {
            minX = bounds.left
            minY = bounds.top
            maxX = Math.max(bounds.left, bounds.right - cr.width)
            maxY = Math.max(bounds.top, bounds.bottom - cr.height)
          }
          if (typeof header.setPointerCapture === "function") {
            try { header.setPointerCapture(e.pointerId) } catch (err) {}
          }
          drag = { px: e.clientX, py: e.clientY, x: cr.left, y: cr.top, minX: minX, maxX: maxX, minY: minY, maxY: maxY }
        }
        const onPointerMove = (e) => {
          if (drag === null) return
          const nx = Math.min(Math.max(drag.x + (e.clientX - drag.px), drag.minX), drag.maxX)
          const ny = Math.min(Math.max(drag.y + (e.clientY - drag.py), drag.minY), drag.maxY)
          setPos({ x: nx, y: ny })
        }
        const onPointerUp = () => { drag = null }

        const dotColor = overallLevel === "loading" ? "#94a3b8" : LEVEL_COLOR[overallLevel] || "#94a3b8"
        const borderColor = overallLevel === "warn" ? "rgba(251,191,36,.55)"
          : overallLevel === "critical" ? "rgba(248,113,113,.6)"
          : "rgba(148,163,184,.28)"

        const openEditor = () => {
          setDraft(String(threshold))
          setEditing(!editing)
        }
        const saveThreshold = () => {
          const n = Number(draft)
          if (!Number.isFinite(n) || n < 0) {
            setDraft(String(threshold))
            setEditing(false)
            return
          }
          try { globalThis.localStorage.setItem(STORAGE_KEY, String(n)) } catch (err) {}
          setThreshold(n)
          setEditing(false)
        }

        const title = overallLevel === "critical" ? "额度不足"
          : overallLevel === "warn" ? "额度预警"
          : "平台额度"

        const headerChildren = [
          React.createElement("span", { key: "dot", className: low ? "dsbc-dot dsbc-pulse" : "dsbc-dot", style: { background: dotColor } }),
          React.createElement("span", { key: "title", className: "dsbc-title" }, title),
          React.createElement("button", { key: "refresh", className: "dsbc-btn", title: "立即刷新", onClick: load }, "\u27F3"),
          React.createElement("button", { key: "cfg", className: "dsbc-btn", title: "余额预警阈值设置", onClick: openEditor }, "\u2699"),
          React.createElement("button", { key: "min", className: "dsbc-btn", title: minimized ? "展开" : "收起", onClick: () => setMinimized(!minimized) }, minimized ? "+" : "\u2212"),
        ]

        const platformRow = (p) => {
          const lv = platformLevel(p, threshold)
          let main = null
          const subs = []
          if (p.supported === false) {
            main = React.createElement("span", { style: { color: "#94a3b8", fontWeight: 400 } }, "暂不支持查询")
            subs.push("该平台暂不支持 API 查询")
          } else if (p.error) {
            main = React.createElement("span", { style: { color: "#fca5a5", fontWeight: 400 } }, "查询失败")
            subs.push(String(p.error).slice(0, 140))
          } else {
            if (p.balance) {
              const symbol = symbolOf(p.balance.currency)
              const valueText = typeof p.balance.value === "number" ? symbol + String(p.balance.value) : "\u2014"
              main = React.createElement("span", null, "余额 " + valueText)
              const parts = []
              for (const sub of p.balance.sub || []) {
                if (sub.value !== null && sub.value !== undefined && String(sub.value) !== "") parts.push(sub.label + " " + symbol + String(sub.value))
              }
              if (parts.length > 0) subs.push(parts.join(" · "))
              if (!p.balance.available) subs.push("余额不可用")
            }
            if (p.plan) {
              const first = (p.plan.rows || []).find((r) => typeof r.remainingPct === "number")
              if (main === null && first !== undefined) {
                main = React.createElement("span", null, "剩余 " + String(first.remainingPct) + "%")
              }
              const rowTexts = (p.plan.rows || []).map((r) => {
                const pctText = typeof r.remainingPct === "number" ? String(r.remainingPct) + "%" : "\u2014"
                return r.label + " " + pctText
              })
              const kindText = p.plan.kind + (p.plan.level ? " · " + String(p.plan.level) : "")
              subs.push(kindText + (rowTexts.length > 0 ? ": " + rowTexts.join(" · ") : ""))
            }
            if (main === null) {
              main = React.createElement("span", { style: { color: "#94a3b8", fontWeight: 400 } }, "无可用数据")
            }
          }
          return React.createElement("div", { key: p.id, className: "dsbc-plat" },
            React.createElement("div", { className: "dsbc-plat-top" },
              React.createElement("span", { className: "dsbc-plat-dot", style: { background: LEVEL_COLOR[lv] || "#94a3b8" } }),
              React.createElement("span", { className: "dsbc-plat-name" }, String(p.name)),
              main),
            subs.length > 0 ? React.createElement("div", { className: "dsbc-plat-sub" }, subs.map((text, i) => React.createElement("div", { key: i }, text))) : null)
        }

        let body = null
        if (!minimized) {
          if (state.status === "loading") {
            body = React.createElement("div", { className: "dsbc-body dsbc-error" }, "查询中\u2026")
          } else if (state.status === "error") {
            body = React.createElement("div", { className: "dsbc-body" },
              React.createElement("div", { className: "dsbc-error" }, String(state.error)),
              React.createElement("div", { className: "dsbc-note" }, "点击 \u27F3 重试"))
          } else if (state.platforms.length === 0) {
            body = React.createElement("div", { className: "dsbc-body" },
              React.createElement("div", { className: "dsbc-error" }, "未检测到已配置的平台 API Key"),
              React.createElement("div", { className: "dsbc-note" }, "在凭证库中配置 DEEPSEEK_API_KEY / MOONSHOT_API_KEY 等后刷新"))
          } else {
            body = React.createElement("div", { className: "dsbc-body" },
              state.platforms.map(platformRow),
              editing ? React.createElement("div", { className: "dsbc-settings" },
                React.createElement("span", null, "余额预警阈值"),
                React.createElement("input", { className: "dsbc-input", type: "number", min: "0", step: "1", value: draft, onChange: (e) => setDraft(e.target.value) }),
                React.createElement("button", { className: "dsbc-btn", onClick: saveThreshold }, "保存"),
                React.createElement("button", { className: "dsbc-btn", onClick: () => setEditing(false) }, "取消"))
                : null,
              React.createElement("div", { className: "dsbc-note" },
                "套餐低于 " + PLAN_WARN_PCT + "% 预警"
                + (state.updatedAt !== null ? " \u00B7 " + new Date(state.updatedAt).toLocaleTimeString() : "")))
          }
        }

        const style = { width: minimized ? "auto" : 260, pointerEvents: "auto", borderColor: borderColor }
        if (pos !== null) {
          style.left = pos.x
          style.top = pos.y
          style.right = "auto"
          style.bottom = "auto"
        }

        return React.createElement("div", { className: "dsbc-card", style: style, ref: (el) => { cardEl = el } },
          React.createElement("div", {
            className: "dsbc-header",
            title: "拖动移动 \u00B7 双击复位",
            onPointerDown: onPointerDown,
            onPointerMove: onPointerMove,
            onPointerUp: onPointerUp,
            onDoubleClick: (e) => {
              if (e.target !== null && e.target.tagName === "BUTTON") return
              setPos(null)
            },
          }, ...headerChildren),
          body)
      }

      ctx.slots.inject("shell.overlay", () => ctx.slots.register(
        { name: "shell.overlay", id: "ds-balance-card", order: 100, label: "平台额度" },
        () => React.createElement(BalanceCard, null),
      ))
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  }
});
