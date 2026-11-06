<template>
  <view class="yx-page detail yx-safe-bottom" v-if="gift">
    <view class="cover" :class="'tone-' + (gift.coverTone || 'mint')">
      <text class="big">{{ gift.name.slice(0, 1) }}</text>
    </view>
    <view class="panel yx-card">
      <view class="yx-tag">{{ gift.tag }}</view>
      <text class="name">{{ gift.name }}</text>
      <text class="desc">{{ gift.desc }}</text>
      <view class="meta">
        <text>库存 {{ gift.stock }}</text>
        <text>履约：公司代发</text>
      </view>
      <view class="rules">
        <text class="rt">兑奖条件</text>
        <text class="rl">· {{ costText }}</text>
        <text class="rl">· 需填写收货地址</text>
        <text class="rl">· 下单后可在「我的订单」查看发货状态</text>
      </view>
      <button class="yx-btn yx-btn-orange submit" @click="onRedeem">立即兑换</button>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { gifts as mockGifts } from '../../mock/data.js'
import { session } from '../../store/session.js'
import { appConfig } from '../../store/appConfig.js'
import { fetchGifts } from '../../api/commerce.js'
import { goConfirm } from '../../store/order.js'
import { USE_REMOTE } from '../../api/request.js'

const gift = ref(null)

onLoad(async (q) => {
  let list = (appConfig.catalog && appConfig.catalog.gifts) || []
  if (!list.length && USE_REMOTE) {
    try {
      const data = await fetchGifts()
      list = data.list || []
    } catch (e) {}
  }
  if (!list.length) list = mockGifts
  gift.value = list.find((g) => g.id === q.id) || list[0]
})

const costText = computed(() => {
  const g = gift.value
  if (!g) return ''
  const parts = []
  if (g.costEnergy) parts.push(`养成进度满`)
  if (g.costPoints) parts.push(`${g.costPoints} 积分`)
  if (g.needInvite) parts.push(`有效邀请 ${g.needInvite} 人`)
  if (g.needStreak) parts.push(`连续签到 ${g.needStreak} 天`)
  if (g.needCash) parts.push(`支付 ¥${(g.needCash / 100).toFixed(0)}`)
  return parts.join(' + ')
})

function onRedeem() {
  const g = gift.value
  if (!g) return
  if (g.mode === 'growth' && session.growth.current < 100) {
    uni.showToast({
      title: `进度 ${session.growth.current}% · 还差一点点`,
      icon: 'none',
    })
    return
  }
  if (g.needStreak && session.checkin.streak < g.needStreak) {
    uni.showToast({ title: `需连签 ${g.needStreak} 天`, icon: 'none' })
    return
  }
  if (g.costPoints && session.user.points < g.costPoints) {
    uni.showToast({ title: '积分不足', icon: 'none' })
    return
  }
  goConfirm({ type: 'gift', productId: g.id })
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
  padding-top: 24rpx;
  border-top: 1rpx solid #eee;
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
  color: #6e6258;
  line-height: 1.6;
}

.submit {
  margin-top: 32rpx;
}
</style>
