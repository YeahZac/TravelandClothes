const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const DATA = path.join(ROOT, 'data')
const DRAFT = path.join(DATA, 'draft.json')
const PUBLISHED = path.join(DATA, 'published.json')

function ensureDir() {
  if (!fs.existsSync(DATA)) fs.mkdirSync(DATA, { recursive: true })
}

function readJson(file, fallback = null) {
  ensureDir()
  if (!fs.existsSync(file)) return fallback
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function writeJson(file, data) {
  ensureDir()
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

function getPublished() {
  return readJson(PUBLISHED)
}

function getDraft() {
  return readJson(DRAFT, getPublished())
}

function saveDraft(cfg) {
  writeJson(DRAFT, cfg)
  return cfg
}

function publish() {
  const draft = getDraft()
  if (!draft) throw new Error('无草稿可发布')
  const next = {
    ...draft,
    version: String(Number(draft.version || 0) + 1),
    publishedAt: new Date().toISOString(),
  }
  writeJson(PUBLISHED, next)
  writeJson(DRAFT, next)
  return next
}

function absolutize(cfg, baseUrl) {
  if (!cfg) return cfg
  const raw = JSON.stringify(cfg)
  const replaced = raw.replace(
    /"(\/uploads\/[^"]+)"/g,
    (_, p) => `"${baseUrl}${p}"`
  )
  return JSON.parse(replaced)
}

module.exports = {
  getPublished,
  getDraft,
  saveDraft,
  publish,
  absolutize,
  DRAFT,
  PUBLISHED,
}
