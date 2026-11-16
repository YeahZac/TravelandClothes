<template>
  <view class="yx-page ticket-page yx-safe-bottom" v-if="ticket">
    <view class="cover" :class="'tc-' + (ticket.tone || 'orange')">
      <text class="big">{{ (ticket.tag || ticket.name || '票').slice(0, 1) }}</text>
      <text class="yx-tag yx-tag-hot">{{ ticket.tag || '报名' }}</text>
    </view>
    <view class="yx-card body">
      <text class="name">{{ ticket.name }}</text>
      <text class="desc">{{ ticket.desc }}</text>
      <view class="price-row">
        <text class="price">¥{{ ticket.price }}</text>
        <text class="day">{{ ticket.dayLabel || '' }}</text>
      </view>
      <view class="bonus">在线支付 · 报名成功后电子凭证生效</view>
      <view class="rules">
        <text class="rl">· 报名费已含入园福利</text>
        <text class="rl">· 符合景区免票政策者自行入园，无需缴费</text>
        <text class="rl">· {{ ticket.audience === 'child' ? '适用身高 1.2—1.5 米' : '成人标准报名' }}</text>
      </view>
      <button class="yx-btn yx-btn-orange" @click="goCheckout">在线支付报名</button>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { tickets as mockTickets } from '../../mock/data.js'
import { USE_REMOTE, request } from '../../api/request.js'
import { requireAuth } from '../../utils/loginGate.js'
import { usePageShare, buildInviteQuery } from '../../utils/share.js'

const ticket = ref(null)
const ticketId = ref('')
usePageShare(() => {
  const t = ticket.value || {}
  const id = ticketId.value || t.id || ''
  const inviteQ = buildInviteQuery({ channel: 'share_ticket' })
  return {
    channel: 'share_ticket',
    title: `${t.name || '汉服节票种'} · 早鸟价看看`,
    path: id ? `/pages/festival/ticket?id=${encodeURIComponent(id)}&${inviteQ}` : undefined,
    query: id ? `id=${encodeURIComponent(id)}` : '',
  }
})

async function loadTicket(id) {
  if (USE_REMOTE) {
    try {
      const data = await request('/api/traffic/v1/festival/tickets')
      const hit = (data.list || []).find((t) => t.id === id)
      if (hit) {
        ticket.value = hit
        return
      }
    } catch (_) {}
  }
  ticket.value = mockTickets.find((t) => t.id === id) || mockTickets[0]
}

onLoad((q) => {
  ticketId.value = String((q && q.id) || '')
  loadTicket(q.id)
})

function goCheckout() {
  if (!requireAuth('/pages/festival/index')) return
  uni.navigateTo({ url: `/pages/festival/checkout?id=${ticket.value.id}` })
}
</script>

<style scoped lang="scss">
.ticket-page {
  padding: 24rpx 28rpx 80rpx;
}
.cover {
  height: 280rpx;
  border-radius: 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  margin-bottom: 20rpx;
}
.big {
  font-size: 72rpx;
  font-weight: 800;
  color: rgba(28, 26, 23, 0.28);
}
.tc-blue {
  background: #dce9ff;
}
.tc-orange {
  background: #ffe4cc;
}
.tc-gold {
  background: #ffe9b8;
}
.tc-mint {
  background: #d8f6f2;
}
.body {
  padding: 28rpx;
}
.name {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
}
.desc {
  display: block;
  margin-top: 8rpx;
  color: #6e6258;
  font-size: 26rpx;
}
.price-row {
  display: flex;
  align-items: baseline;
  gap: 16rpx;
  margin-top: 20rpx;
}
.price {
  font-size: 48rpx;
  font-weight: 800;
  color: #c45c3e;
}
.day {
  font-size: 24rpx;
  color: #8a837a;
}
.bonus {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #8a4b2e;
}
.rules {
  margin: 24rpx 0 32rpx;
}
.rl {
  display: block;
  font-size: 24rpx;
  color: #5c574f;
  line-height: 1.7;
}
</style>
