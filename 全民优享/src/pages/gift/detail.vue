<template>
  <view class="yx-page detail yx-safe-bottom" v-if="gift">
    <view class="cover">
      <CmsImage
        v-if="gift.imageUrl"
        class="cover-img"
        :src="gift.imageUrl"
        mode="aspectFill"
        placeholder="/static/ui/ico-gift.png"
      />
      <view v-else class="cover-fallback" :class="'tone-' + (gift.coverTone || 'mint')">
        <text class="big">{{ gift.name.slice(0, 1) }}</text>
      </view>
    </view>
    <view class="panel">
      <view class="price-box">
        <PriceMix :item="gift" size="lg" :badge="gift.tag || ''" />
        <view v-if="mix.payMode === 'mix'" class="mix-tip">
          先扣能量值，差额微信支付，下单即锁库存
        </view>
      </view>
      <text class="name">{{ gift.name }}</text>
      <text class="desc">{{ gift.desc }}</text>
      <view class="meta">
        <text v-if="!hideFlashStock">库存 {{ gift.stock }}</text>
        <text>公司代发 · 可查物流</text>
      </view>
      <view class="rules">
        <text class="rt">兑礼说明</text>
        <text class="rl">· 兑换价：{{ mix.label }}</text>
        <text v-if="gift.needInvite" class="rl">· 需有效邀请 {{ gift.needInvite }} 人</text>
        <text v-if="gift.needStreak" class="rl">· 需连续签到 {{ gift.needStreak }} 天</text>
        <text v-if="gift.costEnergy" class="rl">· 需养成进度满 / 能量满兑</text>
        <text class="rl">· 需填写收货地址，下单后「我的订单」可查发货</text>
        <text v-if="mix.payCashCent" class="rl">· 含现金部分将调起微信支付</text>
      </view>
      <button
        class="submit"
        :class="gateBlocked ? 'mute' : ''"
        @click="onRedeem"
      >{{ gateBlocked || (mix.payCashCent ? '能量值+微信支付兑换' : mix.ctaText) }}</button>
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
import { resolvePayMix } from '../../utils/payMix.js'
import CmsImage from '../../components/CmsImage.vue'
import PriceMix from '../../components/PriceMix.vue'

const gift = ref(null)
const hideFlashStock = ref(false)
const mix = computed(() => resolvePayMix(gift.value || {}))

onLoad(async (q) => {
  hideFlashStock.value = String(q.from || '') === 'flash'
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

const gateBlocked = computed(() => {
  const g = gift.value
  if (!g) return ''
  const streak = session.checkin.streak || 0
  const invites = session.user.validInviteCount || 0
  const energy = session.user.energy || session.user.points || 0
  const m = resolvePayMix(g)
  if (g.mode === 'growth' && session.growth.current < 100) {
    return `还差进度 ${100 - session.growth.current}%`
  }
  if (g.needStreak && streak < g.needStreak) return `还差连签 ${g.needStreak - streak} 天`
  if (g.needInvite && invites < g.needInvite) return `还差邀 ${g.needInvite - invites} 人`
  if (m.payPoints && energy < m.payPoints) return `还差 ${m.payPoints - energy} 能量值`
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
  background: #f6f7fb;
  min-height: 100vh;
}

.cover {
  height: 560rpx;
  background: #fff;
  overflow: hidden;
}
.cover-img {
  width: 100%;
  height: 560rpx;
}
.cover-fallback {
  height: 100%;
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
  margin: -48rpx 24rpx 0;
  position: relative;
  z-index: 1;
  padding: 28rpx;
  background: #fff;
  border-radius: 28rpx;
  box-shadow: 0 12rpx 32rpx rgba(17, 24, 39, 0.06);
}

.price-box {
  padding-bottom: 20rpx;
  border-bottom: 1rpx solid #f3f4f6;
}

.mix-tip {
  margin-top: 12rpx;
  font-size: 22rpx;
  color: #9f1239;
  background: #fff1f2;
  padding: 10rpx 14rpx;
  border-radius: 10rpx;
}

.name {
  display: block;
  margin-top: 20rpx;
  font-size: 40rpx;
  font-weight: 800;
  color: #111827;
}

.desc {
  display: block;
  margin-top: 12rpx;
  font-size: 26rpx;
  color: #6b7280;
  line-height: 1.5;
}

.meta {
  display: flex;
  justify-content: space-between;
  margin-top: 24rpx;
  font-size: 22rpx;
  color: #9ca3af;
}

.rules {
  margin-top: 28rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid #f3f4f6;
}

.rt {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  margin-bottom: 12rpx;
  color: #111827;
}

.rl {
  display: block;
  font-size: 24rpx;
  color: #6b7280;
  line-height: 1.7;
}

.submit {
  margin-top: 32rpx;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: 999rpx;
  background: linear-gradient(90deg, #e11d48, #f97316);
  color: #fff;
  font-size: 30rpx;
  font-weight: 700;
  border: none;
}
.submit.mute {
  background: #e5e7eb;
  color: #6b7280;
}
.submit::after {
  border: none;
}
</style>
