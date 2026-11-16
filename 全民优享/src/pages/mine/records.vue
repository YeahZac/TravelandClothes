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

    <!-- 中奖记录 -->
    <view v-else-if="tab === 'wins'">
      <view v-if="!wins.length" class="empty">
        <text class="et">暂无中奖记录</text>
        <text class="es">抽奖中奖后会出现在这里</text>
      </view>
      <view v-for="h in wins" :key="h.id" class="card">
        <view class="head">
          <text class="name">{{ h.name }}</text>
          <text class="st">{{ winStatus(h) }}</text>
        </view>
        <text class="mute">{{ fmt(h.time) }}</text>
        <view class="foot">
          <text class="mute">{{ typeLabel(h.prizeType) }}</text>
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
        <text class="es">抽奖兑奖或兑好礼后会出现在这里</text>
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
          <text v-else-if="o.payCashYuan" class="pay">¥{{ Number(o.payCashYuan).toFixed(2) }}</text>
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
  if (!t) return ''
  return String(t).slice(0, 16).replace('T', ' ')
}

function typeLabel(t) {
  if (t === 'physical') return '实物'
  if (t === 'empty') return '未中奖'
  if (t === 'seed') return '种子'
  if (t === 'energy' || t === 'coin' || t === 'points') return '能量'
  return '奖品'
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
    }[e] || e
  )
}

function winStatus(h) {
  if (h.prizeType === 'empty') return '谢谢参与'
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
    wins.value = (data.items || []).map((h) => ({
      id: h.id,
      name: h.name,
      time: h.time,
      prizeType: h.prizeType,
      claimToken: h.claimToken,
      claimStatus: h.claimStatus,
      productId: h.productId,
      orderNo: h.orderNo || '',
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
  uni.navigateTo({
    url: `/pages/order/confirm?type=lottery&productId=${pid}&claimToken=${token}&entryFrom=lottery`,
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
.name {
  flex: 1;
  font-size: 28rpx;
  font-weight: 700;
  color: #1c1917;
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
