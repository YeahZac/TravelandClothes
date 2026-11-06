/**
 * 将上传图压到 ≤ maxBytes，尽量不改清晰度：
 * - 不主动缩小分辨率
 * - 优先高质量 WebP / JPEG，仅在超限时逐步降质量
 * - 质量触底仍超限才等比缩小（最后手段）
 */
const MAX_BYTES = 1024 * 1024

async function compressImage(buffer, mime = '', maxBytes = MAX_BYTES) {
  let sharp
  try {
    sharp = require('sharp')
  } catch (e) {
    return { buffer, mime: mime || 'application/octet-stream', compressed: false, bytes: buffer.length }
  }

  if (!buffer || !buffer.length) {
    throw new Error('空文件')
  }
  if (buffer.length <= maxBytes && /image\/(jpeg|png|webp|gif)/i.test(mime || '')) {
    return { buffer, mime: mime || 'image/jpeg', compressed: false, bytes: buffer.length }
  }

  const img = sharp(buffer, { animated: false, failOn: 'none' })
  const meta = await img.metadata()
  const w = meta.width || 0
  const h = meta.height || 0
  const hasAlpha = !!meta.hasAlpha

  async function encode(quality, width) {
    let pipeline = sharp(buffer, { animated: false, failOn: 'none' })
    if (width && w && width < w) {
      pipeline = pipeline.resize({ width, withoutEnlargement: true })
    }
    if (hasAlpha) {
      const out = await pipeline.webp({ quality, effort: 4 }).toBuffer()
      return { buffer: out, mime: 'image/webp' }
    }
    const out = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer()
    return { buffer: out, mime: 'image/jpeg' }
  }

  // 高质量试探：90 → 82 → 74 → 66（保清晰优先）
  const qualities = [90, 82, 74, 66]
  for (const q of qualities) {
    const r = await encode(q, null)
    if (r.buffer.length <= maxBytes) {
      return { ...r, compressed: true, bytes: r.buffer.length, quality: q }
    }
  }

  // 仍超限：轻微缩小边长（每步 90%），质量不低于 72
  let curW = w || 1600
  for (let i = 0; i < 8; i++) {
    curW = Math.max(640, Math.floor(curW * 0.9))
    const r = await encode(72, curW)
    if (r.buffer.length <= maxBytes) {
      return { ...r, compressed: true, bytes: r.buffer.length, quality: 72, width: curW }
    }
  }

  const last = await encode(65, Math.min(curW, 800))
  return { ...last, compressed: true, bytes: last.buffer.length, quality: 65 }
}

module.exports = { compressImage, MAX_BYTES }
