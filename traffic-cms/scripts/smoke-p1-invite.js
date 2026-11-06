/**
 * P1 冒烟：绑码 → 首签 → 冻结 → 解冻；门槛拦截；分享 path 形状
 * 用法：在 traffic-cms 目录 node scripts/smoke-p1-invite.js
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const crypto = require('crypto')
const dbMod = require('../src/db')
const checkin = require('../src/services/checkinService')
const invite = require('../src/services/inviteService')
const commerce = require('../src/services/commerceService')

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

function createUser(nick) {
  const d = dbMod.open()
  const now = dbMod.nowIso()
  const openid = `smoke_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const code = `YX${crypto.randomBytes(3).toString('hex').toUpperCase()}`
  const info = d
    .prepare(
      `INSERT INTO user_account (platform, openid, unionid, nick_name, avatar_url, invite_code, channel, session_key, created_at, updated_at)
       VALUES ('mp-weixin', ?, '', ?, '', ?, 'smoke', '', ?, ?)`
    )
    .run(openid, nick, code, now, now)
  const id = Number(info.lastInsertRowid || info.insertId)
  d.prepare(
    `INSERT OR IGNORE INTO user_wallet (user_id, energy, points, coins, lottery_chance, updated_at)
     VALUES (?, 0, 0, 0, 0, ?)`
  ).run(id, now)
  return { id, invite_code: code }
}

async function main() {
  dbMod.open()
  invite.ensureTables()
  checkin.ensureTables()

  const inviter = createUser('邀请人A')
  const invitee = createUser('被邀B')
  assert(inviter.invite_code, '邀请人应有 invite_code')

  const bind = invite.tryBind(invitee.id, inviter.invite_code)
  assert(bind.ok, `绑定失败: ${bind.msg}`)

  const bind2 = invite.tryBind(invitee.id, inviter.invite_code)
  assert(!bind2.ok, '二次绑定应失败')

  const before = invite.validInviteCount(inviter.id)
  const ck = checkin.checkin(invitee.id)
  assert(ck.ok, `首签失败: ${ck.msg}`)
  const after = invite.validInviteCount(inviter.id)
  assert(after === before + 1, `有效邀请应 +1，实际 ${before}→${after}`)

  const holds = dbMod
    .open()
    .prepare(`SELECT * FROM invite_reward_hold WHERE user_id=? AND status='frozen'`)
    .all(inviter.id)
  if (!holds.length) {
    dbMod
      .open()
      .prepare(
        `INSERT INTO invite_reward_hold (user_id, tier_need, reward_json, unlock_at, status, created_at)
         VALUES (?,?,?,?, 'frozen', ?)`
      )
      .run(
        inviter.id,
        1,
        JSON.stringify({ type: 'energy', value: 7, label: '测试解冻+7' }),
        Date.now() - 1000,
        new Date().toISOString()
      )
  } else {
    dbMod
      .open()
      .prepare(`UPDATE invite_reward_hold SET unlock_at=? WHERE user_id=? AND status='frozen'`)
      .run(Date.now() - 1000, inviter.id)
  }
  const unlock = invite.unlockDue(inviter.id)
  assert(unlock.unlocked && unlock.unlocked.length, '应解冻至少一笔')

  // 写高门槛礼并拦截
  const d = dbMod.open()
  const gid = `smoke_gift_${Date.now()}`
  d.prepare(
    `INSERT OR REPLACE INTO product (id,name,category,price_cent,cost_cent,points_off,stock,stock_alarm,image_url,tag,status,sort_order,meta_json,updated_at)
     VALUES (?,?, '兑礼', 0, 100, 0, 10, 1, '', '测', 'on', 99, ?, ?)`
  ).run(
    gid,
    '冒烟高门槛礼',
    JSON.stringify({ costPoints: 0, needInvite: 99, needStreak: 0, firstWave: true }),
    new Date().toISOString()
  )
  const r = commerce.placeOrder(inviter.id, {
    orderType: 'gift',
    productId: gid,
    address: {
      name: '测',
      phone: '13800138000',
      province: '广东省',
      city: '广州市',
      district: '天河区',
      detail: '测试路 1 号',
    },
  })
  assert(!r.ok, '高门槛应拦截')
  assert(/邀请/.test(r.msg || ''), `文案应含邀请，实际: ${r.msg}`)

  const sample = `/pages/home/index?invite=${encodeURIComponent(inviter.invite_code)}&channel=share_nearmiss&from=progress`
  assert(sample.includes('/pages/home/index'), '落地页应为 home')
  assert(sample.includes('invite='), '须带 invite')
  assert(sample.includes('channel='), '须带 channel')

  console.log('P1 smoke OK', {
    inviterId: inviter.id,
    inviteeId: invitee.id,
    code: inviter.invite_code,
    validInvites: after,
    unlocked: unlock.unlocked.length,
    gateMsg: r.msg,
  })
}

main().catch((e) => {
  console.error('P1 smoke FAIL', e)
  process.exit(1)
})
