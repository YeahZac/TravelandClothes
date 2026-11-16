<template>
  <view class="page yx-safe-bottom">
    <scroll-view scroll-x class="tabs">
      <text
        v-for="t in tabs"
        :key="t.key"
        class="tab"
        :class="{ on: tab === t.key }"
        @click="switchTab(t.key)"
      >{{ t.label }}</text>
    </scroll-view>

    <view v-if="loading" class="empty"><text class="et">加载中…</text></view>

    <!-- 中奖记录（不含谢谢参与） -->
    <view v-else-if="tab === 'wins'">
      <view v-if="!wins.length" class="empty">
        <text class="et">暂无中奖记录</text>
        <text class="es">抽奖 / 签到 / 步数实物礼品会出现在这里，可点「去兑奖」</text>
      </view>
      <view v-for="h in wins" :key="h.id" class="card" :class="winCardClass(h)">
        <view class="head">
          <view class="name-row">
            <text class="kind" :class="kindClass(h.prizeType)">{{ kindLabel(h.prizeType) }}</text>
            <text class="name">{{ h.name }}</text>
          </view>
          <text class="st">{{ winStatus(h) }}</text>
        </view>
        <text class="mute">{{ fmt(h.time) }}{{ winSourceLabel(h) ? ` · ${winSourceLabel(h)}` : '' }}</text>
        <view class="foot">
          <text class="mute">{{ kindHint(h.prizeType) }}</text>
          <button
            v-if="h.claimToken && h.productId && h.claimStatus !== 'used'"
            class="btn"
            size="mini"
            @click="goClaim(h)"
          >去兑奖</button>
          <button
            v-else-if="h.claimStatus === 'used' && h.orderNo"
            class="btn ghost"
            size="mini"
            @click="goOrderByNo(h.orderNo)"
          >查看兑换</button>
        </view>
      </view>
    </view>

    <!-- 兑换记录：已兑奖 / 兑礼订单（待发货+已发货） -->
    <view v-else-if="tab === 'redeem'">
      <view v-if="!orders.length" class="empty">
        <text class="et">暂无兑换记录</text>
        <text class="es">填写地址兑奖或兑好礼 / 准点兑换后会出现在这里</text>
      </view>
      <view
        v-for="o in orders"
        :key="o.id || o.orderNo"
        class="card"
        @click="goOrder(o)"
      >
        <view class="head">
          <text class="name">{{ o.productName }} ×{{ o.qty }}</text>
          <text class="st">{{ o.statusText || statusMap[o.status] || o.status }}</text>
        </view>
        <text class="mute">
          {{ typeText(o.orderType) }} · {{ fmt(o.createdAt) }}{{ o.entryFrom ? ` · ${entryLabel(o.entryFrom)}` : '' }}
        </text>
        <view v-if="o.carrier || o.trackingNo" class="ship" @click.stop="copyTrack(o)">
          <text class="ship-t">{{ o.carrier || '快递' }} {{ o.trackingNo }}</text>
          <text class="ship-copy">复制单号</text>
        </view>
        <view class="foot">
          <text class="mute">{{ o.orderNo }}</text>
          <text v-if="o.orderType === 'lottery'" class="pay">抽奖兑奖</text>
          <text v-else-if="o.payPoints" class="pay">{{ o.payPoints }} 能量</text>
          <text v-else-if="o.payCashYuan" class="pay">¥{{ Number(o.payCashYuan).toFixed(1) }}</text>
          <text v-else class="pay">免能量</text>
        </view>
      </view>
    </view>

    <!-- 发货记录：已发货/已完成，展示后台填写的物流单号 -->
    <view v-else>
      <view v-if="!orders.length" class="empty">
        <text class="et">暂无发货记录</text>
        <text class="es">运营台「兑换履约」填写物流后会出现在这里</text>
      </view>
      <view
        v-for="o in orders"
        :key="o.id || o.orderNo"
        class="card"
        @click="goOrder(o)"
      >
        <view class="head">
          <text class="name">{{ o.productName }} ×{{ o.qty }}</text>
          <text class="st">{{ o.statusText || statusMap[o.status] || o.status }}</text>
        </view>
        <text class="mute">{{ typeText(o.orderType) }} · 发货 {{ fmt(o.shippedAt || o.updatedAt) }}</text>
        <view class="ship" @click.stop="copyTrack(o)">
          <text class="ship-t">{{ o.carrier || '快递' }} {{ o.trackingNo || '物流单号待补充' }}</text>
          <text v-if="o.trackingNo" class="ship-copy">复制单号</text>
        </view>
        <view class="foot">
          <text class="mute">{{ o.orderNo }}</text>
          <text class="pay">查物流 ›</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { request, USE_REMOTE, getToken } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'
