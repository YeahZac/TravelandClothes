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

function ensureSchemaExtras() {
  const d = db()
  const add = require('../db').addColumnIfMissing
  add(d, 'redeem_order', 'tracking_no', `VARCHAR(64) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'redeem_order', 'carrier', `VARCHAR(64) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'redeem_order', 'shipped_at', `VARCHAR(40) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
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
  db()
    .prepare(
      `INSERT INTO admin_audit (actor, action, target, detail_json, created_at) VALUES ('admin',?,?,?,?)`
    )
    .run(action, target, JSON.stringify(detail || {}), now())
}

function getOps() {
  seedOps()
  const row = db().prepare('SELECT payload_json FROM ops_config WHERE id=1').get()
  let ops = DEFAULT_OPS
  try {
    ops = { ...DEFAULT_OPS, ...JSON.parse(row.payload_json) }
    ops.risk = { ...DEFAULT_OPS.risk, ...(ops.risk || {}) }
    ops.lotteryPity = { ...DEFAULT_OPS.lotteryPity, ...(ops.lotteryPity || {}) }
    ops.monetize = { ...DEFAULT_OPS.monetize, ...(ops.monetize || {}) }
    ops.homePopup = { ...DEFAULT_OPS.homePopup, ...(ops.homePopup || {}) }
    ops.lotteryPage = { ...DEFAULT_OPS.lotteryPage, ...(ops.lotteryPage || {}) }
  } catch (e) {}
  return ops
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
  }
  db()
    .prepare(`UPDATE ops_config SET payload_json=?, updated_at=? WHERE id=1`)
    .run(JSON.stringify(next), now())
  audit('ops.save', 'ops_config', next)
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

function riskSnapshot() {
  // iaaEnabled 一并回传给运营台
  const ops = getOps()
  const today = dayKey()
  const m = monthRange()
  const daySpend = incentiveSpend(today, today)
  const monthSpend = incentiveSpend(m.from, m.to)
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

  const todayPhysical = db()
    .prepare(
      `SELECT COUNT(*) AS n FROM redeem_order
       WHERE order_type IN ('gift','jar','lottery') AND substr(created_at,1,10)=? AND status!='cancelled'`
    )
    .get(today).n

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
    todayPhysicalOrders: todayPhysical,
    copyFuseToast: (listCopy().find((c) => c.id === 'fuseToast') || {}).body || '',
    iaaEnabled: !!(ops.monetize && ops.monetize.iaaEnabled),
    energyPerYuan: Number((ops.monetize && ops.monetize.energyPerYuan) || 1000),
    lotteryEnergyCost: Number((ops.monetize && ops.monetize.lotteryEnergyCost) || 50),
  }
}

/** 客户端 bootstrap 用 */
function clientRiskPayload() {
  const snap = riskSnapshot()
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
  // 优先 emptyRatePercent；未配则用 100-globalWinRate
  let emptyRatePercent
  if (lp.emptyRatePercent != null && Number.isFinite(Number(lp.emptyRatePercent))) {
    emptyRatePercent = Math.min(100, Math.max(0, Number(lp.emptyRatePercent)))
  } else {
    const g = Math.min(100, Math.max(0, Number(lp.globalWinRate != null ? lp.globalWinRate : 30)))
    emptyRatePercent = Math.round((100 - g) * 100) / 100
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
function clientLotteryRules() {
  const snap = riskSnapshot()
  const lp = lotteryPageConfig()
  let todayWinUsers = 0
  try {
    todayWinUsers = require('./lotteryService').todayWinUserCount()
  } catch (_) {}
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
      `每人每日最多抽奖 ${lp.dailyDrawLimit} 次（含谢谢参与）`,
      `谢谢参与基础占比约 ${lp.emptyRatePercent}%（未达日峰顶、未触个人日中奖上限时）`,
      `真中奖概率约 ${lp.globalWinRate}%；达日中奖人数峰顶后当天仅谢谢参与`,
      lp.dailyWinUserCap > 0
        ? `每日中奖名额上限 ${lp.dailyWinUserCap} 人（今日已中 ${todayWinUsers} 人）`
        : '',
      lp.maxWinsPerUserPerDay > 0
        ? `每人每日最多真中奖 ${lp.maxWinsPerUserPerDay} 次，超出后当日强制谢谢参与`
        : '',
      lp.newAccountHours > 0
        ? `新注册满 ${lp.newAccountHours} 小时后方可抽中实物`
        : '',
      '完成签到、日常任务可获得能量值，用于继续抽奖',
      snap.iaaEnabled ? '观看激励视频可获得额外能量（以任务页配置为准）' : '',
      '抽奖结果可在本页「我的中奖记录」或「我的 → 我的中奖记录」查看',
      '实物中奖后请尽快填写收货地址兑奖；中奖凭证逾期可能失效',
      snap.allowLotteryPhysical === false ? '当前实物抽奖通道暂未开放' : '实物中奖免能量与现金，填地址即可领取',
    ].filter(Boolean)
  }
  return {
    lines,
    customRules: custom,
    energyCost: lp.energyCost,
    dailyLimit: lp.dailyDrawLimit,
    emptyRatePercent: lp.emptyRatePercent,
    globalWinRate: lp.globalWinRate,
    dailyWinUserCap: lp.dailyWinUserCap,
    maxWinsPerUserPerDay: lp.maxWinsPerUserPerDay,
    newAccountHours: lp.newAccountHours,
    softMiss: lp.softMiss,
    hardMiss: lp.hardMiss,
    softBoost: lp.softBoost,
    todayWinUsers,
    allowPhysical: snap.allowLotteryPhysical !== false,
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
  d.prepare(
    `UPDATE redeem_order SET status='shipped', carrier=?, tracking_no=?, shipped_at=?, updated_at=? WHERE id=?`
  ).run(carrier || '', trackingNo || '', now(), now(), id)
  audit('order.ship', String(id), { carrier, trackingNo })
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

/** 兑礼 SKU 列表（后台含下架） */
function listGiftSkus() {
  try {
    return require('./commerceService').listGiftsAdmin()
  } catch (e) {
    return []
  }
}

function upsertGiftSku(body) {
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少礼品 id' }
  const pricing = require('./pricingService')
  const existing = db().prepare('SELECT meta_json FROM product WHERE id=?').get(id)
  let prevMeta = {}
  try {
    prevMeta = JSON.parse((existing && existing.meta_json) || '{}') || {}
  } catch (_) {}
  // 兑礼 SKU：商品属性 + 软门槛（连签/邀人/首兑）+ 积分/现金组合价
  let meta = {
    ...prevMeta,
    needStreak: Number(body.needStreak || 0),
    needInvite: Number(body.needInvite || 0),
    firstWave: !!body.firstWave,
    desc: body.desc || '',
    coverTone: body.coverTone || 'mint',
    costEnergy: Number(body.costEnergy != null ? body.costEnergy : prevMeta.costEnergy || 0),
  }
  if (body.purchaseUrl != null) {
    const url = String(body.purchaseUrl || '').trim()
    if (url) meta.purchaseUrl = url
    else delete meta.purchaseUrl
  }
  meta = pricing.applyMetaPayFields(meta, {
    payPoints: body.payPoints != null ? body.payPoints : body.costPoints,
    payCashCent: body.payCashCent != null ? body.payCashCent : body.needCash,
    payCashYuan: body.payCashYuan,
    listPriceCent: body.listPriceCent,
    listPriceYuan: body.listPriceYuan,
  })
  const r = adminService.upsertProduct({
    id,
    name: body.name || id,
    category: '兑礼',
    kind: 'gift',
    priceYuan: Number(body.listPriceYuan != null ? body.listPriceYuan : 0),
    costYuan: Number(body.costYuan != null ? body.costYuan : (body.costCent || 0) / 100),
    costCent: body.costCent != null ? Number(body.costCent) : undefined,
    stock: Number(body.stock != null ? body.stock : 0),
    stockAlarm: Number(body.stockAlarm != null ? body.stockAlarm : 10),
    imageUrl: body.imageUrl || '',
    tag: body.tag || '',
    status: body.status || 'on',
    sortOrder: Number(body.sortOrder || 100),
    payPoints: meta.payPoints,
    payCashCent: meta.payCashCent,
    purchaseUrl: meta.purchaseUrl || '',
    meta,
  })
  // force meta_json
  if (r.ok) {
    db()
      .prepare(`UPDATE product SET category='兑礼', kind='gift', meta_json=?, updated_at=? WHERE id=?`)
      .run(JSON.stringify(meta), now(), id)
  }
  audit('gift.upsert', id, body)
  return r
}

module.exports = {
  seedOps,
  getOps,
  saveOps,
  riskSnapshot,
  clientRiskPayload,
  lotteryPageConfig,
  saveLotteryRules,
  clientLotteryRules,
  assertCanFulfill,
  setFuse,
  listBanners,
  upsertBanner,
  deleteBanner,
  syncBannersIntoDraft,
  listCopy,
  upsertCopy,
  listChannels,
  upsertChannel,
  channelStats,
  shipOrder,
  listAudit,
  listGiftSkus,
  upsertGiftSku,
  audit,
  ensureSchemaExtras,
}
