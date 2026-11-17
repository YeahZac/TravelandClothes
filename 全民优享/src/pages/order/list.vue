<template>
  <view class="page">
    <scroll-view scroll-x class="tabs" :show-scrollbar="false">
      <text
        v-for="t in tabs"
        :key="t.key"
        class="tab"
        :class="{ on: status === t.key }"
        @click="switchTab(t.key)"
      >{{ t.label }}</text>
    </scroll-view>

    <view v-if="loading && !orderState.list.length" class="empty">
      <text class="et">加载中…</text>
    </view>

    <view v-else-if="loadErr && !orderState.list.length" class="empty">
      <text class="et">订单加载失败</text>
      <text class="es">{{ loadErr }}</text>
      <button class="retry" size="mini" @click="reload">重新加载</button>
    </view>

    <view v-else-if="!orderState.list.length" class="empty">
      <text class="et">暂无订单</text>
      <text class="es">商城购买或兑礼后会出现在这里</text>
    </view>

    <view
      v-for="o in orderState.list"
      :key="o.id || o.orderNo"
      class="card"
      @click="goDetail(o)"
    >
      <view class="head">
        <text class="no">{{ o.orderNo }}</text>
        <text class="st">{{ o.statusText || STATUS_MAP[o.status] || o.status }}</text>
      </view>
      <text class="name">{{ o.productName }} ×{{ o.qty }}</text>
      <text v-if="o.items && o.items.length > 1" class="sub">含 {{ o.items.length }} 种商品</text>
      <view v-if="o.carrier || o.trackingNo" class="ship">
        <text class="ship-t">{{ o.carrier || '快递' }} {{ o.trackingNo }}</text>
      </view>
      <view class="foot">
        <text class="mute">{{ displayTime(o) }}</text>
        <text class="pay" v-if="o.payCashYuan">¥{{ Number(o.payCashYuan).toFixed(1) }}</text>
        <text class="pay" v-else-if="o.payPoints">{{ o.payPoints }} 能量值</text>
      </view>
      <view class="acts" @click.stop>
        <button v-if="canPay(o)" class="pay-btn" size="mini" @click="onPay(o)">去支付</button>
        <button v-if="canCancel(o)" class="ghost-btn" size="mini" @click="onCancel(o)">取消</button>
        <button
          v-if="o.status === 'shipped'"
          class="pay-btn"
          size="mini"
          @click="onConfirm(o)"
        >确认收货</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { orderState, loadOrders, payOrder, cancelMyOrder, STATUS_MAP } from '../../store/order.js'
import { getToken } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'
import { goLogin, currentPagePath } from '../../utils/loginGate.js'
import { bindPullRefresh } from '../../utils/pullRefresh.js'
import * as api from '../../api/commerce.js'
import { formatChinaTime } from '../../utils/chinaTime.js'

const status = ref('')
const loading = ref(false)
const loadErr = ref('')
const tabs = [
  { key: '', label: '全部' },
  { key: 'unpaid', label: '待支付' },
  { key: 'pending', label: '待发货' },
  { key: 'shipped', label: '已发货' },
  { key: 'done', label: '已完成' },
  { key: 'refunded', label: '已退款' },
  { key: 'cancelled', label: '已取消' },
]

function displayTime(o) {
  return formatChinaTime(o.createdAt)
}

function canPay(o) {
  if (!o) return false
  if (['cancelled', 'refunded', 'shipped', 'done'].includes(o.status)) return false
  if (o.payStatus === 'paid') return false
  return !!o.needWxPay || o.status === 'unpaid'
}

function canCancel(o) {
  if (!o) return false
  if (o.canCancel === false) return false
  if (['shipped', 'done', 'refunded', 'cancelled'].includes(o.status)) return false
  if (o.payStatus === 'paid') return false
  return o.status === 'unpaid' || o.status === 'pending'
}

