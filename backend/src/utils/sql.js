const fs = require('fs')
const path = require('path')

const SCHEMA_FILES = ['schema.sql', 'schema_v2.sql', 'schema_v3.sql', 'schema_v4.sql', 'schema_v5.sql']

function splitSql(sql) {
  return String(sql || '')
    .split(';')
    .map((chunk) => chunk
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('--'))
      .join('\n')
      .trim())
    .filter(Boolean)
}

function isIgnorable(err) {
  const msg = (err && err.message) || String(err || '')
  return /Duplicate column|already exists|ER_DUP_FIELDNAME|ER_TABLE_EXISTS_ERROR/i.test(msg)
}

async function applySchema(db, databaseDir) {
  const dir = databaseDir || path.join(__dirname, '../../database')
  let executed = 0
  const errors = []
  for (const f of SCHEMA_FILES) {
    const sqlPath = path.join(dir, f)
    if (!fs.existsSync(sqlPath)) continue
    const statements = splitSql(fs.readFileSync(sqlPath, 'utf8'))
    for (const stmt of statements) {
      try {
        await db.query(stmt)
        executed++
      } catch (e) {
        if (isIgnorable(e)) continue
        errors.push({ file: f, msg: e.message })
        console.error('schema', f, e.message)
      }
    }
  }
  return { executed, errors }
}

module.exports = { SCHEMA_FILES, splitSql, applySchema }
