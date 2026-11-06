/**
 * 用户协议 / 隐私政策：入库 content_copy（surface=legal），供小程序登录前展示与后台编辑。
 * 文稿为业务模板，正式上线前建议公司法务审阅。
 */
const fs = require('fs')
const path = require('path')
const dbMod = require('../db')

const ROOT = path.join(__dirname, '..', '..')
const TOS_ID = 'legal_tos'
const PRIVACY_ID = 'legal_privacy'

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
  ]
  seeds.forEach((s) => {
    const exists = d.prepare('SELECT id, body FROM content_copy WHERE id=?').get(s.id)
    if (!exists) {
      d.prepare(
        `INSERT INTO content_copy (id,label,body,surface,updated_at) VALUES (?,?,?,?,?)`
      ).run(s.id, s.label, s.body, s.surface, t)
      return
    }
    // 库中仍是占位短文时，用仓库模板覆盖一次
    if (!exists.body || String(exists.body).length < 80) {
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
    id: row.id === TOS_ID ? 'tos' : row.id === PRIVACY_ID ? 'privacy' : row.id,
    docKey: row.id,
    title: meta.title || row.label,
    label: row.label,
    version: meta.version,
    effective: meta.effective,
    updatedAt: row.updated_at,
    body: row.body,
  }
}

function listPublic() {
  ensureLegalDocs()
  const d = db()
  const tos = d.prepare('SELECT * FROM content_copy WHERE id=?').get(TOS_ID)
  const privacy = d.prepare('SELECT * FROM content_copy WHERE id=?').get(PRIVACY_ID)
  const a = rowToDoc(tos)
  const b = rowToDoc(privacy)
  return {
    tos: a
      ? { id: a.id, docKey: a.docKey, title: a.title, version: a.version, effective: a.effective, updatedAt: a.updatedAt }
      : null,
    privacy: b
      ? {
          id: b.id,
          docKey: b.docKey,
          title: b.title,
          version: b.version,
          effective: b.effective,
          updatedAt: b.updatedAt,
        }
      : null,
  }
}

function getPublic(docId) {
  ensureLegalDocs()
  const key =
    docId === 'tos' || docId === 'service' || docId === TOS_ID
      ? TOS_ID
      : docId === 'privacy' || docId === PRIVACY_ID
        ? PRIVACY_ID
        : null
  if (!key) return null
  const row = db().prepare('SELECT * FROM content_copy WHERE id=?').get(key)
  return rowToDoc(row)
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
  ensureLegalDocs,
  listPublic,
  getPublic,
  requireAgreement,
  persistUserAgreement,
}
