<template>
  <view class="page yx-safe-bottom">
    <view class="head">
      <text class="title">开兑记录</text>
      <text class="sub">展示脱敏昵称 · 兑换礼品与数量</text>
    </view>
    <view v-for="it in list" :key="it.id" class="row">
      <view class="l">
        <text class="name">{{ it.productName }}</text>
        <text class="meta">{{ it.slotTitle }} · {{ it.nickMask }}</text>
      </view>
      <text class="time">{{ it.day }}</text>
    </view>
    <view v-if="!list.length" class="empty">暂无开兑记录</view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { request, USE_REMOTE } from '../../api/request.js'

const list = ref([])

onMounted(async () => {
  if (!USE_REMOTE) {
    list.value = []
    return
  }
  try {
    const data = await request('/api/traffic/v1/flash/history?pageSize=50')
    list.value = data.list || []
  } catch (e) {
    list.value = []
  }
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f6f7fb;
  padding: 24rpx 28rpx 48rpx;
}
.head {
  margin-bottom: 20rpx;
}
.title {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
}
.sub {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #6b7280;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  padding: 24rpx;
  margin-bottom: 12rpx;
  background: #fff;
  border-radius: 16rpx;
}
.name {
  display: block;
  font-size: 28rpx;
  font-weight: 700;
}
.meta {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #6b7280;
}
.time {
  font-size: 22rpx;
  color: #9ca3af;
  flex-shrink: 0;
}
.empty {
  padding: 80rpx;
  text-align: center;
  color: #9ca3af;
}
</style>