import { goLogin } from '../../utils/loginGate.js'
import { fetchOrders } from '../../api/commerce.js'
import { STATUS_MAP } from '../../store/order.js'
import { formatChinaTime } from '../../utils/chinaTime.js'

const tab = ref('wins')
const loading = ref(false)
const wins = ref([])
const orders = ref([])
const statusMap = STATUS_MAP

const FULFILL_TYPES = 'gift,lottery,jar'
const tabs = [
  { key: 'wins', label: '中奖记录' },
  { key: 'redeem', label: '兑换记录' },
  { key: 'shipped', label: '发货记录' },
]

function fmt(t) {
  return formatChinaTime(t)
}

function isEnergyPrize(t) {
  return t === 'energy' || t === 'coin' || t === 'points'
}

function kindLabel(t) {
  if (t === 'physical') return '实物礼品'
  if (isEnergyPrize(t)) return '能量值'
  if (t === 'seed') return '种子'
  return '奖品'
}

function kindHint(t) {
  if (t === 'physical') return '需填写地址兑奖发货'
  if (isEnergyPrize(t)) return '已发放至能量账户'
  if (t === 'seed') return '可用于养成'
  return ''
}

function kindClass(t) {
  if (t === 'physical') return 'kind-physical'
  if (isEnergyPrize(t)) return 'kind-energy'
  if (t === 'seed') return 'kind-seed'
  return 'kind-other'
}

function winCardClass(h) {
  if (h && h.prizeType === 'physical') return 'card-physical'
  if (h && isEnergyPrize(h.prizeType)) return 'card-energy'
  return ''
}

function typeText(t) {
  return (
    {
      gift: '兑礼',
      lottery: '抽奖兑奖',
      jar: '养成兑礼',
      mall: '商城',
    }[t] || t || '兑换'
  )
}

function entryLabel(e) {
  return (
    {
      gift_center: '兑好礼',
      flash: '准点兑换',
      lottery: '幸运抽奖',
      jar: '能量罐',
      mall: '优享商城',
      home_entry: '首页入口',
      checkin: '连续签到',
      steps: '步数兑换',
      task: '任务奖励',
    }[e] || e
  )
}

function winSourceLabel(h) {
  return (
    {
      checkin: '连续签到',
      steps: '步数兑换',
      flash: '准点兑换',
      task: '任务',
      lottery: '幸运抽奖',
    }[(h && h.source) || ''] || ''
  )
}

function winStatus(h) {
  if (h.prizeType === 'physical') {
    if (h.claimStatus === 'used') return '已兑奖'
    if (h.claimStatus === 'expired') return '已过期'
    if (h.claimToken && h.productId) return '待兑奖'
    return '待处理'
  }
  if (isEnergyPrize(h.prizeType)) return '已到账'
  if (h.claimStatus === 'used') return '已兑奖'
  if (h.claimStatus === 'expired') return '已过期'
  if (h.claimToken && h.productId) return '待兑奖'
  return '已到账'
}

function requireLogin() {
  if (USE_REMOTE && !(getToken() && isLoggedIn())) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => goLogin('/pages/mine/records'), 400)
    return false
  }
  return true
}

async function loadWins() {
  if (!(USE_REMOTE && getToken())) {
    wins.value = []
    return
  }
  try {
    const data = await request('/api/traffic/v1/lottery/history')
      wins.value = (data.items || [])
      .filter((h) => h && h.prizeType !== 'empty')
      .map((h) => ({
        id: h.id,
        name: h.name,
        time: h.time,
        prizeType: h.prizeType,
        claimToken: h.claimToken,
        claimStatus: h.claimStatus,
        productId: h.productId,
        orderNo: h.orderNo || '',
        source: h.source || 'lottery',
      }))
  } catch (_) {
    wins.value = []
  }
}

async function loadOrderTab() {
  if (!(USE_REMOTE && getToken())) {
    orders.value = []
    return
  }
  try {
    if (tab.value === 'redeem') {
      // 已兑奖/兑礼：待发货 + 已发货 + 已完成（不含取消）
      const data = await fetchOrders({
        types: FULFILL_TYPES,
        statusIn: 'pending,shipped,done',
        page: 1,
        pageSize: 50,
      })
      orders.value = data.list || []
      return
    }
    // 发货记录：后台填物流后的 shipped / done，展示运单号
    const data = await fetchOrders({
      types: FULFILL_TYPES,
      statusIn: 'shipped,done',
      page: 1,
      pageSize: 50,
    })
    orders.value = (data.list || []).filter((o) => o.trackingNo || o.status === 'shipped' || o.status === 'done')
  } catch (_) {
    orders.value = []
  }
}

