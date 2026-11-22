/**
 * 自定义任务：定义在 task_def，日切 00:00（东八区）重置；
 * 仅当日可统计、可验证行为；action 仅允许内置类型。
 */
const dbMod = require('../db')

/** 活跃：运营台可选 + 任务列表展示 */
const ACTIVE_ACTIONS = [
  {
    key: 'invite',
    label: '邀请好友',
    defaultId: 'invite',
    defaultTitle: '邀请好友',
    defaultTarget: 3,
    defaultEnergy: 30,
    defaultDesc: '好友通过邀请进入并登录',
    quantify: '当日成功邀请人数 / 目标（如 0/3）',
    frontend: '点「去完成」→ 邀请页；达标后点「领取」',
    progressSource: 'invite',
    hideInTaskList: false,
  },
  {
    key: 'mall_pay',
    label: '商城支付笔数',
    defaultId: 'mall_pay',
    defaultTitle: '商城下单',
    defaultTarget: 1,
    defaultEnergy: 20,
    defaultDesc: '当日商城现金单支付成功笔数',
    quantify: '当日已支付商城订单笔数 / 目标',
    frontend: '点「去完成」→ 商城；支付达标后点「领取」',
    progressSource: 'mall_pay',
    hideInTaskList: false,
  },
  {
    key: 'mall_spend',
    label: '商城消费金额',
    defaultId: 'mall_spend',
    defaultTitle: '商城消费',
    defaultTarget: 100,
    defaultEnergy: 30,
    defaultDesc: '当日商城实付合计达标',
    quantify: '目标填「分」：100=¥1.00；进度为当日实付分',
    frontend: '点「去完成」→ 商城；实付达标后点「领取」',
    progressSource: 'mall_spend',
    hideInTaskList: false,
  },
  {
    key: 'lottery',
    label: '抽奖次数',
    defaultId: 'lottery',
    defaultTitle: '今日抽奖',
    defaultTarget: 1,
    defaultEnergy: 15,
    defaultDesc: '当日完成抽奖次数',
    quantify: '当日 lottery_draw 次数 / 目标',
    frontend: '点「去完成」→ 抽奖；达标后点「领取」',
    progressSource: 'lottery',
    hideInTaskList: false,
  },
  {
    key: 'share',
    label: '分享小程序',
    defaultId: 'share',
    defaultTitle: '分享给好友',
    defaultTarget: 1,
    defaultEnergy: 10,
    defaultDesc: '当日分享小程序次数',
    quantify: '当日分享上报次数 / 目标（隔日清零）',
    frontend: '点「去完成」→ 分享；上报达标后点「领取」',
    progressSource: 'task_action_event',
    hideInTaskList: false,
  },
  {
    key: 'browse_mall',
    label: '浏览商城次数',
    defaultId: 'browse_mall',
    defaultTitle: '逛商城',
    defaultTarget: 1,
    defaultEnergy: 5,
    defaultDesc: '当日打开商城页次数',
    quantify: '当日浏览商城上报次数 / 目标（可>1）',
    frontend: '点「去完成」→ 商城；浏览达标后点「领取」',
    progressSource: 'task_action_event',
    hideInTaskList: false,
  },
  {
    key: 'browse_festival',
    label: '浏览活动页次数',
    defaultId: 'browse_festival',
    defaultTitle: '逛活动页',
    defaultTarget: 1,
    defaultEnergy: 5,
    defaultDesc: '当日打开活动/专题页次数',
    quantify: '当日浏览活动页上报次数 / 目标（可>1）',
    frontend: '点「去完成」→ 活动页；浏览达标后点「领取」',
    progressSource: 'task_action_event',
    hideInTaskList: false,
  },
]

