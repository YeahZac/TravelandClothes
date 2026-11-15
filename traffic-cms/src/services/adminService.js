/**
 * 运营后台：用户 / 商品 / 抽奖 / 任务 / 兑换 / 图标 / 财务统计
 * 与前端 bootstrap 互通：catalog 块由本服务组装。
 */
const dbMod = require('../db')
const configService = require('./configService')
const mediaUrl = require('../mediaUrl')

function db() {
  return dbMod.open()
}

function now() {
  return dbMod.nowIso()
}

function dayKey(d = new Date()) {
  const x = typeof d === 'string' ? new Date(d) : d
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function yuanToCent(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return NaN
  return Math.round(n * 100)
}

function centToYuan(c) {
  return Math.round(Number(c || 0)) / 100
}

/**
 * @deprecated 禁止在已有奖池上自动补演示奖项（会盖掉运营删改）。
 * 保留空实现以免旧调用报错。
 */
function ensureLotterySeedPrizes(_d = db()) {
  return
}

function parseMoneyCent(body, yuanKey, centKey) {
  if (body[centKey] != null && body[centKey] !== '') {
    const n = Number(body[centKey])
    return Number.isFinite(n) ? Math.round(n) : NaN
  }
  return yuanToCent(body[yuanKey])
}

let _seedDone = false

function orderNo(prefix = 'R') {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 900 + 100)}`
}

/**
 * 库表引导：永不自动灌演示商品（m1–m4 / 配置回灌等）。
 * 商品一律由运营在后台新增；此处只做列修复与脏图清理。
 */
function seedIfEmpty() {
  if (_seedDone) return
  const d = db()
  ensureUserColumns()
  const prodN = d.prepare('SELECT COUNT(*) AS n FROM product').get().n
  if (prodN) {
    // 历史脏数据：把 /static 占位图清掉，迫使运营重新上传 COS 图
    try {
      d.prepare(
        `UPDATE product SET image_url='', updated_at=? WHERE image_url LIKE '/static/%'`
      ).run(now())
    } catch (e) {}
    try {
      d.prepare(
        `UPDATE icon_asset SET path='', updated_at=? WHERE path LIKE '/static/%' OR path LIKE 'static/%'`
      ).run(now())
    } catch (e) {}
  }
  try {
    require('./commerceService').purgeDemoGiftsWithoutImage()
  } catch (_) {}

  // 奖池：仅空表时放一条「谢谢参与」兜底；已有数据一律不自动增删改（含演示种子）
  try {
    require('./lotteryService').ensureSchema()
  } catch (_) {}
  const lotN = d.prepare('SELECT COUNT(*) AS n FROM lottery_prize').get().n
  if (!lotN) {
    const t = now()
    try {
      d.prepare(
        `INSERT INTO lottery_prize (id,name,prize_type,prize_value,product_id,weight,stock,image_url,status,sort_order,updated_at,rarity,pool_id)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run('p_empty', '谢谢参与', 'empty', 0, '', 0, -1, '', 'on', 0, t, 'N', 'default')
    } catch (_) {
      d.prepare(
        `INSERT INTO lottery_prize (id,name,prize_type,prize_value,product_id,weight,stock,image_url,status,sort_order,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      ).run('p_empty', '谢谢参与', 'empty', 0, '', 0, -1, '', 'on', 0, t)
    }
  }

  const taskN = d.prepare('SELECT COUNT(*) AS n FROM task_def').get().n
  if (!taskN) {
    const t = now()
    const ins = d.prepare(
      `INSERT INTO task_def (id,title,action_key,reward_desc,reward_energy,reward_coins,daily_limit,status,sort_order,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    )
    ;[
      ['checkin', '每日签到', 'checkin', '能量+20', 20, 0, 1, 'on', 0],
      ['steps', '步数兑换', 'steps', '能量+15', 15, 0, 1, 'on', 1],
      ['browse_mall', '逛商城', 'mall', '金币+5', 0, 5, 1, 'on', 2],
      ['invite', '邀请好友', 'invite', '能量+30', 30, 0, 5, 'on', 3],
      ['ad', '看激励视频', 'ad', '能量+30', 30, 0, 1, 'on', 4],
    ].forEach((r) => ins.run(...r, t))
  } else {
    // 已有库补 ad 任务
    const ad = d.prepare(`SELECT id FROM task_def WHERE id='ad'`).get()
    if (!ad) {
      d.prepare(
        `INSERT INTO task_def (id,title,action_key,reward_desc,reward_energy,reward_coins,daily_limit,status,sort_order,updated_at)
         VALUES ('ad','看激励视频','ad','能量+30',30,0,1,'on',4,?)`
      ).run(now())
    }
  }

  const iconN = d.prepare('SELECT COUNT(*) AS n FROM icon_asset').get().n
  if (!iconN) {
    const pub = configService.getPublished() || {}
    const assets = pub.assets || {}
    const t = now()
    const ins = d.prepare(
      `INSERT INTO icon_asset (id,label,purpose,path,updated_at) VALUES (?,?,?,?,?)`
    )
    Object.entries(assets).forEach(([k, path]) => {
      ins.run(k, k, 'assets', path || '', t)
    })
    ;(pub.tabBar || []).forEach((tab) => {
      if (tab.iconUrl) ins.run(`tab.${tab.pageKey}`, tab.text || tab.pageKey, 'tabbar', tab.iconUrl, t)
      if (tab.selectedIconUrl)
        ins.run(`tab.${tab.pageKey}.active`, `${tab.text || tab.pageKey}·选中`, 'tabbar', tab.selectedIconUrl, t)
    })
  }
  try {
    require('./skuService').migrateKinds()
    require('./lotteryService').ensureSchema()
  } catch (e) {
    console.warn('[seed] sku/lottery schema', e.message)
  }
  _seedDone = true
}

function ensureUserColumns() {
  const d = db()
  const add = dbMod.addColumnIfMissing
  add(d, 'user_account', 'status', `VARCHAR(16) NOT NULL DEFAULT 'active'`, `TEXT NOT NULL DEFAULT 'active'`)
  add(d, 'user_account', 'remark', `VARCHAR(255) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'user_account', 'session_key', `VARCHAR(128) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'user_account', 'inviter_id', `INT NULL`, `INTEGER`)
  ensureProductMetaCapacity()
}

/** 详情富文本/长图需要更大 meta；MySQL 原 VARCHAR(1024) 不够 */
function ensureProductMetaCapacity() {
  if (dbMod.DIALECT !== 'mysql') return
  try {
    db().exec(`ALTER TABLE product MODIFY meta_json MEDIUMTEXT NOT NULL`)
  } catch (e) {
    /* 已是大字段或无权限时忽略 */
  }
  try {
    db().exec(`ALTER TABLE product MODIFY image_url VARCHAR(1024) NOT NULL DEFAULT ''`)
  } catch (e) {}
}

function parseProductMeta(raw) {
  try {
    return JSON.parse(raw || '{}') || {}
  } catch (e) {
    return {}
  }
}

function mapProductClient(p) {
  const meta = parseProductMeta(p.meta_json)
  const gallery = Array.isArray(meta.gallery) ? meta.gallery : []
  const pay = require('./pricingService').resolvePayMix(p)
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    price: centToYuan(p.price_cent),
    pointsOff: p.points_off,
    payPoints: pay.payPoints,
    payCashCent: pay.payCashCent,
    payCashYuan: pay.payCashYuan,
    listPriceCent: pay.listPriceCent,
    listPriceYuan: pay.listPriceYuan,
    payMode: pay.payMode,
    payLabel: pay.label,
    stock: p.stock,
    imageUrl: mediaUrl.clientMediaPath(p.image_url),
    tag: p.tag,
    subtitle: meta.subtitle || '',
    detailHtml: meta.detailHtml || '',
    gallery: gallery.map((u) => mediaUrl.clientMediaPath(u)).filter(Boolean),
  }
}

