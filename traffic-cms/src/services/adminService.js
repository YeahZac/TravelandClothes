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

/** 已有奖池补齐抽奖种子奖（桃夭/节节高/苍松） */
function ensureLotterySeedPrizes(d = db()) {
  const t = now()
  const ins = d.prepare(
    `INSERT INTO lottery_prize (id,name,prize_type,prize_value,product_id,weight,stock,image_url,status,sort_order,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  )
  ;[
    ['p_seed_peach', '桃夭种子', 'seed', 1, 'seed_peach', 12, -1, '', 'on', 5],
    ['p_seed_bamboo', '节节高种子', 'seed', 1, 'seed_bamboo', 6, -1, '', 'on', 6],
    ['p_seed_pine', '苍松种子', 'seed', 1, 'seed_pine', 3, -1, '', 'on', 7],
  ].forEach((r) => {
    if (d.prepare('SELECT id FROM lottery_prize WHERE id=?').get(r[0])) return
    ins.run(...r, t)
  })
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

  const lotN = d.prepare('SELECT COUNT(*) AS n FROM lottery_prize').get().n
  if (!lotN) {
    const t = now()
    const ins = d.prepare(
      `INSERT INTO lottery_prize (id,name,prize_type,prize_value,product_id,weight,stock,image_url,status,sort_order,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    )
    ;[
      ['p_empty', '谢谢参与', 'empty', 0, '', 40, -1, '', 'on', 0],
      ['p_coin10', '金币×10', 'coin', 10, '', 30, -1, '', 'on', 1],
      ['p_coin50', '金币×50', 'coin', 50, '', 15, -1, '', 'on', 2],
      ['p_energy30', '能量×30', 'energy', 30, '', 10, -1, '', 'on', 3],
      // 实物奖 product_id 留空，由运营在奖池绑定真实 SKU（不再默认挂演示 m1）
      ['p_gift', '实物小礼', 'physical', 0, '', 5, 50, '', 'on', 4],
      ['p_seed_peach', '桃夭种子', 'seed', 1, '', 12, -1, '', 'on', 5],
      ['p_seed_bamboo', '节节高种子', 'seed', 1, '', 6, -1, '', 'on', 6],
      ['p_seed_pine', '苍松种子', 'seed', 1, '', 3, -1, '', 'on', 7],
    ].forEach((r) => ins.run(...r, t))
  } else {
    ensureLotterySeedPrizes(d)
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
  const products = d
    .prepare(
      `SELECT id, name, category, price_cent, points_off, stock, image_url, tag, status, sort_order, meta_json
       FROM product WHERE status='on' AND category!='兑礼' ORDER BY sort_order, id`
    )
    .all()
    .map((p) => mapProductClient(p))

  const prizes = d
    .prepare(
      `SELECT id, name, prize_type, prize_value, product_id, weight, stock, image_url
       FROM lottery_prize WHERE status='on' ORDER BY sort_order, id`
    )
    .all()
  const totalW = prizes.reduce((s, p) => s + Math.max(0, p.weight), 0) || 1
  const offerService = require('./offerService')
  const lottery = prizes.map((p) => {
    let payHint = '抽中即得'
    let payMode = 'free'
    let payLabel = '抽中即得'
    let product = null
    let displayName = p.name
    let imageUrl = mediaUrl.clientMediaPath(p.image_url)
    if (p.product_id) {
      product = offerService.resolveOffer(p.product_id)
      displayName = product.name || p.name
      imageUrl = product.imageUrl || imageUrl
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
    return {
      id: p.id,
      name: displayName,
      prizeType: p.prize_type,
      prizeValue: p.prize_value,
      productId: p.product_id,
      product,
      weight: p.weight,
      probability: Math.round((p.weight / totalW) * 10000) / 10000,
      stock: p.stock,
      imageUrl,
      payMode,
      payLabel,
      payHint,
      claimFree: p.prize_type === 'physical',
    }
  })

  const tasks = d
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

  const icons = {}
  d.prepare(`SELECT id, path FROM icon_asset`).all().forEach((r) => {
    const path = String(r.path || '')
    if (path.startsWith('/static/')) return
    const client = mediaUrl.clientMediaPath(path)
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
  const d = db()
  const where = []
  const args = []
  if (q) {
    where.push(`(nick_name LIKE ? OR openid LIKE ? OR invite_code LIKE ? OR CAST(id AS TEXT)=?)`)
    const like = `%${q}%`
    args.push(like, like, like, q)
  }
  if (status) {
    where.push(`status = ?`)
    args.push(status)
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = d.prepare(`SELECT COUNT(*) AS n FROM user_account ${w}`).get(...args).n
  const offset = (Math.max(1, page) - 1) * pageSize
  const rows = d
    .prepare(
      `SELECT u.*, w.energy, w.points, w.coins, w.lottery_chance
       FROM user_account u
       LEFT JOIN user_wallet w ON w.user_id = u.id
       ${w}
       ORDER BY u.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...args, pageSize, offset)
  return { total, page: Number(page), pageSize, list: rows }
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
      d.prepare(
        `UPDATE user_wallet SET energy=?, points=?, coins=?, lottery_chance=?, updated_at=? WHERE user_id=?`
      ).run(
        patch.wallet.energy != null ? patch.wallet.energy : w.energy,
        patch.wallet.points != null ? patch.wallet.points : w.points,
        patch.wallet.coins != null ? patch.wallet.coins : w.coins,
        patch.wallet.lotteryChance != null ? patch.wallet.lotteryChance : w.lottery_chance,
        now(),
        id
      )
    }
  }
  return { ok: true, user: listUsers({ q: String(id), pageSize: 1 }).list[0] }
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
  const priceCent = parseMoneyCent(body, 'priceYuan', 'priceCent')
  const costCent = parseMoneyCent(body, 'costYuan', 'costCent')
  if (!Number.isFinite(priceCent) || priceCent < 0) {
    return { ok: false, msg: '售价无效' }
  }
  if (!Number.isFinite(costCent) || costCent < 0) {
    return { ok: false, msg: '成本无效' }
  }
  const name = String(body.name != null ? body.name : (existing && existing.name) || id).trim()
  if (!name) return { ok: false, msg: '缺少名称' }
  // 未显式传 category 时保留原分类，避免商城编辑把「兑礼」冲成「推荐」
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
  // 积分 + 微信支付组合价（各模块后台可配）
  nextMeta = require('./pricingService').applyMetaPayFields(nextMeta, body)
  let metaJson = '{}'
  try {
    metaJson = JSON.stringify(nextMeta)
  } catch (e) {
    return { ok: false, msg: '详情内容过大或无法序列化' }
  }

  // 兼容旧 points_off：若显式配置了组合价，用现金/100 回写展示抵扣
  let pointsOff = Number(body.pointsOff != null ? body.pointsOff : existing ? existing.points_off : 0)
  if (body.payPoints != null || body.payCashCent != null || body.payCashYuan != null) {
    const payPts = Number(nextMeta.payPoints || 0)
    pointsOff = Math.round((payPts / 10) * 10) / 10
  }
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
  } catch (_) {}
  let kind = body.kind || (existing && existing.kind) || ''
  if (!kind) {
    if (category === '兑礼') kind = 'gift'
    else if (category === '种子' || tag === '树种') kind = 'seed'
    else if (category === '虚拟') kind = 'virtual'
    else kind = 'mall'
  }

  let sortOrder
  if (body.sortOrder != null && body.sortOrder !== '') {
    sortOrder = Number(body.sortOrder)
  } else if (existing) {
    sortOrder = Number(existing.sort_order || 0)
  } else {
    const maxRow = d
      .prepare(`SELECT MAX(sort_order) AS m FROM product WHERE kind=? OR (IFNULL(kind,'')='' AND category=?)`)
      .get(kind, category)
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
        category,
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
        category,
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
  db().prepare('DELETE FROM product WHERE id=?').run(id)
  try {
    publishMallLive()
  } catch (e) {
    console.warn('[admin] publishMallLive after delete failed:', e.message)
  }
  return { ok: true }
}

/**
 * 同 kind 内上移/下移，重写 sort_order 后同步小程序商城顺序。
 * direction: 'up' | 'down'
 */
function moveProductSort(id, direction = 'up') {
  const d = db()
  const cur = d.prepare('SELECT * FROM product WHERE id=?').get(id)
  if (!cur) return { ok: false, msg: '商品不存在' }
  let kind = cur.kind || ''
  if (!kind) {
    if (cur.category === '兑礼') kind = 'gift'
    else if (cur.category === '种子') kind = 'seed'
    else if (cur.category === '虚拟') kind = 'virtual'
    else kind = 'mall'
  }
  const list = d
    .prepare(
      `SELECT id, sort_order FROM product
       WHERE kind=? OR (IFNULL(kind,'')='' AND category=?)
       ORDER BY sort_order, id`
    )
    .all(kind, cur.category || '推荐')
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

/** 商城列表项（小程序/壳层共用；图片一律 /uploads/...） */
function buildMallCatalogItems() {
  return db()
    .prepare(
      `SELECT id, name, category, price_cent, points_off, stock, image_url, tag, status, sort_order, meta_json
       FROM product WHERE status='on' AND category!='兑礼' ORDER BY sort_order, id`
    )
    .all()
    .map((p) => {
      const mapped = mapProductClient(p)
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
function listLottery() {
  seedIfEmpty()
  try {
    require('./skuService').migrateKinds()
    require('./lotteryService').ensureSchema()
  } catch (_) {}
  const rows = db().prepare(`SELECT * FROM lottery_prize ORDER BY sort_order, id`).all()
  const totalW = rows.filter((r) => r.status === 'on').reduce((s, p) => s + Math.max(0, p.weight), 0) || 1
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
    return {
      ...p,
      name: skuName || p.name,
      image_url: skuImage || p.image_url,
      skuName,
      skuCostCent: skuCost,
      product: offer,
      rarity: p.rarity || 'N',
      pool_id: p.pool_id || 'default',
      probability: p.status === 'on' ? Math.round((p.weight / totalW) * 10000) / 10000 : 0,
    }
  })
}

function upsertLottery(body) {
  try {
    require('./lotteryService').ensureSchema()
  } catch (_) {}
  const d = db()
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少 id' }
  const t = now()
  const prizeType = body.prizeType || 'coin'
  const productId = String(body.productId || body.skuId || '').trim()
  const needsSku = prizeType === 'physical' || prizeType === 'seed'
  if (needsSku && !productId) {
    return { ok: false, msg: '实物/种子奖项必须绑定物料中心 SKU' }
  }
  // 展示名/图一律以物料为准，禁止渠道再录一份
  let name = body.name || id
  let imageUrl = ''
  if (productId) {
    const sku = d.prepare(`SELECT id, name, image_url, stock, status FROM product WHERE id=?`).get(productId)
    if (!sku) return { ok: false, msg: `物料不存在：${productId}` }
    name = sku.name || id
    imageUrl = sku.image_url || ''
    const channelStock = Number(body.stock != null ? body.stock : -1)
    if (channelStock > 0 && Number(sku.stock || 0) < channelStock) {
      // 强提示但不硬拦：渠道配额可大于仓库时运营自担；返回 ok 仍保存
    }
  }
  const exists = d.prepare('SELECT id FROM lottery_prize WHERE id=?').get(id)
  const rarity = body.rarity || (prizeType === 'physical' ? 'SSR' : prizeType === 'seed' ? 'SR' : 'N')
  const poolId = body.poolId || body.pool_id || 'default'
  const args = [
    name,
    prizeType,
    Number(body.prizeValue || 0),
    productId,
    Math.max(0, Number(body.weight != null ? body.weight : 1)),
    Number(body.stock != null ? body.stock : -1),
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
  return { ok: true, item: d.prepare('SELECT * FROM lottery_prize WHERE id=?').get(id) }
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
      weight: p.weight,
      probability: p.probability,
      stock: p.stock,
      imageUrl: p.image_url,
    }))
  if (!draft.catalog) draft.catalog = {}
  draft.catalog.lottery = draft.game.lottery
  configService.saveDraft(draft)
}

function drawLottery(userId, opts = {}) {
  seedIfEmpty()
  ensureLotterySeedPrizes()
  return require('./lotteryService').draw(userId, opts)
}

/* ——— 任务 ——— */
function listTasks() {
  seedIfEmpty()
  return db().prepare(`SELECT * FROM task_def ORDER BY sort_order, id`).all()
}

function upsertTask(body) {
  const d = db()
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少 id' }
  const t = now()
  const exists = d.prepare('SELECT id FROM task_def WHERE id=?').get(id)
  const args = [
    body.title || id,
    body.actionKey || body.action || '',
    body.rewardDesc || '',
    Number(body.rewardEnergy || 0),
    Number(body.rewardCoins || 0),
    Number(body.dailyLimit != null ? body.dailyLimit : 1),
    body.status || 'on',
    Number(body.sortOrder || 0),
    t,
  ]
  if (exists) {
    d.prepare(
      `UPDATE task_def SET title=?, action_key=?, reward_desc=?, reward_energy=?, reward_coins=?, daily_limit=?, status=?, sort_order=?, updated_at=? WHERE id=?`
    ).run(...args, id)
  } else {
    d.prepare(
      `INSERT INTO task_def (id,title,action_key,reward_desc,reward_energy,reward_coins,daily_limit,status,sort_order,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(id, ...args)
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
  draft.catalog.tasks = listTasks()
    .filter((t) => t.status === 'on')
    .map((t) => ({
      id: t.id,
      title: t.title,
      action: t.action_key,
      reward: t.reward_desc,
      rewardEnergy: t.reward_energy,
      rewardCoins: t.reward_coins,
      dailyLimit: t.daily_limit,
    }))
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
  const d = db()
  const task = d.prepare(`SELECT * FROM task_def WHERE id=? AND status='on'`).get(taskId)
  if (!task) return { ok: false, msg: '任务不存在' }
  const dk = dayKey()
  const done = d
    .prepare(`SELECT COUNT(*) AS n FROM task_completion WHERE user_id=? AND task_id=? AND day_key=?`)
    .get(userId, taskId, dk).n
  if (done >= task.daily_limit) return { ok: false, msg: '今日已完成' }
  const addEnergy = Number(task.reward_energy || 0) + Number(task.reward_coins || 0)
  const reward = { energy: addEnergy }
  const tx = d.transaction(() => {
    d.prepare(
      `INSERT INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at) VALUES (?,?,?,'done',?,?)`
    ).run(userId, taskId, dk, JSON.stringify(reward), now())
    if (addEnergy > 0) {
      require('./currencyService').grantEnergy(userId, addEnergy, { note: `task:${taskId}` })
    }
  })
  tx()
  return { ok: true, reward, wallet: require('./currencyService').getWallet(userId) }
}

/* ——— 兑换 ——— */
function listRedeems({ status = '', page = 1, pageSize = 30 } = {}) {
  seedIfEmpty()
  const d = db()
  const where = status ? 'WHERE r.status=?' : ''
  const args = status ? [status] : []
  const total = d.prepare(`SELECT COUNT(*) AS n FROM redeem_order r ${where}`).get(...args).n
  const offset = (Math.max(1, page) - 1) * pageSize
  const list = d
    .prepare(
      `SELECT r.*, u.nick_name, u.platform
       FROM redeem_order r
       LEFT JOIN user_account u ON u.id=r.user_id
       ${where}
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
}) {
  seedIfEmpty()
  const d = db()
  const prod = productId ? d.prepare('SELECT * FROM product WHERE id=?').get(productId) : null
  if (productId && !prod) return { ok: false, msg: '商品不存在' }
  if (prod && prod.stock < qty) return { ok: false, msg: '库存不足' }
  const cost = prod ? prod.cost_cent * qty : 0
  const ono = orderNo(orderType === 'mall' ? 'M' : 'G')
  const tx = d.transaction(() => {
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
      JSON.stringify(address || {}),
      now(),
      now()
    )
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

function listFinance({ entryType = '', from = '', to = '', page = 1, pageSize = 50 } = {}) {
  seedIfEmpty()
  const d = db()
  const where = []
  const args = []
  if (entryType) {
    where.push('entry_type=?')
    args.push(entryType)
  }
  if (from) {
    where.push('day_key>=?')
    args.push(from)
  }
  if (to) {
    where.push('day_key<=?')
    args.push(to)
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = d.prepare(`SELECT COUNT(*) AS n FROM finance_ledger ${w}`).get(...args).n
  const offset = (Math.max(1, page) - 1) * pageSize
  const list = d
    .prepare(`SELECT * FROM finance_ledger ${w} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, pageSize, offset)
  return { total, page: Number(page), pageSize, list }
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
  const d = db()
  const periods = ['day', 'week', 'month'].map((period) => {
    const r = rangeKeys(period)
    const revenue = sumFinance(r.from, r.to, 'revenue')
    const cost = sumFinance(r.from, r.to, 'cost')
    return {
      period,
      label: r.label,
      from: r.from,
      to: r.to,
      revenueCent: revenue,
      costCent: cost,
      revenueYuan: centToYuan(revenue),
      costYuan: centToYuan(cost),
      marginYuan: centToYuan(revenue - cost),
    }
  })

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
  updateUser,
  listProducts,
  moveProductSort,
  upsertProduct,
  deleteProduct,
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
  statsOverview,
  dayKey,
  centToYuan,
  yuanToCent,
}