async function refresh() {
  if (!requireLogin()) return
  loading.value = true
  try {
    if (tab.value === 'wins') await loadWins()
    else await loadOrderTab()
  } finally {
    loading.value = false
  }
}

function switchTab(key) {
  tab.value = key
  refresh()
}

function goClaim(h) {
  const token = encodeURIComponent(h.claimToken || '')
  const pid = encodeURIComponent(h.productId || '')
  const from = encodeURIComponent(h.source || 'lottery')
  uni.navigateTo({
    url: `/pages/order/confirm?type=lottery&productId=${pid}&claimToken=${token}&entryFrom=${from}`,
  })
}

function goOrder(o) {
  uni.navigateTo({ url: `/pages/order/detail?id=${o.id || o.orderNo}` })
}

function goOrderByNo(orderNo) {
  if (!orderNo) {
    switchTab('redeem')
    return
  }
  uni.navigateTo({ url: `/pages/order/detail?id=${encodeURIComponent(orderNo)}` })
}

function copyTrack(o) {
  const no = (o && o.trackingNo) || ''
  if (!no) {
    uni.showToast({ title: '暂无运单号', icon: 'none' })
    return
  }
  uni.setClipboardData({
    data: no,
    success: () => uni.showToast({ title: '运单号已复制', icon: 'none' }),
  })
}

onLoad((q) => {
  if (q && q.tab && ['wins', 'redeem', 'shipped'].includes(q.tab)) tab.value = q.tab
})

onShow(refresh)
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #fbf8f4;
  padding-bottom: 48rpx;
}
.tabs {
  white-space: nowrap;
  padding: 20rpx 24rpx;
  background: #fff;
  border-bottom: 1rpx solid #eae0d5;
}
.tab {
  display: inline-block;
  padding: 12rpx 28rpx;
  margin-right: 8rpx;
  font-size: 26rpx;
  color: #6e6258;
  border-radius: 999rpx;
}
.tab.on {
  background: #fce8f0;
  color: #d83068;
  font-weight: 700;
}
.empty {
  padding: 120rpx 32rpx;
  text-align: center;
}
.et {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
  color: #1c1917;
}
.es {
  display: block;
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #8a8178;
}
.card {
  margin: 16rpx 24rpx 0;
  padding: 24rpx;
  background: #fff;
  border-radius: 20rpx;
  box-shadow: 0 6rpx 20rpx rgba(28, 25, 23, 0.04);
}
.head {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  align-items: baseline;
}
.name-row {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.name {
  flex: 1;
  min-width: 0;
  font-size: 28rpx;
  font-weight: 700;
  color: #1c1917;
}
.kind {
  flex-shrink: 0;
  font-size: 20rpx;
  font-weight: 800;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  line-height: 1.2;
}
.kind-energy {
  color: #b45309;
  background: #fef3c7;
}
.kind-physical {
  color: #be123c;
  background: #ffe4e6;
}
.kind-seed {
  color: #047857;
  background: #d1fae5;
}
.kind-other {
  color: #4b5563;
  background: #f3f4f6;
}
.card-energy {
  border-left: 6rpx solid #f59e0b;
}
.card-physical {
  border-left: 6rpx solid #e11d48;
}
.st {
  flex-shrink: 0;
  font-size: 22rpx;
  font-weight: 700;
  color: #d83068;
}
.mute {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #8a8178;
}
.ship {
  margin-top: 12rpx;
  padding: 12rpx 16rpx;
  background: #f6f3ee;
  border-radius: 12rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}
.ship-t {
  flex: 1;
  font-size: 24rpx;
  font-weight: 600;
  color: #1c1917;
}
.ship-copy {
  flex-shrink: 0;
  font-size: 22rpx;
  font-weight: 700;
  color: #d83068;
}
.foot {
  margin-top: 12rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12rpx;
}
.pay {
  font-size: 24rpx;
  font-weight: 700;
  color: #c9a36b;
}
.btn {
  margin: 0;
  padding: 0 22rpx;
  height: 52rpx;
  line-height: 52rpx;
  border-radius: 999rpx;
  background: #1c1917;
  color: #fff;
  font-size: 22rpx;
  font-weight: 700;
  border: none;
}
.btn.ghost {
  background: #fff;
  color: #1c1917;
  border: 2rpx solid #1c1917;
}
.btn::after {
  border: none;
}
</style>
