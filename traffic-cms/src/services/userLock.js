/**
 * 同一用户同一动作的进程内防重入。
 * deasync 查询会让出事件循环，同一用户的并发请求可能在「先查后写」之间交错执行。
 * 仅覆盖单实例；跨实例由各业务的 DB 唯一键 / 条件 UPDATE 兜底。
 */
const busy = new Set()

const BUSY_MSG = '操作处理中，请勿重复点击'

function withUserLock(action, userId, fn) {
  const key = `${action}:${userId}`
  if (busy.has(key)) return { ok: false, busy: true, msg: BUSY_MSG }
  busy.add(key)
  try {
    return fn()
  } finally {
    busy.delete(key)
  }
}

async function withUserLockAsync(action, userId, fn) {
  const key = `${action}:${userId}`
  if (busy.has(key)) return { ok: false, busy: true, msg: BUSY_MSG }
  busy.add(key)
  try {
    return await fn()
  } finally {
    busy.delete(key)
  }
}

module.exports = { withUserLock, withUserLockAsync, BUSY_MSG }
