<template>
  <view class="yx-page page yx-safe-bottom" v-if="ticket">
    <view class="pass" :class="{ used: !ticket.valid }">
      <text class="badge">{{ ticket.statusLabel }}</text>
      <text class="sku">{{ ticket.skuName }}</text>
      <text class="day">{{ ticket.dayLabel }} · 岭南印象园</text>

      <view class="qr-wrap">
        <image v-if="ticket.qrImageUrl" class="qr" :src="ticket.qrImageUrl" mode="aspectFit" />
        <view v-if="!ticket.valid" class="stamp">已核验失效</view>
      </view>

      <text class="hint">
        {{ ticket.usableToday ? '今日可用 · 入场出示此码 · 当日可反复进出' : '请在票面标注日期出示 · 非当日不可入场' }}
      </text>
      <view class="meta">
        <view class="line"><text>票号</text><text class="val">{{ ticket.ticketNo }}</text></view>
        <view class="line"><text>出行人</text><text class="val">{{ ticket.visitor || '—' }}</text></view>
        <view class="line"><text>手机</text><text class="val">{{ ticket.phone || '—' }}</text></view>
        <view class="line"><text>订单</text><text class="val">{{ ticket.orderNo }}</text></view>
      </view>
    </view>
  </view>
  <view v-else class="yx-page page">
    <text class="yx-muted">{{ err || '加载中…' }}</text>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { USE_REMOTE, request } from '../../api/request.js'
import { requireAuth } from '../../utils/loginGate.js'

const ticket = ref(null)
const err = ref('')

onLoad(async (q) => {
  const ticketNo = decodeURIComponent((q && q.ticketNo) || '')
  if (!requireAuth(`/pages/festival/ticket-pass?ticketNo=${encodeURIComponent(ticketNo)}`)) return
  if (!ticketNo) {
    err.value = '缺少票号'
    return
  }
  try {
    if (USE_REMOTE) {
      const data = await request(`/api/traffic/v1/festival/tickets/${encodeURIComponent(ticketNo)}`)
      ticket.value = data.ticket || null
      if (!ticket.value) err.value = '票不存在'
    }
  } catch (e) {
    err.value = (e && e.message) || '加载失败'
  }
})
</script>

<style scoped>
.page {
  padding: 28rpx;
  min-height: 100vh;
  background: #f6f1ea;
}
.pass {
  position: relative;
  padding: 40rpx 32rpx;
  border-radius: 28rpx;
  background: linear-gradient(165deg, #fffdf9 0%, #f8efe6 100%);
  border: 1rpx solid #e8ddd0;
  text-align: center;
}
.pass.used {
  filter: grayscale(0.85);
  opacity: 0.75;
}
.badge {
  display: inline-block;
  padding: 6rpx 18rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 700;
  color: #c45c3e;
  background: #f8ebe4;
  margin-bottom: 16rpx;
}
.sku {
  display: block;
  font-size: 34rpx;
  font-weight: 800;
  color: #1f1814;
}
.day {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #8a7b6d;
}
.qr-wrap {
  position: relative;
  margin: 36rpx auto 20rpx;
  width: 360rpx;
  height: 360rpx;
  background: #fff;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.qr {
  width: 320rpx;
  height: 320rpx;
}
.stamp {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(43, 37, 32, 0.45);
  color: #fff;
  font-size: 36rpx;
  font-weight: 800;
  letter-spacing: 4rpx;
}
.hint {
  display: block;
  font-size: 22rpx;
  color: #9a8b7c;
  margin-bottom: 28rpx;
}
.meta {
  text-align: left;
  border-top: 1rpx dashed #e0d4c6;
  padding-top: 20rpx;
}
.line {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
  font-size: 26rpx;
  color: #5c574f;
  margin-bottom: 12rpx;
}
.val {
  color: #1f1814;
  font-weight: 600;
  word-break: break-all;
  text-align: right;
}
</style>