/** 下线：别处已领奖，不下拉、不进任务列表（旧库定义会被过滤） */
const RETIRED_ACTIONS = [
  {
    key: 'checkin',
    label: '每日签到（已下线·走首页签到）',
    defaultId: 'checkin',
    defaultTitle: '每日签到',
    defaultTarget: 1,
    defaultEnergy: 20,
    defaultDesc: '',
    quantify: '',
    frontend: '',
    progressSource: 'retired',
    hideInTaskList: true,
  },
  {
    key: 'steps',
    label: '步数兑换（已下线·走首页步数）',
    defaultId: 'steps',
    defaultTitle: '步数兑换',
    defaultTarget: 1,
    defaultEnergy: 15,
    defaultDesc: '',
    quantify: '',
    frontend: '',
    progressSource: 'retired',
    hideInTaskList: true,
  },
  {
    key: 'ad',
    label: '看激励视频（已下线·走广告补给）',
    defaultId: 'ad',
    defaultTitle: '看激励视频',
    defaultTarget: 1,
    defaultEnergy: 30,
    defaultDesc: '',
    quantify: '',
    frontend: '',
    progressSource: 'retired',
    hideInTaskList: true,
  },
]

const BUILTIN_ACTIONS = [...ACTIVE_ACTIONS, ...RETIRED_ACTIONS]
const ACTION_MAP = Object.fromEntries(BUILTIN_ACTIONS.map((a) => [a.key, a]))
const EVENT_ACTIONS = new Set(['share', 'browse_mall', 'browse_festival'])
const CLAIM_ACTIONS = new Set([
  'invite',
  'mall_pay',
  'mall_spend',
  'lottery',
  'share',
  'browse_mall',
  'browse_festival',
])

const ACTION_RATE = { perMinute: 6, perDay: 50 }

function normalizeActionKey(raw) {
  const a = String(raw || '')
    .trim()
    .toLowerCase()
  if (!a) return ''
  if (a === 'browse' || a === 'mall') return 'browse_mall'
  if (a === 'festival') return 'browse_festival'
  if (a.includes('step')) return 'steps'
  if (a === 'order' || a === 'pay') return 'mall_pay'
  if (a === 'mall_sale' || a === 'spend') return 'mall_spend'
  if (a === 'draw' || a === 'lottery_draw') return 'lottery'
  return a
}

function getBuiltinActions() {
  return ACTIVE_ACTIONS.map((a) => ({
    key: a.key,
    label: a.label,
    defaultId: a.defaultId,
    defaultTitle: a.defaultTitle,
    defaultTarget: a.defaultTarget,
    defaultEnergy: a.defaultEnergy,
    defaultDesc: a.defaultDesc,
    quantify: a.quantify,
    frontend: a.frontend,
    hideInTaskList: false,
  }))
}

function assertBuiltinAction(actionKey) {
  const key = normalizeActionKey(actionKey)
  if (!key || !ACTION_MAP[key] || ACTION_MAP[key].hideInTaskList) {
    return {
      ok: false,
      msg: `action 必须是内置类型：${ACTIVE_ACTIONS.map((x) => x.key).join(' / ')}`,
    }
  }
  return { ok: true, key }
}

function db() {
  return dbMod.open()
}

function now() {
  return dbMod.nowIso()
}

/** 东八区自然日，避免云托管 UTC 错日 */
function shanghaiParts(input = new Date()) {
  const x = typeof input === 'string' ? new Date(input) : input instanceof Date ? input : new Date()
  if (Number.isNaN(x.getTime())) {
    return { year: '1970', month: '01', day: '01' }
  }
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const map = {}
  fmt.formatToParts(x).forEach((p) => {
    if (p.type !== 'literal') map[p.type] = p.value
  })
  return {
    year: map.year || '1970',
    month: map.month || '01',
    day: map.day || '01',
  }
}

function dayKey(d = new Date()) {
  const p = shanghaiParts(d)
  return `${p.year}-${p.month}-${p.day}`
}

/** 时间串取东八区日；纯 YYYY-MM-DD 前缀可直接用 */
function dayKeyFromStored(v) {
  const s = String(v || '').trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s) && !s.includes('T')) {
    return s.slice(0, 10)
  }
  if (!s) return dayKey()
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s.slice(0, 10)
  return dayKey(d)
}

let schemaReady = false