onShow(() => {
  if (!(getToken() && isLoggedIn())) {
    orderState.list = []
    goLogin(currentPagePath() || '/pages/order/list')
    return
  }
  reload()
})

bindPullRefresh(() => reload())

async function reload() {
  loading.value = true
  loadErr.value = ''
  try {
    await loadOrders(status.value)
  } catch (e) {
    loadErr.value = (e && e.message) || '加载失败'
    if (!orderState.list.length) {
      uni.showToast({ title: loadErr.value, icon: 'none' })
    }
  } finally {
    loading.value = false
  }
}

function switchTab(key) {
  status.value = key
  reload()
}

function goDetail(o) {
  uni.navigateTo({ url: `/pages/order/detail?id=${o.id || o.orderNo}` })
}

async function onPay(o) {
  const r = await payOrder(o.orderNo)
  if (!r.ok) {
    uni.showToast({ title: r.msg || '支付未完成', icon: 'none' })
    return
  }
  uni.showToast({ title: r.pendingConfirm ? '支付确认中' : '支付成功', icon: 'none' })
  reload()
}

async function onCancel(o) {
  if (!canCancel(o)) {
    uni.showToast({ title: '该订单不可取消', icon: 'none' })
    return
  }
  const ok = await new Promise((resolve) => {
    uni.showModal({
      title: '取消订单',
      content:
        Number(o.payPoints || 0) > 0
          ? `确认取消 ${o.orderNo}？将退回 ${o.payPoints} 能量值`
          : `确认取消 ${o.orderNo}？`,
      success: (res) => resolve(!!res.confirm),
    })
  })
  if (!ok) return
  const r = await cancelMyOrder(o.id || o.orderNo)
  if (!r.ok) {
    uni.showToast({ title: r.msg || '取消失败', icon: 'none' })
    return
  }
  const back = Number(r.energyRestored || 0)
  uni.showToast({
    title: back > 0 ? `已取消，退回 ${back} 能量值` : r.msg || '已取消',
    icon: 'none',
    duration: 2200,
  })
  reload()
}

async function onConfirm(o) {
  try {
    await api.confirmOrder(o.id || o.orderNo)
    uni.showToast({ title: '已确认收货', icon: 'none' })
    reload()
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '操作失败', icon: 'none' })
  }
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--paper, #fbf8f4);
  padding: 0 0 48rpx;
}
.tabs {
  white-space: nowrap;
  padding: 20rpx 24rpx;
  background: #fff;
  border-bottom: 1rpx solid var(--line, #eae0d5);
}
.tab {
  display: inline-block;
  padding: 12rpx 24rpx;
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
}
.es {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #a89b91;
}
.retry {
  margin-top: 24rpx;
}
.card {
  margin: 20rpx 32rpx 0;
  background: #fff;
  border-radius: 28rpx;
  padding: 28rpx;
  border: 1rpx solid var(--line, #eae0d5);
}
.head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12rpx;
}
.no {
  font-size: 22rpx;
  color: #a89b91;
}
.st {
  font-size: 24rpx;
  font-weight: 700;
  color: #d83068;
}
.name {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
}
.sub {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #a89b91;
}
.ship {
  margin-top: 8rpx;
}
.ship-t {
  font-size: 22rpx;
  color: #6e6258;
}
.foot {
  display: flex;
  justify-content: space-between;
  margin-top: 16rpx;
  align-items: center;
}
.mute {
  font-size: 22rpx;
  color: #a89b91;
}
.pay {
  font-size: 28rpx;
  font-weight: 800;
  color: #d83068;
}
.acts {
  margin-top: 16rpx;
  display: flex;
  justify-content: flex-end;
  gap: 12rpx;
}
.pay-btn {
  background: #d83068 !important;
  color: #fff !important;
  border-radius: 999rpx;
}
.ghost-btn {
  background: #fff !important;
  color: #6e6258 !important;
  border: 1rpx solid #eae0d5 !important;
  border-radius: 999rpx;
}
</style>