/* ——— 前端互通 catalog ——— */
function catalogForClient(baseUrl) {
  seedIfEmpty()
  const d = db()
  const listingService = require('./listingService')
  try {
    listingService.ensureReady()
  } catch (_) {}

  const products = listingService.listMallCatalog().map((o) => listingService.mapMallClient(o))

  const prizes = d
    .prepare(
      `SELECT id, name, prize_type, prize_value, product_id, stock, image_url
       FROM lottery_prize WHERE status='on' ORDER BY sort_order, id`
    )
    .all()
  const offerService = require('./offerService')
  const lottery = prizes.map((p) => {
    let payHint = '抽中即得'
    let payMode = 'free'
    let payLabel = '抽中即得'
    let product = null
    let displayName = p.name
    let imageUrl = ''
    if (p.product_id) {
      product = offerService.resolveOffer(p.product_id)
      displayName = product.name || p.name
      imageUrl = product.imageUrl || ''
      payMode = product.payMode
      payLabel = product.payLabel || payLabel
      if (product.listPriceCent > 0) {
        payHint = `价值 ¥${(product.listPriceCent / 100).toFixed(product.listPriceCent % 100 ? 2 : 0)}`
      } else if (product.payLabel && product.payLabel !== '免费领') {
        payHint = `价值 ${product.payLabel}`
      }
    } else if (p.prize_type === 'points' || p.prize_type === 'coins' || p.prize_type === 'energy') {
      payHint = `+${p.prize_value} 能量值`
      payLabel = payHint
    }
    if (!imageUrl && p.image_url && !isBrokenLotteryIcon(p.image_url)) {
      imageUrl = mediaUrl.clientMediaPath(p.image_url)
    }
    // 对客 catalog 不带 weight/probability，避免奖池占比泄露
    return {
      id: p.id,
      name: displayName,
      prizeType: p.prize_type,
      prizeValue: p.prize_value,
      productId: p.product_id,
      product,
      stock: p.stock,
      imageUrl,
      payMode,
      payLabel,
      payHint,
      claimFree: p.prize_type === 'physical',
    }
  })

  let tasks = []
  try {
    tasks = require('./taskService').listDefs(false)
  } catch (_) {
    tasks = d
      .prepare(
        `SELECT id, title, action_key, reward_desc, reward_energy, reward_coins, daily_limit
         FROM task_def WHERE status='on' ORDER BY sort_order, id`
      )
      .all()
      .map((t) => ({
        id: t.id,
        title: t.title,
        action: t.action_key,
        reward: t.reward_desc,
        rewardEnergy: t.reward_energy,
        rewardCoins: t.reward_coins,
        dailyLimit: t.daily_limit,
      }))
  }

  const icons = {}
  d.prepare(`SELECT id, path FROM icon_asset`).all().forEach((r) => {
    const path = String(r.path || '')
    if (path.startsWith('/static/')) return
    const client = mediaUrl.clientMediaPath(path)
    // 运营台曾写入 /uploads/qmyx/home.png 等根路径占位，COS 无对象 → 刷 getObject 404
    if (client && /^\/uploads\/qmyx\/[^/]+\.(png|jpe?g|webp|gif)$/i.test(client)) return
    if (client) icons[r.id] = client
  })

  let gifts = []
  try {
    gifts = require('./commerceService').listGifts()
  } catch (e) {
    gifts = []
  }

  return { products, lottery, tasks, icons, gifts }
}

