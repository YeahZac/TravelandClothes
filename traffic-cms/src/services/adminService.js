/**
 * 运营后台：用户 / 商品 / 抽奖 / 任务 / 兑换 / 图标 / 财务统计
 * 与前端 bootstrap 互通：catalog 块由本服务组装。
 */
const dbMod = require('../db')
const configService = require('./configService')
const mediaUrl = require('../mediaUrl')
const { chinaDayKey, formatChinaDateTime } = require('./chinaDay')

function db() {
  return dbMod.open()
}

function now() {
  return dbMod.nowIso()
}

/** 上海时区各字段（云托管机器常为 UTC，day/展示必须以东八区为准） */
function shanghaiParts(input = new Date()) {
  const x = typeof input === 'string' ? new Date(input) : input instanceof Date ? input : new Date()
  if (Number.isNaN(x.getTime())) {
    return { year: '1970', month: '01', day: '01', hour: '00', minute: '00', second: '00', ms: '000' }
  }
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const map = {}
  fmt.formatToParts(x).forEach((p) => {
    if (p.type !== 'literal') map[p.type] = p.value
  })
  let hour = map.hour || '00'
  if (hour === '24') hour = '00'
  return {
    year: map.year || '1970',
    month: map.month || '01',
    day: map.day || '01',
    hour,
    minute: map.minute || '00',
    second: map.second || '00',
    ms: String(x.getMilliseconds()).padStart(3, '0'),
  }
}

function dayKey(d = new Date()) {
  return chinaDayKey(d)
}

/** 东八区本地时间，精确到毫秒：2026-11-15 17:42:05.123 */
function nowLocalMs(d = new Date()) {
  const p = shanghaiParts(d)
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}.${p.ms}`
}

/** 流水展示用：UTC ISO / 本地串 → 东八区毫秒 */
function formatFinanceTime(v) {
  if (!v) return ''
  const s = String(v).trim()
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(s)) {
    // 已是本地无 Z：补毫秒后直接展示
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) && !s.includes('T')) {
      if (/\.\d{1,3}$/.test(s)) return s.slice(0, 23)
      return `${s.slice(0, 19)}.000`
    }
  }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) {
    const bare = s.replace('T', ' ').replace(/Z$/, '')
    if (/\.\d{1,3}/.test(bare)) return bare.slice(0, 23)
    return `${bare.slice(0, 19)}.000`
  }
  return nowLocalMs(d)
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
let _userColsReady = false

function markUserColumnsReady() {
  _userColsReady = true
}

function orderNo(prefix = 'R') {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 900 + 100)}`
}

/**
 * 库表引导：永不自动灌演示商品（m1–m4 / 配置回灌等）。
 * 商品一律由运营在后台新增；此处只做列修复与脏图清理。
 */
function markSeedDone() {
  _seedDone = true
}