function ensureSchema() {
  if (schemaReady) return
  if (dbMod.DIALECT === 'mysql') {
    schemaReady = true
    return
  }
  const d = db()
  const add = dbMod.addColumnIfMissing
  add(d, 'task_def', 'target_count', `INT NOT NULL DEFAULT 1`, `INTEGER NOT NULL DEFAULT 1`)
  add(d, 'task_def', 'reward_gift_id', `VARCHAR(64) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  add(d, 'task_def', 'desc_text', `VARCHAR(256) NOT NULL DEFAULT ''`, `TEXT NOT NULL DEFAULT ''`)
  try {
    d.prepare(
      `UPDATE task_def SET target_count=daily_limit
       WHERE action_key='invite' AND (target_count IS NULL OR target_count<=1) AND daily_limit>1`
    ).run()
  } catch (_) {}
  try {
    if (dbMod.DIALECT === 'mysql') {
      d.exec(`
        CREATE TABLE IF NOT EXISTS task_action_event (
          id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          user_id BIGINT NOT NULL,
          action_key VARCHAR(32) NOT NULL,
          day_key VARCHAR(10) NOT NULL,
          created_at VARCHAR(40) NOT NULL,
          KEY idx_task_action_user_day (user_id, action_key, day_key)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `)
    } else {
      d.exec(`
        CREATE TABLE IF NOT EXISTS task_action_event (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          action_key TEXT NOT NULL,
          day_key TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `)
      d.exec(
        `CREATE INDEX IF NOT EXISTS idx_task_action_user_day ON task_action_event(user_id, action_key, day_key)`
      )
    }
  } catch (e) {
    console.warn('[task] ensure task_action_event', e && e.message)
  }
  schemaReady = true
}

function autoRewardDesc(energy, coins, giftId, giftName) {
  const parts = []
  const e = Number(energy) || 0
  const c = Number(coins) || 0
  if (e > 0) parts.push(`能量+${e}`)
  if (c > 0) parts.push(`金币+${c}`)
  if (giftId) parts.push(giftName ? String(giftName).slice(0, 10) : '礼品+1')
  return parts.join(' · ') || '完成奖励'
}

function giftMeta(giftId) {
  if (!giftId) return { name: '', imageUrl: '' }
  try {
    const o = require('./offerService').resolveOffer(giftId)
    if (!o || !o.found) return { name: '', imageUrl: '' }
    return {
      name: o.name || '',
      imageUrl: o.imageUrl || '',
    }
  } catch (_) {
    return { name: '', imageUrl: '' }
  }
}

function giftName(giftId) {
  return giftMeta(giftId).name
}

function mapDef(row) {
  const target = Math.max(1, Number(row.target_count != null ? row.target_count : row.daily_limit) || 1)
  const energyOnly = Number(row.reward_energy || 0)
  const coinsOnly = Number(row.reward_coins || 0)
  const giftId = row.reward_gift_id || ''
  const gift = giftMeta(giftId)
  const action = normalizeActionKey(row.action_key || '')
  const meta = ACTION_MAP[action] || null
  const reward = row.reward_desc || autoRewardDesc(energyOnly, coinsOnly, giftId, gift.name)
  return {
    id: row.id,
    title: row.title,
    action,
    actionLabel: meta ? meta.label : action,
    desc: row.desc_text || row.reward_desc || '',
    reward,
    rewardEnergy: energyOnly,
    rewardCoins: coinsOnly,
    rewardGiftId: giftId,
    rewardGiftName: gift.name,
    rewardGiftImageUrl: gift.imageUrl || '',
    targetCount: target,
    dailyLimit: Math.max(1, Number(row.daily_limit) || 1),
    sortOrder: Number(row.sort_order) || 0,
    status: row.status || 'on',
    enabled: row.status !== 'off',
    quantify: meta ? meta.quantify : '',
    targetUnit: action === 'mall_spend' ? 'cent' : 'count',
  }
}

function listDefs(includeOff = false) {
  ensureSchema()
  const sql = includeOff
    ? `SELECT * FROM task_def ORDER BY sort_order, id`
    : `SELECT * FROM task_def WHERE status='on' ORDER BY sort_order, id`
  return db().prepare(sql).all().map(mapDef)
}

/** 对客 / 运营草稿：仅活跃可统计类型 */
function listClientDefs() {
  return listDefs(false).filter((t) => {
    const a = normalizeActionKey(t.action)
    const meta = ACTION_MAP[a]
    return meta && !meta.hideInTaskList && CLAIM_ACTIONS.has(a)
  })
}

function invitesToday(userId, dk) {
  const d = db()
  try {
    return (
      d
        .prepare(`SELECT COUNT(*) AS n FROM invite_event WHERE inviter_id=? AND day_key=?`)
        .get(userId, dk).n || 0
    )
  } catch (_) {
    return 0
  }
}

function mallPayToday(userId, dk) {
  const d = db()
  try {
    const rows = d
      .prepare(
        `SELECT paid_at, created_at FROM redeem_order
         WHERE user_id=? AND order_type='mall' AND pay_status='paid'`
      )
      .all(userId)
    return rows.filter((r) => dayKeyFromStored(r.paid_at || r.created_at) === dk).length
  } catch (_) {
    return 0
  }
}

function mallSpendToday(userId, dk) {
  const d = db()
  try {
    const rows = d
      .prepare(
        `SELECT pay_cash_cent, paid_at, created_at FROM redeem_order
         WHERE user_id=? AND order_type='mall' AND pay_status='paid'`
      )
      .all(userId)
    let sum = 0
    rows.forEach((r) => {
      if (dayKeyFromStored(r.paid_at || r.created_at) === dk) {
        sum += Number(r.pay_cash_cent) || 0
      }
    })
    return sum
  } catch (_) {
    return 0
  }
}

function lotteryToday(userId, dk) {
  const d = db()
  try {
    const rows = d.prepare(`SELECT created_at FROM lottery_draw WHERE user_id=?`).all(userId)
    return rows.filter((r) => dayKeyFromStored(r.created_at) === dk).length
  } catch (_) {
    return 0
  }
}

function actionEventsToday(userId, actionKey, dk) {
  const d = db()
  try {
    return (
      d
        .prepare(
          `SELECT COUNT(*) AS n FROM task_action_event WHERE user_id=? AND action_key=? AND day_key=?`
        )
        .get(userId, actionKey, dk).n || 0
    )
  } catch (_) {
    return 0
  }
}

function claimedToday(userId, taskId, dk) {
  const row = db()
    .prepare(
      `SELECT 1 AS ok FROM task_completion WHERE user_id=? AND task_id=? AND day_key=? AND status='done'`
    )
    .get(userId, taskId, dk)
  return !!row
}

function progressFor(userId, def, dk) {
  const action = normalizeActionKey(def.action)
  const target = Math.max(1, Number(def.targetCount) || 1)
  if (action === 'invite') return Math.min(target, invitesToday(userId, dk))
  if (action === 'mall_pay') return Math.min(target, mallPayToday(userId, dk))
  if (action === 'mall_spend') return Math.min(target, mallSpendToday(userId, dk))
  if (action === 'lottery') return Math.min(target, lotteryToday(userId, dk))
  if (EVENT_ACTIONS.has(action)) return Math.min(target, actionEventsToday(userId, action, dk))
  return 0
}

function statusFor(def, progress, claimed) {
  const target = Math.max(1, Number(def.targetCount) || 1)
  const a = normalizeActionKey(def.action)
  if (claimed) return 'done'
  if (progress >= target && CLAIM_ACTIONS.has(a)) return 'claim'
  return 'todo'
}

function progressTextFor(def, progress) {
  const target = Math.max(1, Number(def.targetCount) || 1)
  if (normalizeActionKey(def.action) === 'mall_spend') {
    return `${progress}/${target}分`
  }
  return `${progress}/${target}`
}

function filterClientTodayDefs(defs) {
  return (defs || []).filter((t) => {
    const a = normalizeActionKey(t.action)
    const meta = ACTION_MAP[a]
    if (!meta || meta.hideInTaskList) return false
    if (!CLAIM_ACTIONS.has(a)) return false
    const id = String(t.id || '').toLowerCase()
    return !id.includes('step') && a !== 'checkin' && a !== 'ad' && a !== 'steps'
  })
}

function assembleTodayList(userId, dk, defs, progressByAction, claimedIds) {
  const list = defs.map((t) => {
    const action = normalizeActionKey(t.action)
    const target = Math.max(1, Number(t.targetCount) || 1)
    let progress = 0
    if (action === 'invite') progress = Math.min(target, Number(progressByAction.invite) || 0)
    else if (action === 'mall_pay') progress = Math.min(target, Number(progressByAction.mall_pay) || 0)
    else if (action === 'mall_spend')
      progress = Math.min(target, Number(progressByAction.mall_spend) || 0)
    else if (action === 'lottery') progress = Math.min(target, Number(progressByAction.lottery) || 0)
    else if (EVENT_ACTIONS.has(action))
      progress = Math.min(target, Number(progressByAction[action]) || 0)
    const claimed = claimedIds.has(String(t.id))
    const st = statusFor(t, progress, claimed)
    return {
      ...t,
      dayKey: dk,
      progress,
      targetCount: target,
      progressText: progressTextFor(t, progress),
      status: st,
      canClaim: st === 'claim',
      done: st === 'done',
    }
  })
  return {
    dayKey: dk,
    list,
    doneCount: list.filter((x) => x.done).length,
    total: list.length,
  }
}

function listToday(userId) {
  ensureSchema()
  const dk = dayKey()
  const defs = filterClientTodayDefs(listDefs(false))
  const progressByAction = {
    invite: invitesToday(userId, dk),
    mall_pay: mallPayToday(userId, dk),
    mall_spend: mallSpendToday(userId, dk),
    lottery: lotteryToday(userId, dk),
    share: actionEventsToday(userId, 'share', dk),
    browse_mall: actionEventsToday(userId, 'browse_mall', dk),
    browse_festival: actionEventsToday(userId, 'browse_festival', dk),
  }
  const claimedIds = new Set(
    defs.filter((t) => claimedToday(userId, t.id, dk)).map((t) => String(t.id))
  )
  return assembleTodayList(userId, dk, defs, progressByAction, claimedIds)
}

/** GET /tasks/today：批量 queryAsync，禁止逐任务 deasync */
async function listTodayAsync(userId) {
  ensureSchema()
  const dk = dayKey()
  const [defRows, inviteRows, mallRows, lotteryRows, eventRows, claimRows] = await Promise.all([
    dbMod.queryAsync(`SELECT * FROM task_def WHERE status='on' ORDER BY sort_order, id`).then(
      (r) => r[0] || []
    ),
    dbMod
      .queryAsync(`SELECT COUNT(*) AS n FROM invite_event WHERE inviter_id=? AND day_key=?`, [
        userId,
        dk,
      ])
      .then((r) => r[0] || [])
      .catch(() => []),
    dbMod
      .queryAsync(
        `SELECT pay_cash_cent, paid_at, created_at FROM redeem_order
         WHERE user_id=? AND order_type='mall' AND pay_status='paid'`,
        [userId]
      )
      .then((r) => r[0] || [])
      .catch(() => []),
    dbMod
      .queryAsync(`SELECT created_at FROM lottery_draw WHERE user_id=?`, [userId])
      .then((r) => r[0] || [])
      .catch(() => []),
    dbMod
      .queryAsync(
        `SELECT action_key, COUNT(*) AS n FROM task_action_event
         WHERE user_id=? AND day_key=? GROUP BY action_key`,
        [userId, dk]
      )
      .then((r) => r[0] || [])
      .catch(() => []),
    dbMod
      .queryAsync(
        `SELECT task_id FROM task_completion
         WHERE user_id=? AND day_key=? AND status='done'`,
        [userId, dk]
      )
      .then((r) => r[0] || [])
      .catch(() => []),
  ])
  const defs = filterClientTodayDefs((defRows || []).map(mapDef))
  let mallPay = 0
  let mallSpend = 0
  ;(mallRows || []).forEach((r) => {
    if (dayKeyFromStored(r.paid_at || r.created_at) === dk) {
      mallPay += 1
      mallSpend += Number(r.pay_cash_cent) || 0
    }
  })
  const lottery = (lotteryRows || []).filter((r) => dayKeyFromStored(r.created_at) === dk).length
  const progressByAction = {
    invite: Number((inviteRows && inviteRows[0] && inviteRows[0].n) || 0),
    mall_pay: mallPay,
    mall_spend: mallSpend,
    lottery,
    share: 0,
    browse_mall: 0,
    browse_festival: 0,
  }
  ;(eventRows || []).forEach((r) => {
    const k = normalizeActionKey(r.action_key)
    if (EVENT_ACTIONS.has(k)) progressByAction[k] = Number(r.n) || 0
  })
  const claimedIds = new Set((claimRows || []).map((r) => String(r.task_id)))
  return assembleTodayList(userId, dk, defs, progressByAction, claimedIds)
}

function grantTaskGift(userId, giftId, taskId) {
  if (!giftId) return null
  try {
    const ord = require('./adminService').createRedeemOrder({
      userId,
      orderType: 'gift',
      productId: giftId,
      qty: 1,
      payPoints: 0,
      payCashCent: 0,
      entryFrom: 'task',
      address: { note: `自定义任务 ${taskId}`, entryFrom: 'task' },
    })
    return ord && ord.ok ? ord : null
  } catch (e) {
    console.warn('[task] gift order', taskId, e && e.message)
    return null
  }
}

/**
 * 上报可统计行为（分享 / 浏览），按日累计，隔日清零
 */
function recordAction(userId, actionKeyRaw) {
  ensureSchema()
  const action = normalizeActionKey(actionKeyRaw)
  if (!EVENT_ACTIONS.has(action)) {
    return { ok: false, msg: '不支持的行为类型' }
  }
  const dk = dayKey()
  const d = db()
  const dayCount = actionEventsToday(userId, action, dk)
  if (dayCount >= ACTION_RATE.perDay) {
    return { ok: false, msg: '今日该行为已达上限', ...listToday(userId) }
  }
  const minuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
  let recent = 0
  try {
    recent =
      d
        .prepare(
          `SELECT COUNT(*) AS n FROM task_action_event
           WHERE user_id=? AND action_key=? AND created_at>=?`
        )
        .get(userId, action, minuteAgo).n || 0
  } catch (_) {
    recent = 0
  }
  if (recent >= ACTION_RATE.perMinute) {
    return { ok: false, msg: '操作太快，请稍后再试', ...listToday(userId) }
  }
  d.prepare(
    `INSERT INTO task_action_event (user_id, action_key, day_key, created_at) VALUES (?,?,?,?)`
  ).run(userId, action, dk, now())
  return { ok: true, action, dayKey: dk, count: dayCount + 1, ...listToday(userId) }
}

/** async：task_action_event COUNT/INSERT + listToday 全程 queryAsync，禁止占 SyncGate */
async function recordActionAsync(userId, actionKeyRaw) {
  ensureSchema()
  const action = normalizeActionKey(actionKeyRaw)
  if (!EVENT_ACTIONS.has(action)) {
    return { ok: false, msg: '不支持的行为类型' }
  }
  const dk = dayKey()
  let dayCount = 0
  try {
    const [rows] = await dbMod.queryAsync(
      `SELECT COUNT(*) AS n FROM task_action_event WHERE user_id=? AND action_key=? AND day_key=?`,
      [userId, action, dk]
    )
    dayCount = Number((rows && rows[0] && rows[0].n) || 0)
  } catch (_) {
    dayCount = 0
  }
  if (dayCount >= ACTION_RATE.perDay) {
    return { ok: false, msg: '今日该行为已达上限', ...(await listTodayAsync(userId)) }
  }
  const minuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
  let recent = 0
  try {
    const [rows] = await dbMod.queryAsync(
      `SELECT COUNT(*) AS n FROM task_action_event
       WHERE user_id=? AND action_key=? AND created_at>=?`,
      [userId, action, minuteAgo]
    )
    recent = Number((rows && rows[0] && rows[0].n) || 0)
  } catch (_) {
    recent = 0
  }
  if (recent >= ACTION_RATE.perMinute) {
    return { ok: false, msg: '操作太快，请稍后再试', ...(await listTodayAsync(userId)) }
  }
  await dbMod.queryAsync(
    `INSERT INTO task_action_event (user_id, action_key, day_key, created_at) VALUES (?,?,?,?)`,
    [userId, action, dk, now()]
  )
  return {
    ok: true,
    action,
    dayKey: dk,
    count: dayCount + 1,
    ...(await listTodayAsync(userId)),
  }
}
/**
 * 领取任务（每日每任务最多一次 done）；必须进度达标。
 * includeToday=false 时不拼 listToday，供 async 路由在闸外 listTodayAsync。
 */
function complete(userId, taskId, { includeToday = true } = {}) {
  ensureSchema()
  const d = db()
  const withToday = (payload) => (includeToday ? { ...payload, ...listToday(userId) } : payload)
  const row = d.prepare(`SELECT * FROM task_def WHERE id=? AND status='on'`).get(taskId)
  if (!row) return withToday({ ok: false, msg: '任务不存在或已停用' })
  const def = mapDef(row)
  const actionCheck = assertBuiltinAction(def.action)
  if (!actionCheck.ok) return withToday({ ok: false, msg: actionCheck.msg })
  const action = actionCheck.key
  const dk = dayKey()
  if (claimedToday(userId, taskId, dk)) {
    return withToday({ ok: false, msg: '今日已完成' })
  }

  const progress = progressFor(userId, def, dk)
  const target = Math.max(1, Number(def.targetCount) || 1)
  if (progress < target) {
    const unit = action === 'mall_spend' ? '分' : action === 'invite' ? '人' : '次'
    return withToday({
      ok: false,
      msg: `进度未达标（${progress}/${target}${unit}）`,
    })
  }

  const energyOnly = Number(def.rewardEnergy) || 0
  const coinsOnly = Number(def.rewardCoins) || 0
  // 钱包已统一能量口径：金币字段发放时并入能量，文案仍可显示「金币+N」
  const grantEnergy = energyOnly + coinsOnly
  const reward = {
    energy: grantEnergy,
    coins: coinsOnly,
    giftId: def.rewardGiftId || '',
    label: def.reward,
  }

  // 以唯一键 (user_id,task_id,day_key) 原子抢占领奖资格；抢不到说明并发请求已领
  let claimedNow = false
  const tx = d.transaction(() => {
    const tdb = db()
    const rewardJson = JSON.stringify(reward)
    const ins = tdb
      .prepare(
        `INSERT OR IGNORE INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at)
         VALUES (?,?,?,'done',?,?)`
      )
      .run(userId, taskId, dk, rewardJson, now())
    let won = !!(ins && ins.changes)
    if (!won) {
      const up = tdb
        .prepare(
          `UPDATE task_completion SET status='done', reward_json=?
           WHERE user_id=? AND task_id=? AND day_key=? AND status!='done'`
        )
        .run(rewardJson, userId, taskId, dk)
      won = !!(up && up.changes)
    }
    if (!won) return
    claimedNow = true
    if (grantEnergy > 0) {
      require('./currencyService').grantEnergy(userId, grantEnergy, { note: `task:${taskId}` })
    }
  })
  tx()
  if (!claimedNow) return withToday({ ok: false, msg: '今日已完成' })

  let giftOrder = null
  if (def.rewardGiftId) {
    giftOrder = grantTaskGift(userId, def.rewardGiftId, taskId)
    if (!giftOrder) {
      return withToday({
        ok: true,
        partial: true,
        msg: '奖励已到账，礼品下单失败请联系客服',
        reward,
        wallet: require('./currencyService').getWallet(userId),
      })
    }
  }

  const parts = []
  if (energyOnly > 0) parts.push(`能量+${energyOnly}`)
  if (coinsOnly > 0) parts.push(`金币+${coinsOnly}`)
  if (giftOrder) parts.push('礼品已生成兑礼单')
  return withToday({
    ok: true,
    msg: parts.length ? `任务完成 · ${parts.join(' · ')}` : '任务完成',
    reward,
    giftOrder,
    wallet: require('./currencyService').getWallet(userId),
  })
}

/** async：领奖全程 queryAsync，禁止 runSync/deasync */
async function completeAsync(userId, taskId) {
  ensureSchema()
  const tid = String(taskId || '').trim()
  if (!tid) return { ok: false, msg: '缺少 taskId', ...(await listTodayAsync(userId)) }
  const [defRows] = await dbMod.queryAsync(
    `SELECT * FROM task_def WHERE id=? AND status='on' LIMIT 1`,
    [tid]
  )
  const row = defRows && defRows[0]
  if (!row) return { ok: false, msg: '任务不存在或已停用', ...(await listTodayAsync(userId)) }
  const def = mapDef(row)
  const actionCheck = assertBuiltinAction(def.action)
  if (!actionCheck.ok) {
    return { ok: false, msg: actionCheck.msg, ...(await listTodayAsync(userId)) }
  }
  const dk = dayKey()
  const [claimRows] = await dbMod.queryAsync(
    `SELECT 1 AS ok FROM task_completion WHERE user_id=? AND task_id=? AND day_key=? AND status='done' LIMIT 1`,
    [userId, tid, dk]
  )
  if (claimRows && claimRows[0]) {
    return { ok: false, msg: '今日已完成', ...(await listTodayAsync(userId)) }
  }

  // 进度：复用 listTodayAsync 组装结果，避免再跑同步 progressFor
  const todayPreview = await listTodayAsync(userId)
  const hit = (todayPreview.list || []).find((x) => String(x.id) === tid)
  const progress = hit ? Number(hit.progress) || 0 : 0
  const target = Math.max(1, Number(def.targetCount) || 1)
  if (progress < target) {
    const unit = actionCheck.key === 'mall_spend' ? '分' : actionCheck.key === 'invite' ? '人' : '次'
    return {
      ok: false,
      msg: `进度未达标（${progress}/${target}${unit}）`,
      ...todayPreview,
    }
  }

  const energyOnly = Number(def.rewardEnergy) || 0
  const coinsOnly = Number(def.rewardCoins) || 0
  const grantAmt = energyOnly + coinsOnly
  const reward = {
    energy: grantAmt,
    coins: coinsOnly,
    giftId: def.rewardGiftId || '',
    label: def.reward,
  }
  const rewardJson = JSON.stringify(reward)
  const t = now()
  let claimedNow = false
  try {
    const [ins] = await dbMod.queryAsync(
      `INSERT IGNORE INTO task_completion (user_id,task_id,day_key,status,reward_json,created_at)
       VALUES (?,?,?,'done',?,?)`,
      [userId, tid, dk, rewardJson, t]
    )
    claimedNow = Number((ins && (ins.affectedRows || ins.changes)) || 0) > 0
  } catch (_) {
    claimedNow = false
  }
  if (!claimedNow) {
    try {
      const [up] = await dbMod.queryAsync(
        `UPDATE task_completion SET status='done', reward_json=?
         WHERE user_id=? AND task_id=? AND day_key=? AND status!='done'`,
        [rewardJson, userId, tid, dk]
      )
      claimedNow = Number((up && (up.affectedRows || up.changes)) || 0) > 0
    } catch (_) {}
  }
  if (!claimedNow) return { ok: false, msg: '今日已完成', ...(await listTodayAsync(userId)) }

  let wallet = null
  if (grantAmt > 0) {
    wallet = await require('./currencyService').grantEnergyAsync(userId, grantAmt, {
      note: `task:${tid}`,
      refType: 'task',
      refId: tid,
    })
  } else {
    wallet = await require('./currencyService').getWalletAsync(userId)
  }

  const parts = []
  if (energyOnly > 0) parts.push(`能量+${energyOnly}`)
  if (coinsOnly > 0) parts.push(`金币+${coinsOnly}`)
  const today = await listTodayAsync(userId)
  return {
    ...today,
    ok: true,
    msg: parts.length ? `任务完成 · ${parts.join(' · ')}` : '任务完成',
    reward,
    wallet,
  }
}
function ensureTaskColumnsOnUpsert(body) {
  ensureSchema()
  return {
    targetCount: Math.max(1, Number(body.targetCount != null ? body.targetCount : body.dailyLimit) || 1),
    rewardGiftId: String(body.rewardGiftId || body.giftId || '').trim(),
    descText: String(body.descText || body.desc || '').trim(),
  }
}

module.exports = {
  ensureSchema,
  dayKey,
  listDefs,
  listClientDefs,
  listToday,
  listTodayAsync,
  complete,
  completeAsync,
  recordAction,
  recordActionAsync,
  mapDef,
  autoRewardDesc,
  giftName,
  ensureTaskColumnsOnUpsert,
  BUILTIN_ACTIONS,
  ACTIVE_ACTIONS,
  getBuiltinActions,
  assertBuiltinAction,
  normalizeActionKey,
}