/* ——— 用户 ——— */
function listUsers({ q = '', status = '', page = 1, pageSize = 20 } = {}) {
  seedIfEmpty()
  try {
    require('./authService').ensureUserColumns()
  } catch (_) {}
  const d = db()
  const where = []
  const args = []
  if (q) {
    where.push(`(u.nick_name LIKE ? OR u.openid LIKE ? OR u.invite_code LIKE ? OR CAST(u.id AS TEXT)=?)`)
    const like = `%${q}%`
    args.push(like, like, like, q)
  }
  if (status) {
    where.push(`u.status = ?`)
    args.push(status)
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = d.prepare(`SELECT COUNT(*) AS n FROM user_account u ${w}`).get(...args).n
  const offset = (Math.max(1, page) - 1) * pageSize
  const rows = d
    .prepare(
      `SELECT u.*, w.energy, w.points, w.coins, w.lottery_chance,
        (SELECT COUNT(*) FROM redeem_order r WHERE r.user_id = u.id) AS redeem_count,
        (SELECT COUNT(*) FROM lottery_draw l WHERE l.user_id = u.id) AS lottery_count,
        (SELECT COUNT(*) FROM lottery_draw l
          WHERE l.user_id = u.id
            AND IFNULL(l.prize_type,'') NOT IN ('','empty')
        ) AS lottery_win_count,
        (SELECT COUNT(*) FROM user_account i WHERE i.inviter_id = u.id) AS invite_count
       FROM user_account u
       LEFT JOIN user_wallet w ON w.user_id = u.id
       ${w}
       ORDER BY u.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...args, pageSize, offset)
  const list = rows.map((u) => ({
    ...u,
    nickName: u.nick_name || '',
    avatarUrl: mediaUrl.adminProxyUrl(u.avatar_url) || u.avatar_url || '',
    gender: u.gender || '',
    registeredAt: u.created_at || '',
    activeCount: Number(u.active_count || 0),
    lastActiveAt: u.last_active_at || '',
    redeemCount: Number(u.redeem_count || 0),
    lotteryCount: Number(u.lottery_count || 0),
    lotteryWinCount: Number(u.lottery_win_count || 0),
    inviteCount: Number(u.invite_count || 0),
  }))
  return { total, page: Number(page), pageSize, list }
}

function updateUser(id, patch) {
  const d = db()
  try {
    require('./lotteryService').ensureSchema()
  } catch (_) {}
  const u = d.prepare('SELECT * FROM user_account WHERE id=?').get(id)
  if (!u) return { ok: false, msg: '用户不存在' }
  const nick = patch.nickName != null ? patch.nickName : u.nick_name
  const status = patch.status != null ? patch.status : u.status
  const remark = patch.remark != null ? patch.remark : u.remark
  d.prepare(
    `UPDATE user_account SET nick_name=?, status=?, remark=?, updated_at=? WHERE id=?`
  ).run(nick, status, remark, now(), id)
  if (patch.riskFlag != null || patch.risk_flag != null) {
    const flag = patch.riskFlag != null ? patch.riskFlag : patch.risk_flag
    try {
      require('./lotteryService').setUserRiskFlag(id, flag)
    } catch (_) {}
  }
  if (patch.wallet) {
    const w = d.prepare('SELECT * FROM user_wallet WHERE user_id=?').get(id)
    if (w) {
      const nextEnergy =
        patch.wallet.energy != null ? Number(patch.wallet.energy) : Number(w.energy || 0)
      const delta = nextEnergy - Number(w.energy || 0)
      d.prepare(
        `UPDATE user_wallet SET energy=?, points=?, coins=?, lottery_chance=?, updated_at=? WHERE user_id=?`
      ).run(
        nextEnergy,
        patch.wallet.points != null ? patch.wallet.points : w.points,
        patch.wallet.coins != null ? patch.wallet.coins : w.coins,
        patch.wallet.lotteryChance != null ? patch.wallet.lotteryChance : w.lottery_chance,
        now(),
        id
      )
      if (delta) {
        try {
          const currency = require('./currencyService')
          currency.writeLedger(
            id,
            delta,
            nextEnergy,
            patch.walletNote || patch.note || (delta > 0 ? 'admin_grant' : 'admin_deduct'),
            { refType: 'admin', refId: String(id) }
          )
        } catch (_) {}
      }
    }
  }
  return { ok: true, user: listUsers({ q: String(id), pageSize: 1 }).list[0] }
}

/**
 * 用户详情（运营二级页）：资料 + 资产 + 签到/流水/抽奖/订单/步数/邀请
 */
function getUserDetail(id, { tab = 'overview', page = 1, pageSize = 20, direction = '' } = {}) {
  seedIfEmpty()
  try {
    require('./authService').ensureUserColumns()
  } catch (_) {}
  try {
    require('./lotteryService').ensureSchema()
  } catch (_) {}
  try {
    require('./currencyService').ensureWalletLedger()
  } catch (_) {}
  const d = db()
  const uid = Number(id)
  const u = d.prepare('SELECT * FROM user_account WHERE id=?').get(uid)
  if (!u) return { ok: false, msg: '用户不存在' }

  const walletRow = d.prepare('SELECT * FROM user_wallet WHERE user_id=?').get(uid)
  let wallet = null
  try {
    wallet = require('./currencyService').getWallet(uid)
  } catch (_) {
    wallet = walletRow
      ? { energy: walletRow.energy, points: walletRow.points, coins: walletRow.coins }
      : { energy: 0 }
  }

  let inviter = null
  if (u.inviter_id) {
    const iv = d
      .prepare('SELECT id, nick_name, invite_code, avatar_url FROM user_account WHERE id=?')
      .get(u.inviter_id)
    if (iv) {
      inviter = {
        id: iv.id,
        nickName: iv.nick_name || '',
        inviteCode: iv.invite_code || '',
        avatarUrl: mediaUrl.adminProxyUrl(iv.avatar_url) || iv.avatar_url || '',
      }
    }
  }

  const counts = {
    redeem: d.prepare(`SELECT COUNT(*) AS n FROM redeem_order WHERE user_id=?`).get(uid).n,
    redeemPending: d
      .prepare(`SELECT COUNT(*) AS n FROM redeem_order WHERE user_id=? AND status IN ('unpaid','pending','shipped')`)
      .get(uid).n,
    lottery: 0,
    lotteryWin: 0,
    checkinDays: 0,
    invitees: d.prepare(`SELECT COUNT(*) AS n FROM user_account WHERE inviter_id=?`).get(uid).n,
    stepsDays: 0,
  }
  try {
    counts.lottery = d.prepare(`SELECT COUNT(*) AS n FROM lottery_draw WHERE user_id=?`).get(uid).n
    counts.lotteryWin = d
      .prepare(
        `SELECT COUNT(*) AS n FROM lottery_draw WHERE user_id=? AND IFNULL(prize_type,'') NOT IN ('','empty')`
      )
      .get(uid).n
  } catch (_) {}
  try {
    counts.checkinDays = d.prepare(`SELECT COUNT(*) AS n FROM user_checkin WHERE user_id=?`).get(uid).n
  } catch (_) {}
  try {
    counts.stepsDays = d.prepare(`SELECT COUNT(*) AS n FROM user_steps_day WHERE user_id=?`).get(uid).n
  } catch (_) {}

  let energyStats = { sumIn: 0, sumOut: 0 }
  try {
    const led = require('./currencyService').listWalletLedger(uid, { page: 1, pageSize: 1 })
    energyStats = { sumIn: led.sumIn, sumOut: led.sumOut }
  } catch (_) {}

  const profile = {
    id: u.id,
    nickName: u.nick_name || '',
    avatarUrl: mediaUrl.adminProxyUrl(u.avatar_url) || u.avatar_url || '',
    openid: u.openid || '',
    platform: u.platform || '',
    gender: u.gender || '',
    province: u.province || '',
    city: u.city || '',
    district: u.district || '',
    inviteCode: u.invite_code || '',
    channel: u.channel || '',
    status: u.status || 'active',
    remark: u.remark || '',
    registeredAt: u.created_at || '',
    lastActiveAt: u.last_active_at || '',
    activeCount: Number(u.active_count || 0),
    updatedAt: u.updated_at || '',
    inviter,
    wallet,
    counts,
    energyStats,
  }

  const pg = Math.max(1, Number(page) || 1)
  const ps = Math.min(50, Math.max(5, Number(pageSize) || 20))
  let panel = { list: [], total: 0, page: pg, pageSize: ps }

  if (tab === 'ledger') {
    panel = require('./currencyService').listWalletLedger(uid, { direction, page: pg, pageSize: ps })
  } else if (tab === 'checkin') {
    try {
      const total = d.prepare(`SELECT COUNT(*) AS n FROM user_checkin WHERE user_id=?`).get(uid).n
      const list = d
        .prepare(
          `SELECT * FROM user_checkin WHERE user_id=? ORDER BY day_key DESC LIMIT ? OFFSET ?`
        )
        .all(uid, ps, (pg - 1) * ps)
      panel = { total, page: pg, pageSize: ps, list }
    } catch (_) {}
  } else if (tab === 'lottery') {
    try {
      const total = d.prepare(`SELECT COUNT(*) AS n FROM lottery_draw WHERE user_id=?`).get(uid).n
      const list = d
        .prepare(
          `SELECT * FROM lottery_draw WHERE user_id=? ORDER BY id DESC LIMIT ? OFFSET ?`
        )
        .all(uid, ps, (pg - 1) * ps)
      panel = { total, page: pg, pageSize: ps, list }
    } catch (_) {}
  } else if (tab === 'orders') {
    const total = d.prepare(`SELECT COUNT(*) AS n FROM redeem_order WHERE user_id=?`).get(uid).n
    const list = d
      .prepare(`SELECT * FROM redeem_order WHERE user_id=? ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(uid, ps, (pg - 1) * ps)
    panel = { total, page: pg, pageSize: ps, list }
  } else if (tab === 'steps') {
    try {
      const total = d.prepare(`SELECT COUNT(*) AS n FROM user_steps_day WHERE user_id=?`).get(uid).n
      const list = d
        .prepare(
          `SELECT * FROM user_steps_day WHERE user_id=? ORDER BY day_key DESC LIMIT ? OFFSET ?`
        )
        .all(uid, ps, (pg - 1) * ps)
      panel = { total, page: pg, pageSize: ps, list }
    } catch (_) {}
  } else if (tab === 'invite') {
    const total = d.prepare(`SELECT COUNT(*) AS n FROM user_account WHERE inviter_id=?`).get(uid).n
    const list = d
      .prepare(
        `SELECT id, nick_name, avatar_url, invite_code, channel, created_at, last_active_at, status
         FROM user_account WHERE inviter_id=? ORDER BY id DESC LIMIT ? OFFSET ?`
      )
      .all(uid, ps, (pg - 1) * ps)
      .map((x) => ({
        id: x.id,
        nickName: x.nick_name || '',
        avatarUrl: mediaUrl.adminProxyUrl(x.avatar_url) || x.avatar_url || '',
        inviteCode: x.invite_code || '',
        channel: x.channel || '',
        registeredAt: x.created_at || '',
        lastActiveAt: x.last_active_at || '',
        status: x.status || 'active',
      }))
    panel = { total, page: pg, pageSize: ps, list }
  } else {
    // overview: recent slices
    let recentLedger = []
    let recentOrders = []
    let recentLottery = []
    try {
      recentLedger = require('./currencyService').listWalletLedger(uid, { page: 1, pageSize: 8 }).list
    } catch (_) {}
    try {
      recentOrders = d
        .prepare(`SELECT * FROM redeem_order WHERE user_id=? ORDER BY id DESC LIMIT 5`)
        .all(uid)
    } catch (_) {}
    try {
      recentLottery = d
        .prepare(`SELECT * FROM lottery_draw WHERE user_id=? ORDER BY id DESC LIMIT 5`)
        .all(uid)
    } catch (_) {}
    panel = {
      recentLedger,
      recentOrders,
      recentLottery,
      total: 0,
      page: 1,
      pageSize: ps,
    }
  }

  return { ok: true, profile, tab, panel }
}

/* ——— 商品 ——— */
function listProducts(baseUrl) {
  seedIfEmpty()
  try {
    require('./skuService').migrateKinds()
  } catch (_) {}
  return db()
    .prepare(`SELECT * FROM product ORDER BY sort_order, id`)
    .all()
    .map((p) => {
      const meta = parseProductMeta(p.meta_json)
      const pay = require('./pricingService').resolvePayMix(p)
      return {
        ...p,
        kind: p.kind || '',
        priceYuan: centToYuan(p.price_cent),
        costYuan: centToYuan(p.cost_cent),
        image_url: mediaUrl.adminProxyUrl(p.image_url) || mediaUrl.clientMediaPath(p.image_url),
        image_url_raw: mediaUrl.clientMediaPath(p.image_url) || p.image_url,
        subtitle: meta.subtitle || '',
        detailHtml: meta.detailHtml || '',
        gallery: Array.isArray(meta.gallery) ? meta.gallery : [],
        purchaseUrl: meta.purchaseUrl || '',
        payPoints: pay.payPoints,
        payCashCent: pay.payCashCent,
        payCashYuan: pay.payCashYuan,
        listPriceYuan: pay.listPriceYuan,
        payMode: pay.payMode,
        payLabel: pay.label,
        meta,
      }
    })
}

function upsertProduct(body) {
  const d = db()
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少 id' }
  const t = now()
  const existing = d.prepare('SELECT * FROM product WHERE id=?').get(id)
  let priceCent = parseMoneyCent(body, 'priceYuan', 'priceCent')
  if (!Number.isFinite(priceCent) && existing) priceCent = Number(existing.price_cent || 0)
  if (!Number.isFinite(priceCent)) priceCent = 0
  const costCent = parseMoneyCent(body, 'costYuan', 'costCent')
  if (!Number.isFinite(costCent) || costCent < 0) {
    return { ok: false, msg: '成本无效' }
  }
  if (priceCent < 0) return { ok: false, msg: '参考价无效' }
  const name = String(body.name != null ? body.name : (existing && existing.name) || id).trim()
  if (!name) return { ok: false, msg: '缺少名称' }
  const category =
    body.category != null && String(body.category).trim() !== ''
      ? String(body.category).trim()
      : existing
        ? existing.category
        : '推荐'
  const status = body.status || (existing && existing.status) || 'on'
  if (status !== 'on' && status !== 'off') return { ok: false, msg: '状态只能是 on/off' }

  const prevMeta = parseProductMeta(existing && existing.meta_json)
  let nextMeta = { ...prevMeta }
  if (body.meta != null) {
    try {
      const incoming = typeof body.meta === 'string' ? JSON.parse(body.meta) : body.meta || {}
      nextMeta = { ...nextMeta, ...incoming }
    } catch (e) {
      return { ok: false, msg: 'meta 不是合法 JSON' }
    }
  }
  if (body.subtitle != null) nextMeta.subtitle = String(body.subtitle)
  if (body.detailHtml != null) nextMeta.detailHtml = String(body.detailHtml)
  // 采购链接：仅运营台使用，非必填；不透出到小程序 catalog
  if (body.purchaseUrl != null) {
    const url = String(body.purchaseUrl || '').trim()
    if (url) nextMeta.purchaseUrl = url
    else delete nextMeta.purchaseUrl
  }
  if (body.gallery != null) {
    nextMeta.gallery = Array.isArray(body.gallery)
      ? body.gallery.map(String).filter(Boolean)
      : String(body.gallery || '')
          .split(/\n|,/)
          .map((s) => s.trim())
          .filter(Boolean)
  }
  if (Array.isArray(nextMeta.gallery)) {
    nextMeta.gallery = nextMeta.gallery.map((u) => mediaUrl.normalizeStoredMedia(u)).filter(Boolean)
  }
  // 物料主数据：渠道价/兑礼门槛改到 channel_listing，此处剥离
  const listingService = require('./listingService')
  nextMeta = listingService.stripChannelFieldsFromProductMeta(nextMeta)
  let metaJson = '{}'
  try {
    metaJson = JSON.stringify(nextMeta)
  } catch (e) {
    return { ok: false, msg: '详情内容过大或无法序列化' }
  }

  let pointsOff = Number(body.pointsOff != null ? body.pointsOff : existing ? existing.points_off : 0)
  const stock = Number(body.stock != null ? body.stock : existing ? existing.stock : 0)
  const stockAlarm = Number(
    body.stockAlarm != null ? body.stockAlarm : existing ? existing.stock_alarm : 10
  )
  let imageUrl
  if (body.imageUrl != null) {
    const raw = String(body.imageUrl).trim()
    imageUrl = mediaUrl.normalizeStoredMedia(raw)
    if (!imageUrl && raw && existing && existing.image_url) imageUrl = existing.image_url
  } else {
    imageUrl = existing ? existing.image_url || '' : ''
  }
  imageUrl = mediaUrl.normalizeStoredMedia(imageUrl) || imageUrl || ''
  const tag = body.tag != null ? String(body.tag) : existing ? existing.tag || '' : ''

  try {
    require('./skuService').ensureKindColumn()
    listingService.ensureReady()
  } catch (_) {}
  let kind = body.kind || (existing && existing.kind) || ''
  kind = listingService.normalizeMaterialKind(kind, category, tag, nextMeta)
  // 物料 category 跟随 kind（兑礼不再是物料分类）
  const materialCategory =
    body.category != null && String(body.category).trim() !== '' && body.category !== '兑礼'
      ? String(body.category).trim()
      : listingService.categoryForKind(kind)

  let sortOrder
  if (body.sortOrder != null && body.sortOrder !== '') {
    sortOrder = Number(body.sortOrder)
  } else if (existing) {
    sortOrder = Number(existing.sort_order || 0)
  } else {
    const maxRow = d.prepare(`SELECT MAX(sort_order) AS m FROM product WHERE kind=?`).get(kind)
    sortOrder = Number(maxRow && maxRow.m != null ? maxRow.m : -1) + 1
  }

  if (!Number.isFinite(pointsOff) || pointsOff < 0) return { ok: false, msg: '积分抵扣无效' }
  if (!Number.isFinite(stock) || stock < 0) return { ok: false, msg: '库存无效' }
  if (!Number.isFinite(stockAlarm) || stockAlarm < 0) return { ok: false, msg: '库存预警无效' }
  if (!Number.isFinite(sortOrder)) return { ok: false, msg: '排序无效' }

  try {
    if (existing) {
      d.prepare(
        `UPDATE product SET name=?, category=?, price_cent=?, cost_cent=?, points_off=?, stock=?, stock_alarm=?,
         image_url=?, tag=?, status=?, sort_order=?, meta_json=?, updated_at=?, kind=? WHERE id=?`
      ).run(
        name,
        materialCategory,
        priceCent,
        costCent,
        pointsOff,
        stock,
        stockAlarm,
        imageUrl,
        tag,
        status,
        sortOrder,
        metaJson,
        t,
        kind,
        id
      )
    } else {
      d.prepare(
        `INSERT INTO product (id,name,category,price_cent,cost_cent,points_off,stock,stock_alarm,image_url,tag,status,sort_order,meta_json,updated_at,kind)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(
        id,
        name,
        materialCategory,
        priceCent,
        costCent,
        pointsOff,
        stock,
        stockAlarm,
        imageUrl,
        tag,
        status,
        sortOrder,
        metaJson,
        t,
        kind
      )
    }
  } catch (e) {
    return { ok: false, msg: e.message || '商品写入失败' }
  }

  // 物料主档变更：若已上架商城则刷新投影（名/图/库存）
  let liveSynced = true
  let liveError = ''
  let publishedVersion = ''
  try {
    const pub = publishMallLive()
    publishedVersion = pub && pub.version ? String(pub.version) : ''
  } catch (e) {
    liveSynced = false
    liveError = e.message || '同步小程序失败'
    console.warn('[admin] publishMallLive failed:', liveError)
  }

  const item = d.prepare('SELECT * FROM product WHERE id=?').get(id)
  return {
    ok: true,
    item,
    draftSynced: liveSynced,
    liveSynced,
    publishedVersion,
    draftError: liveError || undefined,
    msg: liveSynced ? undefined : `商品已入库，但同步小程序失败：${liveError}`,
  }
}

function deleteProduct(id) {
  const d = db()
  try {
    require('./listingService').ensureReady()
    d.prepare(`DELETE FROM channel_listing WHERE product_id=?`).run(id)
  } catch (_) {}
  d.prepare('DELETE FROM product WHERE id=?').run(id)
  try {
    publishMallLive()
  } catch (e) {
    console.warn('[admin] publishMallLive after delete failed:', e.message)
  }
  return { ok: true }
}

/**
 * 同物料 kind 内上移/下移。
 */
function moveProductSort(id, direction = 'up') {
  const d = db()
  const cur = d.prepare('SELECT * FROM product WHERE id=?').get(id)
  if (!cur) return { ok: false, msg: '商品不存在' }
  const listingService = require('./listingService')
  const kind = listingService.normalizeMaterialKind(cur.kind, cur.category, cur.tag, parseProductMeta(cur.meta_json))
  const list = d
    .prepare(`SELECT id, sort_order FROM product WHERE kind=? ORDER BY sort_order, id`)
    .all(kind)
  const idx = list.findIndex((r) => r.id === id)
  if (idx < 0) return { ok: false, msg: '商品不存在' }
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1
  if (swapIdx < 0 || swapIdx >= list.length) {
    return { ok: true, moved: false, list: listProducts() }
  }
  const next = list.slice()
  const tmp = next[idx]
  next[idx] = next[swapIdx]
  next[swapIdx] = tmp
  const t = now()
  const upd = d.prepare(`UPDATE product SET sort_order=?, updated_at=? WHERE id=?`)
  const tx = d.transaction(() => {
    next.forEach((row, i) => upd.run(i, t, row.id))
  })
  tx()
  try {
    publishMallLive()
  } catch (e) {
    console.warn('[admin] publishMallLive after sort failed:', e.message)
  }
  return { ok: true, moved: true, list: listProducts() }
}

/** 商城列表项（小程序/壳层共用；来自 mall channel_listing） */
function buildMallCatalogItems() {
  const listingService = require('./listingService')
  try {
    listingService.ensureReady()
  } catch (_) {}
  return listingService.listMallCatalog().map((o) => {
    const mapped = listingService.mapMallClient(o)
    return {
      id: mapped.id,
      name: mapped.name,
      price: mapped.price,
      pointsOff: mapped.pointsOff,
      tag: mapped.tag,
      imageUrl: mapped.imageUrl || '',
      subtitle: mapped.subtitle || '',
      detailHtml: mapped.detailHtml || '',
      gallery: mapped.gallery || [],
      tone: 'mint',
      stock: mapped.stock,
      payPoints: mapped.payPoints,
      payCashCent: mapped.payCashCent,
      payLabel: mapped.payLabel,
    }
  })
}

/** 保存即生效：草稿 + 已发布配置一起更新并升版本 */
function publishMallLive() {
  const items = buildMallCatalogItems()
  return configService.publishMallSnapshot(items)
}

/** @deprecated 名称保留，内部走 publishMallLive */
function syncMallIntoDraft() {
  publishMallLive()
}

/* ——— 抽奖 ——— */
/** 空串：小程序用本地 /static/ui 占位，避免指向不存在的 COS key */
const LOTTERY_DEFAULT_ICONS = {
  empty: '',
  energy: '',
  coin: '',
  points: '',
}

function isBrokenLotteryIcon(url) {
  const u = String(url || '')
  return !u || /\/uploads\/ico-|ico-lottery\.png|ico-coin\.png|qmyx\/ico-lottery|qmyx\/ico-coin/.test(u)
}

function listLottery() {
  seedIfEmpty()
  try {
    require('./skuService').migrateKinds()
    require('./lotteryService').ensureSchema()
  } catch (_) {}
  let globalWinRate = 30
  try {
    globalWinRate = require('./opsService').lotteryPageConfig().globalWinRate
  } catch (_) {}
  const rows = db().prepare(`SELECT * FROM lottery_prize ORDER BY sort_order, id`).all()
  // 池内占比：仅启用中的非 empty 奖项
  const winRows = rows.filter(
    (r) => r.status === 'on' && r.prize_type !== 'empty' && Math.max(0, Number(r.weight) || 0) > 0
  )
  const totalW = winRows.reduce((s, p) => s + Math.max(0, Number(p.weight) || 0), 0) || 1
  const offerService = require('./offerService')
  return rows.map((p) => {
    let skuName = ''
    let skuImage = ''
    let skuCost = 0
    let offer = null
    if (p.product_id) {
      offer = offerService.resolveOffer(p.product_id)
      skuName = offer.name
      skuImage = offer.imageUrl
      skuCost = offer.costCent
    }
    const isEmpty =
      p.prize_type === 'empty' ||
      p.id === 'p_empty' ||
      /谢谢参与|谢谢惠顾/.test(String(p.name || ''))
    const isEnergy = p.prize_type === 'energy' || p.prize_type === 'coin' || p.prize_type === 'points'
    const poolShare =
      !isEmpty && p.status === 'on'
        ? Math.round((Math.max(0, Number(p.weight) || 0) / totalW) * 10000) / 10000
        : 0
    const absoluteRate = isEmpty
      ? Math.round(((100 - Number(globalWinRate || 0)) / 100) * 10000) / 10000
      : Math.round(poolShare * (Number(globalWinRate || 0) / 100) * 10000) / 10000
    const rawImg = skuImage || p.image_url || ''
    const image_url = isBrokenLotteryIcon(rawImg) ? '' : rawImg
    return {
      ...p,
      name: skuName || p.name,
      image_url,
      skuName,
      skuCostCent: skuCost,
      product: offer,
      rarity: p.rarity || 'N',
      pool_id: p.pool_id || 'default',
      /** 中奖池内占比 0–1（empty 为 0） */
      probability: poolShare,
      poolSharePercent: Math.round(poolShare * 10000) / 100,
      absoluteRate,
      absoluteRatePercent: Math.round(absoluteRate * 10000) / 100,
      globalWinRate,
    }
  })
}

/** 奖项 ID：lp + 自增序号，保证唯一 */
function allocLotteryId() {
  const d = db()
  let max = 0
  d.prepare('SELECT id FROM lottery_prize').all().forEach((r) => {
    const m = String(r.id || '').match(/(\d+)$/)
    if (m) max = Math.max(max, Number(m[1]) || 0)
  })
  let n = max + 1
  let id = `lp${n}`
  while (d.prepare('SELECT id FROM lottery_prize WHERE id=?').get(id)) {
    n += 1
    id = `lp${n}`
  }
  return id
}

function upsertLottery(body) {
  try {
    require('./lotteryService').ensureSchema()
  } catch (_) {}
  const d = db()
  let id = String(body.id || '').trim()
  const t = now()
  // 兼容旧 coin/points → energy
  let prizeType = body.prizeType || body.prize_type || 'energy'
  if (prizeType === 'coin' || prizeType === 'points') prizeType = 'energy'
  let nameHint = String(body.name || '').trim()
  // 名称含谢谢参与时强制 empty，防止再次误标成实物/能量抬高中奖感
  if (
    body.id === 'p_empty' ||
    /谢谢参与|谢谢惠顾/.test(nameHint) ||
    prizeType === 'empty'
  ) {
    prizeType = 'empty'
  }
  let productId = String(body.productId || body.skuId || '').trim()
  let prizeValue = Number(body.prizeValue != null ? body.prizeValue : 0)
  let stock = Number(body.stock != null ? body.stock : -1)
  let rarity = body.rarity || 'N'

  if (prizeType === 'empty') {
    productId = ''
    prizeValue = 0
    stock = -1
    rarity = 'N'
  } else if (prizeType === 'energy') {
    productId = ''
    if (!(prizeValue > 0) && body.probability == null) {
      // 允许先存再改面值；保存时若明确传了 0 则提示
      if (body.prizeValue != null && Number(body.prizeValue) <= 0) {
        return { ok: false, msg: '能量值奖项请填写面值' }
      }
    }
  } else if (prizeType === 'physical' || prizeType === 'seed') {
    if (!productId) return { ok: false, msg: '实物/种子奖项必须绑定物料中心 SKU' }
  }

  // 展示名/图：物料优先；empty/energy 默认名与默认 ICON
  let name = body.name || id
  let imageUrl = String(body.imageUrl || body.image_url || '').trim()
  if (productId) {
    const sku = d.prepare(`SELECT id, name, image_url, stock, status FROM product WHERE id=?`).get(productId)
    if (!sku) return { ok: false, msg: `物料不存在：${productId}` }
    name = sku.name || id
    imageUrl = sku.image_url || ''
  } else if (prizeType === 'empty') {
    name = body.name || '谢谢参与'
    if (!imageUrl) imageUrl = LOTTERY_DEFAULT_ICONS.empty
  } else if (prizeType === 'energy') {
    name = body.name || (prizeValue > 0 ? `能量值×${prizeValue}` : '能量值')
    if (!imageUrl) imageUrl = LOTTERY_DEFAULT_ICONS.energy
  }

  if (!id) {
    id = allocLotteryId()
    if (!name || name === '') name = id
  }

  // 池内概率 % → weight（保留比例；单奖直接设为 round(percent*100)）
  let weight = Math.max(0, Number(body.weight != null ? body.weight : 1))
  if (body.probabilityPercent != null || body.poolSharePercent != null) {
    const pct = Number(body.probabilityPercent != null ? body.probabilityPercent : body.poolSharePercent)
    if (Number.isFinite(pct) && pct >= 0) {
      weight = Math.max(0, Math.round(pct * 100))
    }
  } else if (body.probability != null && Number(body.probability) >= 0 && Number(body.probability) <= 1) {
    weight = Math.max(0, Math.round(Number(body.probability) * 10000))
  }
  if (prizeType === 'empty') weight = 0

  if (prizeType === 'physical') {
    rarity = body.rarity || 'SSR'
  } else if (prizeType === 'seed') {
    rarity = body.rarity || 'SR'
  }

  const exists = d.prepare('SELECT id FROM lottery_prize WHERE id=?').get(id)
  const poolId = 'default'
  const args = [
    name,
    prizeType,
    prizeValue,
    productId,
    weight,
    stock,
    imageUrl,
    body.status || 'on',
    Number(body.sortOrder || 0),
    t,
    rarity,
    poolId,
  ]
  if (exists) {
    d.prepare(
      `UPDATE lottery_prize SET name=?, prize_type=?, prize_value=?, product_id=?, weight=?, stock=?, image_url=?, status=?, sort_order=?, updated_at=?, rarity=?, pool_id=? WHERE id=?`
    ).run(...args, id)
  } else {
    d.prepare(
      `INSERT INTO lottery_prize (id,name,prize_type,prize_value,product_id,weight,stock,image_url,status,sort_order,updated_at,rarity,pool_id)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(id, ...args)
  }
  syncLotteryIntoDraft()
  return { ok: true, item: listLottery().find((x) => x.id === id) || d.prepare('SELECT * FROM lottery_prize WHERE id=?').get(id) }
}

function deleteLottery(id) {
  db().prepare('DELETE FROM lottery_prize WHERE id=?').run(id)
  syncLotteryIntoDraft()
  return { ok: true }
}

function syncLotteryIntoDraft() {
  const draft = configService.getDraft()
  if (!draft) return
  if (!draft.game) draft.game = {}
  draft.game.lottery = listLottery()
    .filter((p) => p.status === 'on')
    .map((p) => ({
      id: p.id,
      name: p.name,
      prizeType: p.prize_type,
      prizeValue: p.prize_value,
      stock: p.stock,
      imageUrl: p.image_url,
      productId: p.product_id || '',
      claimFree: p.prize_type === 'physical',
    }))
  if (!draft.catalog) draft.catalog = {}
  draft.catalog.lottery = draft.game.lottery
  configService.saveDraft(draft)
}

function drawLottery(userId, opts = {}) {
  seedIfEmpty()
  return require('./lotteryService').draw(userId, opts)
}

/* ——— 任务 ——— */
function listTasks() {
  seedIfEmpty()
  try {
    require('./taskService').ensureSchema()
  } catch (_) {}
  return db().prepare(`SELECT * FROM task_def ORDER BY sort_order, id`).all()
}

function upsertTask(body) {
  const d = db()
  const taskSvc = require('./taskService')
  taskSvc.ensureSchema()
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少 id' }
  const t = now()
  const extra = taskSvc.ensureTaskColumnsOnUpsert(body)
  const energy = Number(body.rewardEnergy || 0)
  const coins = Number(body.rewardCoins || 0)
  const giftId = extra.rewardGiftId
  const rewardDesc =
    body.rewardDesc ||
    taskSvc.autoRewardDesc(energy + coins, giftId, taskSvc.giftName(giftId))
  const exists = d.prepare('SELECT id FROM task_def WHERE id=?').get(id)
  const dailyLimit = Math.max(1, Number(body.dailyLimit != null ? body.dailyLimit : 1) || 1)
  const targetCount = Math.max(1, Number(extra.targetCount) || dailyLimit)
  if (exists) {
    d.prepare(
      `UPDATE task_def SET title=?, action_key=?, reward_desc=?, reward_energy=?, reward_coins=?, daily_limit=?,
       status=?, sort_order=?, target_count=?, reward_gift_id=?, desc_text=?, updated_at=? WHERE id=?`
    ).run(
      body.title || id,
      body.actionKey || body.action || '',
      rewardDesc,
      energy,
      coins,
      dailyLimit,
      body.status || 'on',
      Number(body.sortOrder || 0),
      targetCount,
      giftId,
      extra.descText,
      t,
      id
    )
  } else {
    d.prepare(
      `INSERT INTO task_def (id,title,action_key,reward_desc,reward_energy,reward_coins,daily_limit,status,sort_order,target_count,reward_gift_id,desc_text,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id,
      body.title || id,
      body.actionKey || body.action || '',
      rewardDesc,
      energy,
      coins,
      dailyLimit,
      body.status || 'on',
      Number(body.sortOrder || 0),
      targetCount,
      giftId,
      extra.descText,
      t
    )
  }
  syncTasksIntoDraft()
  return { ok: true }
}

function deleteTask(id) {
  db().prepare('DELETE FROM task_def WHERE id=?').run(id)
  syncTasksIntoDraft()
  return { ok: true }
}

function syncTasksIntoDraft() {
  const draft = configService.getDraft()
  if (!draft) return
  if (!draft.catalog) draft.catalog = {}
  let items = []
  try {
    items = require('./taskService').listDefs(false)
  } catch (_) {
    items = listTasks()
      .filter((t) => t.status === 'on')
      .map((t) => ({
        id: t.id,
        title: t.title,
        action: t.action_key,
        reward: t.reward_desc,
        rewardEnergy: t.reward_energy,
        rewardCoins: t.reward_coins,
        dailyLimit: t.daily_limit,
        targetCount: t.target_count || t.daily_limit || 1,
        rewardGiftId: t.reward_gift_id || '',
        sortOrder: t.sort_order,
        desc: t.desc_text || t.reward_desc || '',
        enabled: true,
      }))
  }
  draft.catalog.tasks = items

  // 与「每日任务」页 task_list 对齐（首页 task_list 已下线）
  if (!draft.pages) draft.pages = {}
  if (!draft.pages.energy) draft.pages.energy = { navigationTitle: '每日任务', modules: [] }
  const mods = Array.isArray(draft.pages.energy.modules) ? draft.pages.energy.modules.slice() : []
  let idx = mods.findIndex((m) => m && (m.id === 'energy_tasks' || m.type === 'task_list'))
  const prev = idx >= 0 ? mods[idx] : null
  const prevItems = (prev && prev.payload && prev.payload.items) || []
  const iconMap = {}
  prevItems.forEach((it) => {
    if (it && it.id) iconMap[it.id] = it
  })
  const merged = items
    .filter((t) => String(t.action || '').toLowerCase() !== 'steps' && !String(t.id || '').includes('step'))
    .map((t) => {
      const extra = iconMap[t.id] || {}
      return {
        ...extra,
        id: t.id,
        title: t.title,
        desc: extra.desc || t.desc || '',
        reward: t.reward || extra.reward || '',
        action: t.action || extra.action || '',
        rewardEnergy: t.rewardEnergy,
        rewardGiftId: t.rewardGiftId || '',
        targetCount: t.targetCount || 1,
        dailyLimit: t.dailyLimit || 1,
        iconUrl: extra.iconUrl || '',
        iconKey: extra.iconKey || '',
        sortOrder: t.sortOrder != null ? t.sortOrder : extra.sortOrder,
        enabled: true,
      }
    })
  const taskMod = {
    id: 'energy_tasks',
    type: 'task_list',
    title: (prev && prev.title) || '每日任务',
    payload: {
      ...(prev && prev.payload ? prev.payload : {}),
      items: merged,
      showSteps: false,
    },
  }
  if (idx >= 0) mods[idx] = taskMod
  else mods.unshift(taskMod)
  draft.pages.energy = { ...draft.pages.energy, navigationTitle: '每日任务', modules: mods }
  configService.saveDraft(draft)
}

function listTaskCompletions({ day = '', taskId = '', page = 1, pageSize = 50 } = {}) {
  seedIfEmpty()
  const d = db()
  const where = []
  const args = []
  if (day) {
    where.push('c.day_key=?')
    args.push(day)
  }
  if (taskId) {
    where.push('c.task_id=?')
    args.push(taskId)
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = d.prepare(`SELECT COUNT(*) AS n FROM task_completion c ${w}`).get(...args).n
  const offset = (Math.max(1, page) - 1) * pageSize
  const list = d
    .prepare(
      `SELECT c.*, u.nick_name, u.platform, t.title AS task_title
       FROM task_completion c
       LEFT JOIN user_account u ON u.id=c.user_id
       LEFT JOIN task_def t ON t.id=c.task_id
       ${w}
       ORDER BY c.id DESC LIMIT ? OFFSET ?`
    )
    .all(...args, pageSize, offset)
  const summary = d
    .prepare(
      `SELECT task_id, COUNT(*) AS cnt FROM task_completion
       ${day ? 'WHERE day_key=?' : ''}
       GROUP BY task_id`
    )
    .all(...(day ? [day] : []))
  return { total, page: Number(page), pageSize, list, summary, day: day || dayKey() }
}

function completeTask(userId, taskId) {
  seedIfEmpty()
  return require('./taskService').complete(userId, taskId)
}

/* ——— 兑换 ——— */
function listRedeems({ status = '', orderType = '', page = 1, pageSize = 30 } = {}) {
  seedIfEmpty()
  const d = db()
  const where = []
  const args = []
  if (status) {
    where.push('r.status=?')
    args.push(status)
  }
  if (orderType) {
    where.push('r.order_type=?')
    args.push(orderType)
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = d.prepare(`SELECT COUNT(*) AS n FROM redeem_order r ${w}`).get(...args).n
  const offset = (Math.max(1, page) - 1) * pageSize
  const list = d
    .prepare(
      `SELECT r.*, u.nick_name, u.platform
       FROM redeem_order r
       LEFT JOIN user_account u ON u.id=r.user_id
       ${w}
       ORDER BY r.id DESC LIMIT ? OFFSET ?`
    )
    .all(...args, pageSize, offset)
  return { total, page: Number(page), pageSize, list }
}

function updateRedeem(id, patch) {
  const d = db()
  const row = d.prepare('SELECT * FROM redeem_order WHERE id=?').get(id)
  if (!row) return { ok: false, msg: '订单不存在' }
  const status = patch.status || row.status
  d.prepare(`UPDATE redeem_order SET status=?, updated_at=? WHERE id=?`).run(status, now(), id)
  return { ok: true }
}

function createRedeemOrder({
  userId,
  orderType = 'gift',
  productId,
  qty = 1,
  payPoints = 0,
  payCashCent = 0,
  address = {},
  entryFrom = '',
}) {
  seedIfEmpty()
  const d = db()
  try {
    dbMod.addColumnIfMissing(
      d,
      'redeem_order',
      'entry_from',
      `VARCHAR(64) NOT NULL DEFAULT ''`,
      `TEXT NOT NULL DEFAULT ''`
    )
  } catch (_) {}
  const prod = productId ? d.prepare('SELECT * FROM product WHERE id=?').get(productId) : null
  if (productId && !prod) return { ok: false, msg: '商品不存在' }
  if (prod && prod.stock < qty) return { ok: false, msg: '库存不足' }
  const cost = prod ? prod.cost_cent * qty : 0
  const ono = orderNo(orderType === 'mall' ? 'M' : 'G')
  const entry =
    entryFrom ||
    (address && (address.entryFrom || address.note)) ||
    ''
  const addrJson = JSON.stringify(address || {})
  const tx = d.transaction(() => {
    try {
      d.prepare(
        `INSERT INTO redeem_order (order_no,user_id,order_type,product_id,product_name,qty,pay_points,pay_cash_cent,cost_cent,status,pay_status,address_json,entry_from,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,'pending','none',?,?,?,?)`
      ).run(
        ono,
        userId,
        orderType,
        productId || '',
        prod ? prod.name : '',
        qty,
        payPoints,
        payCashCent,
        cost,
        addrJson,
        String(entry).slice(0, 64),
        now(),
        now()
      )
    } catch (_) {
      d.prepare(
        `INSERT INTO redeem_order (order_no,user_id,order_type,product_id,product_name,qty,pay_points,pay_cash_cent,cost_cent,status,address_json,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,'pending',?,?,?)`
      ).run(
        ono,
        userId,
        orderType,
        productId || '',
        prod ? prod.name : '',
        qty,
        payPoints,
        payCashCent,
        cost,
        addrJson,
        now(),
        now()
      )
    }
    if (prod) {
      d.prepare(`UPDATE product SET stock=stock-?, updated_at=? WHERE id=?`).run(qty, now(), prod.id)
    }
    if (payCashCent > 0) {
      addFinance({
        entryType: 'revenue',
        category: orderType === 'mall' ? 'mall_sale' : 'cash_redeem',
        amountCent: payCashCent,
        refType: 'order',
        refId: ono,
        note: prod ? prod.name : orderType,
      })
    }
    if (cost > 0) {
      addFinance({
        entryType: 'cost',
        category: 'gift_cost',
        amountCent: cost,
        refType: 'order',
        refId: ono,
        note: `激励成本 ${prod ? prod.name : ''}`,
      })
    }
  })
  tx()
  return { ok: true, orderNo: ono }
}

/* ——— 图标 ——— */
function listIcons(baseUrl) {
  seedIfEmpty()
  return db()
    .prepare(`SELECT * FROM icon_asset ORDER BY purpose, id`)
    .all()
    .map((i) => {
      const raw = i.path || ''
      return {
        ...i,
        path_raw: raw,
        path: mediaUrl.adminProxyUrl(raw) || mediaUrl.clientMediaPath(raw),
        path_storage: mediaUrl.clientMediaPath(raw),
      }
    })
}

function upsertIcon(body) {
  const d = db()
  const id = String(body.id || '').trim()
  let path = body.path != null ? String(body.path) : ''
  if (!id || !path) return { ok: false, msg: '缺少 id 或 path' }
  if (path.startsWith('/static/')) return { ok: false, msg: '请上传 COS 图片，不要使用 /static 包内路径' }
  path = mediaUrl.normalizeStoredMedia(path)
  if (!path) return { ok: false, msg: '图片路径无效，请重新上传' }
  const t = now()
  const exists = d.prepare('SELECT id FROM icon_asset WHERE id=?').get(id)
  if (exists) {
    d.prepare(`UPDATE icon_asset SET label=?, purpose=?, path=?, updated_at=? WHERE id=?`).run(
      body.label || id,
      body.purpose || 'icons',
      path,
      t,
      id
    )
  } else {
    d.prepare(`INSERT INTO icon_asset (id,label,purpose,path,updated_at) VALUES (?,?,?,?,?)`).run(
      id,
      body.label || id,
      body.purpose || 'icons',
      path,
      t
    )
  }
  syncIconsIntoDraft()
  return { ok: true }
}

function deleteIcon(id) {
  db().prepare('DELETE FROM icon_asset WHERE id=?').run(id)
  syncIconsIntoDraft()
  return { ok: true }
}

function syncIconsIntoDraft() {
  const draft = configService.getDraft()
  if (!draft) return
  const icons = listIcons()
  const pick = (i) => {
    const raw = i.path_storage || i.path_raw || mediaUrl.clientMediaPath(i.path) || ''
    return raw.startsWith('/static/') ? '' : mediaUrl.clientMediaPath(raw) || raw
  }
  const assets = { ...(draft.assets || {}) }
  icons
    .filter((i) => i.purpose === 'assets' || !String(i.id).startsWith('tab.'))
    .forEach((i) => {
      if (!String(i.id).startsWith('tab.')) {
        const p = pick(i)
        if (p) assets[i.id] = p
        else delete assets[i.id]
      }
    })
  draft.assets = assets
  icons
    .filter((i) => String(i.id).startsWith('tab.') && !String(i.id).endsWith('.active'))
    .forEach((i) => {
      const key = i.id.replace(/^tab\./, '')
      const tab = (draft.tabBar || []).find((t) => t.pageKey === key)
      if (tab) tab.iconUrl = pick(i)
    })
  icons
    .filter((i) => String(i.id).endsWith('.active'))
    .forEach((i) => {
      const key = i.id.replace(/^tab\./, '').replace(/\.active$/, '')
      const tab = (draft.tabBar || []).find((t) => t.pageKey === key)
      if (tab) tab.selectedIconUrl = pick(i)
    })
  if (!draft.catalog) draft.catalog = {}
  draft.catalog.icons = {}
  icons.forEach((i) => {
    const p = pick(i)
    if (p) draft.catalog.icons[i.id] = p
  })
  configService.saveDraft(draft)
}

/* ——— 财务 ——— */
function addFinance({ entryType, category, amountCent, refType = '', refId = '', note = '', day } = {}) {
  if (!amountCent || amountCent <= 0) return null
  const d = db()
  const info = d
    .prepare(
      `INSERT INTO finance_ledger (day_key,entry_type,category,amount_cent,ref_type,ref_id,note,created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(day || dayKey(), entryType, category || 'misc', amountCent, refType, refId, note || '', now())
  return info.lastInsertRowid
}

/** 微信支付成功入账（幂等：同订单同类型不重复） */
function ensureWxPayFinance(order) {
  if (!order) return { revenue: false, cost: false }
  const outTradeNo = order.order_no || order.orderNo
  const payCent = Number(order.pay_cash_cent != null ? order.pay_cash_cent : order.payCashCent) || 0
  const costCent = Number(order.cost_cent != null ? order.cost_cent : order.costCent) || 0
  const name = order.product_name || order.productName || outTradeNo
  const orderType = order.order_type || order.orderType || 'mall'
  const d = db()
  let revenue = false
  let cost = false
  if (payCent > 0) {
    const exists = d
      .prepare(
        `SELECT id FROM finance_ledger WHERE ref_type='order' AND ref_id=? AND entry_type='revenue' AND category IN ('mall_sale','cash_redeem','wx_pay') LIMIT 1`
      )
      .get(outTradeNo)
    if (!exists) {
      addFinance({
        entryType: 'revenue',
        category: orderType === 'mall' ? 'mall_sale' : 'wx_pay',
        amountCent: payCent,
        refType: 'order',
        refId: outTradeNo,
        note: `${name} · 微信支付`,
        day: (order.paid_at || order.paidAt || now()).slice(0, 10) || dayKey(),
      })
      revenue = true
    }
  }
  if (costCent > 0) {
    const costExists = d
      .prepare(
        `SELECT id FROM finance_ledger WHERE ref_type='order' AND ref_id=? AND entry_type='cost' AND category='gift_cost' LIMIT 1`
      )
      .get(outTradeNo)
    if (!costExists) {
      addFinance({
        entryType: 'cost',
        category: 'gift_cost',
        amountCent: costCent,
        refType: 'order',
        refId: outTradeNo,
        note: `履约成本 ${name}`,
        day: (order.paid_at || order.paidAt || now()).slice(0, 10) || dayKey(),
      })
      cost = true
    }
  }
  return { revenue, cost }
}

/** 退款记支出（幂等：同 refundId / 同订单退款金额） */
function ensureWxRefundFinance(order, amountCent, refundId = '') {
  const outTradeNo = order.order_no || order.orderNo
  const cent = Number(amountCent) || 0
  if (!outTradeNo || cent <= 0) return false
  const d = db()
  const refId = refundId || `${outTradeNo}:refund`
  const exists = d
    .prepare(
      `SELECT id FROM finance_ledger WHERE ref_type IN ('refund','order') AND ref_id=? AND entry_type='cost' AND category='wx_refund' LIMIT 1`
    )
    .get(refId)
  if (exists) return false
  addFinance({
    entryType: 'cost',
    category: 'wx_refund',
    amountCent: cent,
    refType: 'refund',
    refId,
    note: `微信退款 ${order.product_name || outTradeNo} · ¥${(cent / 100).toFixed(2)}`,
    day: dayKey(),
  })
  return true
}

/** 回填：已支付订单漏记的收入/成本 */
function backfillWxPayFinance() {
  seedIfEmpty()
  const d = db()
  let n = 0
  try {
    const rows = d
      .prepare(
        `SELECT * FROM redeem_order WHERE pay_status='paid' AND COALESCE(pay_cash_cent,0)>0`
      )
      .all()
    rows.forEach((row) => {
      const r = ensureWxPayFinance(row)
      if (r.revenue || r.cost) n += 1
    })
  } catch (e) {
    console.warn('[finance] backfill', e && e.message)
  }
  return { ok: true, patched: n }
}

function financeWhere({ entryType = '', from = '', to = '', category = '' } = {}) {
  const where = []
  const args = []
  if (entryType === 'expense' || entryType === 'cost') {
    where.push(`entry_type='cost'`)
  } else if (entryType === 'revenue') {
    where.push(`entry_type='revenue'`)
  } else if (entryType === 'refund') {
    where.push(`entry_type='cost' AND category='wx_refund'`)
  } else if (entryType) {
    where.push('entry_type=?')
    args.push(entryType)
  }
  if (category) {
    where.push('category=?')
    args.push(category)
  }
  if (from) {
    where.push('day_key>=?')
    args.push(from)
  }
  if (to) {
    where.push('day_key<=?')
    args.push(to)
  }
  return { where, args, w: where.length ? `WHERE ${where.join(' AND ')}` : '' }
}

function listFinance({ entryType = '', from = '', to = '', category = '', page = 1, pageSize = 50 } = {}) {
  seedIfEmpty()
  try {
    backfillWxPayFinance()
  } catch (_) {}
  const d = db()
  const { args, w } = financeWhere({ entryType, from, to, category })
  const total = d.prepare(`SELECT COUNT(*) AS n FROM finance_ledger ${w}`).get(...args).n
  const offset = (Math.max(1, page) - 1) * pageSize
  const list = d
    .prepare(`SELECT * FROM finance_ledger ${w} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, pageSize, offset)
    .map((f) => ({
      ...f,
      amountYuan: centToYuan(f.amount_cent),
      typeLabel:
        f.entry_type === 'revenue'
          ? '收入'
          : f.category === 'wx_refund'
            ? '退款'
            : '支出',
    }))

  // 实时汇总：收入 / 支出（含退款）/ 净额 —— 不受分页与类型筛选影响（仅受日期）
  const sumParts = []
  const sumArgs = []
  if (from) {
    sumParts.push('day_key>=?')
    sumArgs.push(from)
  }
  if (to) {
    sumParts.push('day_key<=?')
    sumArgs.push(to)
  }
  const dateClause = sumParts.length ? ` AND ${sumParts.join(' AND ')}` : ''
  const revenueCent = d
    .prepare(`SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger WHERE entry_type='revenue'${dateClause}`)
    .get(...sumArgs).s
  const costCent = d
    .prepare(`SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger WHERE entry_type='cost'${dateClause}`)
    .get(...sumArgs).s
  const refundCent = d
    .prepare(
      `SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger WHERE entry_type='cost' AND category='wx_refund'${dateClause}`
    )
    .get(...sumArgs).s

  return {
    total,
    page: Number(page),
    pageSize,
    list,
    summary: {
      revenueCent,
      costCent,
      refundCent,
      expenseCent: costCent,
      netCent: revenueCent - costCent,
      revenueYuan: centToYuan(revenueCent),
      costYuan: centToYuan(costCent),
      refundYuan: centToYuan(refundCent),
      expenseYuan: centToYuan(costCent),
      netYuan: centToYuan(revenueCent - costCent),
    },
  }
}

function rangeKeys(period, anchor = new Date()) {
  const a = new Date(anchor)
  a.setHours(0, 0, 0, 0)
  if (period === 'day') {
    const k = dayKey(a)
    return { from: k, to: k, label: k }
  }
  if (period === 'week') {
    const day = a.getDay() || 7
    const start = new Date(a)
    start.setDate(a.getDate() - day + 1)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return { from: dayKey(start), to: dayKey(end), label: `${dayKey(start)}~${dayKey(end)}` }
  }
  // month
  const start = new Date(a.getFullYear(), a.getMonth(), 1)
  const end = new Date(a.getFullYear(), a.getMonth() + 1, 0)
  return { from: dayKey(start), to: dayKey(end), label: `${a.getFullYear()}-${String(a.getMonth() + 1).padStart(2, '0')}` }
}

function sumFinance(from, to, entryType) {
  const row = db()
    .prepare(
      `SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger
       WHERE entry_type=? AND day_key>=? AND day_key<=?`
    )
    .get(entryType, from, to)
  return row.s
}

function statsOverview() {
  seedIfEmpty()
  try {
    backfillWxPayFinance()
  } catch (_) {}
  const d = db()
  const periods = ['day', 'week', 'month'].map((period) => {
    const r = rangeKeys(period)
    const revenue = sumFinance(r.from, r.to, 'revenue')
    const cost = sumFinance(r.from, r.to, 'cost')
    const refund = d
      .prepare(
        `SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger
         WHERE entry_type='cost' AND category='wx_refund' AND day_key>=? AND day_key<=?`
      )
      .get(r.from, r.to).s
    return {
      period,
      label: r.label,
      from: r.from,
      to: r.to,
      revenueCent: revenue,
      costCent: cost,
      refundCent: refund,
      revenueYuan: centToYuan(revenue),
      costYuan: centToYuan(cost),
      refundYuan: centToYuan(refund),
      expenseYuan: centToYuan(cost),
      marginYuan: centToYuan(revenue - cost),
    }
  })

  const allRevenue = d
    .prepare(`SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger WHERE entry_type='revenue'`)
    .get().s
  const allCost = d
    .prepare(`SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger WHERE entry_type='cost'`)
    .get().s
  const allRefund = d
    .prepare(
      `SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger WHERE entry_type='cost' AND category='wx_refund'`
    )
    .get().s

  const users = d.prepare('SELECT COUNT(*) AS n FROM user_account').get().n
  const activeUsers = d
    .prepare(`SELECT COUNT(*) AS n FROM user_account WHERE status='active'`).get().n
  const lowStock = d
    .prepare(`SELECT COUNT(*) AS n FROM product WHERE status='on' AND stock<=stock_alarm`)
    .get().n
  const pendingRedeem = d
    .prepare(`SELECT COUNT(*) AS n FROM redeem_order WHERE status='pending'`).get().n
  const todayTasks = d
    .prepare(`SELECT COUNT(*) AS n FROM task_completion WHERE day_key=?`)
    .get(dayKey()).n
  const todayDraws = d
    .prepare(`SELECT COUNT(*) AS n FROM lottery_draw WHERE substr(created_at,1,10)=?`)
    .get(dayKey()).n

  const revenueByCat = d
    .prepare(
      `SELECT category, SUM(amount_cent) AS s FROM finance_ledger
       WHERE entry_type='revenue' AND day_key>=? GROUP BY category`
    )
    .all(rangeKeys('month').from)
  const costByCat = d
    .prepare(
      `SELECT category, SUM(amount_cent) AS s FROM finance_ledger
       WHERE entry_type='cost' AND day_key>=? GROUP BY category`
    )
    .all(rangeKeys('month').from)

  return {
    periods,
    totals: {
      revenueCent: allRevenue,
      costCent: allCost,
      refundCent: allRefund,
      expenseCent: allCost,
      netCent: allRevenue - allCost,
      revenueYuan: centToYuan(allRevenue),
      costYuan: centToYuan(allCost),
      refundYuan: centToYuan(allRefund),
      expenseYuan: centToYuan(allCost),
      netYuan: centToYuan(allRevenue - allCost),
    },
    kpi: { users, activeUsers, lowStock, pendingRedeem, todayTasks, todayDraws },
    revenueByCat: revenueByCat.map((r) => ({ category: r.category, yuan: centToYuan(r.s) })),
    costByCat: costByCat.map((r) => ({ category: r.category, yuan: centToYuan(r.s) })),
  }
}

/** 演示灌数：方便后台看统计（幂等按 note） */
function seedDemoFinanceIfEmpty() {
  seedIfEmpty()
  const n = db().prepare('SELECT COUNT(*) AS n FROM finance_ledger').get().n
  if (n) return
  const today = dayKey()
  const y = new Date()
  y.setDate(y.getDate() - 1)
  const yesterday = dayKey(y)
  ;[
    ['revenue', 'mall_sale', 12800, today, '商城销售'],
    ['revenue', 'mall_sale', 8600, yesterday, '商城销售'],
    ['revenue', 'brand_buy', 50000, today, '品牌买量回款'],
    ['cost', 'gift_cost', 3200, today, '实物兑礼成本'],
    ['cost', 'gift_cost', 2800, yesterday, '实物兑礼成本'],
    ['cost', 'shipping', 900, today, '运费'],
    ['cost', 'payment_fee', 180, today, '支付手续费'],
    ['cost', 'ops', 1500, today, '客服/包材'],
  ].forEach((row) => {
    addFinance({
      entryType: row[0],
      category: row[1],
      amountCent: row[2],
      day: row[3],
      note: row[4],
      refType: 'seed',
      refId: 'demo',
    })
  })
}

module.exports = {
  seedIfEmpty,
  seedDemoFinanceIfEmpty,
  ensureLotterySeedPrizes,
  catalogForClient,
  listUsers,
  getUserDetail,
  updateUser,
  listProducts,
  moveProductSort,
  upsertProduct,
  deleteProduct,
  publishMallLive,
  buildMallCatalogItems,
  listLottery,
  upsertLottery,
  deleteLottery,
  drawLottery,
  listTasks,
  upsertTask,
  deleteTask,
  listTaskCompletions,
  completeTask,
  listRedeems,
  updateRedeem,
  createRedeemOrder,
  listIcons,
  upsertIcon,
  deleteIcon,
  addFinance,
  listFinance,
  ensureWxPayFinance,
  ensureWxRefundFinance,
  backfillWxPayFinance,
  statsOverview,
  dayKey,
  centToYuan,
  yuanToCent,
}
