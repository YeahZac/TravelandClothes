<template>
  <view class="page">
    <view v-if="loading && !order" class="empty">
      <text class="empty-t">加载订单中…</text>
    </view>

    <view v-else-if="!order" class="empty">
      <text class="empty-t">{{ emptyTitle }}</text>
      <text class="empty-s">{{ emptySub }}</text>
      <button class="cta" :loading="loading" @click="refresh">重新加载</button>
      <button class="ghost" @click="goList">返回订单列表</button>
    </view>

    <template v-else>
      <view class="card status">
        <text class="st">{{ order.statusText || STATUS_MAP[order.status] }}</text>
        <text class="hint">{{ statusHint }}</text>
      </view>

      <view class="card">
        <text class="label">收货信息</text>
        <text class="v">{{ order.address && order.address.name }} {{ order.address && order.address.phone }}</text>
        <text class="v mute">{{ (order.address && (order.address.full || order.address.detail)) || '—' }}</text>
      </view>

      <view class="card">
        <text class="label">商品</text>
        <view v-if="order.items && order.items.length" class="items">
          <text v-for="(it, i) in order.items" :key="i" class="v strong item-line">
            {{ it.productName || it.name }} ×{{ it.qty }}
          </text>
        </view>
        <text v-else class="v strong">{{ order.productName }} ×{{ order.qty }}</text>
        <view class="line"><text>类型</text><text>{{ order.orderType }}</text></view>
        <view class="line" v-if="order.payPoints"><text>能量值</text><text>{{ order.payPoints }}</text></view>
        <view class="line" v-if="order.payCashCent"><text>现金</text><text>¥{{ Number(order.payCashYuan || order.payCashCent / 100).toFixed(2) }}</text></view>
        <view class="line"><text>单号</text><text class="mono">{{ order.orderNo }}</text></view>
        <view class="line" v-if="order.carrier || order.trackingNo">
          <text>物流</text>
          <text>{{ order.carrier }} {{ order.trackingNo }}</text>
        </view>
        <view class="line" v-if="order.shippedAt">
          <text>发货时间</text>
          <text>{{ fmt(order.shippedAt) }}</text>
        </view>
        <view class="line"><text>下单时间</text><text>{{ fmt(order.createdAt) }}</text></view>
      </view>

      <button
        v-if="needPay"
        class="cta"
        :loading="paying"
        @click="onPay"
      >
        微信支付 ¥{{ Number(order.payCashYuan || order.payCashCent / 100).toFixed(2) }}
      </button>
      <button v-if="canCancel" class="ghost" @click="onCancel">取消订单</button>
      <button class="cta" :class="{ ghost: needPay }" @click="goList">返回订单列表</button>
    </template>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { loadOrderDetail, cancelMyOrder, payOrder, STATUS_MAP } from '../../store/order.js'

const order = ref(null)
const paying = ref(false)
const loading = ref(false)
const orderKey = ref('')
const loadErr = ref('')

const needPay = computed(() => {
  const o = order.value
  if (!o) return false
  if (o.status === 'cancelled' || o.payStatus === 'paid') return false
  if (o.status === 'pending' || o.status === 'shipped' || o.status === 'done') return false
  return o.status === 'unpaid' || !!o.needWxPay
})

const canCancel = computed(() => {
  const s = order.value && order.value.status
  return s === 'pending' || s === 'unpaid'
})

const statusHint = computed(() => {
  const s = order.value && order.value.status
  if (s === 'unpaid') return '待微信支付，付款后进入待发货'
  if (s === 'pending') return '仓库处理中，可在后台发货'
  if (s === 'shipped') return '已发货，请注意查收'
  if (s === 'done') return '订单已完成'
  if (s === 'cancelled') return '订单已取消，库存/能量值已回退'
  if (s === 'refunded') return '已退款，款项将原路退回'
  return ''
})

