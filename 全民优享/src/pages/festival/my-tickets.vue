<template>
  <view class="yx-page page yx-safe-bottom">
    <view v-if="loading" class="yx-muted empty">加载中…</view>
    <view v-else-if="!list.length" class="empty">
      <text class="yx-muted">暂无电子票</text>
      <button class="yx-btn yx-btn-orange go" @click="goFest">去报名</button>
    </view>
    <view v-else class="list">
      <view
        v-for="t in list"
        :key="t.ticketNo"
        class="card"
        :class="{ used: t.status !== 'valid' }"
        @click="openPass(t)"
      >
        <view class="row1">
          <text class="name">{{ t.skuName }}</text>
          <text class="st">{{ t.statusLabel }}</text>
        </view>
        <text class="sub">{{ t.dayLabel }} · {{ t.visitor || '出行人' }}</text>
        <text class="no">票号 {{ t.ticketNo }}</text>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { USE_REMOTE, request } from '../../api/request.js'
import { requireAuth } from '../../utils/loginGate.js'

const list = ref([])
const loading = ref(true)

async function load() {
  if (!requireAuth('/pages/festival/my-tickets')) {
    loading.value = false
    return
  }
  loading.value = true
  try {
    if (USE_REMOTE) {
      const data = await request('/api/traffic/v1/festival/my-tickets')
      list.value = (data && data.list) || []
    } else {
      list.value = []
    }
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '加载失败', icon: 'none' })
  } finally {
    loading.value = false
  }
}

function openPass(t) {
  uni.navigateTo({ url: `/pages/festival/ticket-pass?ticketNo=${encodeURIComponent(t.ticketNo)}` })
}

function goFest() {
  uni.switchTab({ url: '/pages/festival/index' })
}

onShow(load)
</script>

<style scoped>
.page {
  padding: 24rpx 28rpx;
  background: #f6f1ea;
  min-height: 100vh;
}
.empty {
  padding: 120rpx 0;
  text-align: center;
}
.go {
  margin-top: 32rpx;
  display: inline-block;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.card {
  padding: 28rpx;
  border-radius: 20rpx;
  background: #fffdf9;
  border: 1rpx solid #ebe3d8;
}
.card.used {
  opacity: 0.55;
}
.row1 {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  align-items: flex-start;
}
.name {
  flex: 1;
  font-size: 30rpx;
  font-weight: 700;
  color: #1f1814;
}
.st {
  font-size: 22rpx;
  color: #c45c3e;
  font-weight: 600;
}
.card.used .st {
  color: #9a8b7c;
}
.sub {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #5c574f;
}
.no {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #9a8b7c;
}
</style>
