#!/usr/bin/env node
/**
 * 商品保存/发布冒烟：白盒直调 + 可选 HTTP 黑盒
 * 用法: node scripts/smoke-products.js [baseUrl]
 */
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '..', '.env') })

const dbMod = require('../src/db')
const admin = require('../src/services/adminService')
const cfg = require('../src/services/configService')
const { validateConfig } = require('../src/validate')

function assert(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function httpJson(base, method, urlPath, body) {
  const res = await fetch(`${base}${urlPath}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch (_) {
    throw new Error(`HTTP ${res.status} non-json: ${text.slice(0, 180)}`)
  }
  return { status: res.status, json }
}

async function main() {
  const base = process.argv[2] || ''
  console.log('dialect', dbMod.DIALECT)

  // convertSql 白盒
  const converted = dbMod.convertSql(
    `INSERT INTO config_draft (id, version, payload_json, updated_at) VALUES (1,?,?,?)
     ON CONFLICT(id) DO UPDATE SET version=excluded.version, payload_json=excluded.payload_json, updated_at=excluded.updated_at`
  )
  assert(/ON DUPLICATE KEY UPDATE/.test(converted), 'ON CONFLICT 未转换成 ON DUPLICATE KEY')
  assert(/VALUES\(version\)/.test(converted), 'excluded.version 未转换')
  assert(!/ON CONFLICT/.test(converted), '仍残留 ON CONFLICT')
  console.log('convertSql OK')

  const id = `smoke_${Date.now()}`
  const bad = admin.upsertProduct({ id: '', name: 'x', priceYuan: 1 })
  assert(!bad.ok, '空 id 应失败')

  const nan = admin.upsertProduct({ id: 'nan_x', name: 'x', priceYuan: 'abc', costYuan: 1 })
  assert(!nan.ok && /售价/.test(nan.msg || ''), `NaN 售价应业务失败，实际: ${JSON.stringify(nan)}`)

  const ok1 = admin.upsertProduct({
    id,
    name: '冒烟商品',
    priceYuan: 12.34,
    costYuan: 5,
    stock: 3,
    status: 'on',
    category: '推荐',
  })
  assert(ok1.ok, `upsert 失败: ${ok1.msg}`)
  assert(ok1.item && ok1.item.price_cent === 1234, '价格分转换错误')

  const draft = cfg.getDraft()
  const v = validateConfig(draft)
  assert(v.ok, `草稿校验失败: ${(v.errors || []).join('; ')}`)

  const pub = cfg.publish()
  assert(pub && pub.version, 'publish 无 version')
  console.log('publish OK v' + pub.version)

  admin.deleteProduct(id)
  console.log('whitebox OK')

  if (base) {
    const id2 = `http_${Date.now()}`
    const put = await httpJson(base, 'PUT', '/api/traffic/v1/admin/products', {
      id: id2,
      name: 'HTTP冒烟',
      priceYuan: 9.9,
      costYuan: 2,
      stock: 1,
      status: 'on',
    })
    assert(put.json.code === 0, `HTTP put 失败: ${JSON.stringify(put.json)}`)
    const publish = await httpJson(base, 'POST', '/api/traffic/v1/admin/publish', {})
    assert(publish.json.code === 0, `HTTP publish 失败: ${JSON.stringify(publish.json)}`)
    await httpJson(base, 'DELETE', `/api/traffic/v1/admin/products/${id2}`)
    console.log('http OK', base)
  }
}

main().catch((e) => {
  console.error('FAIL', e.message)
  process.exit(1)
})
