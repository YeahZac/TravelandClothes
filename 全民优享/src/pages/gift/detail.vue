<template>
  <view class="yx-page detail yx-safe-bottom" v-if="gift">
    <view class="cover" :class="'tone-' + gift.coverTone">
      <text class="big">{{ gift.name.slice(0, 1) }}</text>
    </view>
    <view class="panel yx-card">
      <view class="yx-tag">{{ gift.tag }}</view>
      <text class="name">{{ gift.name }}</text>
      <text class="desc">{{ gift.desc }}</text>
      <view class="meta">
        <text>库存 {{ gift.stock }}</text>
        <text>履约：公司代发（模拟）</text>
      </view>
      <view class="rules">
        <text class="rt">兑奖条件（可公示）</text>
        <text class="rl">· {{ costText }}</text>
        <text class="rl">· 需填写收货地址；运费规则参与前显著说明</text>
        <text class="rl">· 前端 mock：不真正扣减库存与积分</text>
      </view>
      <button class="yx-btn yx-btn-orange submit" @click="onRedeem">
        立即兑换（模拟）
      </button>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { gifts } from '../../mock/data.js'
import { session } from '../../store/session.js'

const gift = ref(null)

onLoad((q) => {
  gift.value = gifts.find((g) => g.id === q.id) || gifts[0]
})

const costText = computed(() => {
  const g = gift.value
  if (!g) return ''
  const parts = []
  if (g.costEnergy) parts.push(`养成进度满 + 锁定能量`)
  if (g.costPoints) parts.push(`${g.costPoints} 积分`)
  if (g.needInvite) parts.push(`有效邀请 ${g.needInvite} 人`)
  if (g.needStreak) parts.push(`连续签到 ${g.needStreak} 天`)
  if (g.needCash) parts.push(`支付 ¥${(g.needCash / 100).toFixed(0)}`)
  return parts.join(' + ')
})

function onRedeem() {
  if (gift.value?.mode === 'growth' && session.growth.current < 100) {
    uni.showToast({
      title: `进度 ${session.growth.current}% · 还差一点点`,
      icon: 'none',
    })
    return
  }
  uni.showModal({
    title: '兑换成功（模拟）',
    content: '已生成履约单，请在「我的」查看发货状态。地址页后续对接。',
    showCancel: false,
  })
}
</script>

<style scoped lang="scss">
.detail {
  padding-bottom: 48rpx;
}

.cover {
  height: 420rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tone-peach { background: #ffe0d4; }
.tone-mint { background: #d8f6f2; }
.tone-lilac { background: #ebe4ff; }
.tone-sun { background: #ffe9c9; }
.tone-coral { background: #ffd5cf; }

.big {
  font-size: 160rpx;
  font-weight: 800;
  color: rgba(28, 26, 23, 0.18);
}

.panel {
  margin: -48rpx 32rpx 0;
  position: relative;
  z-index: 1;
}

.name {
  display: block;
  margin-top: 16rpx;
  font-size: 40rpx;
  font-weight: 800;
}

.desc {
  display: block;
  margin-top: 12rpx;
  font-size: 26rpx;
  color: #5c574f;
  line-height: 1.5;
}

.meta {
  display: flex;
  justify-content: space-between;
  margin-top: 24rpx;
  font-size: 22rpx;
  color: #9a948c;
}

.rules {
  margin-top: 28rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background: rgba(28, 26, 23, 0.04);
}

.rt {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  margin-bottom: 12rpx;
}

.rl {
  display: block;
  font-size: 24rpx;
  color: #5c574f;
  line-height: 1.6;
}

.submit {
  margin-top: 32rpx;
  width: 100%;
}
</style>
