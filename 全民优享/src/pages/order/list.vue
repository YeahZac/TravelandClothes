<template>
  <view class="page">
    <scroll-view scroll-x class="tabs">
      <text
        v-for="t in tabs"
        :key="t.key"
        class="tab"
        :class="{ on: status === t.key }"
        @click="switchTab(t.key)"
      >{{ t.label }}</text>
    </scroll-view>

    <view v-if="!orderState.list.length" class="empty">
      <text class="et">暂无订单</text>
      <text class="es">兑礼或商城下单后会出现在这里</text>
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
      <view class="foot">
        <text class="mute">{{ (o.createdAt || '').slice(0, 16).replace('T', ' ') }}</text>
        <text class="pay" v-if="o.payCashYuan">¥{{ Number(o.payCashYuan).toFixed(2) }}</text>
        <text class="pay" v-else-if="o.payPoints">{{ o.payPoints }} 积分</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { orderState, loadOrders, STATUS_MAP } from '../../store/order.js'

const status = ref('')
const tabs = [
  { key: '', label: '全部' },
  { key: 'unpaid', label: '待支付' },
  { key: 'pending', label: '待发货' },
  { key: 'shipped', label: '已发货' },
  { key: 'done', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
]

onShow(() => {
  loadOrders(status.value)
})

function switchTab(key) {
  status.value = key
  loadOrders(key)
}

function goDetail(o) {
  uni.navigateTo({ url: `/pages/order/detail?id=${o.id || o.orderNo}` })
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
  color: #b87a1f;
}
.name {
  display: block;
  font-size: 30rpx;
  font-weight: 700;
}
.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16rpx;
}
.mute {
  font-size: 22rpx;
  color: #a89b91;
}
.pay {
  font-size: 28rpx;
  font-weight: 800;
}
</style>
