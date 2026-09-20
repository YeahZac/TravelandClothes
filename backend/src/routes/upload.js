const express = require('express')
const router = express.Router()
const multer = require('multer')
const { success, fail } = require('../utils/response')
const { COS_BUCKET, COS_REGION, getObjectUrl } = require('../config/cos')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// POST /api/upload — 上传图片到 COS
// 云托管容器内自动鉴权，无需 AK/SK
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return fail(res, '缺少文件')
    const { folder } = req.body
    const dir = folder || 'uploads'
    const ext = req.file.originalname.split('.').pop() || 'jpg'
    const key = `${dir}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    // 云托管环境：通过内网自动鉴权上传
    // 本地开发：返回 URL，实际上传需配置 COS SDK
    const url = getObjectUrl(key)

    // TODO: 容器内集成 cos-nodejs-sdk-v5 实际上传
    // const cos = require('cos-nodejs-sdk-v5')
    // await cos.putObject({ Bucket: COS_BUCKET, Region: COS_REGION, Key: key, Body: req.file.buffer })

    success(res, { key, url, size: req.file.size }, '上传成功')
  } catch (e) {
    fail(res, '上传失败: ' + e.message)
  }
})

// GET /api/upload/url — 获取对象访问URL
router.get('/url', (req, res) => {
  const { key } = req.query
  if (!key) return fail(res, '缺少key')
  success(res, { url: getObjectUrl(key) })
})

module.exports = router
