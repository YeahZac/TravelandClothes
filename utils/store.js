const memberLib = require('./member')
const { CLOUD_FILE } = require('./config')
function pic(name) { return CLOUD_FILE + '/' + name }

const KEY = 'robe_state_v2'

function now() {
  return Date.now()
}

function padDate(d) {
  const dt = new Date(d)
  const m = dt.getMonth() + 1
  const day = dt.getDate()
  return dt.getFullYear() + '-' + (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day
}

function seed() {
  const t = now()
  return {
    user: {
      nickName: '小袍',
      avatarUrl: pic('avatar-01.jpg'),
      phone: '13800138000'
    },
    member: {
      growthValue: 420,
      cardStatus: 0,
      level: 0,
      isDormant: false,
      savedFen: 0,
      trialUsed: false,
      firstPaid: true
    },
    card: null,
    orders: [
      {
        orderNo: 'OD20260918021',
        type: 'ticket',
        refId: 'tk-chen',
        title: '陈家祠门票',
        cover: pic('spot-chen.jpg'),
        day: '2026-09-18',
        qty: 2,
        amount: 2000,
        payAmount: 2000,
        status: 2,
        place: '广州 · 荔湾',
        visitor: '小袍',
        phone: '13800138000',
        createdAt: t - 2 * 86400000,
        paidAt: t - 2 * 86400000,
        verifiedAt: t - 2 * 86400000
      },
      {
        orderNo: 'OD20260915008',
        type: 'rent',
        refId: 'rt-gz',
        title: '广州汉服日租',
        cover: pic('checkin-chen.jpg'),
        day: '2026-09-21',
        qty: 1,
        amount: 16800,
        payAmount: 16800,
        status: 1,
        place: '余荫山房 / 陈家祠',
        visitor: '小袍',
        phone: '13800138000',
        createdAt: t - 5 * 86400000,
        paidAt: t - 5 * 86400000
      },
      {
        orderNo: 'OD20260901003',
        type: 'ticket',
        refId: 'tk-xiangbi',
        title: '象鼻山门票',
        cover: pic('spot-xiangbi.jpg'),
        day: '2026-09-02',
        qty: 1,
        amount: 7500,
        payAmount: 7500,
        status: 2,
        place: '桂林',
        visitor: '小袍',
        phone: '13800138000',
        createdAt: t - 18 * 86400000,
        paidAt: t - 18 * 86400000,
        verifiedAt: t - 18 * 86400000
      }
    ],
    records: [
      { actionType: 'consume', actionValue: 20, label: '购票 · 陈家祠', createdAt: t - 2 * 86400000 },
      { actionType: 'checkin', actionValue: 20, label: '核销到场 · 陈家祠', createdAt: t - 2 * 86400000 },
      { actionType: 'post', actionValue: 10, label: '打卡动态', createdAt: t - 86400000 },
      { actionType: 'consume', actionValue: 168, label: '租赁 · 广州汉服日租', createdAt: t - 5 * 86400000 },
      { actionType: 'consume', actionValue: 75, label: '购票 · 象鼻山', createdAt: t - 18 * 86400000 },
      { actionType: 'checkin', actionValue: 20, label: '核销到场 · 象鼻山', createdAt: t - 18 * 86400000 },
      { actionType: 'consume', actionValue: 107, label: '历史出行累计', createdAt: t - 40 * 86400000 }
    ],
    stamps: [{ id: 'chen', name: '陈家祠', route: 'bayarea', at: t - 2 * 86400000 }],
    hooks: { trialPrompted: false, unlockPrompted: false }
  }
}

function read() {
  const cached = wx.getStorageSync(KEY)
  if (cached && cached.member) return cached
  const next = seed()
  wx.setStorageSync(KEY, next)
  return next
}

function write(state) {
  wx.setStorageSync(KEY, state)
  return state
}

function snapshot() {
  const state = read()
  const info = memberLib.resolveLevel(state.member)
  const gap = memberLib.nextGap(state.member)
  state.member.level = info.level
  state.member.levelName = info.name
  state.member.unlockable = info.unlockable
  state.member.unlockName = info.unlockName
  state.member.nextName = gap.nextName
  state.member.growthToNext = gap.remain
  state.orders = (state.orders || []).map(decorateOrder)
  return state
}

function addGrowth(actionType, value, label) {
  const state = read()
  const added = Math.max(0, Math.floor(value || 0))
  if (!added) return snapshot()
  const multi = state.member.cardStatus === 1 ? 1.5 : 1
  const finalValue = actionType === 'consume' ? added : Math.floor(added * multi)
  state.member.growthValue += finalValue
  const info = memberLib.resolveLevel(state.member)
  state.member.level = info.level
  state.records.unshift({
    actionType,
    actionValue: finalValue,
    label: label || (memberLib.GROWTH_ACTIONS[actionType] && memberLib.GROWTH_ACTIONS[actionType].label) || '成长值',
    createdAt: now()
  })
  write(state)
  return snapshot()
}

function createOrder(payload) {
  const state = read()
  const order = Object.assign({
    orderNo: 'OD' + now(),
    status: 0,
    createdAt: now(),
    visitor: state.user.nickName,
    phone: state.user.phone
  }, payload)
  state.orders.unshift(order)
  write(state)
  return order
}

function payOrder(orderNo) {
  const state = read()
  const order = state.orders.find((item) => item.orderNo === orderNo)
  if (!order) throw new Error('订单不存在')
  if (order.status !== 0) throw new Error('订单已处理')
  order.status = 1
  order.paidAt = now()
  const yuan = Math.floor((order.payAmount || order.amount || 0) / 100)
  if (order.coveredByCard && state.card) {
    state.card.remainScenic = Math.max(0, (state.card.remainScenic || 0) - 1)
    state.member.savedFen += order.amount || 0
  }
  write(state)
  if (yuan > 0) addGrowth('consume', yuan, '购票 · ' + order.title)
  else if (order.coveredByCard) addGrowth('checkin', 20, '年卡核销 · ' + order.title)
  const after = snapshot()
  after.lastOrder = after.orders.find((item) => item.orderNo === orderNo)
  return after
}

function activateCard(skuCode, payFen) {
  const sku = memberLib.CARD_SKUS.find((item) => item.skuCode === skuCode)
  if (!sku) throw new Error('年卡不存在')
  const state = read()
  const expire = now() + 365 * 24 * 3600 * 1000
  state.card = {
    cardNo: 'TC' + now(),
    skuCode: sku.skuCode,
    skuName: sku.name,
    price: payFen != null ? payFen : sku.price,
    remainScenic: sku.scenicTimes,
    remainHotel: sku.hotelNights,
    remainShow: sku.showTimes,
    remainRent: sku.rentTimes,
    remainStudy: sku.studyTimes,
    status: 1,
    expireAt: expire,
    purchasedAt: now()
  }
  state.member.cardStatus = 1
  state.member.isDormant = false
  write(state)
  const yuan = Math.floor((payFen != null ? payFen : sku.price) / 100)
  addGrowth('consume', yuan, '开通年卡 · ' + sku.name)
  return snapshot()
}

function startTrial() {
  const state = read()
  if (state.member.trialUsed) throw new Error('试用仅限一次')
  state.member.trialUsed = true
  write(state)
  const after = activateCard('standard', 990)
  after.card.remainScenic = 0
  after.card.trial = true
  after.card.expireAt = now() + 7 * 24 * 3600 * 1000
  after.card.skuName = '7 天试用'
  write(after)
  return snapshot()
}

function updateUser(patch) {
  const state = read()
  Object.assign(state.user, patch)
  write(state)
  return snapshot()
}

function markHook(name) {
  const state = read()
  state.hooks[name] = true
  write(state)
  return snapshot()
}

const STATUS_TEXT = {
  0: '待支付',
  1: '待使用',
  2: '已完成',
  3: '已退款',
  4: '已取消'
}

function decorateOrder(order) {
  if (!order) return null
  return Object.assign({}, order, {
    statusText: STATUS_TEXT[order.status] || '未知',
    amountYuan: memberLib.yuan(order.amount),
    payYuan: memberLib.yuan(order.payAmount)
  })
}

function getOrder(orderNo) {
  return decorateOrder(read().orders.find((item) => item.orderNo === orderNo))
}

function cancelOrder(orderNo) {
  const state = read()
  const order = state.orders.find((item) => item.orderNo === orderNo)
  if (!order) throw new Error('订单不存在')
  if (order.status !== 0) throw new Error('仅待支付订单可取消')
  order.status = 4
  write(state)
  return snapshot()
}

function refundOrder(orderNo) {
  const state = read()
  const order = state.orders.find((item) => item.orderNo === orderNo)
  if (!order) throw new Error('订单不存在')
  if (order.status !== 1) throw new Error('仅待使用订单可退款')
  order.status = 3
  order.refundedAt = now()
  if (order.coveredByCard && state.card) {
    state.card.remainScenic += 1
  }
  write(state)
  return snapshot()
}

function verifyOrder(orderNo) {
  const state = read()
  const order = state.orders.find((item) => item.orderNo === orderNo)
  if (!order) throw new Error('订单不存在')
  if (order.status !== 1) throw new Error('订单不可核销')
  order.status = 2
  order.verifiedAt = now()
  write(state)
  addGrowth('checkin', 20, '核销到场 · ' + order.title)
  const after = snapshot()
  after.lastOrder = decorateOrder(after.orders.find((item) => item.orderNo === orderNo))
  return after
}

module.exports = {
  padDate,
  snapshot,
  addGrowth,
  createOrder,
  payOrder,
  activateCard,
  startTrial,
  updateUser,
  markHook,
  STATUS_TEXT,
  decorateOrder,
  getOrder,
  cancelOrder,
  refundOrder,
  verifyOrder
}
