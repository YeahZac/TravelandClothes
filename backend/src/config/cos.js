// 对象存储 COS 配置（微信云托管对象存储）
// 实际上传/下载在云托管容器内通过内网自动鉴权，无需 AK/SK
const COS_BUCKET = process.env.COS_BUCKET || ''
const COS_REGION = process.env.COS_REGION || 'ap-shanghai'

// 生成对象访问 URL
function getObjectUrl(key) {
  if (!COS_BUCKET) return key
  return `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${key}`
}

module.exports = { COS_BUCKET, COS_REGION, getObjectUrl }
