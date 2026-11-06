/**
 * 运营后台：用户 / 商品 / 抽奖 / 任务 / 兑换 / 图标 / 财务统计
 * 与前端 bootstrap 互通：catalog 块由本服务组装。
 */
const dbMod = require('../db')
const configService = require('./configService')

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
  return Math.round(Number(v || 0) * 100)
}

function centToYuan(c) {
  return Math.round(Number(c || 0)) / 100
}

function orderNo(prefix = 'R') {
  return `${prefix}${Date.now()}${Math.floor(Math.random() * 900 + 100)}`
}

/** 首次空表时从已发布配置 / 默认值灌入 */
function seedIfEmpty() {
  const d = db()
  ensureUserColumns()
  const prodN = d.prepare('SELECT COUNT(*) AS n FROM product').get().n
  if (!prodN) {
    const pub = configService.getPublished() || {}
    const mall = ((((pub.pages || {}).mall || {}).modules || []).find((m) => m.type === 'goods_grid') || {})
      .payload
    const items = (mall && mall.items) || []
    const ins = d.prepare(
      `INSERT INTO product (id,name,category,price_cent,cost_cent,points_off,stock,stock_alarm,image_url,tag,status,sort_order,meta_json,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    const t = now()
    if (items.length) {
      items.forEach((it, i) => {
        const price = yuanToCent(it.price)
        const cost = Math.round(price * 0.45)
        ins.run(
          it.id || `m${i + 1}`,
          it.name || `商品${i + 1}`,
          '推荐',
          price,
          cost,
          Number(it.pointsOff || 0),
          200,
          20,
          it.imageUrl || '',
          it.tag || '',
          'on',
          i,
          '{}',
          t
        )
      })
    } else {
      ;[
        ['m1', '亚克力手机支架', 1990, 900, 2, '热卖'],
        ['m2', '多巴胺发夹套装', 1590, 700, 1.5, '新品'],
        ['m3', '迷你桌面风扇', 2990, 1400, 3, '加速'],
        ['m4', '趣味帆布袋', 3990, 1800, 4, ''],
      ].forEach((row, i) => {
        ins.run(row[0], row[1], '推荐', row[2], row[3], row[4], 200, 20, '', row[5], 'on', i, '{}', t)
      })
    }
  }

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
      ['p_gift', '实物小礼', 'physical', 0, 'm1', 5, 50, '', 'on', 4],
    ].forEach((r) => ins.run(...r, t))
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
}

function ensureUserColumns() {
  const d = db()
  const add = dbMod.addColumnIfMissing
  add(d, 'user_account', 'status', `VARCHAR(16) NOT NULL DEFAULT 'active'`, `TEXT NOT NULL DEFAULT 'active'`)
  add(d, 'user_account', 'remark', `VARCHAR(255) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'user_account', 'session_key', `VARCHAR(128) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'user_account', 'inviter_id', `INT NULL`, `INTEGER`)
}

/* ——— 前端互通 catalog ——— */
function catalogForClient() {
  seedIfEmpty()
  const d = db()
  const products = d
    .prepare(
      `SELECT id, name, category, price_cent, points_off, stock, image_url, tag, status, sort_order
       FROM product WHERE status='on' ORDER BY sort_order, id`
    )
    .all()
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: centToYuan(p.price_cent),
      pointsOff: p.points_off,
      stock: p.stock,
      imageUrl: p.image_url,
      tag: p.tag,
    }))

  const prizes = d
    .prepare(
      `SELECT id, name, prize_type, prize_value, product_id, weight, stock, image_url
       FROM lottery_prize WHERE status='on' ORDER BY sort_order, id`
    )
    .all()
  const totalW = prizes.reduce((s, p) => s + Math.max(0, p.weight), 0) || 1
  const lottery = prizes.map((p) => ({
    id: p.id,
    name: p.name,
    prizeType: p.prize_type,
    prizeValue: p.prize_value,
    productId: p.product_id,
    weight: p.weight,
    probability: Math.round((p.weight / totalW) * 10000) / 10000,
    stock: p.stock,
    imageUrl: p.image_url,
  }))

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
    icons[r.id] = r.path
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
  const u = d.prepare('SELECT * FROM user_account WHERE id=?').get(id)
  if (!u) return { ok: false, msg: '用户不存在' }
  const nick = patch.nickName != null ? patch.nickName : u.nick_name
  const status = patch.status != null ? patch.status : u.status
  const remark = patch.remark != null ? patch.remark : u.remark
  d.prepare(
    `UPDATE user_account SET nick_name=?, status=?, remark=?, updated_at=? WHERE id=?`
  ).run(nick, status, remark, now(), id)
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
function listProducts() {
  seedIfEmpty()
  return db()
    .prepare(`SELECT * FROM product ORDER BY sort_order, id`)
    .all()
    .map((p) => ({
      ...p,
      priceYuan: centToYuan(p.price_cent),
      costYuan: centToYuan(p.cost_cent),
    }))
}

function upsertProduct(body) {
  const d = db()
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少 id' }
  const t = now()
  const priceCent = body.priceCent != null ? Number(body.priceCent) : yuanToCent(body.priceYuan)
  const costCent = body.costCent != null ? Number(body.costCent) : yuanToCent(body.costYuan)
  const exists = d.prepare('SELECT id FROM product WHERE id=?').get(id)
  if (exists) {
    d.prepare(
      `UPDATE product SET name=?, category=?, price_cent=?, cost_cent=?, points_off=?, stock=?, stock_alarm=?,
       image_url=?, tag=?, status=?, sort_order=?, meta_json=?, updated_at=? WHERE id=?`
    ).run(
      body.name || '',
      body.category || '推荐',
      priceCent,
      costCent,
      Number(body.pointsOff || 0),
      Number(body.stock || 0),
      Number(body.stockAlarm != null ? body.stockAlarm : 10),
      body.imageUrl || '',
      body.tag || '',
      body.status || 'on',
      Number(body.sortOrder || 0),
      JSON.stringify(body.meta || {}),
      t,
      id
    )
  } else {
    d.prepare(
      `INSERT INTO product (id,name,category,price_cent,cost_cent,points_off,stock,stock_alarm,image_url,tag,status,sort_order,meta_json,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      id,
      body.name || id,
      body.category || '推荐',
      priceCent,
      costCent,
      Number(body.pointsOff || 0),
      Number(body.stock != null ? body.stock : 0),
      Number(body.stockAlarm != null ? body.stockAlarm : 10),
      body.imageUrl || '',
      body.tag || '',
      body.status || 'on',
      Number(body.sortOrder || 0),
      JSON.stringify(body.meta || {}),
      t
    )
  }
  syncMallIntoDraft()
  return { ok: true, item: d.prepare('SELECT * FROM product WHERE id=?').get(id) }
}

function deleteProduct(id) {
  db().prepare('DELETE FROM product WHERE id=?').run(id)
  syncMallIntoDraft()
  return { ok: true }
}

/** 把商品表同步进配置草稿的 mall goods_grid，保证发布后前端互通 */
function syncMallIntoDraft() {
  const draft = configService.getDraft()
  if (!draft || !draft.pages || !draft.pages.mall) return
  const items = listProducts()
    .filter((p) => p.status === 'on')
    .map((p) => ({
      id: p.id,
      name: p.name,
      price: centToYuan(p.price_cent),
      pointsOff: p.points_off,
      tag: p.tag,
      imageUrl: p.image_url,
      tone: 'mint',
      stock: p.stock,
    }))
  const mods = draft.pages.mall.modules || []
  const idx = mods.findIndex((m) => m.type === 'goods_grid')
  if (idx >= 0) {
    mods[idx].payload = mods[idx].payload || {}
    mods[idx].payload.items = items
  }
  if (!draft.catalog) draft.catalog = {}
  draft.catalog.products = items
  configService.saveDraft(draft)
}

/* ——— 抽奖 ——— */
function listLottery() {
  seedIfEmpty()
  const rows = db().prepare(`SELECT * FROM lottery_prize ORDER BY sort_order, id`).all()
  const totalW = rows.filter((r) => r.status === 'on').reduce((s, p) => s + Math.max(0, p.weight), 0) || 1
  return rows.map((p) => ({
    ...p,
    probability: p.status === 'on' ? Math.round((p.weight / totalW) * 10000) / 10000 : 0,
  }))
}

function upsertLottery(body) {
  const d = db()
  const id = String(body.id || '').trim()
  if (!id) return { ok: false, msg: '缺少 id' }
  const t = now()
  const exists = d.prepare('SELECT id FROM lottery_prize WHERE id=?').get(id)
  const args = [
    body.name || id,
    body.prizeType || 'coin',
    Number(body.prizeValue || 0),
    body.productId || '',
    Math.max(0, Number(body.weight != null ? body.weight : 1)),
    Number(body.stock != null ? body.stock : -1),
    body.imageUrl || '',
    body.status || 'on',
    Number(body.sortOrder || 0),
    t,
  ]
  if (exists) {
    d.prepare(
      `UPDATE lottery_prize SET name=?, prize_type=?, prize_value=?, product_id=?, weight=?, stock=?, image_url=?, status=?, sort_order=?, updated_at=? WHERE id=?`
    ).run(...args, id)
  } else {
    d.prepare(
      `INSERT INTO lottery_prize (id,name,prize_type,prize_value,product_id,weight,stock,image_url,status,sort_order,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
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

function drawLottery(userId) {
  seedIfEmpty()
  const d = db()
  const wallet = d.prepare('SELECT * FROM user_wallet WHERE user_id=?').get(userId)
  if (!wallet) return { ok: false, msg: '钱包不存在' }
  if (wallet.lottery_chance <= 0) return { ok: false, msg: '抽奖次数不足' }
  try {
    const ops = require('./opsService')
    const snap = ops.riskSnapshot()
    const today = new Date().toISOString().slice(0, 10)
    const todayDraws = d
      .prepare(`SELECT COUNT(*) AS n FROM lottery_draw WHERE user_id=? AND substr(created_at,1,10)=?`)
      .get(userId, today).n
    if (todayDraws >= (snap.perUserDailyLotteryLimit || 15)) {
      return { ok: false, msg: '今日抽奖次数已达风控上限' }
    }
  } catch (e) {}

  const prizes = d
    .prepare(`SELECT * FROM lottery_prize WHERE status='on' AND (stock=-1 OR stock>0)`)
    .all()
  if (!prizes.length) return { ok: false, msg: '奖池为空' }
  const totalW = prizes.reduce((s, p) => s + Math.max(0, p.weight), 0)
  let r = Math.random() * totalW
  let hit = prizes[prizes.length - 1]
  for (const p of prizes) {
    r -= Math.max(0, p.weight)
    if (r <= 0) {
      hit = p
      break
    }
  }

  const tx = d.transaction(() => {
    d.prepare(
      `UPDATE user_wallet SET lottery_chance=lottery_chance-1, updated_at=? WHERE user_id=?`
    ).run(now(), userId)
    if (hit.stock > 0) {
      d.prepare(`UPDATE lottery_prize SET stock=stock-1, updated_at=? WHERE id=?`).run(now(), hit.id)
    }
    if (hit.prize_type === 'coin') {
      d.prepare(`UPDATE user_wallet SET coins=coins+?, updated_at=? WHERE user_id=?`).run(
        hit.prize_value,
        now(),
        userId
      )
    } else if (hit.prize_type === 'energy') {
      d.prepare(`UPDATE user_wallet SET energy=energy+?, updated_at=? WHERE user_id=?`).run(
        hit.prize_value,
        now(),
        userId
      )
    } else if (hit.prize_type === 'points') {
      d.prepare(`UPDATE user_wallet SET points=points+?, updated_at=? WHERE user_id=?`).run(
        hit.prize_value,
        now(),
        userId
      )
    } else if (hit.prize_type === 'physical') {
      // 实物不在开奖瞬间建单：前端填地址后走 placeOrder，避免无地址履约单
    }
    d.prepare(
      `INSERT INTO lottery_draw (user_id,prize_id,prize_name,cost_cent,created_at) VALUES (?,?,?,?,?)`
    ).run(userId, hit.id, hit.name, 0, now())
  })
  tx()
  return {
    ok: true,
    prize: {
      id: hit.id,
      name: hit.name,
      prizeType: hit.prize_type,
      prizeValue: hit.prize_value,
      productId: hit.product_id || '',
    },
  }
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
  const reward = { energy: task.reward_energy, coins: task.reward_coins }
  const tx = d.transaction(() => {
    d.prepare(
      `INSERT INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at) VALUES (?,?,?,'done',?,?)`
    ).run(userId, taskId, dk, JSON.stringify(reward), now())
    if (task.reward_energy || task.reward_coins) {
      d.prepare(
        `UPDATE user_wallet SET energy=energy+?, coins=coins+?, updated_at=? WHERE user_id=?`
      ).run(task.reward_energy, task.reward_coins, now(), userId)
    }
  })
  tx()
  return { ok: true, reward }
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
function listIcons() {
  seedIfEmpty()
  return db().prepare(`SELECT * FROM icon_asset ORDER BY purpose, id`).all()
}

function upsertIcon(body) {
  const d = db()
  const id = String(body.id || '').trim()
  if (!id || !body.path) return { ok: false, msg: '缺少 id 或 path' }
  const t = now()
  const exists = d.prepare('SELECT id FROM icon_asset WHERE id=?').get(id)
  if (exists) {
    d.prepare(`UPDATE icon_asset SET label=?, purpose=?, path=?, updated_at=? WHERE id=?`).run(
      body.label || id,
      body.purpose || 'icons',
      body.path,
      t,
      id
    )
  } else {
    d.prepare(`INSERT INTO icon_asset (id,label,purpose,path,updated_at) VALUES (?,?,?,?,?)`).run(
      id,
      body.label || id,
      body.purpose || 'icons',
      body.path,
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
  const assets = { ...(draft.assets || {}) }
  icons
    .filter((i) => i.purpose === 'assets' || !String(i.id).startsWith('tab.'))
    .forEach((i) => {
      if (!String(i.id).startsWith('tab.')) assets[i.id] = i.path
    })
  draft.assets = assets
  icons
    .filter((i) => String(i.id).startsWith('tab.') && !String(i.id).endsWith('.active'))
    .forEach((i) => {
      const key = i.id.replace(/^tab\./, '')
      const tab = (draft.tabBar || []).find((t) => t.pageKey === key)
      if (tab) tab.iconUrl = i.path
    })
  icons
    .filter((i) => String(i.id).endsWith('.active'))
    .forEach((i) => {
      const key = i.id.replace(/^tab\./, '').replace(/\.active$/, '')
      const tab = (draft.tabBar || []).find((t) => t.pageKey === key)
      if (tab) tab.selectedIconUrl = i.path
    })
  if (!draft.catalog) draft.catalog = {}
  draft.catalog.icons = {}
  icons.forEach((i) => {
    draft.catalog.icons[i.id] = i.path
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
  catalogForClient,
  listUsers,
  updateUser,
  listProducts,
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
