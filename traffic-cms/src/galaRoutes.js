/**
 * 年会抽奖 HTTP 路由：挂到 /api/gala/v1/*
 */
const gala = require('./services/galaService')
const cos = require('./cos')
const { getWxaCodeUnlimited } = require('./services/wxAuth')

function mountGalaRoutes(app, { wrap, ok, fail, authToken, requireUser, requireUserAsync, upload, baseUrl }) {
  async function needUser(req, res) {
    if (typeof requireUserAsync === 'function') return requireUserAsync(req, res)
    return requireUser(req, res)
  }
  function hostId(req) {
    const t = authToken(req)
    return gala.hostFromToken(t)
  }

  function requireHost(req, res) {
    const id = hostId(req)
    if (!id) {
      fail(res, 401, '请先登录主办方账号')
      return null
    }
    return id
  }

  function requireScreenCtrl(req, res, eventId) {
    const hid = hostId(req)
    if (hid) {
      try {
        gala.getEventById(eventId) // exists
        const ev = require('./db').open().prepare(`SELECT account_id FROM gala_event WHERE id=?`).get(eventId)
        if (ev && Number(ev.account_id) === Number(hid)) return { accountId: hid }
      } catch (_) {}
    }
    const st = gala.screenFromToken(authToken(req) || req.query.screenToken || (req.body && req.body.screenToken))
    if (st && Number(st.eventId) === Number(eventId)) return { accountId: st.accountId }
    fail(res, 401, '无控场权限')
    return null
  }

  app.post(
    '/api/gala/v1/auth/sms/send',
    wrap(async (req, res) => {
      const data = await gala.sendSms(req.body && req.body.phone)
      ok(res, data)
    })
  )

  app.post(
    '/api/gala/v1/auth/sms/login',
    wrap((req, res) => {
      const data = gala.loginWithSms(req.body || {})
      ok(res, data)
    })
  )

  app.get(
    '/api/gala/v1/auth/me',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      ok(res, { account: gala.getAccount(id) })
    })
  )

  app.put(
    '/api/gala/v1/auth/me',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      const account = gala.updateAccount(id, req.body || {})
      ok(res, { account })
    })
  )

  app.get(
    '/api/gala/v1/events',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      ok(res, { list: gala.listEvents(id) })
    })
  )

  app.post(
    '/api/gala/v1/events',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      ok(res, gala.createEvent(id, req.body || {}))
    })
  )

  app.put(
    '/api/gala/v1/events/:id',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      ok(res, gala.updateEvent(id, Number(req.params.id), req.body || {}))
    })
  )

  app.delete(
    '/api/gala/v1/events/:id',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      ok(res, gala.deleteEvent(id, Number(req.params.id)))
    })
  )

  app.get(
    '/api/gala/v1/events/:id',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      const ev = gala.getEventById(Number(req.params.id))
      if (!ev || ev.accountId !== id) return fail(res, 404, '场次不存在')
      ok(res, {
        event: ev,
        prizes: gala.listPrizes(ev.id),
        rounds: gala.listRounds(ev.id),
        winners: gala.listWinners(ev.id),
        checkinCount: gala.listParticipants(ev.id, { limit: 500 }).length,
      })
    })
  )

  app.get(
    '/api/gala/v1/events/by-code/:code',
    wrap((req, res) => {
      const ev = gala.getEventByCode(req.params.code)
      if (!ev) return fail(res, 404, '场次不存在')
      ok(res, {
        event: {
          id: ev.id,
          title: ev.title,
          code: ev.code,
          requireRealName: ev.requireRealName,
          status: ev.status,
        },
      })
    })
  )

  app.put(
    '/api/gala/v1/events/:id/prizes',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      const prize = gala.upsertPrize(id, Number(req.params.id), req.body || {})
      ok(res, prize)
    })
  )

  app.get(
    '/api/gala/v1/events/:id/prizes/:prizeId',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      ok(res, gala.getPrize(id, Number(req.params.id), Number(req.params.prizeId)))
    })
  )

  app.delete(
    '/api/gala/v1/events/:id/prizes/:prizeId',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      ok(res, gala.deletePrize(id, Number(req.params.id), Number(req.params.prizeId)))
    })
  )

  app.post(
    '/api/gala/v1/events/:id/sync-rounds',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      ok(res, { list: gala.syncRoundsFromPrizes(id, Number(req.params.id)) })
    })
  )

  app.get(
    '/api/gala/v1/events/:id/winners',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      const eventId = Number(req.params.id)
      const ev = gala.getEventById(eventId)
      if (!ev || ev.accountId !== id) return fail(res, 404, '场次不存在')
      ok(res, {
        list: gala.listWinners(eventId, { includeVoided: req.query.includeVoided === '1' }),
      })
    })
  )

  app.get(
    '/api/gala/v1/events/:id/participants',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      const eventId = Number(req.params.id)
      const ev = gala.getEventById(eventId)
      if (!ev || ev.accountId !== id) return fail(res, 404, '场次不存在')
      ok(res, { list: gala.listParticipants(eventId, { limit: req.query.limit || 500 }) })
    })
  )

  app.post(
    '/api/gala/v1/events/:id/winners/:winId/void',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      ok(res, gala.voidWinner(id, Number(req.params.id), Number(req.params.winId)))
    })
  )

  app.post(
    '/api/gala/v1/events/:id/clear-test-winners',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      ok(res, gala.clearTestWinners(id, Number(req.params.id)))
    })
  )

  /** 主办台也可抽奖（与大屏同权，需主办 token） */
  app.post(
    '/api/gala/v1/events/:id/rounds/:roundId/draw-host',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      const redraw = !!(req.body && req.body.redraw)
      ok(res, gala.drawRound(id, Number(req.params.id), Number(req.params.roundId), { redraw }))
    })
  )

  app.post(
    '/api/gala/v1/events/:id/screen-token',
    wrap((req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      const eventId = Number(req.params.id)
      const ev = gala.getEventById(eventId)
      if (!ev || ev.accountId !== id) return fail(res, 404, '场次不存在')
      const token = gala.issueScreenToken(eventId, id)
      ok(res, {
        screenToken: token,
        screenUrl: `/gala-screen/?code=${encodeURIComponent(ev.code)}&token=${encodeURIComponent(token)}`,
        adminHintUrl: `/gala-admin/`,
      })
    })
  )

  app.post(
    '/api/gala/v1/events/:id/upload',
    upload.single('file'),
    wrap(async (req, res) => {
      const id = requireHost(req, res)
      if (!id) return
      const eventId = Number(req.params.id)
      const ev = gala.getEventById(eventId)
      if (!ev || ev.accountId !== id) return fail(res, 404, '场次不存在')
      if (!req.file) return fail(res, 400, '缺少文件')
      const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
      const key = `qmyx/gala/${eventId}/${Date.now()}.${ext || 'jpg'}`
      const put = await cos.putObject({
        key,
        buffer: req.file.buffer,
        mime: req.file.mimetype || 'image/jpeg',
        originalName: req.file.originalname,
      })
      const url =
        (put && (put.url || put.path)) ||
        `/api/traffic/v1/media/file?key=${encodeURIComponent(key)}`
      ok(res, { key, url, path: (put && put.path) || key })
    })
  )

  app.post(
    '/api/gala/v1/events/:id/rounds/:roundId/draw',
    wrap((req, res) => {
      const eventId = Number(req.params.id)
      const ctrl = requireScreenCtrl(req, res, eventId)
      if (!ctrl) return
      ok(res, gala.drawRound(ctrl.accountId, eventId, Number(req.params.roundId), { redraw: false }))
    })
  )

  app.post(
    '/api/gala/v1/events/:id/rounds/:roundId/redraw',
    wrap((req, res) => {
      const eventId = Number(req.params.id)
      const ctrl = requireScreenCtrl(req, res, eventId)
      if (!ctrl) return
      ok(res, gala.drawRound(ctrl.accountId, eventId, Number(req.params.roundId), { redraw: true }))
    })
  )

  app.post(
    '/api/gala/v1/events/:id/screen-mode',
    wrap((req, res) => {
      const eventId = Number(req.params.id)
      const ctrl = requireScreenCtrl(req, res, eventId)
      if (!ctrl) return
      const mode = (req.body && req.body.mode) || 'checkin'
      const roundId = req.body && req.body.roundId
      ok(res, gala.setScreenMode(ctrl.accountId, eventId, mode, roundId))
    })
  )

  app.get(
    '/api/gala/v1/screen/snapshot',
    wrap((req, res) => {
      const code = req.query.code || req.query.eventId
      if (!code) return fail(res, 400, '缺少场次 code')
      ok(res, gala.screenSnapshot(code))
    })
  )

  app.get(
    '/api/gala/v1/screen/qrcode',
    wrap(async (req, res) => {
      const code = String(req.query.code || '')
        .trim()
        .toUpperCase()
      if (!code) return fail(res, 400, '缺少 code')
      const ev = gala.getEventByCode(code)
      if (!ev) return fail(res, 404, '场次不存在')
      const scene = `g${ev.code}`.slice(0, 32)
      const page = 'pages/gala/checkin'
      const envs = []
      const prefer = String(req.query.env || process.env.WX_QR_ENV_VERSION || '').trim()
      if (prefer) envs.push(prefer)
      for (const e of ['release', 'trial', 'develop']) {
        if (!envs.includes(e)) envs.push(e)
      }
      let lastErr = null
      for (const envVersion of envs) {
        try {
          const buf = await getWxaCodeUnlimited({ scene, page, envVersion })
          res.set('Content-Type', 'image/png')
          res.set('Cache-Control', 'no-store')
          return res.send(buf)
        } catch (e) {
          lastErr = e
        }
      }
      fail(res, 500, (lastErr && lastErr.message) || '生成小程序码失败')
    })
  )

  app.post(
    '/api/gala/v1/events/:id/checkin',
    wrap(async (req, res) => {
      const uid = await needUser(req, res)
      if (!uid) return
      const openid = gala.openidOfUser(uid)
      const body = req.body || {}
      const idOrCode = Number(req.params.id)
      const data = gala.checkin(Number.isFinite(idOrCode) && idOrCode > 0 ? idOrCode : body.code, {
        userId: uid,
        openid,
      }, body)
      ok(res, data)
    })
  )

  app.get(
    '/api/gala/v1/events/:id/my-checkin',
    wrap(async (req, res) => {
      const uid = await needUser(req, res)
      if (!uid) return
      const openid = gala.openidOfUser(uid)
      ok(res, {
        participant: gala.myCheckin({ userId: uid, openid }, Number(req.params.id)),
      })
    })
  )

  app.post(
    '/api/gala/v1/events/:id/danmaku',
    wrap(async (req, res) => {
      const uid = await needUser(req, res)
      if (!uid) return
      const openid = gala.openidOfUser(uid)
      const content = (req.body && req.body.content) || ''
      ok(res, gala.postDanmaku(Number(req.params.id), { userId: uid, openid }, content))
    })
  )

  app.get(
    '/api/gala/v1/events/:id/danmaku',
    wrap((req, res) => {
      ok(res, {
        list: gala.listDanmaku(Number(req.params.id), {
          afterId: req.query.afterId,
          limit: req.query.limit,
        }),
      })
    })
  )
}

module.exports = { mountGalaRoutes }