const emptyTitle = computed(() => {
  const m = String(loadErr.value || '')
  if (/502|503|timeout|超时|繁忙|云托管/i.test(m)) return '订单暂时加载失败'
  if (/不存在|404/i.test(m)) return '订单不存在'
  return '未找到订单'
})

const emptySub = computed(() => {
  const m = String(loadErr.value || '')
  if (/502|503|timeout|超时|繁忙|云托管/i.test(m)) {
    return '支付若已成功，可稍后重试或从订单列表进入'
  }
  return '请返回订单列表查看，或稍后再试'
})

async function refresh() {
  if (!orderKey.value) return
  loading.value = true
  loadErr.value = ''
  try {
    const r = await loadOrderDetail(orderKey.value, { withError: true })
    order.value = (r && r.order) || null
    loadErr.value = (r && r.error) || (order.value ? '' : '订单不存在')
  } catch (e) {
    loadErr.value = (e && e.message) || '加载失败'
  } finally {
    loading.value = false
  }
}

onLoad(async (q) => {
  orderKey.value = decodeURIComponent(q.id || q.orderNo || '')
  await refresh()
})

onShow(() => {
  if (orderKey.value) refresh()
})

function fmt(t) {
  return (t || '').slice(0, 19).replace('T', ' ')
}

function goList() {
  uni.redirectTo({ url: '/pages/order/list' })
}

async function onPay() {
  if (!order.value || paying.value) return
  paying.value = true
  try {
    const r = await payOrder(order.value.orderNo)
    if (!r.ok) {
      uni.showToast({ title: r.msg || '支付未完成', icon: 'none' })
      return
    }
    await refresh()
    uni.showToast({
      title: r.pendingConfirm ? '支付确认中' : '支付成功',
      icon: 'none',
    })
  } finally {
    paying.value = false
  }
}

function onCancel() {
  uni.showModal({
    title: '取消订单',
    content: '取消后库存与能量值将退回',
    success: async (res) => {
      if (!res.confirm) return
      const r = await cancelMyOrder(order.value.id || order.value.orderNo)
      if (!r.ok) {
        uni.showToast({ title: r.msg || '取消失败', icon: 'none' })
        return
      }
      await refresh()
      uni.showToast({ title: '已取消', icon: 'none' })
    },
  })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--paper, #fbf8f4);
  padding: 24rpx 32rpx 48rpx;
  box-sizing: border-box;
}
.empty {
  padding: 120rpx 24rpx 48rpx;
  text-align: center;
}
.empty-t {
  display: block;
  font-size: 34rpx;
  font-weight: 700;
  color: #2b2520;
}
.empty-s {
  display: block;
  margin: 16rpx 0 40rpx;
  font-size: 26rpx;
  color: #6e6258;
  line-height: 1.45;
}
.card {
  background: #fff;
  border-radius: 28rpx;
  padding: 28rpx;
  margin-bottom: 20rpx;
  border: 1rpx solid var(--line, #eae0d5);
}
.status .st {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
}
.status .hint {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #6e6258;
}
.label {
  display: block;
  font-size: 22rpx;
  color: #a89b91;
  margin-bottom: 12rpx;
}
.v {
  display: block;
  font-size: 28rpx;
  color: #2b2520;
  line-height: 1.45;
}
.v.strong {
  font-weight: 700;
  font-size: 30rpx;
}
.item-line + .item-line {
  margin-top: 8rpx;
}
.v.mute {
  color: #6e6258;
  margin-top: 6rpx;
}
.line {
  display: flex;
  justify-content: space-between;
  margin-top: 14rpx;
  font-size: 26rpx;
  color: #6e6258;
}
.mono {
  font-size: 22rpx;
}
.cta,
.ghost {
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 999rpx;
  font-size: 30rpx;
  font-weight: 600;
  border: none;
  margin-top: 16rpx;
}
.cta {
  background: var(--accent, #d83068);
  color: #fff;
}
.ghost {
  background: transparent;
  color: #2b2520;
  border: 2rpx solid #2b2520;
}
.cta::after,
.ghost::after {
  border: none;
}
</style>
