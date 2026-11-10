/**
 * P0：好友列表 / 偷能量 / 助力（读 game.stealPerDay / helpEnergy*）
 */
const dbMod = require('../db')
const configService = require('./configService')
const jarService = require('./jarService')

function dayKey() {
  const x = new Date()
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

function ensureTables() {
  dbMod.open().exec(`
    CREATE TABLE IF NOT EXISTS friend_edge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      friend_user_id INTEGER NOT NULL,
      status VARCHAR(16) NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      UNIQUE(user_id, friend_user_id)
    );
    CREATE TABLE IF NOT EXISTS social_action_day (
      user_id INTEGER NOT NULL,
      day_key TEXT NOT NULL,
      steals INTEGER NOT NULL DEFAULT 0,
      helps INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day_key)
    );
  `)
}

function rules() {
  const g = (configService.getPublished() || {}).game || {}
  return {
    stealPerDay: Number(g.stealPerDay) > 0 ? Number(g.stealPerDay) : 3,
    helpPerDay: Number(g.helpPerDay) > 0 ? Number(g.helpPerDay) : 3,
    helpEnergyMe: Number(g.helpEnergyMe) >= 0 ? Number(g.helpEnergyMe) : 5,
    helpEnergyFriend: Number(g.helpEnergyFriend) >= 0 ? Number(g.helpEnergyFriend) : 20,
    stealRatio: Number(g.stealRatio) > 0 ? Number(g.stealRatio) : 0.5,
    stealMin: Number(g.stealMin) > 0 ? Number(g.stealMin) : 1,
  }
}

function seedDemoFriends(userId) {
  ensureTables()
  const d = dbMod.open()
  const n = d.prepare(`SELECT COUNT(*) AS n FROM friend_edge WHERE user_id=?`).get(userId).n
  if (n > 0) return
  const now = dbMod.nowIso()
  // 造 2 个演示好友账号
  ;[
    { openid: `demo_friend_a_${userId}`, nick: '小林' },
    { openid: `demo_friend_b_${userId}`, nick: '七七' },
  ].forEach((f, idx) => {
    let row = d.prepare(`SELECT id FROM user_account WHERE platform='mp-weixin' AND openid=?`).get(f.openid)
    if (!row) {
      const code = `DF${String(userId).slice(-2)}${idx}${Math.floor(Math.random() * 90 + 10)}`
      const info = d
        .prepare(
          `INSERT INTO user_account (platform, openid, nick_name, invite_code, channel, created_at, updated_at)
           VALUES ('mp-weixin',?,?,?, 'demo',?,?)`
        )
        .run(f.openid, f.nick, code, now, now)
      row = { id: info.lastInsertRowid }
      d.prepare(
        `INSERT INTO user_wallet (user_id, energy, points, coins, lottery_chance, updated_at) VALUES (?, 200, 0, 0, 0, ?)`
      ).run(row.id, now)
      const pending = idx === 0 ? 36 : 0
      d.prepare(
        `INSERT INTO jar_state (user_id, stage, liquid, pending, next_harvest_at, water_ready_at,
           water_count, steals_left, helped_json, event_json, updated_at)
         VALUES (?, 1, 40, ?, ?, ?, 0, 3, '[]', NULL, ?)`
      ).run(row.id, pending, Date.now() + 3600000, Date.now() - 1000, now)
    }
    d.prepare(
      `INSERT OR IGNORE INTO friend_edge (user_id, friend_user_id, status, created_at) VALUES (?,?, 'active', ?)`
    ).run(userId, row.id, now)
    d.prepare(
      `INSERT OR IGNORE INTO friend_edge (user_id, friend_user_id, status, created_at) VALUES (?,?, 'active', ?)`
    ).run(row.id, userId, now)
  })
}

function dayAction(userId) {
  ensureTables()
  const d = dbMod.open()
  const dk = dayKey()
  let row = d.prepare(`SELECT * FROM social_action_day WHERE user_id=? AND day_key=?`).get(userId, dk)
  if (!row) {
    d.prepare(
      `INSERT INTO social_action_day (user_id, day_key, steals, helps) VALUES (?,?,0,0)`
    ).run(userId, dk)
    row = { steals: 0, helps: 0 }
  }
  return row
}

function listFriends(userId) {
  ensureTables()
  seedDemoFriends(userId)
  // 打开列表时给好友懒结算，便于有可偷能量
  const d = dbMod.open()
  const edges = d
    .prepare(
      `SELECT e.friend_user_id AS fid, u.nick_name
       FROM friend_edge e
       JOIN user_account u ON u.id=e.friend_user_id
       WHERE e.user_id=? AND e.status='active'`
    )
    .all(userId)
  const r = rules()
  const act = dayAction(userId)
  const meJar = d.prepare(`SELECT helped_json FROM jar_state WHERE user_id=?`).get(userId)
  const helpedIds = meJar ? JSON.parse(meJar.helped_json || '[]') : []

  let nutritionMap = {}
  try {
    const treeService = require('./treeService')
    edges.forEach((e) => {
      try {
        treeService.ensureDailyDrop(e.fid)
      } catch (_) {}
    })
    nutritionMap = treeService.friendDropPreview(edges.map((e) => e.fid))
  } catch (_) {}

  const friends = edges.map((e) => {
    try {
      jarService.accruePending(e.fid)
    } catch (err) {}
    const jar = d.prepare(`SELECT pending, liquid FROM jar_state WHERE user_id=?`).get(e.fid)
    const pending = jar ? jar.pending : 0
    const nutritionDrop = Number(nutritionMap[e.fid]) || 0
    let status = 'empty'
    let energy = 0
    let tip = '暂无能量'
    if (pending > 0) {
      status = 'stealable'
      energy = Math.max(r.stealMin, Math.ceil(pending * r.stealRatio))
      tip = `可收 ${energy}`
    } else if (nutritionDrop > 0) {
      status = 'nutrition'
      tip = `树上营养 ${nutritionDrop}`
    } else if (!helpedIds.includes(e.fid) && act.helps < r.helpPerDay) {
      status = 'boost'
      tip = '可助力'
    }
    return {
      id: e.fid,
      name: e.nick_name || '好友',
      energy,
      pending,
      nutritionDrop,
      status,
      tip,
    }
  })

  return {
    friends,
    stealsLeft: Math.max(0, r.stealPerDay - act.steals),
    helpsLeft: Math.max(0, r.helpPerDay - act.helps),
    rules: r,
  }
}

function consumeStealSlot(userId) {
  ensureTables()
  const d = dbMod.open()
  dayAction(userId)
  d.prepare(`UPDATE social_action_day SET steals=steals+1 WHERE user_id=? AND day_key=?`).run(
    userId,
    dayKey()
  )
}

function steal(userId, friendId, actionId) {
  ensureTables()
  const d = dbMod.open()
  if (actionId) {
    const dup = d.prepare(`SELECT id FROM jar_ledger WHERE user_id=? AND action_id=?`).get(userId, actionId)
    if (dup) return { ok: true, idempotent: true, ...listFriends(userId) }
  }
  const edge = d
    .prepare(`SELECT 1 AS ok FROM friend_edge WHERE user_id=? AND friend_user_id=? AND status='active'`)
    .get(userId, friendId)
  if (!edge) return { ok: false, msg: '还不是好友' }
  const r = rules()
  const act = dayAction(userId)
  if (act.steals >= r.stealPerDay) return { ok: false, msg: '今日偷取次数已用完' }

  jarService.accruePending(friendId)
  const jar = d.prepare(`SELECT pending FROM jar_state WHERE user_id=?`).get(friendId)
  if (!jar || jar.pending <= 0) return { ok: false, msg: '没有可收的能量' }
  const got = Math.max(r.stealMin, Math.ceil(jar.pending * r.stealRatio))
  const left = Math.max(0, jar.pending - got)
  const now = dbMod.nowIso()
  const friend = d.prepare(`SELECT nick_name FROM user_account WHERE id=?`).get(friendId)
  const me = d.prepare(`SELECT nick_name FROM user_account WHERE id=?`).get(userId)

  const tx = d.transaction(() => {
    d.prepare(`UPDATE jar_state SET pending=?, updated_at=? WHERE user_id=?`).run(left, now, friendId)
    d.prepare(`UPDATE user_wallet SET energy=energy+?, updated_at=? WHERE user_id=?`).run(got, now, userId)
    d.prepare(
      `UPDATE social_action_day SET steals=steals+1 WHERE user_id=? AND day_key=?`
    ).run(userId, dayKey())
    if (actionId) {
      d.prepare(
        `INSERT INTO jar_ledger (user_id, action_id, action_type, delta_energy, delta_liquid, meta_json, created_at)
         VALUES (?,?,?,?,?,?,?)`
      ).run(userId, actionId, 'steal', got, 0, JSON.stringify({ friendId }), now)
    }
    d.prepare(
      `INSERT INTO social_feed (user_id, actor_name, feed_type, amount, tip, created_at, read_flag)
       VALUES (?,?, 'stolen', ?, '偷走了你的能量', ?, 0)`
    ).run(friendId, (me && me.nick_name) || '好友', got, now)
  })
  tx()
  return {
    ok: true,
    msg: `顺手收了 ${got} 点 · 来自${(friend && friend.nick_name) || '好友'}`,
    got,
    ...listFriends(userId),
  }
}

function help(userId, friendId, actionId) {
  ensureTables()
  const d = dbMod.open()
  if (actionId) {
    const dup = d.prepare(`SELECT id FROM jar_ledger WHERE user_id=? AND action_id=?`).get(userId, actionId)
    if (dup) return { ok: true, idempotent: true, ...listFriends(userId) }
  }
  const edge = d
    .prepare(`SELECT 1 AS ok FROM friend_edge WHERE user_id=? AND friend_user_id=? AND status='active'`)
    .get(userId, friendId)
  if (!edge) return { ok: false, msg: '还不是好友' }
  const r = rules()
  const act = dayAction(userId)
  if (act.helps >= r.helpPerDay) return { ok: false, msg: '今日助力次数已用完' }

  const meJar = d.prepare(`SELECT helped_json FROM jar_state WHERE user_id=?`).get(userId)
  const helped = meJar ? JSON.parse(meJar.helped_json || '[]') : []
  if (helped.includes(friendId)) return { ok: false, msg: '今天已经帮过啦' }

  const now = dbMod.nowIso()
  const friend = d.prepare(`SELECT nick_name FROM user_account WHERE id=?`).get(friendId)
  const me = d.prepare(`SELECT nick_name FROM user_account WHERE id=?`).get(userId)
  helped.push(friendId)

  const tx = d.transaction(() => {
    d.prepare(`UPDATE user_wallet SET energy=energy+?, updated_at=? WHERE user_id=?`).run(
      r.helpEnergyMe,
      now,
      userId
    )
    d.prepare(`UPDATE user_wallet SET energy=energy+?, updated_at=? WHERE user_id=?`).run(
      r.helpEnergyFriend,
      now,
      friendId
    )
    // 好友液体 +2（助力砍进度）
    const fJar = d.prepare(`SELECT liquid FROM jar_state WHERE user_id=?`).get(friendId)
    if (fJar) {
      const liquid = Math.min(100, (fJar.liquid || 0) + 2)
      d.prepare(`UPDATE jar_state SET liquid=?, updated_at=? WHERE user_id=?`).run(liquid, now, friendId)
    }
    d.prepare(`UPDATE jar_state SET helped_json=?, updated_at=? WHERE user_id=?`).run(
      JSON.stringify(helped),
      now,
      userId
    )
    d.prepare(`UPDATE social_action_day SET helps=helps+1 WHERE user_id=? AND day_key=?`).run(userId, dayKey())
    if (actionId) {
      d.prepare(
        `INSERT INTO jar_ledger (user_id, action_id, action_type, delta_energy, delta_liquid, meta_json, created_at)
         VALUES (?,?,?,?,?,?,?)`
      ).run(userId, actionId, 'help', r.helpEnergyMe, 0, JSON.stringify({ friendId }), now)
    }
    d.prepare(
      `INSERT INTO social_feed (user_id, actor_name, feed_type, amount, tip, created_at, read_flag)
       VALUES (?,?, 'helped', ?, '给你浇了水', ?, 0)`
    ).run(friendId, (me && me.nick_name) || '好友', r.helpEnergyFriend, now)
  })
  tx()
  return {
    ok: true,
    msg: `帮${(friend && friend.nick_name) || '好友'}砍了一下 · 你 +${r.helpEnergyMe}`,
    ...listFriends(userId),
  }
}

module.exports = {
  listFriends,
  steal,
  help,
  seedDemoFriends,
  ensureTables,
  consumeStealSlot,
  dayAction,
  rules,
}
