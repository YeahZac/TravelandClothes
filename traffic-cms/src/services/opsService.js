/**
 * 运营总监视角：预算熔断 / Banner内容 / 文案 / 渠道 / 审计 / 履约物流
 * 编辑影响面写在各函数注释与 admin UI hint 中。
 */
const dbMod = require('../db')
const configService = require('./configService')
const adminService = require('./adminService')

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
  monetize: {
    pointsToYuanRate: 0.01, // 展示用：积分负债估值
    iaaEnabled: false,
    brandAdEnabled: false,
  },
}

function ensureSchemaExtras() {
  const d = db()
  const cols = d.prepare('PRAGMA table_info(redeem_order)').all().map((c) => c.name)
  if (!cols.includes('tracking_no')) {
    d.exec(`ALTER TABLE redeem_order ADD COLUMN tracking_no TEXT NOT NULL DEFAULT ''`)
  }
  if (!cols.includes('carrier')) {
    d.exec(`ALTER TABLE redeem_order ADD COLUMN carrier TEXT NOT NULL DEFAULT ''`)
  }
  if (!cols.includes('shipped_at')) {
    d.exec(`ALTER TABLE redeem_order ADD COLUMN shipped_at TEXT NOT NULL DEFAULT ''`)
  }
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
      ['home_b1', 'home', '汉服节门票开售', '星火成炬 · 早鸟价', '/static/ui/banner-festival.png', 'festival', 'orange', 0],
      ['home_b2', 'home', '商城新到好物', '积分最高抵 10%', '/static/ui/banner-mall.png', 'mall', 'day', 1],
      ['home_b3', 'home', '晚场开兑进行中', '20:00–22:00 限量', '/static/ui/banner-evening.png', 'energy', 'mint', 2],
      ['mall_b1', 'mall', '商城精选', '积分可抵现', '/static/ui/banner-mall.png', 'mall', 'day', 0],
    ].forEach((r) => ins.run(...r, 'on', t))
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
    ops.monetize = { ...DEFAULT_OPS.monetize, ...(ops.monetize || {}) }
  } catch (e) {}
  return ops
}

function saveOps(patch) {
  const cur = getOps()
  const next = {
    risk: { ...cur.risk, ...(patch.risk || {}) },
    monetize: { ...cur.monetize, ...(patch.monetize || {}) },
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
  if ((orderType === 'gift' || orderType === 'jar') && snap.todayPhysicalOrders >= snap.bigPrizeDailyCap) {
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
function listBanners(pageKey = '') {
  seedOps()
  const d = db()
  if (pageKey) {
    return d
      .prepare(`SELECT * FROM content_banner WHERE page_key=? ORDER BY sort_order, id`)
      .all(pageKey)
  }
  return d.prepare(`SELECT * FROM content_banner ORDER BY page_key, sort_order, id`).all()
}

function upsertBanner(body) {
  const d = db()
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少 id' }
  const t = now()
  const exists = d.prepare('SELECT id FROM content_banner WHERE id=?').get(id)
  const args = [
    body.pageKey || 'home',
    body.title || '',
    body.sub || '',
    body.imageUrl || '',
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
      .map((b) => ({
        id: b.id,
        title: b.title,
        sub: b.sub,
        imageUrl: b.image_url,
        tone: b.tone,
        linkKey: b.link_key,
      }))
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
  // 兑礼 SKU：商品属性 + 软门槛（连签/邀人/首兑）均后台可配
  const meta = {
    costPoints: Number(body.costPoints || 0),
    needCash: Number(body.needCash || 0),
    needStreak: Number(body.needStreak || 0),
    needInvite: Number(body.needInvite || 0),
    firstWave: !!body.firstWave,
    desc: body.desc || '',
    coverTone: body.coverTone || 'mint',
  }
  const r = adminService.upsertProduct({
    id,
    name: body.name || id,
    category: '兑礼',
    priceYuan: 0,
    costYuan: Number(body.costYuan != null ? body.costYuan : (body.costCent || 0) / 100),
    costCent: body.costCent != null ? Number(body.costCent) : undefined,
    stock: Number(body.stock != null ? body.stock : 0),
    stockAlarm: Number(body.stockAlarm != null ? body.stockAlarm : 10),
    imageUrl: body.imageUrl || '',
    tag: body.tag || '',
    status: body.status || 'on',
    sortOrder: Number(body.sortOrder || 100),
    meta,
  })
  // force meta_json
  if (r.ok) {
    db()
      .prepare(`UPDATE product SET category='兑礼', meta_json=?, updated_at=? WHERE id=?`)
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
