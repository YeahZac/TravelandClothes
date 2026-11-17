/**
 * 用户协议 / 隐私政策 / 能量值规则：入库 content_copy（surface=legal），供小程序展示与后台编辑。
 * 文稿为业务模板，正式上线前建议公司法务审阅。
 */
const fs = require('fs')
const path = require('path')
const dbMod = require('../db')

const ROOT = path.join(__dirname, '..', '..')
const TOS_ID = 'legal_tos'
const PRIVACY_ID = 'legal_privacy'
const ENERGY_ID = 'legal_energy'

const ENERGY_RULE_LINES = [
  '「能量值」是营销积分 / 会员积分，仅可在本小程序内按规则使用',
  '能量值不是虚拟货币、不是代币，不具有法定货币属性',
  '不得提现、不得转赠、不得兑微信红包或其他现金红包',
  '平台不提供「能量值回收 / 兑换现金」入口，请勿轻信第三方套现',
]

function db() {
  return dbMod.open()
}

function now() {
  return dbMod.nowIso()
}

function readFileSafe(rel) {
  const p = path.join(ROOT, rel)
  if (!fs.existsSync(p)) return ''
  return fs.readFileSync(p, 'utf8')
}

function parseMeta(body) {
  const text = String(body || '')
  const version = (text.match(/【版本号】\s*([^\n\r]+)/) || [])[1] || '1.0.0'
  const title = (text.match(/【文档名称】\s*([^\n\r]+)/) || [])[1] || ''
  const effective = (text.match(/【生效日期】\s*([^\n\r]+)/) || [])[1] || ''
  return {
    version: String(version).trim(),
    title: String(title).trim(),
    effective: String(effective).trim(),
  }
}

function publicIdOf(rowId) {
  if (rowId === TOS_ID) return 'tos'
  if (rowId === PRIVACY_ID) return 'privacy'
  if (rowId === ENERGY_ID) return 'energy'
  return rowId
}

function resolveDocKey(docId) {
  const id = String(docId || '').trim()
  if (id === 'tos' || id === 'service' || id === TOS_ID) return TOS_ID
  if (id === 'privacy' || id === PRIVACY_ID) return PRIVACY_ID
  if (id === 'energy' || id === 'energy_rules' || id === ENERGY_ID) return ENERGY_ID
  return null
}

function ensureLegalDocs() {
  const d = db()
  const t = now()
  const seeds = [
    {
      id: TOS_ID,
      label: '用户服务协议',
      body: readFileSafe('data/legal/tos.md') || '用户服务协议正文待配置',
      surface: 'legal',
    },
    {
      id: PRIVACY_ID,
      label: '用户隐私政策',
      body: readFileSafe('data/legal/privacy.md') || '用户隐私政策正文待配置',
      surface: 'legal',
    },
    {
      id: ENERGY_ID,
      label: '能量值规则说明',
      body: readFileSafe('data/legal/energy.md') || '能量值规则说明待配置',
      surface: 'legal',
    },
  ]
  seeds.forEach((s) => {
    const exists = d.prepare('SELECT id, body FROM content_copy WHERE id=?').get(s.id)
    if (!exists) {
      d.prepare(
        `INSERT INTO content_copy (id,label,body,surface,updated_at) VALUES (?,?,?,?,?)`
      ).run(s.id, s.label, s.body, s.surface, t)
      return
    }
    const oldBody = String(exists.body || '')
    const oldVer = parseMeta(oldBody).version
    const nextVer = parseMeta(s.body).version
    // 占位短文，或仓库模板版本更高时覆盖（便于合规文案热更新）
    const shouldReplace =
      oldBody.length < 80 || (nextVer && oldVer && nextVer !== oldVer && String(s.body).length > 80)
    if (shouldReplace) {
      d.prepare(`UPDATE content_copy SET label=?, body=?, surface=?, updated_at=? WHERE id=?`).run(
        s.label,
        s.body,
        s.surface,
        t,
        s.id
      )
    }
  })
}

function rowToDoc(row) {
  if (!row) return null
  const meta = parseMeta(row.body)
  return {
    id: publicIdOf(row.id),
    docKey: row.id,
    title: meta.title || row.label,
    label: row.label,
    version: meta.version,
    effective: meta.effective,
    updatedAt: row.updated_at,
    body: row.body,
  }
}

function slimDoc(doc) {
  return doc
    ? {
        id: doc.id,
        docKey: doc.docKey,
        title: doc.title,
        version: doc.version,
        effective: doc.effective,
        updatedAt: doc.updatedAt,
      }
    : null
}

function packPublic(tos, privacy, energy) {
  return {
    tos: slimDoc(tos),
    privacy: slimDoc(privacy),
    energy: slimDoc(energy),
    energyRuleLines: ENERGY_RULE_LINES.slice(),
  }
}

