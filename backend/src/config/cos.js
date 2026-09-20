const COS = require('cos-nodejs-sdk-v5')

const COS_BUCKET = process.env.COS_BUCKET || '7072-prod-d7gnz9s0j20275c05-1492159324'
const COS_REGION = process.env.COS_REGION || 'ap-shanghai'
const COS_PREFIX = process.env.COS_PREFIX || 'mock'

function getObjectUrl(key) {
  const clean = String(key || '').replace(/^\/+/, '')
  return `https://${COS_BUCKET}.cos.${COS_REGION}.myqcloud.com/${clean}`
}

function localToCosKey(src) {
  if (!src) return src
  if (src.startsWith('http')) return src
  const name = String(src).split('/').pop()
  return `${COS_PREFIX}/${name}`
}

function localToCosUrl(src) {
  if (!src) return src
  if (src.startsWith('http')) return src
  return getObjectUrl(localToCosKey(src))
}

function createClient() {
  const SecretId = process.env.COS_SECRET_ID || process.env.QCLOUD_SECRET_ID || process.env.TENCENTCLOUD_SECRETID
  const SecretKey = process.env.COS_SECRET_KEY || process.env.QCLOUD_SECRET_KEY || process.env.TENCENTCLOUD_SECRETKEY
  const SecurityToken = process.env.COS_TOKEN || process.env.QCLOUD_TOKEN || process.env.TENCENTCLOUD_SESSIONTOKEN
  if (!SecretId || !SecretKey) {
    throw new Error('缺少 COS 密钥，请配置 COS_SECRET_ID / COS_SECRET_KEY')
  }
  return new COS({
    SecretId,
    SecretKey,
    SecurityToken: SecurityToken || undefined
  })
}

function mimeOf(name) {
  const lower = String(name || '').toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'image/jpeg'
}

function uploadFile(localPath, key) {
  const cos = createClient()
  const contentType = mimeOf(key || localPath)
  return new Promise((resolve, reject) => {
    cos.uploadFile({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: key,
      FilePath: localPath,
      ContentType: contentType,
      Headers: { 'x-cos-acl': 'public-read' }
    }, (err, data) => {
      if (!err) return resolve({ key, url: getObjectUrl(key), data })
      cos.uploadFile({
        Bucket: COS_BUCKET,
        Region: COS_REGION,
        Key: key,
        FilePath: localPath,
        ContentType: contentType
      }, (err2, data2) => {
        if (err2) return reject(err2)
        resolve({ key, url: getObjectUrl(key), data: data2 })
      })
    })
  })
}

function putBuffer(buffer, key, contentType) {
  const cos = createClient()
  return new Promise((resolve, reject) => {
    const payload = {
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: key,
      Body: buffer,
      ContentType: contentType || 'image/jpeg'
    }
    cos.putObject({ ...payload, Headers: { 'x-cos-acl': 'public-read' } }, (err, data) => {
      if (!err) return resolve({ key, url: getObjectUrl(key), data })
      cos.putObject(payload, (err2, data2) => {
        if (err2) return reject(err2)
        resolve({ key, url: getObjectUrl(key), data: data2 })
      })
    })
  })
}

function listPrefix(prefix) {
  const cos = createClient()
  return new Promise((resolve, reject) => {
    cos.getBucket({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Prefix: prefix || COS_PREFIX,
      MaxKeys: 1000
    }, (err, data) => {
      if (err) return reject(err)
      resolve((data && data.Contents) || [])
    })
  })
}

function getSignedUrl(key, expires) {
  const cos = createClient()
  return new Promise((resolve, reject) => {
    cos.getObjectUrl({
      Bucket: COS_BUCKET,
      Region: COS_REGION,
      Key: key,
      Sign: true,
      Expires: expires || 7 * 24 * 3600
    }, (err, data) => {
      if (err) return reject(err)
      resolve(data.Url)
    })
  })
}

module.exports = {
  COS_BUCKET,
  COS_REGION,
  COS_PREFIX,
  getObjectUrl,
  localToCosKey,
  localToCosUrl,
  createClient,
  uploadFile,
  putBuffer,
  listPrefix,
  getSignedUrl,
  mimeOf
}
