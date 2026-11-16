/**
 * 运营总监视角：预算熔断 / Banner内容 / 文案 / 渠道 / 审计 / 履约物流
 * 编辑影响面写在各函数注释与 admin UI hint 中。
 */
const dbMod = require('../db')
const configService = require('./configService')
const adminService = require('./adminService')
const mediaUrl = require('../mediaUrl')

function db() {
  return dbMod.open()
}
function now() {
  return dbMod.nowIso()
}
function dayKey(d = new Date()) {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

const DEFAULT_OPS = {
  risk: {
    fuseEnabled: true,
    fused: false,
    fuseReason: '',
    dailyIncentiveBudgetCent: 500000, // ¥5,000 / 日激励上限
    monthlyIncentiveBudgetCent: 8000000, // ¥80,000 / 月
    perUserDailyRedeemLimit: 3,
    perUserDailyLotteryLimit: 15,
    bigPrizeDailyCap: 30, // 实物大奖日上限
    haltOnBudgetExceed: true,
    allowCashRedeem: true,
    allowLotteryPhysical: true,
  },
  lotteryPity: {
    softMiss: 20,
    softBoost: 3,
    hardMiss: 50,
    newAccountHours: 24,
    virtualCostEnergyCent: 1,
    virtualCostCoinCent: 1,
    virtualCostPointsCent: 1,
    seedDefaultCostCent: 50,
  },
  monetize: {
    pointsToYuanRate: 0.001, // 兼容旧字段：1 能量值 ≈ ¥0.001（=1000 能量/元）
    energyPerYuan: 1000, // 能量值 / 元
    lotteryEnergyCost: 50, // 每次抽奖消耗能量值
    iaaEnabled: false,
    brandAdEnabled: false,
  },
  // 首页首进弹窗（仅管理员配置；frequency: daily=每日首次 / once=终身一次）
  homePopup: {
    enabled: true,
    frequency: 'daily',
    imageUrl: '',
    title: '今日推荐',
    confirmText: '去兑礼',
    confirmPath: 'gift',
    remark: '',
  },
  /** 首页兑礼动态：默认只用真实数据；冷启动可开示范 */
  demoActivityFeed: false,
  /**
   * 汉服节页模式 + 票价（元）
   * registerEnabled=true：HTML 介绍 + 原生选票/微信支付
   * registerEnabled=false：仅展示 CMS 富文本 HTML
   * prices 覆盖默认价，立即影响列表与微信支付
   */
  festival: {
    registerEnabled: true,
    prices: {
      fest_adult_28: 30,
      fest_adult_29: 42,
      fest_adult_both: 72,
      fest_child_28: 20,
      fest_child_29: 20,
      fest_child_both: 40,
    },
    /** 活动年份（用于「11月28日」→ 日历日） */
    eventYear: 2026,
    /**
     * 验票管理员：小程序用户 ID 列表。
     * 仅名单内用户可见「验票」入口并可调用扫码验票 API。
     * 空名单 = 无人可验（CMS 后台核销仍可用）。
     */
    verifyStaffIds: [],
    /**
     * 测试专用：仅名单内票号按「今天」可验/可入场（不影响其它票的日期逻辑）。
     * 测完务必清空；票面展示日也会临时改成今天。
     */
    testForceTodayTicketNos: [],
  },
  /**
   * 抽奖页运营参数（运营台「抽奖兑换」顶部配置）
   * 开奖三层：①谢谢参与占比 ②日中奖人数峰顶 ③奖池内占比分配
   */
  lotteryPage: {
    customRules: '',
    energyCost: 50,
    dailyDrawLimit: 15,
    /**
     * 谢谢参与基础占比 0–100（第一段）。
     * 与 globalWinRate 互为补数：globalWinRate = 100 - emptyRatePercent
     */
    emptyRatePercent: 70,
    /** 总体中奖概率 0–100（=100-emptyRatePercent，保留兼容） */
    globalWinRate: 30,
    /** 每日最多中奖去重用户数；达峰后当天其余抽奖均为谢谢参与 */
    dailyWinUserCap: 200,
    /** 防作弊：同一用户每日最多「真中奖」次数（非谢谢参与） */
    maxWinsPerUserPerDay: 3,
    /** 防作弊：新号注册满 N 小时才可抽中实物 */
    newAccountHours: 24,
  },
}

let schemaExtrasReady = false

function ensureSchemaExtras() {
  if (schemaExtrasReady) return
  if (dbMod.DIALECT === 'mysql') {
    schemaExtrasReady = true
    return
  }
  const d = db()
  const add = require('../db').addColumnIfMissing
  add(d, 'redeem_order', 'tracking_no', `VARCHAR(64) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'redeem_order', 'carrier', `VARCHAR(64) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'redeem_order', 'shipped_at', `VARCHAR(40) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  /** 兑礼/下单入口归因：gift_center / flash / lottery / jar / mall / home_entry 等 */
  add(d, 'redeem_order', 'entry_from', `VARCHAR(64) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  // 审计明细：VARCHAR(1024) 会在 saveOps 整包写入时爆掉；扩为 MEDIUMTEXT
  try {
    if (dbMod.DIALECT === 'mysql') {
      d.exec(`ALTER TABLE admin_audit MODIFY COLUMN detail_json MEDIUMTEXT NOT NULL`)
    }
  } catch (e) {
    console.warn('[ops] widen admin_audit.detail_json', e && e.message)
  }
  schemaExtrasReady = true
}

function seedOps() {
  ensureSchemaExtras()
  const d = db()
  const row = d.prepare('SELECT id FROM ops_config WHERE id=1').get()
  if (!row) {
    d.prepare(`INSERT INTO ops_config (id, payload_json, updated_at) VALUES (1, ?, ?)`).run(
      JSON.stringify(DEFAULT_OPS),
      now()
    )
  }

  const banN = d.prepare('SELECT COUNT(*) AS n FROM content_banner').get().n
  if (!banN) {
    const t = now()
    const ins = d.prepare(
      `INSERT INTO content_banner (id,page_key,title,sub,image_url,link_key,tone,sort_order,status,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    ;[
      ['home_b1', 'home', '汉服节门票开售', '星火成炬 · 早鸟价', '', 'festival', 'orange', 0],
      ['home_b2', 'home', '商城新到好物', '积分最高抵 10%', '', 'mall', 'day', 1],
      ['home_b3', 'home', '晚场开兑进行中', '20:00–22:00 限量', '', 'energy', 'mint', 2],
      ['mall_b1', 'mall', '商城精选', '积分可抵现', '', 'mall', 'day', 0],
    ].forEach((r) => ins.run(...r, 'on', t))
  } else {
    // 历史脏数据：小程序包内路径不能给后台/COS 用
    try {
      const scrub = d
        .prepare(
          `UPDATE content_banner SET image_url='', updated_at=? WHERE image_url LIKE '/static/%' OR image_url LIKE 'static/%'`
        )
        .run(now())
      if (scrub && scrub.changes > 0) {
        try {
          syncBannersIntoDraft()
        } catch (e) {}
      }
    } catch (e) {}
  }

  const copyN = d.prepare('SELECT COUNT(*) AS n FROM content_copy').get().n
  if (!copyN) {
    const t = now()
    const ins = d.prepare(
      `INSERT INTO content_copy (id,label,body,surface,updated_at) VALUES (?,?,?,?,?)`
    )
    ;[
      ['compliance', '合规脚注', '能量/积分不可提现或交易 · 激励成本可熔断', 'global'],
      ['footerNote', '页脚说明', '素材与文案由运营后台配置', 'global'],
      ['redeemTip', '兑礼须知', '需填写收货地址；运费规则参与前显著说明；大奖限量可熔断', 'gift'],
      ['mallTip', '商城提示', '积分抵扣以结算页为准；库存以后台为准', 'mall'],
      ['fuseToast', '熔断提示文案', '今日激励预算已用尽，兑礼通道暂时关闭，明天再来～', 'risk'],
    ].forEach((r) => ins.run(...r, t))
  }
  try {
    require('./legalService').ensureLegalDocs()
  } catch (e) {
    console.warn('[ops] ensureLegalDocs', e.message)
  }

  const chN = d.prepare('SELECT COUNT(*) AS n FROM channel_def').get().n
  if (!chN) {
    const t = now()
    const ins = d.prepare(`INSERT INTO channel_def (id,name,note,status,updated_at) VALUES (?,?,?,?,?)`)
    ;[
      ['organic', '自然量', '无投放'],
      ['wx_timeline', '朋友圈', '裂变分享'],
      ['douyin', '抖音', '短视频投放'],
      ['brand_a', '品牌合作A', '皮肤/奖池赞助'],
    ].forEach((r) => ins.run(...r, 'on', t))
  }
}

function audit(action, target = '', detail = {}) {
  try {
    ensureSchemaExtras()
    let payload = JSON.stringify(detail || {})
    // 线上若仍是 VARCHAR(1024)，先截到 900，避免 Data too long 冒泡成 unhandled
    const maxLen = dbMod.DIALECT === 'mysql' ? 900 : 200000
    if (payload.length > maxLen) {
      payload = JSON.stringify({
        truncated: true,
        keys: detail && typeof detail === 'object' ? Object.keys(detail) : [],
        preview: payload.slice(0, Math.max(120, maxLen - 80)),
      }).slice(0, maxLen)
    }
    db()
      .prepare(
        `INSERT INTO admin_audit (actor, action, target, detail_json, created_at) VALUES ('admin',?,?,?,?)`
      )
      .run(action, target, payload, now())
  } catch (e) {
    console.warn('[ops] audit failed (ignored)', action, e && e.message)
  }
}

/** 内存缓存：避免每个请求 deasync 打 ops_config（高并发会拖死池并 corrup async hook） */
let opsMem = { at: 0, ops: null }
let opsRefreshPromise = null
const OPS_TTL_MS = Math.max(1000, Number(process.env.OPS_CACHE_TTL_MS || 60000))

function mergeOpsPayload(raw) {
  let ops = DEFAULT_OPS
  try {
    ops = { ...DEFAULT_OPS, ...(raw && typeof raw === 'object' ? raw : {}) }
    ops.risk = { ...DEFAULT_OPS.risk, ...(ops.risk || {}) }
    ops.lotteryPity = { ...DEFAULT_OPS.lotteryPity, ...(ops.lotteryPity || {}) }
    ops.monetize = { ...DEFAULT_OPS.monetize, ...(ops.monetize || {}) }
    ops.homePopup = { ...DEFAULT_OPS.homePopup, ...(ops.homePopup || {}) }
    ops.lotteryPage = { ...DEFAULT_OPS.lotteryPage, ...(ops.lotteryPage || {}) }
    ops.festival = { ...DEFAULT_OPS.festival, ...(ops.festival || {}) }
    if (ops.demoActivityFeed == null) ops.demoActivityFeed = DEFAULT_OPS.demoActivityFeed
  } catch (_) {}
  return ops
}

function opsFallback() {
  if (opsMem.ops) return opsMem.ops
  const ops = mergeOpsPayload(DEFAULT_OPS)
  opsMem = { at: Date.now(), ops }
  return ops
}

function getOps() {
  const nowMs = Date.now()
  if (opsMem.ops && nowMs - opsMem.at < OPS_TTL_MS) return opsMem.ops
  if (dbMod.isCircuitOpen && dbMod.isCircuitOpen()) return opsFallback()
  try {
    // 热路径只读一行；seed 已在 boot / saveOps 侧保证，勿每次 TTL 过期再跑一堆 deasync
    const row = db().prepare('SELECT payload_json FROM ops_config WHERE id=1 LIMIT 1').get()
    let raw = {}
    try {
      raw = JSON.parse((row && row.payload_json) || '{}')
    } catch (_) {
      raw = {}
    }
    const ops = mergeOpsPayload(raw)
    opsMem = { at: nowMs, ops }
    return ops
  } catch (e) {
    // 库超时/池满时：退回旧缓存或默认，禁止把错误抛进 deasync 调用栈打崩进程
    console.warn('[ops] getOps fallback', e && e.message)
    return opsFallback()
  }
}

/** async 路由专用：不走 deasync；single-flight 刷新 */
async function getOpsAsync() {
  const nowMs = Date.now()
  if (opsMem.ops && nowMs - opsMem.at < OPS_TTL_MS) return opsMem.ops
  if (opsRefreshPromise) {
    try {
      return await opsRefreshPromise
    } catch (_) {
      return opsFallback()
    }
  }
  opsRefreshPromise = (async () => {
    try {
      const [rows] = await dbMod.queryAsync(`SELECT payload_json FROM ops_config WHERE id=1 LIMIT 1`)
      const row = rows && rows[0]
      let raw = {}
      try {
        raw = JSON.parse((row && row.payload_json) || '{}')
      } catch (_) {
        raw = {}
      }
      const ops = mergeOpsPayload(raw)
      opsMem = { at: Date.now(), ops }
      return ops
    } catch (e) {
      console.warn('[ops] getOpsAsync fallback', e && e.message)
      return opsFallback()
    } finally {
      opsRefreshPromise = null
    }
  })()
  return opsRefreshPromise
}

function saveOps(patch) {
  const cur = getOps()
  const next = {
    ...cur,
    risk: { ...cur.risk, ...(patch.risk || {}) },
    monetize: { ...cur.monetize, ...(patch.monetize || {}) },
    lotteryPity: { ...cur.lotteryPity, ...(patch.lotteryPity || {}) },
    homePopup: { ...cur.homePopup, ...(patch.homePopup || {}) },
    lotteryPage: { ...cur.lotteryPage, ...(patch.lotteryPage || {}) },
    festival: { ...cur.festival, ...(patch.festival || {}) },
  }
  if (patch.demoActivityFeed != null) next.demoActivityFeed = !!patch.demoActivityFeed
  db()
    .prepare(`UPDATE ops_config SET payload_json=?, updated_at=? WHERE id=1`)
    .run(JSON.stringify(next), now())
  opsMem = { at: Date.now(), ops: next }
  // 审计勿阻断保存；只记摘要，避免整包 ops / 票价对象撑爆 detail_json
  try {
    const slim = { keys: Object.keys(patch || {}) }
    if (patch && patch.festival) {
      slim.festival = {
        registerEnabled: patch.festival.registerEnabled,
        priceIds: patch.festival.prices ? Object.keys(patch.festival.prices) : [],
      }
    }
    if (patch && patch.risk) slim.riskKeys = Object.keys(patch.risk)
    audit('ops.save', 'ops_config', slim)
  } catch (e) {
    console.warn('[ops] audit skip', e && e.message)
  }
  syncRiskIntoDraft(next)
  return next
}

function syncRiskIntoDraft(ops) {
  const draft = configService.getDraft()
  if (!draft) return
  draft.ops = ops
  draft.risk = ops.risk
  if (!draft.copy) draft.copy = {}
  const copies = listCopy()
  copies.forEach((c) => {
    if (c.id === 'compliance') draft.copy.compliance = c.body
    if (c.id === 'footerNote') draft.copy.footerNote = c.body
  })
  configService.saveDraft(draft)
}

/** 当日/当月已发生激励成本（finance cost） */
function incentiveSpend(from, to) {
  const row = db()
    .prepare(
      `SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger
       WHERE entry_type='cost' AND day_key>=? AND day_key<=?`
    )
    .get(from, to)
  return row.s
}

function monthRange(anchor = new Date()) {
  const a = new Date(anchor)
  const from = `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}-01`
  const end = new Date(a.getFullYear(), a.getMonth() + 1, 0)
  return { from, to: dayKey(end) }
}

function buildRiskSnapshot(ops, { daySpend, monthSpend, todayPhysical, copyFuseToast = '' }) {
  const dayLeft = Math.max(0, ops.risk.dailyIncentiveBudgetCent - daySpend)
  const monthLeft = Math.max(0, ops.risk.monthlyIncentiveBudgetCent - monthSpend)
  const budgetHit =
    daySpend >= ops.risk.dailyIncentiveBudgetCent || monthSpend >= ops.risk.monthlyIncentiveBudgetCent
  const autoFuse = ops.risk.haltOnBudgetExceed && budgetHit
  const fused = !!(ops.risk.fused || autoFuse)
  const reason = ops.risk.fused
    ? ops.risk.fuseReason || '人工熔断'
    : autoFuse
      ? daySpend >= ops.risk.dailyIncentiveBudgetCent
        ? '日激励预算已用尽'
        : '月激励预算已用尽'
      : ''
  return {
    ...ops.risk,
    fused,
    fuseReason: reason,
    daySpendCent: daySpend,
    monthSpendCent: monthSpend,
    dayLeftCent: dayLeft,
    monthLeftCent: monthLeft,
    daySpendYuan: adminService.centToYuan(daySpend),
    monthSpendYuan: adminService.centToYuan(monthSpend),
    dayBudgetYuan: adminService.centToYuan(ops.risk.dailyIncentiveBudgetCent),
    monthBudgetYuan: adminService.centToYuan(ops.risk.monthlyIncentiveBudgetCent),
    todayPhysicalOrders: Number(todayPhysical) || 0,
    copyFuseToast,
    iaaEnabled: !!(ops.monetize && ops.monetize.iaaEnabled),
    energyPerYuan: Number((ops.monetize && ops.monetize.energyPerYuan) || 1000),
    lotteryEnergyCost: Number((ops.monetize && ops.monetize.lotteryEnergyCost) || 50),
  }
}

function riskSnapshot() {
  // iaaEnabled 一并回传给运营台
  const ops = getOps()
  const today = dayKey()
  const m = monthRange()
  let todayPhysical = 0
  try {
    todayPhysical = db()
      .prepare(
        `SELECT COUNT(*) AS n FROM redeem_order
         WHERE order_type IN ('gift','jar','lottery') AND substr(created_at,1,10)=? AND status!='cancelled'`
      )
      .get(today).n
  } catch (e) {
    console.warn('[ops] riskSnapshot physical count', e && e.message)
  }
  let copyFuseToast = ''
  try {
    copyFuseToast = (listCopy().find((c) => c.id === 'fuseToast') || {}).body || ''
  } catch (_) {}
  return buildRiskSnapshot(ops, {
    daySpend: incentiveSpend(today, today),
    monthSpend: incentiveSpend(m.from, m.to),
    todayPhysical,
    copyFuseToast,
  })
}

async function incentiveSpendAsync(from, to) {
  try {
    const [rows] = await dbMod.queryAsync(
      `SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger
       WHERE entry_type='cost' AND day_key>=? AND day_key<=?`,
      [from, to]
    )
    return Number(rows && rows[0] && rows[0].s) || 0
  } catch (e) {
    console.warn('[ops] incentiveSpendAsync', e && e.message)
    return 0
  }
}

/** async：运营台风控页禁止 sync deasync */
async function riskSnapshotAsync() {
  const ops = await getOpsAsync()
  const today = dayKey()
  const m = monthRange()
  const [daySpend, monthSpend, physRows, copyRows] = await Promise.all([
    incentiveSpendAsync(today, today),
    incentiveSpendAsync(m.from, m.to),
    dbMod
      .queryAsync(
        `SELECT COUNT(*) AS n FROM redeem_order
         WHERE order_type IN ('gift','jar','lottery') AND substr(created_at,1,10)=? AND status!='cancelled'`,
        [today]
      )
      .catch((e) => {
        console.warn('[ops] riskSnapshotAsync physical count', e && e.message)
        return [[]]
      }),
    dbMod
      .queryAsync(`SELECT body FROM content_copy WHERE id='fuseToast' LIMIT 1`)
      .catch(() => [[]]),
  ])
  const todayPhysical = physRows && physRows[0] && physRows[0][0] ? physRows[0][0].n : 0
  const copyFuseToast =
    copyRows && copyRows[0] && copyRows[0][0] ? String(copyRows[0][0].body || '') : ''
  return buildRiskSnapshot(ops, { daySpend, monthSpend, todayPhysical, copyFuseToast })
}

let riskClientCache = { at: 0, payload: null }
const RISK_CLIENT_TTL_MS = Math.max(2000, Number(process.env.RISK_CLIENT_TTL_MS || 15000))

function mapClientRisk(snap) {
  return {
    fused: snap.fused,
    fuseReason: snap.fuseReason,
    allowCashRedeem: snap.allowCashRedeem !== false,
    allowLotteryPhysical: snap.allowLotteryPhysical !== false,
    fuseToast: snap.copyFuseToast || '激励通道暂时关闭',
    perUserDailyRedeemLimit: snap.perUserDailyRedeemLimit,
    perUserDailyLotteryLimit: snap.perUserDailyLotteryLimit,
  }
}

/** 客户端 bootstrap 用（同步降级：优先缓存） */
function clientRiskPayload() {
  const nowMs = Date.now()
  if (riskClientCache.payload && nowMs - riskClientCache.at < RISK_CLIENT_TTL_MS) {
    return riskClientCache.payload
  }
  try {
    if (dbMod.isCircuitOpen && dbMod.isCircuitOpen() && riskClientCache.payload) {
      return riskClientCache.payload
    }
    const snap = riskSnapshot()
    const payload = mapClientRisk(snap)
    riskClientCache = { at: nowMs, payload }
    return payload
  } catch (e) {
    console.warn('[ops] clientRiskPayload', e && e.message)
    if (riskClientCache.payload) return riskClientCache.payload
    return mapClientRisk(buildRiskSnapshot(getOps(), { daySpend: 0, monthSpend: 0, todayPhysical: 0 }))
  }
}

async function clientRiskPayloadAsync() {
  const nowMs = Date.now()
  if (riskClientCache.payload && nowMs - riskClientCache.at < RISK_CLIENT_TTL_MS) {
    return riskClientCache.payload
  }
  try {
    const snap = await riskSnapshotAsync()
    const payload = mapClientRisk(snap)
    riskClientCache = { at: Date.now(), payload }
    return payload
  } catch (e) {
    console.warn('[ops] clientRiskPayloadAsync', e && e.message)
    if (riskClientCache.payload) return riskClientCache.payload
    // async catch 中禁止回退到 riskSnapshot/getOps 同步 deasync
    const ops = await getOpsAsync()
    return mapClientRisk(
      buildRiskSnapshot(ops, { daySpend: 0, monthSpend: 0, todayPhysical: 0 })
    )
  }
}

function lotteryPageConfig() {
  const ops = getOps()
  const lp = { ...DEFAULT_OPS.lotteryPage, ...(ops.lotteryPage || {}) }
  const pity = { ...DEFAULT_OPS.lotteryPity, ...(ops.lotteryPity || {}) }
  const energyCost = Math.max(
    0,
    Number(
      lp.energyCost != null
        ? lp.energyCost
        : (ops.monetize && ops.monetize.lotteryEnergyCost) != null
          ? ops.monetize.lotteryEnergyCost
          : DEFAULT_OPS.lotteryPage.energyCost
    ) || 0
  )
  const dailyDrawLimit = Math.max(
    1,
    Number(
      lp.dailyDrawLimit != null
        ? lp.dailyDrawLimit
        : (ops.risk && ops.risk.perUserDailyLotteryLimit) != null
          ? ops.risk.perUserDailyLotteryLimit
          : DEFAULT_OPS.lotteryPage.dailyDrawLimit
    ) || 15
  )
  // 以「显式落库字段」为准，避免 DEFAULT.emptyRatePercent 盖住运营只改过的 globalWinRate
  const rawLp = ops.lotteryPage || {}
  let emptyRatePercent
  if (rawLp.emptyRatePercent != null && Number.isFinite(Number(rawLp.emptyRatePercent))) {
    emptyRatePercent = Math.min(100, Math.max(0, Number(rawLp.emptyRatePercent)))
  } else if (rawLp.globalWinRate != null && Number.isFinite(Number(rawLp.globalWinRate))) {
    emptyRatePercent = Math.round(
      (100 - Math.min(100, Math.max(0, Number(rawLp.globalWinRate)))) * 100
    ) / 100
  } else if (lp.emptyRatePercent != null && Number.isFinite(Number(lp.emptyRatePercent))) {
    emptyRatePercent = Math.min(100, Math.max(0, Number(lp.emptyRatePercent)))
  } else {
    emptyRatePercent = 70
  }
  const globalWinRate = Math.round((100 - emptyRatePercent) * 100) / 100
  const dailyWinUserCap = Math.max(0, Number(lp.dailyWinUserCap != null ? lp.dailyWinUserCap : 200) || 0)
  const maxWinsPerUserPerDay = Math.max(
    0,
    Number(lp.maxWinsPerUserPerDay != null ? lp.maxWinsPerUserPerDay : 3) || 0
  )
  const newAccountHours = Math.max(
    0,
    Number(
      lp.newAccountHours != null
        ? lp.newAccountHours
        : pity.newAccountHours != null
          ? pity.newAccountHours
          : 24
    ) || 0
  )
  return {
    customRules: String(lp.customRules || ''),
    energyCost,
    dailyDrawLimit,
    emptyRatePercent,
    globalWinRate,
    dailyWinUserCap,
    maxWinsPerUserPerDay,
    newAccountHours,
    softMiss: Math.max(1, Number(pity.softMiss) || 20),
    hardMiss: Math.max(1, Number(pity.hardMiss) || 50),
    softBoost: Math.max(1, Number(pity.softBoost) || 3),
  }
}

/**
 * 保存抽奖运营台顶部参数
 */
function saveLotteryRules(body = {}) {
  const cur = lotteryPageConfig()
  const energyCost =
    body.energyCost != null ? Math.max(0, Number(body.energyCost) || 0) : cur.energyCost
  const dailyDrawLimit =
    body.dailyDrawLimit != null
      ? Math.max(1, Number(body.dailyDrawLimit) || 1)
      : cur.dailyDrawLimit

  let emptyRatePercent = cur.emptyRatePercent
  if (body.emptyRatePercent != null) {
    emptyRatePercent = Math.min(100, Math.max(0, Number(body.emptyRatePercent) || 0))
  } else if (body.globalWinRate != null) {
    emptyRatePercent = Math.min(100, Math.max(0, 100 - (Number(body.globalWinRate) || 0)))
  }
  const globalWinRate = Math.round((100 - emptyRatePercent) * 100) / 100

  const dailyWinUserCap =
    body.dailyWinUserCap != null
      ? Math.max(0, Number(body.dailyWinUserCap) || 0)
      : cur.dailyWinUserCap
  const maxWinsPerUserPerDay =
    body.maxWinsPerUserPerDay != null
      ? Math.max(0, Number(body.maxWinsPerUserPerDay) || 0)
      : cur.maxWinsPerUserPerDay
  const newAccountHours =
    body.newAccountHours != null
      ? Math.max(0, Number(body.newAccountHours) || 0)
      : cur.newAccountHours
  const softMiss =
    body.softMiss != null ? Math.max(1, Number(body.softMiss) || 20) : cur.softMiss
  const hardMiss =
    body.hardMiss != null ? Math.max(1, Number(body.hardMiss) || 50) : cur.hardMiss
  const softBoost =
    body.softBoost != null ? Math.max(1, Number(body.softBoost) || 3) : cur.softBoost
  const customRules = body.customRules != null ? String(body.customRules) : cur.customRules

  const next = saveOps({
    lotteryPage: {
      customRules,
      energyCost,
      dailyDrawLimit,
      emptyRatePercent,
      globalWinRate,
      dailyWinUserCap,
      maxWinsPerUserPerDay,
      newAccountHours,
    },
    lotteryPity: {
      softMiss,
      hardMiss,
      softBoost,
      newAccountHours,
    },
    monetize: { lotteryEnergyCost: energyCost },
    risk: { perUserDailyLotteryLimit: dailyDrawLimit },
  })
  try {
    const draft = configService.getDraft() || configService.getPublished() || {}
    if (!draft.game) draft.game = {}
    draft.game.economy = {
      ...(draft.game.economy || {}),
      energyPerYuan:
        (next.monetize && next.monetize.energyPerYuan) ||
        (draft.game.economy && draft.game.economy.energyPerYuan) ||
        1000,
      lotteryEnergyCost: energyCost,
    }
    configService.saveDraft(draft)
  } catch (_) {}
  return next
}

/** 抽奖页规则说明（自动生成 + 可选运营自定义） */
/**
 * 小程序对客规则：只返回运营「规则说明文案」或安全默认句。
 * 禁止下发 emptyRate / 峰顶 / 防作弊等运营参数（那些只在管理端与开奖逻辑里用）。
 */
function clientLotteryRules(userId) {
  const snap = riskSnapshot()
  const lp = lotteryPageConfig()
  const custom = String(lp.customRules || '').trim()
  let lines = []
  if (custom) {
    lines = custom
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
  } else {
    lines = [
      `每次抽奖消耗 ${lp.energyCost} 能量值`,
      `每人每日最多抽奖 ${lp.dailyDrawLimit} 次`,
      '完成签到、日常任务可获得能量值，用于继续抽奖',
      '抽奖结果可在「我的 → 我的中奖记录」查看与兑奖',
      '实物中奖后请尽快填写收货地址兑奖',
      snap.allowLotteryPhysical === false ? '当前实物抽奖通道暂未开放' : '',
    ].filter(Boolean)
  }
  const dailyLimit = Number(lp.dailyDrawLimit) || 15
  let todayUsed = null
  let todayLeft = null
  if (userId) {
    try {
      todayUsed = require('./lotteryService').todayDrawCount(userId)
      todayLeft = Math.max(0, dailyLimit - todayUsed)
    } catch (_) {
      todayUsed = 0
      todayLeft = dailyLimit
    }
  }
  return {
    lines,
    energyCost: lp.energyCost,
    dailyLimit,
    allowPhysical: snap.allowLotteryPhysical !== false,
    todayUsed,
    todayLeft,
  }
}

/** 管理端完整规则（含概率/峰顶等，禁止透出到小程序） */
function adminLotteryRules() {
  const lp = lotteryPageConfig()
  let todayWinUsers = 0
  try {
    todayWinUsers = require('./lotteryService').todayWinUserCount()
  } catch (_) {}
  return {
    ...lp,
    todayWinUsers,
    preview: clientLotteryRules(),
  }
}

/**
 * 下单前风控检查
 * @returns {{ ok: boolean, msg?: string }}
 */
function assertCanFulfill(userId, { orderType, isPhysical = true } = {}) {
  const snap = riskSnapshot()
  if (!snap.fuseEnabled) return { ok: true }
  if (snap.fused && isPhysical) {
    return { ok: false, msg: snap.copyFuseToast || '激励通道已熔断，暂不可兑礼' }
  }
  if (orderType === 'lottery' && !snap.allowLotteryPhysical && isPhysical) {
    return { ok: false, msg: '实物抽奖暂未开放' }
  }
  if (
    (orderType === 'gift' || orderType === 'jar' || orderType === 'lottery') &&
    snap.todayPhysicalOrders >= snap.bigPrizeDailyCap
  ) {
    return { ok: false, msg: '今日实物兑礼已达上限，请明日再来' }
  }
  if (userId) {
    const today = dayKey()
    const userCnt = db()
      .prepare(
        `SELECT COUNT(*) AS n FROM redeem_order
         WHERE user_id=? AND substr(created_at,1,10)=? AND status!='cancelled'`
      )
      .get(userId, today).n
    if (userCnt >= snap.perUserDailyRedeemLimit) {
      return { ok: false, msg: `每人每日最多兑换 ${snap.perUserDailyRedeemLimit} 次` }
    }
  }
  return { ok: true }
}

function setFuse(fused, reason = '') {
  const ops = getOps()
  ops.risk.fused = !!fused
  ops.risk.fuseReason = fused ? reason || '人工熔断' : ''
  saveOps(ops)
  audit(fused ? 'risk.fuse_on' : 'risk.fuse_off', 'risk', { reason })
  return riskSnapshot()
}

/* ——— Banner：影响 首页/商城 banner_swiper 模块 ——— */
function listBanners(pageKey = '', baseUrl) {
  seedOps()
  const d = db()
  const rows = pageKey
    ? d.prepare(`SELECT * FROM content_banner WHERE page_key=? ORDER BY sort_order, id`).all(pageKey)
    : d.prepare(`SELECT * FROM content_banner ORDER BY page_key, sort_order, id`).all()
  return rows.map((b) => ({
    ...b,
    image_url_raw: mediaUrl.clientMediaPath(b.image_url) || b.image_url,
    image_url: mediaUrl.adminProxyUrl(b.image_url) || mediaUrl.clientMediaPath(b.image_url),
  }))
}

function upsertBanner(body) {
  const d = db()
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少 id' }
  const t = now()
  const exists = d.prepare('SELECT id, image_url FROM content_banner WHERE id=?').get(id)
  let imageUrl
  if (body.imageUrl != null) {
    let raw = String(body.imageUrl).trim()
    if (raw.startsWith('/static/')) raw = ''
    imageUrl = mediaUrl.normalizeStoredMedia(raw)
    // 无法解析时尽量保留原值，避免保存把已有图抹空
    if (!imageUrl && raw && exists && exists.image_url) imageUrl = exists.image_url
  } else {
    imageUrl = exists ? exists.image_url || '' : ''
  }
  const args = [
    body.pageKey || 'home',
    body.title || '',
    body.sub || '',
    imageUrl,
    body.linkKey || '',
    body.tone || 'orange',
    Number(body.sortOrder || 0),
    body.status || 'on',
    t,
  ]
  if (exists) {
    d.prepare(
      `UPDATE content_banner SET page_key=?, title=?, sub=?, image_url=?, link_key=?, tone=?, sort_order=?, status=?, updated_at=? WHERE id=?`
    ).run(...args, id)
  } else {
    d.prepare(
      `INSERT INTO content_banner (id,page_key,title,sub,image_url,link_key,tone,sort_order,status,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(id, ...args)
  }
  syncBannersIntoDraft()
  audit('banner.upsert', id, body)
  return { ok: true, item: d.prepare('SELECT * FROM content_banner WHERE id=?').get(id) }
}

function deleteBanner(id) {
  db().prepare('DELETE FROM content_banner WHERE id=?').run(id)
  syncBannersIntoDraft()
  audit('banner.delete', id)
  return { ok: true }
}

/** 写回 draft.pages.home|mall 的 banner_swiper.payload.items —— 发布后影响对应 Tab 首屏轮播 */
function syncBannersIntoDraft() {
  const draft = configService.getDraft()
  if (!draft || !draft.pages) return
  ;['home', 'mall'].forEach((pageKey) => {
    const page = draft.pages[pageKey]
    if (!page) return
    const items = listBanners(pageKey)
      .filter((b) => b.status === 'on')
      .map((b) => {
        const raw = mediaUrl.clientMediaPath(b.image_url_raw || b.image_url || '')
        return {
          id: b.id,
          title: b.title,
          sub: b.sub,
          imageUrl: raw,
          tone: b.tone,
          linkKey: b.link_key,
        }
      })
    const mods = page.modules || []
    const idx = mods.findIndex((m) => m.type === 'banner_swiper')
    if (idx >= 0) {
      mods[idx].payload = mods[idx].payload || {}
      mods[idx].payload.items = items
    }
  })
  configService.saveDraft(draft)
}

/* ——— 文案：影响全局合规脚注、兑礼/商城提示 ——— */
function listCopy() {
  seedOps()
  return db().prepare(`SELECT * FROM content_copy ORDER BY surface, id`).all()
}

function upsertCopy(body) {
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少 id' }
  const d = db()
  const t = now()
  const exists = d.prepare('SELECT id FROM content_copy WHERE id=?').get(id)
  if (exists) {
    d.prepare(`UPDATE content_copy SET label=?, body=?, surface=?, updated_at=? WHERE id=?`).run(
      body.label || id,
      body.body || '',
      body.surface || 'global',
      t,
      id
    )
  } else {
    d.prepare(`INSERT INTO content_copy (id,label,body,surface,updated_at) VALUES (?,?,?,?,?)`).run(
      id,
      body.label || id,
      body.body || '',
      body.surface || 'global',
      t
    )
  }
  syncRiskIntoDraft(getOps())
  audit('copy.upsert', id, body)
  return { ok: true }
}

/* ——— 渠道 ——— */
function listChannels() {
  seedOps()
  return db().prepare(`SELECT * FROM channel_def ORDER BY id`).all()
}

async function listChannelsAsync() {
  try {
    const [rows] = await dbMod.queryAsync(`SELECT * FROM channel_def ORDER BY id`)
    return rows || []
  } catch (e) {
    console.warn('[ops] listChannelsAsync', e && e.message)
    return []
  }
}

async function channelStatsAsync() {
  try {
    const [rows] = await dbMod.queryAsync(
      `SELECT channel AS id, COUNT(*) AS users
       FROM user_account GROUP BY channel ORDER BY users DESC`
    )
    return rows || []
  } catch (e) {
    console.warn('[ops] channelStatsAsync', e && e.message)
    return []
  }
}

function upsertChannel(body) {
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少渠道 id' }
  const d = db()
  const t = now()
  const exists = d.prepare('SELECT id FROM channel_def WHERE id=?').get(id)
  if (exists) {
    d.prepare(`UPDATE channel_def SET name=?, note=?, status=?, updated_at=? WHERE id=?`).run(
      body.name || id,
      body.note || '',
      body.status || 'on',
      t,
      id
    )
  } else {
    d.prepare(`INSERT INTO channel_def (id,name,note,status,updated_at) VALUES (?,?,?,?,?)`).run(
      id,
      body.name || id,
      body.note || '',
      body.status || 'on',
      t
    )
  }
  audit('channel.upsert', id, body)
  return { ok: true }
}

function channelStats() {
  seedOps()
  return db()
    .prepare(
      `SELECT channel AS id, COUNT(*) AS users
       FROM user_account GROUP BY channel ORDER BY users DESC`
    )
    .all()
}

/* ——— 履约：发货填物流 ——— */
function shipOrder(id, { carrier = '', trackingNo = '' } = {}) {
  ensureSchemaExtras()
  const d = db()
  const row = d.prepare('SELECT * FROM redeem_order WHERE id=?').get(id)
  if (!row) return { ok: false, msg: '订单不存在' }
  if (row.status === 'cancelled') return { ok: false, msg: '已取消不可发货' }
  if (row.status === 'unpaid') return { ok: false, msg: '待支付订单不可发货' }
  if (Number(row.pay_cash_cent || 0) > 0 && row.pay_status && row.pay_status !== 'paid') {
    return { ok: false, msg: '现金单未支付完成，不可发货' }
  }
  if (row.status !== 'pending' && row.status !== 'shipped') {
    return { ok: false, msg: '仅待发货订单可填写物流' }
  }
  const track = String(trackingNo || '').trim()
  if (!track) return { ok: false, msg: '请填写运单号' }
  d.prepare(
    `UPDATE redeem_order SET status='shipped', carrier=?, tracking_no=?, shipped_at=?, updated_at=? WHERE id=?`
  ).run(carrier || '', track, now(), now(), id)
  try {
    const fresh = d.prepare('SELECT * FROM redeem_order WHERE id=?').get(id)
    require('./adminService').recordFulfillCost(fresh)
  } catch (e) {
    console.warn('[ship] fulfill cost', e && e.message)
  }
  audit('order.ship', String(id), { carrier, trackingNo: track })
  return { ok: true }
}

function listAudit({ page = 1, pageSize = 50 } = {}) {
  seedOps()
  const d = db()
  const total = d.prepare('SELECT COUNT(*) AS n FROM admin_audit').get().n
  const offset = (Math.max(1, page) - 1) * pageSize
  const list = d
    .prepare(`SELECT * FROM admin_audit ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(pageSize, offset)
  return { total, page: Number(page), pageSize, list }
}

/** 兑好礼上架列表（后台含下架） */
function listGiftSkus() {
  try {
    return require('./commerceService').listGiftsAdmin()
  } catch (e) {
    return []
  }
}

/** 兼容旧 /admin/gifts：改为写入兑好礼 channel_listing（物料须已存在） */
function upsertGiftSku(body) {
  const id = String(body.id || body.productId || '').trim()
  if (!id) return { ok: false, msg: '缺少礼品 id / productId' }
  const listing = require('./listingService')
  listing.ensureReady()
  const prod = db().prepare('SELECT id FROM product WHERE id=?').get(id)
  if (!prod) {
    // 兼容：若物料不存在且带了名图，先建物料再上架
    if (body.name) {
      const created = adminService.upsertProduct({
        id,
        name: body.name,
        kind: 'physical',
        costYuan: Number(body.costYuan != null ? body.costYuan : (body.costCent || 0) / 100),
        costCent: body.costCent != null ? Number(body.costCent) : undefined,
        stock: Number(body.stock != null ? body.stock : 0),
        stockAlarm: Number(body.stockAlarm != null ? body.stockAlarm : 10),
        imageUrl: body.imageUrl || '',
        tag: body.tag || '',
        status: 'on',
        purchaseUrl: body.purchaseUrl || '',
      })
      if (!created.ok) return created
    } else {
      return { ok: false, msg: '物料不存在，请先在物料中心创建' }
    }
  }
  const r = listing.upsertListing({
    channel: 'gift',
    productId: id,
    status: body.status || 'on',
    sortOrder: body.sortOrder,
    priceYuan: body.listPriceYuan != null ? body.listPriceYuan : body.priceYuan,
    priceCent: body.priceCent,
    payPoints: body.payPoints != null ? body.payPoints : body.costPoints,
    payCashCent: body.payCashCent != null ? body.payCashCent : body.needCash,
    payCashYuan: body.payCashYuan,
    mode: body.mode,
    needStreak: body.needStreak,
    needInvite: body.needInvite,
    firstWave: body.firstWave,
    costEnergy: body.costEnergy,
    desc: body.desc,
    coverTone: body.coverTone,
  })
  audit('gift.upsert', id, body)
  return r
}

module.exports = {
  seedOps,
  getOps,
  getOpsAsync,
  riskSnapshotAsync,
  saveOps,
  riskSnapshot,
  clientRiskPayload,
  clientRiskPayloadAsync,
  lotteryPageConfig,
  saveLotteryRules,
  clientLotteryRules,
  adminLotteryRules,
  assertCanFulfill,
  setFuse,
  listBanners,
  upsertBanner,
  deleteBanner,
  syncBannersIntoDraft,
  listCopy,
  upsertCopy,
  listChannels,
  listChannelsAsync,
  upsertChannel,
  channelStats,
  channelStatsAsync,
  shipOrder,
  listAudit,
  listGiftSkus,
  upsertGiftSku,
  audit,
  ensureSchemaExtras,
}
