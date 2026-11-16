<template>
  <view class="yx-page page yx-safe-bottom">
    <view v-if="loading" class="yx-muted empty">加载中…</view>
    <view v-else-if="!list.length" class="empty">
      <text class="yx-muted">暂无电子票</text>
      <text class="hint">若刚支付成功，下拉刷新或稍后再进本页</text>
      <text v-if="syncHint" class="hint">{{ syncHint }}</text>
      <button class="yx-btn yx-btn-orange go" @click="goFest">去报名</button>
      <button class="yx-btn refresh" @click="load">刷新门票</button>
    </view>
    <view v-else class="list">
      <view
        v-for="t in list"
        :key="t.ticketNo"
        class="card"
        :class="{ used: t.status !== 'valid' }"
        @click="openPass(t)"
      >
        <view class="main">
          <view class="row1">
            <text class="name">{{ t.skuName }}</text>
            <text class="st">{{ t.statusLabel }}</text>
          </view>
          <text class="sub">{{ t.dayLabel }} · {{ t.visitor || '出行人' }}</text>
          <text class="no">票号 {{ t.ticketNo }}</text>
          <text class="cta">点击查看入场二维码</text>
        </view>
        <view class="qr-box">
          <image
            v-if="t.qrImageUrl"
            class="qr"
            :src="t.qrImageUrl"
            mode="aspectFit"
          />
          <text v-else class="qr-ph">QR</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app'
import { USE_REMOTE, request } from '../../api/request.js'
import { confirmWxPay, fetchOrder, fetchOrders } from '../../api/commerce.js'
import { requireAuth } from '../../utils/loginGate.js'

const list = ref([])
const loading = ref(true)
const syncHint = ref('')

async function healPaidFestivalOrders() {
  try {
    const data = await fetchOrders({ orderType: 'festival', pageSize: 8 })
    const rows = (data && data.list) || []
    const need = rows.filter(
      (o) => o && o.orderNo && o.needWxPay && String(o.payStatus || '') !== 'paid'
    )
    for (const o of need.slice(0, 3)) {
      try {
        await confirmWxPay(o.orderNo)
      } catch (_) {}
      // 旧镜像无 confirm 时：订单详情里的 syncOrderPayIfNeeded 仍可查单入账
      try {
        await fetchOrder(o.orderNo)
      } catch (_) {}
    }
    if (need.length) syncHint.value = '已尝试同步近期支付，请下拉刷新'
  } catch (_) {
    /* 订单列表 502 时跳过，仍试 my-tickets */
  }
}

async function load() {
  if (!requireAuth('/pages/festival/my-tickets')) {
    loading.value = false
    return
  }
  loading.value = true
  syncHint.value = ''
  try {
    if (USE_REMOTE) {
      await healPaidFestivalOrders()
      // 服务端会：微信查单补记 unpaid → backfill 出票
      const data = await request('/api/traffic/v1/festival/my-tickets')
      list.value = (data && data.list) || []
      if (!list.value.length && syncHint.value) {
        /* 空列表保留提示 */
      } else {
        syncHint.value = ''
      }
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
onPullDownRefresh(async () => {
  try {
    await load()
  } finally {
    uni.stopPullDownRefresh()
  }
})
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
.hint {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #9a8b7c;
}
.go {
  margin-top: 32rpx;
  display: inline-block;
}
.refresh {
  margin: 20rpx auto 0;
  display: block;
  width: 240rpx;
  background: transparent;
  color: #c45c3e;
  font-size: 26rpx;
}
.refresh::after {
  border: none;
}
.list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.card {
  display: flex;
  gap: 20rpx;
  align-items: center;
  padding: 24rpx;
  border-radius: 20rpx;
  background: #fffdf9;
  border: 1rpx solid #ebe3d8;
}
.card.used {
  opacity: 0.55;
}
.main {
  flex: 1;
  min-width: 0;
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
.cta {
  display: block;
  margin-top: 12rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #c45c3e;
}
.qr-box {
  width: 140rpx;
  height: 140rpx;
  flex-shrink: 0;
  border-radius: 12rpx;
  background: #fff;
  border: 1rpx solid #ebe3d8;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.qr {
  width: 124rpx;
  height: 124rpx;
}
.qr-ph {
  font-size: 28rpx;
  color: #cbbfb2;
  font-weight: 700;
}
</style>
