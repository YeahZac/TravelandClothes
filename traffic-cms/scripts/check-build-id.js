#!/usr/bin/env node
/**
 * 防止 Dockerfile ENV BUILD_ID 与 server 默认戳漂移（曾导致线上永远显示 v12）。
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '../..')
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8')
const server = fs.readFileSync(path.join(root, 'traffic-cms/src/server.js'), 'utf8')

const envMatch = dockerfile.match(/^\s*ENV\s+BUILD_ID=(\S+)/m)
const serverMatch = server.match(
  /build:\s*process\.env\.BUILD_ID\s*\|\|\s*process\.env\.GIT_COMMIT\s*\|\|\s*'([^']+)'/
)

if (!envMatch) {
  console.error('[check-build-id] Dockerfile 缺少 ENV BUILD_ID=...')
  process.exit(1)
}
if (!serverMatch) {
  console.error('[check-build-id] server.js 缺少 build 默认戳')
  process.exit(1)
}

const a = envMatch[1]
const b = serverMatch[1]
if (a !== b) {
  console.error(`[check-build-id] 不一致: Dockerfile=${a} server.js=${b}`)
  process.exit(1)
}
if (/stability-kernel-v12/i.test(a)) {
  console.error(`[check-build-id] 禁止回退旧戳: ${a}`)
  process.exit(1)
}
console.log(`[check-build-id] ok BUILD_ID=${a}`)
