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
      <button
        class="yx-btn submit"
        :class="gateBlocked ? 'yx-btn-mute' : 'yx-btn-orange'"
        @click="onRedeem"
      >{{ gateBlocked || '立即兑换' }}</button>
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
import { USE_REMOTE, getToken } from '../../api/request.js'
import { isLoggedIn } from '../../api/auth.js'

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

const gateBlocked = computed(() => {
  const g = gift.value
  if (!g) return ''
  const streak = session.checkin.streak || 0
  const invites = session.user.validInviteCount || 0
  const points = session.user.points || 0
  if (g.mode === 'growth' && session.growth.current < 100) {
    return `还差进度 ${100 - session.growth.current}%`
  }
  if (g.needStreak && streak < g.needStreak) return `还差连签 ${g.needStreak - streak} 天`
  if (g.needInvite && invites < g.needInvite) return `还差邀 ${g.needInvite - invites} 人`
  if (g.costPoints && points < g.costPoints) return `还差 ${g.costPoints - points} 积分`
  return ''
})

function onRedeem() {
  const g = gift.value
  if (!g) return
  if (USE_REMOTE && !(getToken() && isLoggedIn())) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    setTimeout(() => uni.navigateTo({ url: '/pages/login/index' }), 400)
    return
  }
  if (gateBlocked.value) {
    uni.showToast({ title: gateBlocked.value, icon: 'none' })
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