let legalListMem = { at: 0, payload: null }
const LEGAL_TTL_MS = Math.max(10000, Number(process.env.LEGAL_CACHE_TTL_MS || 120000))

function listPublic() {
  const nowMs = Date.now()
  if (legalListMem.payload && nowMs - legalListMem.at < LEGAL_TTL_MS) return legalListMem.payload
  // 闸门忙时禁止 ensureLegalDocs（写库+多查）
  if (typeof dbMod.isSyncGateBusy === 'function' && dbMod.isSyncGateBusy()) {
    return legalListMem.payload || packPublic(null, null, null)
  }
  try {
    ensureLegalDocs()
  } catch (e) {
    if (legalListMem.payload) return legalListMem.payload
  }
  const d = db()
  const tos = rowToDoc(d.prepare('SELECT * FROM content_copy WHERE id=?').get(TOS_ID))
  const privacy = rowToDoc(d.prepare('SELECT * FROM content_copy WHERE id=?').get(PRIVACY_ID))
  const energy = rowToDoc(d.prepare('SELECT * FROM content_copy WHERE id=?').get(ENERGY_ID))
  const payload = packPublic(tos, privacy, energy)
  legalListMem = { at: nowMs, payload }
  return payload
}

/** C 端热路径：queryAsync + 内存缓存，不占 SyncGate */
async function listPublicAsync() {
  const nowMs = Date.now()
  if (legalListMem.payload && nowMs - legalListMem.at < LEGAL_TTL_MS) return legalListMem.payload
  try {
    const [rows] = await dbMod.queryAsync(
      `SELECT * FROM content_copy WHERE id IN (?,?,?)`,
      [TOS_ID, PRIVACY_ID, ENERGY_ID]
    )
    const byId = new Map((rows || []).map((r) => [r.id, r]))
    const payload = packPublic(
      rowToDoc(byId.get(TOS_ID)),
      rowToDoc(byId.get(PRIVACY_ID)),
      rowToDoc(byId.get(ENERGY_ID))
    )
    legalListMem = { at: nowMs, payload }
    return payload
  } catch (e) {
    if (legalListMem.payload) return legalListMem.payload
    console.warn('[legal] listPublicAsync', e && e.message)
    return packPublic(null, null, null)
  }
}

function getPublic(docId) {
  const key = resolveDocKey(docId)
  if (!key) return null
  try {
    ensureLegalDocs()
  } catch (_) {}
  const row = db().prepare('SELECT * FROM content_copy WHERE id=?').get(key)
  return rowToDoc(row)
}

async function getPublicAsync(docId) {
  const key = resolveDocKey(docId)
  if (!key) return null
  try {
    const [rows] = await dbMod.queryAsync(`SELECT * FROM content_copy WHERE id=? LIMIT 1`, [key])
    return rowToDoc(rows && rows[0])
  } catch (e) {
    console.warn('[legal] getPublicAsync', e && e.message)
    return null
  }
}

function requireAgreement(body = {}) {
  const agreed = body.agreeLegal === true || body.agreeLegal === 1 || body.agreeLegal === '1'
  if (!agreed) {
    const err = new Error('请先阅读并同意用户服务协议与隐私政策')
    err.code = 'LEGAL_REQUIRED'
    throw err
  }
  const meta = listPublic()
  return {
    tosVersion: body.tosVersion || (meta.tos && meta.tos.version) || '1.0.0',
    privacyVersion: body.privacyVersion || (meta.privacy && meta.privacy.version) || '1.0.0',
    agreedAt: now(),
  }
}

function persistUserAgreement(userId, agreement) {
  if (!userId || !agreement) return
  const d = db()
  dbMod.addColumnIfMissing(
    d,
    'user_account',
    'legal_tos_ver',
    `VARCHAR(32) NOT NULL DEFAULT ''`,
    `TEXT NOT NULL DEFAULT ''`
  )
  dbMod.addColumnIfMissing(
    d,
    'user_account',
    'legal_privacy_ver',
    `VARCHAR(32) NOT NULL DEFAULT ''`,
    `TEXT NOT NULL DEFAULT ''`
  )
  dbMod.addColumnIfMissing(
    d,
    'user_account',
    'legal_agreed_at',
    `VARCHAR(40) NOT NULL DEFAULT ''`,
    `TEXT NOT NULL DEFAULT ''`
  )
  d.prepare(
    `UPDATE user_account SET legal_tos_ver=?, legal_privacy_ver=?, legal_agreed_at=?, updated_at=? WHERE id=?`
  ).run(agreement.tosVersion, agreement.privacyVersion, agreement.agreedAt, now(), userId)
}

module.exports = {
  TOS_ID,
  PRIVACY_ID,
  ENERGY_ID,
  ENERGY_RULE_LINES,
  ensureLegalDocs,
  listPublic,
  listPublicAsync,
  getPublic,
  getPublicAsync,
  requireAgreement,
  persistUserAgreement,
}
