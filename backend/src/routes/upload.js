const express = require('express')
const router = express.Router()
const multer = require('multer')
const { success, fail } = require('../utils/response')
const { putBuffer } = require('../config/cos')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return fail(res, '缺少文件')
    const dir = req.body.folder || 'uploads'
    const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase()
    const key = `${dir}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    const result = await putBuffer(req.file.buffer, key, req.file.mimetype || 'image/jpeg')
    success(res, { key: result.key, url: result.url, size: req.file.size }, '上传成功')
  } catch (e) {
    fail(res, '上传失败: ' + e.message)
  }
})

router.get('/url', (req, res) => {
  const { key } = req.query
  if (!key) return fail(res, '缺少key')
  const { getObjectUrl } = require('../config/cos')
  success(res, { url: getObjectUrl(key) })
})

module.exports = router