function seedIfEmpty() {
  if (_seedDone) return
  // 先占坑：超时后若不清位，每个请求重入 ensureUserColumns 会把连接池打爆
  _seedDone = true
  let d
  try {
    d = db()
    ensureUserColumns()
  } catch (e) {
    console.warn('[seed] ensureUserColumns', e && e.message)
    return
  }
  let prodN = 0
  try {
    prodN = d.prepare('SELECT COUNT(*) AS n FROM product').get().n
  } catch (e) {
    console.warn('[seed] product count', e && e.message)
    return
  }
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
  try {
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
  } catch (e) {
    console.warn('[seed] lottery', e && e.message)
  }

  try {
    const taskN = d.prepare('SELECT COUNT(*) AS n FROM task_def').get().n
    if (!taskN) {
      const t = now()
      const ins = d.prepare(
        `INSERT INTO task_def (id,title,action_key,reward_desc,reward_energy,reward_coins,daily_limit,target_count,status,sort_order,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      )
      ;[
        ['invite', '邀请好友', 'invite', '能量+30', 30, 0, 1, 3, 'on', 0],
        ['mall_pay', '商城下单', 'mall_pay', '能量+20', 20, 0, 1, 1, 'on', 1],
        ['mall_spend', '商城消费', 'mall_spend', '能量+30', 30, 0, 1, 100, 'on', 2],
        ['lottery', '今日抽奖', 'lottery', '能量+15', 15, 0, 1, 1, 'on', 3],
        ['share', '分享给好友', 'share', '能量+10', 10, 0, 1, 1, 'on', 4],
        ['browse_mall', '逛商城', 'browse_mall', '能量+5', 5, 0, 1, 1, 'on', 5],
      ].forEach((r) => ins.run(...r, t))
    } else {
      // 旧库：关闭签到/步数/广告等重复领奖任务（不删数据，仅不下发到任务列表）
      try {
        d.prepare(
          `UPDATE task_def SET status='off', updated_at=?
           WHERE action_key IN ('checkin','steps','ad') OR id IN ('checkin','steps','ad','t_checkin','t_steps')`
        ).run(now())
      } catch (_) {}
      try {
        d.prepare(
          `UPDATE task_def SET action_key='browse_mall', updated_at=?
           WHERE action_key IN ('mall','browse') AND status='on'`
        ).run(now())
        d.prepare(
          `UPDATE task_def SET action_key='browse_festival', updated_at=?
           WHERE action_key='festival' AND status='on'`
        ).run(now())
      } catch (_) {}
    }
  } catch (e) {
    console.warn('[seed] task_def', e && e.message)
  }

  try {
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
  } catch (e) {
    console.warn('[seed] icon_asset', e && e.message)
  }
  try {
    require('./skuService').migrateKinds()
    require('./lotteryService').ensureSchema()
  } catch (e) {
    console.warn('[seed] sku/lottery schema', e.message)
  }
}

function ensureUserColumns() {
  if (_userColsReady) return
  // MySQL：列由 openAsync.ensureUserAccountColumnsAsync 补齐；禁止热路径 deasync
  if (dbMod.DIALECT === 'mysql') {
    _userColsReady = true
    return
  }
  const d = db()
  const add = dbMod.addColumnIfMissing
  add(d, 'user_account', 'status', `VARCHAR(16) NOT NULL DEFAULT 'active'`, `TEXT NOT NULL DEFAULT 'active'`)
  add(d, 'user_account', 'remark', `VARCHAR(255) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'user_account', 'session_key', `VARCHAR(128) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'user_account', 'inviter_id', `INT NULL`, `INTEGER`)
  ensureProductMetaCapacity()
  _userColsReady = true
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
  // 种子仅 boot / 后台一次；热路径禁止 seed 风暴
  if (dbMod.DIALECT !== 'mysql') {
    try {
      seedIfEmpty()
    } catch (_) {}
  }
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
    tasks = require('./taskService').listClientDefs()
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

/** C 端 catalog 短缓存：商城列表反复进 tab 不必每次打齐 5 组 SQL */
let _catalogMem = { at: 0, data: null }
const CATALOG_TTL_MS = Math.max(5000, Number(process.env.CATALOG_CACHE_TTL_MS || 20000))

function invalidateCatalogCache() {
  _catalogMem = { at: 0, data: null }
}

/** C 端 /catalog：纯 queryAsync，禁止 deasync / SyncGate */
async function catalogForClientAsync(_baseUrl) {
  const now = Date.now()
  if (_catalogMem.data && now - _catalogMem.at < CATALOG_TTL_MS) return _catalogMem.data
  // 熔断时吐最多 2 分钟内的旧货架，避免再齐刷 5 组 SQL
  try {
    if (
      typeof dbMod.isCircuitOpen === 'function' &&
      dbMod.isCircuitOpen() &&
      _catalogMem.data &&
      now - _catalogMem.at < 120000
    ) {
      return _catalogMem.data
    }
  } catch (_) {}

  const listingService = require('./listingService')
  const offerService = require('./offerService')

  let mallOffers
  let giftOffers
  let prizePack
  let taskPack
  let iconPack
  try {
    ;[mallOffers, giftOffers, prizePack, taskPack, iconPack] = await Promise.all([
      listingService.listMallCatalogAsync().catch((e) => {
        console.warn('[catalog] mall', e && e.message)
        return []
      }),
      listingService.listGiftCatalogAsync().catch((e) => {
        console.warn('[catalog] gifts', e && e.message)
        return []
      }),
      dbMod
        .queryAsync(
          `SELECT id, name, prize_type, prize_value, product_id, stock, image_url
         FROM lottery_prize WHERE status='on' ORDER BY sort_order, id`
        )
        .catch((e) => {
          console.warn('[catalog] lottery', e && e.message)
          return [[]]
        }),
      dbMod
        .queryAsync(
          `SELECT id, title, action_key, reward_desc, reward_energy, reward_coins, daily_limit, sort_order
         FROM task_def WHERE status='on' ORDER BY sort_order, id`
        )
        .catch((e) => {
          console.warn('[catalog] tasks', e && e.message)
          return [[]]
        }),
      dbMod.queryAsync(`SELECT id, path FROM icon_asset`).catch(() => [[]]),
    ])
  } catch (e) {
    if (_catalogMem.data && Date.now() - _catalogMem.at < 120000) return _catalogMem.data
    throw e
  }

  const products = (mallOffers || []).map((o) => listingService.mapMallClient(o))
  const gifts = (giftOffers || []).map((o) => listingService.mapGiftClient(o))

  const prizeRows = (prizePack && prizePack[0]) || []
  const productIds = [
    ...new Set(prizeRows.map((p) => String(p.product_id || '').trim()).filter(Boolean)),
  ]
  const offerById = {}
  if (productIds.length) {
    const placeholders = productIds.map(() => '?').join(',')
    try {
      const [prodRows] = await dbMod.queryAsync(
        `SELECT * FROM product WHERE id IN (${placeholders})`,
        productIds
      )
      ;(prodRows || []).forEach((row) => {
        offerById[row.id] = offerService.mapOfferRow(row)
      })
    } catch (e) {
      console.warn('[catalog] prize products', e && e.message)
    }
  }

  const lottery = prizeRows.map((p) => {
    let payHint = '抽中即得'
    let payMode = 'free'
    let payLabel = '抽中即得'
    let product = null
    let displayName = p.name
    let imageUrl = ''
    if (p.product_id && offerById[p.product_id]) {
      product = offerById[p.product_id]
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
    const taskService = require('./taskService')
    const rawTasks = ((taskPack && taskPack[0]) || []).map((t) => ({
      id: t.id,
      title: t.title,
      action: t.action_key,
      reward: t.reward_desc,
      rewardEnergy: t.reward_energy,
      rewardCoins: t.reward_coins,
      dailyLimit: t.daily_limit,
    }))
    // 与 listClientDefs 过滤对齐：有 normalize 则用，否则原样
    if (typeof taskService.filterClientDefs === 'function') {
      tasks = taskService.filterClientDefs(rawTasks)
    } else {
      tasks = rawTasks
    }
  } catch (_) {
    tasks = ((taskPack && taskPack[0]) || []).map((t) => ({
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
  ;((iconPack && iconPack[0]) || []).forEach((r) => {
    const path = String(r.path || '')
    if (path.startsWith('/static/')) return
    const client = mediaUrl.clientMediaPath(path)
    if (client && /^\/uploads\/qmyx\/[^/]+\.(png|jpe?g|webp|gif)$/i.test(client)) return
    if (client) icons[r.id] = client
  })

  const payload = { products, lottery, tasks, icons, gifts }
  _catalogMem = { at: Date.now(), data: payload }
  return payload
}

/* ——— 用户 ——— */
/** 演示/开发假号：不进默认用户管理列表 */
function isNonRealOpenid(openid) {
  const s = String(openid || '').trim()
  if (!s) return true
  if (s === 'demo_openid') return true
  if (s.startsWith('demo_') || s.startsWith('demo_friend_') || s.startsWith('dev_')) return true
  return false
}

function buildUserListFilter({ q = '', status = '', realOnly = true } = {}) {
  const where = []
  const args = []
  // 默认只展示真实微信注册用户（有稳定 openid，非 demo/dev）
  if (realOnly !== false && realOnly !== '0' && realOnly !== 0) {
    where.push(
      `(u.openid IS NOT NULL AND TRIM(u.openid) <> ''
        AND u.openid NOT LIKE 'demo_%'
        AND u.openid NOT LIKE 'dev_%'
        AND IFNULL(u.channel,'') <> 'demo')`
    )
  }
  if (q) {
    const like = `%${q}%`
    if (/^\d+$/.test(String(q).trim())) {
      where.push(`(u.id = ? OR u.nick_name LIKE ? OR u.openid LIKE ? OR u.invite_code LIKE ?)`)
      args.push(Number(q), like, like, like)
    } else {
      where.push(`(u.nick_name LIKE ? OR u.openid LIKE ? OR u.invite_code LIKE ?)`)
      args.push(like, like, like)
    }
  }
  if (status) {
    where.push(`u.status = ?`)
    args.push(status)
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  return { where, args, w }
}

function displayNick(nick) {
  const s = String(nick || '').trim()
  if (!s || s === '微信用户' || s === '优享用户' || s === '本地用户' || s === '游客' || s === '点击登录') {
    return ''
  }
  return s
}

function mapUserListRow(u) {
  const nick = displayNick(u.nick_name)
  const gender = String(u.gender || '').trim()
  return {
    ...u,
    nickName: nick || '未设置昵称',
    nick_name: nick || '',
    avatarUrl: mediaUrl.adminDisplayUrl(u.avatar_url) || '',
    avatar_url: u.avatar_url || '',
    gender,
    genderLabel:
      !gender || gender === '0' || gender === 'unknown'
        ? '未设置'
        : gender === '1' || gender === 'male' || gender === '男'
          ? '男'
          : gender === '2' || gender === 'female' || gender === '女'
            ? '女'
            : gender === '3' || gender === 'private' || gender === '保密'
              ? '保密'
              : gender,
    registeredAt: formatChinaDateTime(u.created_at) || u.created_at || '',
    created_at: u.created_at || '',
    activeCount: Number(u.active_count || 0),
    lastActiveAt: formatChinaDateTime(u.last_active_at) || u.last_active_at || '',
    last_active_at: u.last_active_at || '',
    redeemCount: Number(u.redeem_count || 0),
    lotteryCount: Number(u.lottery_count || 0),
    lotteryWinCount: Number(u.lottery_win_count || 0),
    inviteCount: Number(u.invite_count || 0),
    isReal: !isNonRealOpenid(u.openid) && String(u.channel || '') !== 'demo',
  }
}

const USER_LIST_SELECT = `SELECT u.*, w.energy, w.points, w.coins, w.lottery_chance,
        (SELECT COUNT(*) FROM redeem_order r WHERE r.user_id = u.id) AS redeem_count,
        (SELECT COUNT(*) FROM lottery_draw l WHERE l.user_id = u.id) AS lottery_count,
        (SELECT COUNT(*) FROM lottery_draw l
          WHERE l.user_id = u.id
            AND IFNULL(l.prize_type,'') NOT IN ('','empty')
        ) AS lottery_win_count,
        (SELECT COUNT(*) FROM user_account i WHERE i.inviter_id = u.id) AS invite_count
       FROM user_account u
       LEFT JOIN user_wallet w ON w.user_id = u.id`

function clampPageSize(n, fallback = 20, max = 100) {
  const v = Number(n)
  if (!Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(1, Math.floor(v)))
}

function listUsers({ q = '', status = '', page = 1, pageSize = 20, realOnly = true } = {}) {
  seedIfEmpty()
  try {
    require('./authService').ensureUserColumns()
  } catch (_) {}
  const d = db()
  const { args, w } = buildUserListFilter({ q, status, realOnly })
  const ps = clampPageSize(pageSize, 20, 100)
  const pg = Math.max(1, Number(page) || 1)
  const total = d.prepare(`SELECT COUNT(*) AS n FROM user_account u ${w}`).get(...args).n
  const offset = (pg - 1) * ps
  const rows = d
    .prepare(`${USER_LIST_SELECT} ${w} ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`)
    .all(...args, ps, offset)
  return { total, page: pg, pageSize: ps, list: rows.map(mapUserListRow), realOnly: realOnly !== false }
}

/** 运营台用户列表：纯 async，不占 SyncGate */
async function listUsersAsync({ q = '', status = '', page = 1, pageSize = 20, realOnly = true } = {}) {
  const { args, w } = buildUserListFilter({ q, status, realOnly })
  const ps = clampPageSize(pageSize, 20, 100)
  const pg = Math.max(1, Number(page) || 1)
  const offset = (pg - 1) * ps
  const [[countRows], [rows]] = await Promise.all([
    dbMod.queryAsync(`SELECT COUNT(*) AS n FROM user_account u ${w}`, args),
    dbMod.queryAsync(
      `${USER_LIST_SELECT} ${w} ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`,
      [...args, ps, offset]
    ),
  ])
  const total = Number((countRows && countRows[0] && countRows[0].n) || 0)
  return {
    total,
    page: pg,
    pageSize: ps,
    list: (rows || []).map(mapUserListRow),
    realOnly: realOnly !== false && realOnly !== '0' && realOnly !== 0,
  }
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
  if (patch.wallet || patch.walletDelta) {
    let w = d.prepare('SELECT * FROM user_wallet WHERE user_id=?').get(id)
    if (!w) {
      d.prepare(
        `INSERT INTO user_wallet (user_id, energy, points, coins, lottery_chance, updated_at) VALUES (?,?,?,?,?,?)`
      ).run(id, 0, 0, 0, 0, now())
      w = d.prepare('SELECT * FROM user_wallet WHERE user_id=?').get(id)
    }
    if (w) {
      const deltaIn = patch.walletDelta && patch.walletDelta.energy != null ? Number(patch.walletDelta.energy) : null
      const nextEnergy =
        deltaIn != null && Number.isFinite(deltaIn)
          ? Math.max(0, Number(w.energy || 0) + deltaIn)
          : patch.wallet && patch.wallet.energy != null
            ? Number(patch.wallet.energy)
            : Number(w.energy || 0)
      const delta = nextEnergy - Number(w.energy || 0)
      const wallet = patch.wallet || {}
      d.prepare(
        `UPDATE user_wallet SET energy=?, points=?, coins=?, lottery_chance=?, updated_at=? WHERE user_id=?`
      ).run(
        nextEnergy,
        wallet.points != null ? wallet.points : w.points,
        wallet.coins != null ? wallet.coins : w.coins,
        wallet.lotteryChance != null ? wallet.lotteryChance : w.lottery_chance,
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
  const one = listUsers({ q: String(id), pageSize: 1 })
  const user =
    (one.list || []).find((x) => Number(x.id) === Number(id)) || (one.list && one.list[0]) || null
  return { ok: true, user }
}

/** 运营台改用户 / 加能量：纯 queryAsync，MySQL 禁用 deasync 后必须走这条 */
async function updateUserAsync(id, patch = {}) {
  const uid = Number(id)
  if (!Number.isFinite(uid) || uid <= 0) return { ok: false, msg: '用户不存在' }
  const [accRows] = await dbMod.queryAsync(`SELECT * FROM user_account WHERE id=? LIMIT 1`, [uid])
  const u = accRows && accRows[0]
  if (!u) return { ok: false, msg: '用户不存在' }

  const nick = patch.nickName != null ? patch.nickName : u.nick_name
  const status = patch.status != null ? patch.status : u.status
  const remark = patch.remark != null ? patch.remark : u.remark
  const t = now()
  await dbMod.queryAsync(
    `UPDATE user_account SET nick_name=?, status=?, remark=?, updated_at=? WHERE id=?`,
    [nick, status, remark, t, uid]
  )

  if (patch.riskFlag != null || patch.risk_flag != null) {
    const flag = patch.riskFlag != null ? patch.riskFlag : patch.risk_flag
    try {
      await dbMod.queryAsync(
        `UPDATE user_account SET risk_flag=?, updated_at=? WHERE id=?`,
        [flag ? 1 : 0, t, uid]
      )
    } catch (_) {
      try {
        await dbMod.queryAsync(
          `INSERT INTO lottery_user_risk (user_id, risk_flag, updated_at) VALUES (?,?,?)
           ON DUPLICATE KEY UPDATE risk_flag=VALUES(risk_flag), updated_at=VALUES(updated_at)`,
          [uid, flag ? 1 : 0, t]
        )
      } catch (__) {}
    }
  }

  if (patch.wallet || patch.walletDelta) {
    const currency = require('./currencyService')
    let [wRows] = await dbMod.queryAsync(`SELECT * FROM user_wallet WHERE user_id=? LIMIT 1`, [uid])
    let w = wRows && wRows[0]
    if (!w) {
      await dbMod.queryAsync(
        `INSERT INTO user_wallet (user_id, energy, points, coins, lottery_chance, updated_at) VALUES (?,?,?,?,?,?)`,
        [uid, 0, 0, 0, 0, t]
      )
      ;[wRows] = await dbMod.queryAsync(`SELECT * FROM user_wallet WHERE user_id=? LIMIT 1`, [uid])
      w = wRows && wRows[0]
    }
    if (w) {
      const deltaIn =
        patch.walletDelta && patch.walletDelta.energy != null
          ? Number(patch.walletDelta.energy)
          : null
      const note =
        patch.walletNote ||
        patch.note ||
        (deltaIn != null && deltaIn >= 0 ? 'admin_grant' : 'admin_deduct')
      if (deltaIn != null && Number.isFinite(deltaIn) && deltaIn !== 0) {
        if (deltaIn > 0) {
          await currency.grantEnergyAsync(uid, deltaIn, {
            note,
            refType: 'admin',
            refId: String(uid),
          })
        } else {
          await currency.spendEnergyAsync(uid, Math.abs(deltaIn), {
            note,
            refType: 'admin',
            refId: String(uid),
          })
        }
      } else if (patch.wallet && patch.wallet.energy != null) {
        const nextEnergy = Math.max(0, Number(patch.wallet.energy) || 0)
        const prev = Number(w.energy || 0)
        const delta = nextEnergy - prev
        const wallet = patch.wallet || {}
        await dbMod.queryAsync(
          `UPDATE user_wallet SET energy=?, points=?, coins=?, lottery_chance=?, updated_at=? WHERE user_id=?`,
          [
            nextEnergy,
            wallet.points != null ? wallet.points : w.points,
            wallet.coins != null ? wallet.coins : w.coins,
            wallet.lotteryChance != null ? wallet.lotteryChance : w.lottery_chance,
            t,
            uid,
          ]
        )
        if (delta) {
          try {
            await dbMod.queryAsync(
              `INSERT INTO wallet_ledger (user_id, delta, balance_after, direction, note, ref_type, ref_id, created_at)
               VALUES (?,?,?,?,?,?,?,?)`,
              [
                uid,
                delta,
                nextEnergy,
                delta >= 0 ? 'in' : 'out',
                String(note).slice(0, 191),
                'admin',
                String(uid),
                t,
              ]
            )
          } catch (_) {}
        }
      } else {
        const wallet = patch.wallet || {}
        if (
          wallet.points != null ||
          wallet.coins != null ||
          wallet.lotteryChance != null
        ) {
          await dbMod.queryAsync(
            `UPDATE user_wallet SET points=?, coins=?, lottery_chance=?, updated_at=? WHERE user_id=?`,
            [
              wallet.points != null ? wallet.points : w.points,
              wallet.coins != null ? wallet.coins : w.coins,
              wallet.lotteryChance != null ? wallet.lotteryChance : w.lottery_chance,
              t,
              uid,
            ]
          )
        }
      }
    }
  }

  const one = await listUsersAsync({ q: String(uid), pageSize: 5 })
  const user =
    (one.list || []).find((x) => Number(x.id) === uid) || (one.list && one.list[0]) || null
  return { ok: true, user }
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
        avatarUrl: mediaUrl.adminDisplayUrl(iv.avatar_url) || '',
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
    nickName: String(u.nick_name || '').trim(),
    avatarUrl: mediaUrl.adminDisplayUrl(u.avatar_url) || '',
    openid: u.openid || '',
    platform: u.platform || '',
    gender: String(u.gender || '').trim(),
    province: u.province || '',
    city: u.city || '',
    district: u.district || '',
    inviteCode: u.invite_code || '',
    channel: u.channel || '',
    status: u.status || 'active',
    remark: u.remark || '',
    registeredAt: formatChinaDateTime(u.created_at) || u.created_at || '',
    lastActiveAt: formatChinaDateTime(u.last_active_at) || u.last_active_at || '',
    activeCount: Number(u.active_count || 0),
    updatedAt: formatChinaDateTime(u.updated_at) || u.updated_at || '',
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
        nickName: String(x.nick_name || '').trim(),
        avatarUrl: mediaUrl.adminDisplayUrl(x.avatar_url) || '',
        inviteCode: x.invite_code || '',
        channel: x.channel || '',
        registeredAt: formatChinaDateTime(x.created_at) || x.created_at || '',
        lastActiveAt: formatChinaDateTime(x.last_active_at) || x.last_active_at || '',
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
function mapProductRow(p) {
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
}

function listProducts(baseUrl) {
  seedIfEmpty()
  try {
    require('./skuService').migrateKinds()
  } catch (_) {}
  return db()
    .prepare(`SELECT * FROM product ORDER BY sort_order, id`)
    .all()
    .map(mapProductRow)
}

/** 运营台热读：queryAsync，不占 SyncGate */
async function listProductsAsync() {
  if (!_seedDone) {
    try {
      await dbMod.runSync(() => seedIfEmpty())
    } catch (e) {
      if (!(e && e.code === 'DB_BUSY')) console.warn('[admin] seedIfEmpty', e && e.message)
    }
  }
  const [rows] = await dbMod.queryAsync(`SELECT * FROM product ORDER BY sort_order, id`)
  return (rows || []).map(mapProductRow)
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

function mapLotteryRows(rows, globalWinRate) {
  const winRows = rows.filter(
    (r) => r.status === 'on' && r.prize_type !== 'empty' && Math.max(0, Number(r.weight) || 0) > 0
  )
  const totalW = winRows.reduce((s, p) => s + Math.max(0, Number(p.weight) || 0), 0) || 1
  return rows.map((p) => {
    let skuName = p.product_name || ''
    let skuImage = mediaUrl.clientMediaPath(p.product_image_url) || ''
    let skuCost = Number(p.product_cost_cent) || 0
    let offer = null
    if (p.product_id && !skuName) {
      try {
        offer = require('./offerService').resolveOffer(p.product_id)
        skuName = offer.name
        skuImage = offer.imageUrl
        skuCost = offer.costCent
      } catch (_) {}
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
  const rows = db()
    .prepare(
      `SELECT lp.*, p.name AS product_name, p.image_url AS product_image_url, p.cost_cent AS product_cost_cent
       FROM lottery_prize lp
       LEFT JOIN product p ON p.id=lp.product_id
       ORDER BY lp.sort_order, lp.id`
    )
    .all()
  return mapLotteryRows(rows, globalWinRate)
}

/** 运营台热读：JOIN 物料，禁止 per-row resolveOffer */
async function listLotteryAsync() {
  let globalWinRate = 30
  try {
    const ops = await require('./opsService').getOpsAsync()
    globalWinRate = Number((ops.lotteryPage && ops.lotteryPage.globalWinRate) || 30)
  } catch (_) {}
  const [rows] = await dbMod.queryAsync(
    `SELECT lp.*, p.name AS product_name, p.image_url AS product_image_url, p.cost_cent AS product_cost_cent
     FROM lottery_prize lp
     LEFT JOIN product p ON p.id=lp.product_id
     ORDER BY lp.sort_order, lp.id`
  )
  return mapLotteryRows(rows || [], globalWinRate)
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

async function listTasksAsync() {
  if (!_seedDone) {
    try {
      await dbMod.runSync(() => seedIfEmpty())
    } catch (e) {
      if (!(e && e.code === 'DB_BUSY')) console.warn('[admin] seedIfEmpty', e && e.message)
    }
  }
  const [rows] = await dbMod.queryAsync(`SELECT * FROM task_def ORDER BY sort_order, id`)
  return rows || []
}

function upsertTask(body) {
  const d = db()
  const taskSvc = require('./taskService')
  taskSvc.ensureSchema()
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少 id' }
  const actionRaw = body.actionKey || body.action || ''
  const actionOk = taskSvc.assertBuiltinAction(actionRaw)
  if (!actionOk.ok) return actionOk
  const actionKey = actionOk.key
  const t = now()
  const extra = taskSvc.ensureTaskColumnsOnUpsert(body)
  const energy = Number(body.rewardEnergy || 0)
  const coins = Number(body.rewardCoins || 0)
  const giftId = extra.rewardGiftId
  const rewardDesc =
    body.rewardDesc ||
    taskSvc.autoRewardDesc(energy, coins, giftId, taskSvc.giftName(giftId))
  const exists = d.prepare('SELECT id FROM task_def WHERE id=?').get(id)
  const dailyLimit = Math.max(1, Number(body.dailyLimit != null ? body.dailyLimit : 1) || 1)
  // 当日可统计类型：target_count 即进度目标（次数/人数/分），隔日清零
  const targetCount = Math.max(1, Number(extra.targetCount) || dailyLimit)
  if (exists) {
    d.prepare(
      `UPDATE task_def SET title=?, action_key=?, reward_desc=?, reward_energy=?, reward_coins=?, daily_limit=?,
       status=?, sort_order=?, target_count=?, reward_gift_id=?, desc_text=?, updated_at=? WHERE id=?`
    ).run(
      body.title || id,
      actionKey,
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
      actionKey,
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
  return { ok: true, actionKey, targetCount }
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
    items = require('./taskService').listClientDefs()
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
        rewardCoins: t.rewardCoins || 0,
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
  const ps = clampPageSize(pageSize, 50, 100)
  const pg = Math.max(1, Number(page) || 1)
  const total = d.prepare(`SELECT COUNT(*) AS n FROM task_completion c ${w}`).get(...args).n
  const offset = (pg - 1) * ps
  const list = d
    .prepare(
      `SELECT c.*, u.nick_name, u.platform, t.title AS task_title
       FROM task_completion c
       LEFT JOIN user_account u ON u.id=c.user_id
       LEFT JOIN task_def t ON t.id=c.task_id
       ${w}
       ORDER BY c.id DESC LIMIT ? OFFSET ?`
    )
    .all(...args, ps, offset)
  const summary = d
    .prepare(
      `SELECT task_id, COUNT(*) AS cnt FROM task_completion
       ${day ? 'WHERE day_key=?' : ''}
       GROUP BY task_id`
    )
    .all(...(day ? [day] : []))
  return { total, page: pg, pageSize: ps, list, summary, day: day || dayKey() }
}

/** async：任务完成报表禁止 SyncGate COUNT */
async function listTaskCompletionsAsync({ day = '', taskId = '', page = 1, pageSize = 50 } = {}) {
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
  const ps = clampPageSize(pageSize, 50, 100)
  const pg = Math.max(1, Number(page) || 1)
  const offset = (pg - 1) * ps
  const [[countRows], [list], [summary]] = await Promise.all([
    dbMod.queryAsync(`SELECT COUNT(*) AS n FROM task_completion c ${w}`, args),
    dbMod.queryAsync(
      `SELECT c.*, u.nick_name, u.platform, t.title AS task_title
       FROM task_completion c
       LEFT JOIN user_account u ON u.id=c.user_id
       LEFT JOIN task_def t ON t.id=c.task_id
       ${w}
       ORDER BY c.id DESC LIMIT ? OFFSET ?`,
      [...args, ps, offset]
    ),
    dbMod.queryAsync(
      `SELECT task_id, COUNT(*) AS cnt FROM task_completion
       ${day ? 'WHERE day_key=?' : ''}
       GROUP BY task_id`,
      day ? [day] : []
    ),
  ])
  const total = Number((countRows && countRows[0] && countRows[0].n) || 0)
  return {
    total,
    page: pg,
    pageSize: ps,
    list: list || [],
    summary: summary || [],
    day: day || dayKey(),
  }
}
function completeTask(userId, taskId) {
  seedIfEmpty()
  return require('./taskService').complete(userId, taskId)
}

/* ——— 兑换 ——— */
function listRedeems({ status = '', orderType = '', page = 1, pageSize = 30 } = {}) {
  seedIfEmpty()
  try {
    ensureOrderAdminColumns()
  } catch (_) {}
  const d = db()
  const where = []
  const args = []
  if (status === 'refunded') {
    where.push(`(r.status='refunded' OR r.refund_status='success')`)
  } else if (status) {
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

async function listRedeemsAsync({ status = '', orderType = '', page = 1, pageSize = 30 } = {}) {
  const where = []
  const args = []
  if (status === 'refunded') {
    where.push(`(r.status='refunded' OR r.refund_status='success')`)
  } else if (status) {
    where.push('r.status=?')
    args.push(status)
  }
  if (orderType) {
    where.push('r.order_type=?')
    args.push(orderType)
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const ps = clampPageSize(pageSize, 30, 100)
  const pg = Math.max(1, Number(page) || 1)
  const offset = (pg - 1) * ps
  const [[countRows], [list]] = await Promise.all([
    dbMod.queryAsync(`SELECT COUNT(*) AS n FROM redeem_order r ${w}`, args),
    dbMod.queryAsync(
      `SELECT r.*, u.nick_name, u.platform
       FROM redeem_order r
       LEFT JOIN user_account u ON u.id=r.user_id
       ${w}
       ORDER BY r.id DESC LIMIT ? OFFSET ?`,
      [...args, ps, offset]
    ),
  ])
  const total = (countRows && countRows[0] && countRows[0].n) || 0
  return { total, page: pg, pageSize: ps, list: list || [] }
}

const ORDER_STATUSES = new Set(['unpaid', 'pending', 'shipped', 'done', 'cancelled', 'refunded'])

function ensureOrderAdminColumns() {
  const d = db()
  const add = dbMod.addColumnIfMissing
  add(d, 'redeem_order', 'pay_status', `VARCHAR(16) NOT NULL DEFAULT 'none'`, `TEXT NOT NULL DEFAULT 'none'`)
  add(d, 'redeem_order', 'refund_status', `VARCHAR(16) NOT NULL DEFAULT 'none'`, `TEXT NOT NULL DEFAULT 'none'`)
  add(d, 'redeem_order', 'refund_cent', `INT NOT NULL DEFAULT 0`, `INTEGER NOT NULL DEFAULT 0`)
  add(d, 'redeem_order', 'wx_refund_id', `VARCHAR(128) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'redeem_order', 'refunded_at', `VARCHAR(40) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'redeem_order', 'carrier', `VARCHAR(64) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'redeem_order', 'tracking_no', `VARCHAR(128) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'redeem_order', 'shipped_at', `VARCHAR(40) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
}

function updateRedeem(id, patch = {}) {
  ensureOrderAdminColumns()
  const d = db()
  const row = d.prepare('SELECT * FROM redeem_order WHERE id=?').get(id)
  if (!row) return { ok: false, msg: '订单不存在' }

  let status = patch.status != null ? String(patch.status) : row.status
  if (!ORDER_STATUSES.has(status)) return { ok: false, msg: '非法订单状态' }

  const carrier = patch.carrier != null ? String(patch.carrier).trim() : row.carrier || ''
  const trackingNo =
    patch.trackingNo != null
      ? String(patch.trackingNo).trim()
      : patch.tracking_no != null
        ? String(patch.tracking_no).trim()
        : row.tracking_no || ''
  let payStatus = patch.payStatus != null ? String(patch.payStatus) : row.pay_status || 'none'
  if (patch.pay_status != null) payStatus = String(patch.pay_status)

  const t = now()
  let shippedAt = row.shipped_at || ''
  if (status === 'shipped' && !shippedAt) shippedAt = t
  if (status === 'unpaid' || status === 'pending' || status === 'cancelled') {
    // 回退到未发货时不必清空历史物流，便于运营再改
  }

  // 标记已退款时同步退款字段（手工记账场景；真实微信退款走 refund API）
  let refundStatus = row.refund_status || 'none'
  let refundCent = Number(row.refund_cent || 0)
  let refundedAt = row.refunded_at || ''
  if (status === 'refunded') {
    refundStatus = 'success'
    if (!refundCent) refundCent = Number(row.pay_cash_cent || 0)
    if (!refundedAt) refundedAt = t
    if (payStatus === 'unpaid' || payStatus === 'none' || !payStatus) payStatus = 'paid'
  }

  // 运营标记「已支付/待发货」时补 pay_status
  if ((status === 'pending' || status === 'shipped' || status === 'done') && Number(row.pay_cash_cent || 0) > 0) {
    if (payStatus !== 'paid' && patch.forcePaid !== false) {
      if (patch.payStatus === undefined && patch.pay_status === undefined) payStatus = 'paid'
    }
  }
  if (status === 'unpaid' && Number(row.pay_cash_cent || 0) > 0) {
    if (patch.payStatus === undefined && patch.pay_status === undefined) payStatus = 'unpaid'
  }

  try {
    d.prepare(
      `UPDATE redeem_order
       SET status=?, pay_status=?, carrier=?, tracking_no=?, shipped_at=?,
           refund_status=?, refund_cent=?, refunded_at=?, updated_at=?
       WHERE id=?`
    ).run(
      status,
      payStatus,
      carrier,
      trackingNo,
      shippedAt,
      refundStatus,
      refundCent,
      refundedAt,
      t,
      id
    )
  } catch (e) {
    // 旧库无退款列时降级
    d.prepare(
      `UPDATE redeem_order SET status=?, pay_status=?, carrier=?, tracking_no=?, shipped_at=?, updated_at=? WHERE id=?`
    ).run(status, payStatus, carrier, trackingNo, shippedAt, t, id)
  }

  // 手工改为已支付时补收入流水
  if (payStatus === 'paid' && Number(row.pay_cash_cent || 0) > 0) {
    try {
      ensureWxPayFinance({ ...row, pay_status: 'paid', paid_at: row.paid_at || t })
    } catch (_) {}
  }
  if (status === 'refunded' && refundCent > 0) {
    try {
      ensureWxRefundFinance(row, refundCent, row.wx_refund_id || `${row.order_no}:manual`)
    } catch (_) {}
  }
  // 运营台手工退款/关单：回退已扣能量（幂等）
  if (status === 'refunded' || status === 'cancelled') {
    try {
      const cur = d.prepare('SELECT * FROM redeem_order WHERE id=?').get(id)
      require('./currencyService').restoreOrderEnergy(cur || row, status === 'refunded' ? 'admin_refund' : 'admin_cancel')
    } catch (e) {
      console.warn('[admin] restore energy', id, e && e.message)
    }
  }
  if (status === 'shipped' || status === 'done') {
    try {
      recordFulfillCost(d.prepare('SELECT * FROM redeem_order WHERE id=?').get(id))
    } catch (_) {}
  }
  if (status === 'shipped' && Number(row.pay_cash_cent || 0) > 0) {
    // 不阻塞运营台；后台异步同步微信发货
    const shipped = d.prepare('SELECT * FROM redeem_order WHERE id=?').get(id)
    Promise.resolve()
      .then(() => require('./wxShippingService').uploadShippingForOrder(shipped))
      .catch((e) => console.warn('[admin] wx shipping', id, e && e.message))
  }

  return { ok: true, order: d.prepare('SELECT * FROM redeem_order WHERE id=?').get(id) }
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
    // 现金单：等微信支付成功后再记收入/履约成本（见 ensureWxPayFinance）
    // 纯积分/零元单：可即时记履约成本
    if (!(payCashCent > 0) && cost > 0) {
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
function addFinance({ entryType, category, amountCent, refType = '', refId = '', note = '', day, createdAt } = {}) {
  if (!amountCent || amountCent <= 0) return null
  const d = db()
  const ts = createdAt ? formatFinanceTime(createdAt) : nowLocalMs()
  const info = d
    .prepare(
      `INSERT INTO finance_ledger (day_key,entry_type,category,amount_cent,ref_type,ref_id,note,created_at)
       VALUES (?,?,?,?,?,?,?,?)`
    )
    .run(day || dayKey(), entryType, category || 'misc', amountCent, refType, refId, note || '', ts)
  return info.lastInsertRowid
}

function resolveWxRevenueCategory(order) {
  const orderType = order.order_type || order.orderType || ''
  const productId = String(order.product_id || order.productId || '')
  if (orderType === 'festival' || productId.startsWith('fest_')) {
    // 禁止再调 getTicket/getOps：支付回调 await 后 deasync 会拖死进程
    return /child/.test(productId) ? 'festival_child' : 'festival_adult'
  }
  if (orderType === 'mall') return 'mall_sale'
  if (orderType === 'gift' || orderType === 'jar') return 'cash_redeem'
  return 'wx_pay'
}

/** 微信支付成功入账（幂等：同订单同类型不重复） */
function ensureWxPayFinance(order) {
  if (!order) return { revenue: false, cost: false }
  const outTradeNo = order.order_no || order.orderNo
  const payCent = Number(order.pay_cash_cent != null ? order.pay_cash_cent : order.payCashCent) || 0
  const name = order.product_name || order.productName || outTradeNo
  const revenueCat = resolveWxRevenueCategory(order)
  const d = db()
  let revenue = false
  const cost = false
  if (payCent > 0) {
    const exists = d
      .prepare(
        `SELECT id FROM finance_ledger WHERE ref_type='order' AND ref_id=? AND entry_type='revenue' AND category IN ('mall_sale','cash_redeem','wx_pay','festival_adult','festival_child') LIMIT 1`
      )
      .get(outTradeNo)
    if (!exists) {
      const paidAt = order.paid_at || order.paidAt || ''
      const catLabel =
        revenueCat === 'festival_adult'
          ? '汉服节成人票'
          : revenueCat === 'festival_child'
            ? '汉服节儿童/学生票'
            : '微信支付'
      addFinance({
        entryType: 'revenue',
        category: revenueCat,
        amountCent: payCent,
        refType: 'order',
        refId: outTradeNo,
        note: `${name} · ${catLabel}`,
        day: paidAt ? dayKey(paidAt) : dayKey(),
        createdAt: paidAt || undefined,
      })
      revenue = true
    }
  }
  return { revenue, cost }
}

/** 履约成本只在发货或完成后入账。汉服节门票不走发货，不记这笔支出。 */
function recordFulfillCost(order) {
  if (!order) return false
  const type = String(order.order_type || order.orderType || '')
  const status = String(order.status || '')
  if (type === 'festival') return false
  if (status !== 'shipped' && status !== 'done') return false
  const outTradeNo = order.order_no || order.orderNo
  const costCent = Number(order.cost_cent != null ? order.cost_cent : order.costCent) || 0
  if (!outTradeNo || costCent <= 0) return false
  const d = db()
  const exists = d
    .prepare(
      `SELECT id FROM finance_ledger WHERE ref_type='order' AND ref_id=? AND entry_type='cost' AND category='gift_cost' LIMIT 1`
    )
    .get(outTradeNo)
  if (exists) return false
  const when = order.shipped_at || order.shippedAt || order.updated_at || ''
  const name = order.product_name || order.productName || outTradeNo
  addFinance({
    entryType: 'cost',
    category: 'gift_cost',
    amountCent: costCent,
    refType: 'order',
    refId: outTradeNo,
    note: `发货履约 ${name}`,
    day: when ? dayKey(when) : dayKey(),
    createdAt: when || undefined,
  })
  return true
}

/** async 入账：支付回调 / 查单路径专用，禁止 deasync */
async function ensureWxPayFinanceAsync(order) {
  if (!order) return { revenue: false, cost: false }
  const outTradeNo = order.order_no || order.orderNo
  const payCent = Number(order.pay_cash_cent != null ? order.pay_cash_cent : order.payCashCent) || 0
  const name = order.product_name || order.productName || outTradeNo
  const revenueCat = resolveWxRevenueCategory(order)
  let revenue = false
  const cost = false
  if (payCent > 0) {
    const [existRows] = await dbMod.queryAsync(
      `SELECT id FROM finance_ledger WHERE ref_type='order' AND ref_id=? AND entry_type='revenue'
       AND category IN ('mall_sale','cash_redeem','wx_pay','festival_adult','festival_child') LIMIT 1`,
      [outTradeNo]
    )
    if (!(existRows && existRows[0])) {
      const paidAt = order.paid_at || order.paidAt || ''
      const catLabel =
        revenueCat === 'festival_adult'
          ? '汉服节成人票'
          : revenueCat === 'festival_child'
            ? '汉服节儿童/学生票'
            : '微信支付'
      const ts = paidAt ? formatFinanceTime(paidAt) : nowLocalMs()
      await dbMod.queryAsync(
        `INSERT INTO finance_ledger (day_key,entry_type,category,amount_cent,ref_type,ref_id,note,created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          paidAt ? dayKey(paidAt) : dayKey(),
          'revenue',
          revenueCat,
          payCent,
          'order',
          outTradeNo,
          `${name} · ${catLabel}`,
          ts,
        ]
      )
      revenue = true
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

/** 清除历史演示灌数（曾导致收入虚高 714 元） */
function purgeDemoFinance() {
  const d = db()
  let removed = 0
  try {
    const info = d
      .prepare(`DELETE FROM finance_ledger WHERE ref_type='seed' OR ref_id='demo'`)
      .run()
    removed = Number(info.changes || 0)
  } catch (e) {
    console.warn('[finance] purgeDemo', e && e.message)
  }
  return removed
}

/**
 * 纠偏：删掉「订单未支付却已记收入/现金履约成本」的脏流水
 * （旧版 createRedeemOrder 会在下单时预记账）
 */
function reconcileFinanceLedger() {
  const d = db()
  let removedRevenue = 0
  let removedCost = 0
  try {
    const revOrphans = d
      .prepare(
        `SELECT f.id FROM finance_ledger f
         WHERE f.entry_type='revenue' AND f.ref_type='order' AND IFNULL(f.ref_id,'')<>''
           AND NOT EXISTS (
             SELECT 1 FROM redeem_order o WHERE o.order_no=f.ref_id AND o.pay_status='paid'
           )`
      )
      .all()
    const del = d.prepare('DELETE FROM finance_ledger WHERE id=?')
    revOrphans.forEach((r) => {
      del.run(r.id)
      removedRevenue += 1
    })
  } catch (e) {
    console.warn('[finance] reconcile revenue', e && e.message)
  }
  try {
    const costOrphans = d
      .prepare(
        `SELECT f.id FROM finance_ledger f
         WHERE f.entry_type='cost' AND f.category='gift_cost' AND f.ref_type='order' AND IFNULL(f.ref_id,'')<>''
           AND NOT EXISTS (
             SELECT 1 FROM redeem_order o
             WHERE o.order_no=f.ref_id
               AND o.status IN ('shipped','done')
               AND IFNULL(o.order_type,'')<>'festival'
           )`
      )
      .all()
    const del = d.prepare('DELETE FROM finance_ledger WHERE id=?')
    costOrphans.forEach((r) => {
      del.run(r.id)
      removedCost += 1
    })
  } catch (e) {
    console.warn('[finance] reconcile cost', e && e.message)
  }
  return { removedRevenue, removedCost }
}

/** 回填：已支付订单漏记的收入/成本；顺带清演示灌数与未支付预记账 */
function backfillWxPayFinance() {
  seedIfEmpty()
  const purgedDemo = purgeDemoFinance()
  const reconciled = reconcileFinanceLedger()
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
    const shipped = d
      .prepare(
        `SELECT * FROM redeem_order
         WHERE status IN ('shipped','done')
           AND IFNULL(order_type,'')<>'festival'
           AND COALESCE(cost_cent,0)>0`
      )
      .all()
    shipped.forEach((row) => {
      if (recordFulfillCost(row)) n += 1
    })
  } catch (e) {
    console.warn('[finance] backfill', e && e.message)
  }
  return {
    ok: true,
    patched: n,
    purgedDemo,
    removedRevenue: reconciled.removedRevenue,
    removedCost: reconciled.removedCost,
  }
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

function mapFinanceListRow(f) {
  const createdAtDisplay = formatFinanceTime(f.created_at)
  return {
    ...f,
    created_at: createdAtDisplay,
    createdAtDisplay,
    amountYuan: centToYuan(f.amount_cent),
    typeLabel:
      f.entry_type === 'revenue' ? '收入' : f.category === 'wx_refund' ? '退款' : '支出',
  }
}

function buildFinancePayload({
  total,
  page,
  pageSize,
  list,
  revenueCent,
  costCent,
  refundCent,
  wxPaidCent,
  wxPaidOrders,
}) {
  const reconcileMeta = { patched: 0, purgedDemo: 0, removedRevenue: 0, removedCost: 0 }
  return {
    total,
    page,
    pageSize,
    list,
    refreshedAt: nowLocalMs(),
    reconcile: reconcileMeta,
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
      wxPaidCent,
      wxPaidYuan: centToYuan(wxPaidCent),
      wxPaidOrders,
      mismatch: Number(revenueCent) !== Number(wxPaidCent),
    },
  }
}

function listFinance({ entryType = '', from = '', to = '', category = '', page = 1, pageSize = 50 } = {}) {
  seedIfEmpty()
  // 禁止在列表接口里跑 backfillWxPayFinance：会扫全表订单 + deasync，拖死整站 >15s
  const d = db()
  const { args, w } = financeWhere({ entryType, from, to, category })
  const ps = clampPageSize(pageSize, 50, 100)
  const pg = Math.max(1, Number(page) || 1)
  const total = d.prepare(`SELECT COUNT(*) AS n FROM finance_ledger ${w}`).get(...args).n
  const offset = (pg - 1) * ps
  const list = d
    .prepare(`SELECT * FROM finance_ledger ${w} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...args, ps, offset)
    .map(mapFinanceListRow)

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

  let wxPaidCent = 0
  let wxPaidOrders = 0
  try {
    const paidParts = [`pay_status='paid'`, `COALESCE(pay_cash_cent,0)>0`]
    const paidArgs = []
    if (from) {
      paidParts.push(`IFNULL(paid_at, created_at)>=?`)
      paidArgs.push(`${from} 00:00:00`)
    }
    if (to) {
      paidParts.push(`IFNULL(paid_at, created_at)<=?`)
      paidArgs.push(`${to} 23:59:59.999`)
    }
    const paidRow = d
      .prepare(
        `SELECT COALESCE(SUM(pay_cash_cent),0) AS s, COUNT(*) AS n FROM redeem_order WHERE ${paidParts.join(' AND ')}`
      )
      .get(...paidArgs)
    wxPaidCent = Number(paidRow.s || 0)
    wxPaidOrders = Number(paidRow.n || 0)
  } catch (e) {
    console.warn('[finance] wxPaid sum', e && e.message)
  }

  return buildFinancePayload({
    total,
    page: pg,
    pageSize: ps,
    list,
    revenueCent,
    costCent,
    refundCent,
    wxPaidCent,
    wxPaidOrders,
  })
}

async function listFinanceAsync({
  entryType = '',
  from = '',
  to = '',
  category = '',
  page = 1,
  pageSize = 50,
} = {}) {
  const { args, w } = financeWhere({ entryType, from, to, category })
  const ps = clampPageSize(pageSize, 50, 100)
  const pg = Math.max(1, Number(page) || 1)
  const offset = (pg - 1) * ps
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
  const paidParts = [`pay_status='paid'`, `COALESCE(pay_cash_cent,0)>0`]
  const paidArgs = []
  if (from) {
    paidParts.push(`IFNULL(paid_at, created_at)>=?`)
    paidArgs.push(`${from} 00:00:00`)
  }
  if (to) {
    paidParts.push(`IFNULL(paid_at, created_at)<=?`)
    paidArgs.push(`${to} 23:59:59.999`)
  }

  const [[countRows], [listRows], [revRows], [costRows], [refundRows], [paidRows]] =
    await Promise.all([
      dbMod.queryAsync(`SELECT COUNT(*) AS n FROM finance_ledger ${w}`, args),
      dbMod.queryAsync(
        `SELECT * FROM finance_ledger ${w} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...args, ps, offset]
      ),
      dbMod.queryAsync(
        `SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger WHERE entry_type='revenue'${dateClause}`,
        sumArgs
      ),
      dbMod.queryAsync(
        `SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger WHERE entry_type='cost'${dateClause}`,
        sumArgs
      ),
      dbMod.queryAsync(
        `SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger WHERE entry_type='cost' AND category='wx_refund'${dateClause}`,
        sumArgs
      ),
      dbMod
        .queryAsync(
          `SELECT COALESCE(SUM(pay_cash_cent),0) AS s, COUNT(*) AS n FROM redeem_order WHERE ${paidParts.join(
            ' AND '
          )}`,
          paidArgs
        )
        .catch((e) => {
          console.warn('[finance] wxPaid sum async', e && e.message)
          return [[{ s: 0, n: 0 }]]
        }),
    ])

  return buildFinancePayload({
    total: Number((countRows && countRows[0] && countRows[0].n) || 0),
    page: pg,
    pageSize: ps,
    list: (listRows || []).map(mapFinanceListRow),
    revenueCent: Number((revRows && revRows[0] && revRows[0].s) || 0),
    costCent: Number((costRows && costRows[0] && costRows[0].s) || 0),
    refundCent: Number((refundRows && refundRows[0] && refundRows[0].s) || 0),
    wxPaidCent: Number((paidRows && paidRows[0] && paidRows[0].s) || 0),
    wxPaidOrders: Number((paidRows && paidRows[0] && paidRows[0].n) || 0),
  })
}

function rangeKeys(period, anchor = new Date()) {
  const { shiftChinaDay } = require('./chinaDay')
  const today = dayKey(anchor)
  if (period === 'day') {
    return { from: today, to: today, label: today }
  }
  if (period === 'week') {
    // 东八区周一～周日：用该日 12:00 CST 的 UTC 星期，避免容器本地时区
    const [y, m, d] = today.split('-').map(Number)
    const noonUtc = Date.UTC(y, m - 1, d, 4, 0, 0) // 12:00 CST
    const dow = new Date(noonUtc).getUTCDay() || 7 // Mon=1 … Sun=7
    const start = shiftChinaDay(today, -(dow - 1))
    const end = shiftChinaDay(start, 6)
    return { from: start, to: end, label: `${start}~${end}` }
  }
  const [y, m] = today.split('-').map(Number)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { from, to, label: `${y}-${String(m).padStart(2, '0')}` }
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

const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/

function shiftChinaDayKey(dayKeyStr, deltaDays) {
  const { chinaDayKey, chinaDayRangeUtc } = require('./chinaDay')
  const [start] = chinaDayRangeUtc(dayKeyStr)
  return chinaDayKey(new Date(new Date(start).getTime() + Number(deltaDays) * 86400000))
}

/**
 * 总览查询区间（东八区日）。
 * range: today | 7d | month | year | custom
 */
function resolveStatsRange(opts = {}) {
  const { chinaDayKey, chinaDayRangeUtc } = require('./chinaDay')
  const today = chinaDayKey()
  let key = String(opts.range || opts.period || 'today').trim().toLowerCase()
  if (key === 'day') key = 'today'
  if (key === 'week' || key === 'last7' || key === '7days') key = '7d'
  if (key === 'custom' || (opts.from && opts.to)) {
    // keep custom when from/to provided
  }
  let fromKey = today
  let toKey = today
  let label = `今日 ${today}`

  if (key === '7d') {
    fromKey = shiftChinaDayKey(today, -6)
    toKey = today
    label = `近7日 ${fromKey} ~ ${toKey}`
  } else if (key === 'month') {
    const [y, m] = today.split('-')
    fromKey = `${y}-${m}-01`
    toKey = today
    label = `本月 ${fromKey} ~ ${toKey}`
  } else if (key === 'year') {
    const y = today.slice(0, 4)
    fromKey = `${y}-01-01`
    toKey = today
    label = `今年 ${fromKey} ~ ${toKey}`
  } else if (key === 'custom' || (opts.from && opts.to)) {
    key = 'custom'
    fromKey = String(opts.from || '').trim()
    toKey = String(opts.to || '').trim()
    if (!DAY_KEY_RE.test(fromKey) || !DAY_KEY_RE.test(toKey)) {
      const err = new Error('自定义时间请使用 YYYY-MM-DD')
      err.status = 400
      throw err
    }
    if (fromKey > toKey) {
      const t = fromKey
      fromKey = toKey
      toKey = t
    }
    label = `自定义 ${fromKey} ~ ${toKey}`
  } else {
    key = 'today'
    fromKey = today
    toKey = today
    label = `今日 ${today}`
  }

  const [utcStart] = chinaDayRangeUtc(fromKey)
  const [, utcEnd] = chinaDayRangeUtc(toKey)
  return { key, from: fromKey, to: toKey, label, utcStart, utcEnd, today }
}

function statsOverview(opts = {}) {
  seedIfEmpty()
  // 禁止在看板接口里跑全量财务回填；漏账请点「回填微信流水」
  const d = db()
  const range = resolveStatsRange(opts)
  const { from: fromKey, to: toKey, utcStart, utcEnd, key: rangeKey, label: rangeLabel } = range

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

  const rangeRevenue = sumFinance(fromKey, toKey, 'revenue')
  const rangeCost = sumFinance(fromKey, toKey, 'cost')
  const rangeRefund = d
    .prepare(
      `SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger
       WHERE entry_type='cost' AND category='wx_refund' AND day_key>=? AND day_key<=?`
    )
    .get(fromKey, toKey).s

  try {
    require('./authService').ensureUserColumns()
    require('./currencyService').ensureWalletLedger()
  } catch (_) {}
  function scalar(sql, args = []) {
    try {
      const row = d.prepare(sql).get(...args)
      if (!row) return 0
      return Number(row.n != null ? row.n : row.s || 0)
    } catch (_) {
      return 0
    }
  }

  const users = scalar('SELECT COUNT(*) AS n FROM user_account')
  const activeUsers = scalar(`SELECT COUNT(*) AS n FROM user_account WHERE status='active'`)
  const newUsersInRange = scalar(
    `SELECT COUNT(*) AS n FROM user_account WHERE created_at>=? AND created_at<?`,
    [utcStart, utcEnd]
  )
  const activeInRange = scalar(
    `SELECT COUNT(*) AS n FROM (
       SELECT user_id AS uid FROM lottery_draw WHERE created_at>=? AND created_at<?
       UNION SELECT user_id FROM redeem_order WHERE created_at>=? AND created_at<?
       UNION SELECT user_id FROM user_checkin WHERE day_key>=? AND day_key<=?
       UNION SELECT id FROM user_account WHERE last_active_at>=? AND last_active_at<?
     ) t`,
    [utcStart, utcEnd, utcStart, utcEnd, fromKey, toKey, utcStart, utcEnd]
  )
  const lowStock = scalar(`SELECT COUNT(*) AS n FROM product WHERE status='on' AND stock<=stock_alarm`)
  const pendingRedeem = scalar(`SELECT COUNT(*) AS n FROM redeem_order WHERE status='pending'`)
  const shippedOrders = scalar(`SELECT COUNT(*) AS n FROM redeem_order WHERE status IN ('shipped','done')`)
  const redeemInRange = scalar(
    `SELECT COUNT(*) AS n FROM redeem_order WHERE created_at>=? AND created_at<? AND IFNULL(status,'') NOT IN ('cancelled','canceled')`,
    [utcStart, utcEnd]
  )
  const redeemTotal = scalar(
    `SELECT COUNT(*) AS n FROM redeem_order WHERE IFNULL(status,'') NOT IN ('cancelled','canceled','unpaid')`
  )
  const tasksInRange = scalar(
    `SELECT COUNT(*) AS n FROM task_completion WHERE day_key>=? AND day_key<=?`,
    [fromKey, toKey]
  )
  const checkinInRange = scalar(
    `SELECT COUNT(*) AS n FROM user_checkin WHERE day_key>=? AND day_key<=?`,
    [fromKey, toKey]
  )
  const drawsInRange = scalar(
    `SELECT COUNT(*) AS n FROM lottery_draw WHERE created_at>=? AND created_at<?`,
    [utcStart, utcEnd]
  )
  const winInRange = scalar(
    `SELECT COUNT(*) AS n FROM lottery_draw WHERE created_at>=? AND created_at<? AND IFNULL(prize_type,'') NOT IN ('','empty')`,
    [utcStart, utcEnd]
  )
  const winTotal = scalar(
    `SELECT COUNT(*) AS n FROM lottery_draw WHERE IFNULL(prize_type,'') NOT IN ('','empty')`
  )
  const energyGrantInRange = scalar(
    `SELECT COALESCE(SUM(delta),0) AS s FROM wallet_ledger WHERE delta>0 AND created_at>=? AND created_at<?`,
    [utcStart, utcEnd]
  )
  const energyGrantTotal = scalar(`SELECT COALESCE(SUM(delta),0) AS s FROM wallet_ledger WHERE delta>0`)
  const energySpendInRange = scalar(
    `SELECT COALESCE(SUM(-delta),0) AS s FROM wallet_ledger WHERE delta<0 AND created_at>=? AND created_at<?`,
    [utcStart, utcEnd]
  )
  const festivalTickets = scalar(
    `SELECT COUNT(*) AS n FROM festival_ticket WHERE IFNULL(status,'') NOT IN ('refunded','cancelled')`
  )
  const wxPaidOrders = scalar(
    `SELECT COUNT(*) AS n FROM redeem_order WHERE pay_status='paid' AND COALESCE(pay_cash_cent,0)>0`
  )
  const wxPaidInRange = scalar(
    `SELECT COUNT(*) AS n FROM redeem_order WHERE pay_status='paid' AND COALESCE(pay_cash_cent,0)>0 AND created_at>=? AND created_at<?`,
    [utcStart, utcEnd]
  )

  const revenueByCat = d
    .prepare(
      `SELECT category, SUM(amount_cent) AS s FROM finance_ledger
       WHERE entry_type='revenue' AND day_key>=? AND day_key<=? GROUP BY category`
    )
    .all(fromKey, toKey)
  const costByCat = d
    .prepare(
      `SELECT category, SUM(amount_cent) AS s FROM finance_ledger
       WHERE entry_type='cost' AND day_key>=? AND day_key<=? GROUP BY category`
    )
    .all(fromKey, toKey)

  // 兼容旧字段名（今日口径别名）
  const newUsersToday = newUsersInRange
  const activeToday = activeInRange
  const redeemToday = redeemInRange
  const todayTasks = tasksInRange
  const checkinToday = checkinInRange
  const todayDraws = drawsInRange
  const winToday = winInRange
  const energyGrantToday = energyGrantInRange
  const energySpendToday = energySpendInRange
  const r7 = rangeKey === '7d' ? range : resolveStatsRange({ range: '7d' })
  const newUsers7d =
    rangeKey === '7d'
      ? newUsersInRange
      : scalar(`SELECT COUNT(*) AS n FROM user_account WHERE created_at>=? AND created_at<?`, [
          r7.utcStart,
          r7.utcEnd,
        ])
  const active7d =
    rangeKey === '7d'
      ? activeInRange
      : scalar(
          `SELECT COUNT(*) AS n FROM (
             SELECT user_id AS uid FROM lottery_draw WHERE created_at>=? AND created_at<?
             UNION SELECT user_id FROM redeem_order WHERE created_at>=? AND created_at<?
             UNION SELECT user_id FROM user_checkin WHERE day_key>=? AND day_key<=?
             UNION SELECT id FROM user_account WHERE last_active_at>=? AND last_active_at<?
           ) t`,
          [r7.utcStart, r7.utcEnd, r7.utcStart, r7.utcEnd, r7.from, r7.to, r7.utcStart, r7.utcEnd]
        )

  return {
    range: {
      key: rangeKey,
      from: fromKey,
      to: toKey,
      label: rangeLabel,
    },
    periods,
    totals: {
      revenueCent: rangeRevenue,
      costCent: rangeCost,
      refundCent: rangeRefund,
      expenseCent: rangeCost,
      netCent: rangeRevenue - rangeCost,
      revenueYuan: centToYuan(rangeRevenue),
      costYuan: centToYuan(rangeCost),
      refundYuan: centToYuan(rangeRefund),
      expenseYuan: centToYuan(rangeCost),
      netYuan: centToYuan(rangeRevenue - rangeCost),
    },
    lifetime: {
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
    kpi: {
      users,
      activeUsers,
      newUsersInRange,
      activeInRange,
      drawsInRange,
      winInRange,
      redeemInRange,
      tasksInRange,
      checkinInRange,
      energyGrantInRange,
      energySpendInRange,
      wxPaidInRange,
      // 旧字段别名，便于前端渐进替换
      newUsersToday,
      newUsers7d,
      activeToday,
      active7d,
      lowStock,
      pendingRedeem,
      shippedOrders,
      redeemToday,
      redeemTotal,
      todayTasks,
      checkinToday,
      todayDraws,
      winToday,
      winTotal,
      energyGrantToday,
      energyGrantTotal,
      energySpendToday,
      festivalTickets,
      wxPaidOrders,
    },
    revenueByCat: revenueByCat.map((r) => ({ category: r.category, yuan: centToYuan(r.s) })),
    costByCat: costByCat.map((r) => ({ category: r.category, yuan: centToYuan(r.s) })),
  }
}

async function scalarAsync(sql, args = []) {
  try {
    const [rows] = await dbMod.queryAsync(sql, args)
    const row = rows && rows[0]
    if (!row) return 0
    return Number(row.n != null ? row.n : row.s || 0)
  } catch (_) {
    return 0
  }
}

async function sumFinanceAsync(from, to, entryType) {
  return scalarAsync(
    `SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger
     WHERE entry_type=? AND day_key>=? AND day_key<=?`,
    [entryType, from, to]
  )
}

/** 运营台看板：批量 queryAsync，禁止 runSync 占 SyncGate */
async function statsOverviewAsync(opts = {}) {
  const range = resolveStatsRange(opts)
  const { from: fromKey, to: toKey, utcStart, utcEnd, key: rangeKey, label: rangeLabel } = range
  const r7 = rangeKey === '7d' ? range : resolveStatsRange({ range: '7d' })

  const periodDefs = ['day', 'week', 'month'].map((period) => {
    const r = rangeKeys(period)
    return { period, ...r }
  })

  const periodSums = await Promise.all(
    periodDefs.map(async (r) => {
      const [revenue, cost, refund] = await Promise.all([
        sumFinanceAsync(r.from, r.to, 'revenue'),
        sumFinanceAsync(r.from, r.to, 'cost'),
        scalarAsync(
          `SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger
           WHERE entry_type='cost' AND category='wx_refund' AND day_key>=? AND day_key<=?`,
          [r.from, r.to]
        ),
      ])
      return {
        period: r.period,
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
  )

  const [
    allRevenue,
    allCost,
    allRefund,
    rangeRevenue,
    rangeCost,
    rangeRefund,
    users,
    activeUsers,
    newUsersInRange,
    activeInRange,
    lowStock,
    pendingRedeem,
    shippedOrders,
    redeemInRange,
    redeemTotal,
    tasksInRange,
    checkinInRange,
    drawsInRange,
    winInRange,
    winTotal,
    energyGrantInRange,
    energyGrantTotal,
    energySpendInRange,
    festivalTickets,
    wxPaidOrders,
    wxPaidInRange,
    newUsers7dRaw,
    active7dRaw,
    revenueByCatRows,
    costByCatRows,
  ] = await Promise.all([
    scalarAsync(`SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger WHERE entry_type='revenue'`),
    scalarAsync(`SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger WHERE entry_type='cost'`),
    scalarAsync(
      `SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger WHERE entry_type='cost' AND category='wx_refund'`
    ),
    sumFinanceAsync(fromKey, toKey, 'revenue'),
    sumFinanceAsync(fromKey, toKey, 'cost'),
    scalarAsync(
      `SELECT COALESCE(SUM(amount_cent),0) AS s FROM finance_ledger
       WHERE entry_type='cost' AND category='wx_refund' AND day_key>=? AND day_key<=?`,
      [fromKey, toKey]
    ),
    scalarAsync('SELECT COUNT(*) AS n FROM user_account'),
    scalarAsync(`SELECT COUNT(*) AS n FROM user_account WHERE status='active'`),
    scalarAsync(`SELECT COUNT(*) AS n FROM user_account WHERE created_at>=? AND created_at<?`, [
      utcStart,
      utcEnd,
    ]),
    scalarAsync(
      `SELECT COUNT(*) AS n FROM (
         SELECT user_id AS uid FROM lottery_draw WHERE created_at>=? AND created_at<?
         UNION SELECT user_id FROM redeem_order WHERE created_at>=? AND created_at<?
         UNION SELECT user_id FROM user_checkin WHERE day_key>=? AND day_key<=?
         UNION SELECT id FROM user_account WHERE last_active_at>=? AND last_active_at<?
       ) t`,
      [utcStart, utcEnd, utcStart, utcEnd, fromKey, toKey, utcStart, utcEnd]
    ),
    scalarAsync(`SELECT COUNT(*) AS n FROM product WHERE status='on' AND stock<=stock_alarm`),
    scalarAsync(`SELECT COUNT(*) AS n FROM redeem_order WHERE status='pending'`),
    scalarAsync(`SELECT COUNT(*) AS n FROM redeem_order WHERE status IN ('shipped','done')`),
    scalarAsync(
      `SELECT COUNT(*) AS n FROM redeem_order WHERE created_at>=? AND created_at<? AND IFNULL(status,'') NOT IN ('cancelled','canceled')`,
      [utcStart, utcEnd]
    ),
    scalarAsync(
      `SELECT COUNT(*) AS n FROM redeem_order WHERE IFNULL(status,'') NOT IN ('cancelled','canceled','unpaid')`
    ),
    scalarAsync(`SELECT COUNT(*) AS n FROM task_completion WHERE day_key>=? AND day_key<=?`, [
      fromKey,
      toKey,
    ]),
    scalarAsync(`SELECT COUNT(*) AS n FROM user_checkin WHERE day_key>=? AND day_key<=?`, [
      fromKey,
      toKey,
    ]),
    scalarAsync(`SELECT COUNT(*) AS n FROM lottery_draw WHERE created_at>=? AND created_at<?`, [
      utcStart,
      utcEnd,
    ]),
    scalarAsync(
      `SELECT COUNT(*) AS n FROM lottery_draw WHERE created_at>=? AND created_at<? AND IFNULL(prize_type,'') NOT IN ('','empty')`,
      [utcStart, utcEnd]
    ),
    scalarAsync(
      `SELECT COUNT(*) AS n FROM lottery_draw WHERE IFNULL(prize_type,'') NOT IN ('','empty')`
    ),
    scalarAsync(
      `SELECT COALESCE(SUM(delta),0) AS s FROM wallet_ledger WHERE delta>0 AND created_at>=? AND created_at<?`,
      [utcStart, utcEnd]
    ),
    scalarAsync(`SELECT COALESCE(SUM(delta),0) AS s FROM wallet_ledger WHERE delta>0`),
    scalarAsync(
      `SELECT COALESCE(SUM(-delta),0) AS s FROM wallet_ledger WHERE delta<0 AND created_at>=? AND created_at<?`,
      [utcStart, utcEnd]
    ),
    scalarAsync(
      `SELECT COUNT(*) AS n FROM festival_ticket WHERE IFNULL(status,'') NOT IN ('refunded','cancelled')`
    ),
    scalarAsync(
      `SELECT COUNT(*) AS n FROM redeem_order WHERE pay_status='paid' AND COALESCE(pay_cash_cent,0)>0`
    ),
    scalarAsync(
      `SELECT COUNT(*) AS n FROM redeem_order WHERE pay_status='paid' AND COALESCE(pay_cash_cent,0)>0 AND created_at>=? AND created_at<?`,
      [utcStart, utcEnd]
    ),
    rangeKey === '7d'
      ? Promise.resolve(null)
      : scalarAsync(`SELECT COUNT(*) AS n FROM user_account WHERE created_at>=? AND created_at<?`, [
          r7.utcStart,
          r7.utcEnd,
        ]),
    rangeKey === '7d'
      ? Promise.resolve(null)
      : scalarAsync(
          `SELECT COUNT(*) AS n FROM (
             SELECT user_id AS uid FROM lottery_draw WHERE created_at>=? AND created_at<?
             UNION SELECT user_id FROM redeem_order WHERE created_at>=? AND created_at<?
             UNION SELECT user_id FROM user_checkin WHERE day_key>=? AND day_key<=?
             UNION SELECT id FROM user_account WHERE last_active_at>=? AND last_active_at<?
           ) t`,
          [r7.utcStart, r7.utcEnd, r7.utcStart, r7.utcEnd, r7.from, r7.to, r7.utcStart, r7.utcEnd]
        ),
    dbMod
      .queryAsync(
        `SELECT category, SUM(amount_cent) AS s FROM finance_ledger
         WHERE entry_type='revenue' AND day_key>=? AND day_key<=? GROUP BY category`,
        [fromKey, toKey]
      )
      .then((r) => r[0] || [])
      .catch(() => []),
    dbMod
      .queryAsync(
        `SELECT category, SUM(amount_cent) AS s FROM finance_ledger
         WHERE entry_type='cost' AND day_key>=? AND day_key<=? GROUP BY category`,
        [fromKey, toKey]
      )
      .then((r) => r[0] || [])
      .catch(() => []),
  ])

  const newUsers7d = rangeKey === '7d' ? newUsersInRange : Number(newUsers7dRaw || 0)
  const active7d = rangeKey === '7d' ? activeInRange : Number(active7dRaw || 0)

  return {
    range: {
      key: rangeKey,
      from: fromKey,
      to: toKey,
      label: rangeLabel,
    },
    periods: periodSums,
    totals: {
      revenueCent: rangeRevenue,
      costCent: rangeCost,
      refundCent: rangeRefund,
      expenseCent: rangeCost,
      netCent: rangeRevenue - rangeCost,
      revenueYuan: centToYuan(rangeRevenue),
      costYuan: centToYuan(rangeCost),
      refundYuan: centToYuan(rangeRefund),
      expenseYuan: centToYuan(rangeCost),
      netYuan: centToYuan(rangeRevenue - rangeCost),
    },
    lifetime: {
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
    kpi: {
      users,
      activeUsers,
      newUsersInRange,
      activeInRange,
      drawsInRange,
      winInRange,
      redeemInRange,
      tasksInRange,
      checkinInRange,
      energyGrantInRange,
      energySpendInRange,
      wxPaidInRange,
      newUsersToday: newUsersInRange,
      newUsers7d,
      activeToday: activeInRange,
      active7d,
      lowStock,
      pendingRedeem,
      shippedOrders,
      redeemToday: redeemInRange,
      redeemTotal,
      todayTasks: tasksInRange,
      checkinToday: checkinInRange,
      todayDraws: drawsInRange,
      winToday: winInRange,
      winTotal,
      energyGrantToday: energyGrantInRange,
      energyGrantTotal,
      energySpendToday: energySpendInRange,
      festivalTickets,
      wxPaidOrders,
    },
    revenueByCat: (revenueByCatRows || []).map((r) => ({
      category: r.category,
      yuan: centToYuan(r.s),
    })),
    costByCat: (costByCatRows || []).map((r) => ({
      category: r.category,
      yuan: centToYuan(r.s),
    })),
  }
}

/**
 * 已停用：演示灌数曾把收入虚高到 ¥714（128+86+500），与真实微信支付对不上。
 * 保留空函数以免旧启动路径报错；历史演示行由 purgeDemoFinance 清理。
 */
function seedDemoFinanceIfEmpty() {
  return
}

module.exports = {
  seedIfEmpty,
  markSeedDone,
  seedDemoFinanceIfEmpty,
  markUserColumnsReady,
  ensureLotterySeedPrizes,
  catalogForClient,
  catalogForClientAsync,
  invalidateCatalogCache,
  listUsers,
  listUsersAsync,
  getUserDetail,
  updateUser,
  updateUserAsync,
  listProducts,
  listProductsAsync,
  moveProductSort,
  upsertProduct,
  deleteProduct,
  publishMallLive,
  buildMallCatalogItems,
  listLottery,
  listLotteryAsync,
  upsertLottery,
  deleteLottery,
  drawLottery,
  listTasks,
  listTasksAsync,
  upsertTask,
  deleteTask,
  listTaskCompletions,
  listTaskCompletionsAsync,
  completeTask,
  listRedeems,
  listRedeemsAsync,
  updateRedeem,
  createRedeemOrder,
  listIcons,
  upsertIcon,
  deleteIcon,
  addFinance,
  listFinance,
  listFinanceAsync,
  ensureWxPayFinance,
  ensureWxPayFinanceAsync,
  recordFulfillCost,
  ensureWxRefundFinance,
  backfillWxPayFinance,
  purgeDemoFinance,
  reconcileFinanceLedger,
  formatFinanceTime,
  nowLocalMs,
  statsOverview,
  statsOverviewAsync,
  resolveStatsRange,
  dayKey,
  centToYuan,
  yuanToCent,
}
