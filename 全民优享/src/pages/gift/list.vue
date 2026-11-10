<template>
  <view class="yx-page gift-list yx-safe-bottom">
    <view class="intro">
      <text class="title">兑礼中心</text>
      <text class="lead">能量值不够？可「能量值+微信」组合兑，门槛更柔、礼更快到手</text>
      <view class="modes">
        <text
          v-for="m in modes"
          :key="m.key"
          class="mode"
          :class="{ on: filter === m.key }"
          @click="filter = m.key"
        >{{ m.label }}</text>
      </view>
    </view>

    <view
      v-for="g in filtered"
      :key="g.id"
      class="gift"
      @click="goDetail(g.id)"
    >
      <view class="cover">
        <CmsImage
          v-if="g.imageUrl"
          :src="g.imageUrl"
          mode="aspectFill"
          placeholder="/static/ui/ico-gift.png"
          :show-placeholder="true"
        />
        <view v-else class="cover-fallback" :class="'tone-' + (g.coverTone || 'mint')">
          <text class="cover-letter">{{ (g.name || '?').slice(0, 1) }}</text>
        </view>
        <text v-if="g.firstWave" class="wave">首兑</text>
        <text v-if="mixOf(g).payMode === 'mix'" class="mix-flag">组合兑</text>
      </view>
      <view class="body">
        <view class="top">
          <text class="name">{{ g.name }}</text>
          <text v-if="g.tag" class="tag">{{ g.tag }}</text>
        </view>
        <text class="desc">{{ g.desc || gateExtra(g) }}</text>
        <view class="foot">
          <PriceMix :item="g" size="md" />
          <text class="cta-hint">{{ gateHint(g) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, onMounted } from 'vue'
import { gifts as mockGifts } from '../../mock/data.js'
import { appConfig } from '../../store/appConfig.js'
import { session } from '../../store/session.js'
import { fetchGifts } from '../../api/commerce.js'
import { USE_REMOTE } from '../../api/request.js'
import { resolvePayMix } from '../../utils/payMix.js'
import CmsImage from '../../components/CmsImage.vue'
import PriceMix from '../../components/PriceMix.vue'

const filter = ref('all')
const remoteGifts = ref([])
const modes = [
  { key: 'all', label: '全部' },
  { key: 'growth', label: '养成' },
  { key: 'points', label: '能量值' },
  { key: 'points_invite', label: '邀人' },
  { key: 'points_streak', label: '连签' },
  { key: 'points_cash', label: '组合兑' },
]

const allGifts = computed(() => {
  if (remoteGifts.value.length) return remoteGifts.value
  if (appConfig.catalog && appConfig.catalog.gifts && appConfig.catalog.gifts.length) {
    return appConfig.catalog.gifts
  }
  return mockGifts
})

const filtered = computed(() => {
  if (filter.value === 'all') return allGifts.value
  if (filter.value === 'points_cash') {
    return allGifts.value.filter((g) => {
      const m = resolvePayMix(g)
      return m.payMode === 'mix' || g.mode === 'points_cash'
    })
  }
  return allGifts.value.filter((g) => g.mode === filter.value)
})

onMounted(async () => {
  if (!USE_REMOTE) return
  try {
    const data = await fetchGifts()
    remoteGifts.value = data.list || []
  } catch (e) {}
})

function mixOf(g) {
  return resolvePayMix(g || {})
}

function gateExtra(g) {
  const parts = []
  if (g.needInvite) parts.push(`邀 ${g.needInvite} 人`)
  if (g.needStreak) parts.push(`连签 ${g.needStreak} 天`)
  if (g.costEnergy) parts.push('养成满兑')
  return parts.join(' · ')
}

function gateHint(g) {
  const streak = session.checkin.streak || 0
  const invites = session.user.validInviteCount || 0
  const mix = resolvePayMix(g)
  if (g.needStreak && streak < g.needStreak) return `还差连签 ${g.needStreak - streak} 天`
  if (g.needInvite && invites < g.needInvite) return `还差邀 ${g.needInvite - invites} 人`
  const energy = session.user.energy || session.user.points || 0
  if (mix.payPoints && energy < mix.payPoints) {
    return `还差 ${mix.payPoints - energy} 能量值`
  }
  return `去兑换 · 余${g.stock}`
}

function goDetail(id) {
  uni.navigateTo({ url: `/pages/gift/detail?id=${id}` })
}
</script>

<style scoped lang="scss">
.gift-list {
  padding: 24rpx 28rpx 48rpx;
  background: #f6f7fb;
  min-height: 100vh;
}

.intro {
  margin-bottom: 20rpx;
  padding: 28rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, #fff1f2 0%, #fff7ed 100%);
}

.title {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
  color: #111827;
}

.lead {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: #9f1239;
  line-height: 1.45;
}

.modes {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 20rpx;
}

.mode {
  padding: 10rpx 20rpx;
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.85);
  font-size: 22rpx;
  color: #6b7280;
}

.mode.on {
  background: #e11d48;
  color: #fff;
  font-weight: 700;
}

.gift {
  position: relative;
  display: flex;
  gap: 20rpx;
  margin-bottom: 16rpx;
  padding: 18rpx;
  background: #fff;
  border-radius: 20rpx;
  box-shadow: 0 8rpx 24rpx rgba(17, 24, 39, 0.05);
}

.wave,
.mix-flag {
  position: absolute;
  font-size: 18rpx;
  font-weight: 700;
  padding: 4rpx 10rpx;
  border-radius: 8rpx;
  color: #fff;
}
.wave {
  left: 8rpx;
  top: 8rpx;
  background: #f97316;
}
.mix-flag {
  right: 8rpx;
  bottom: 8rpx;
  background: #e11d48;
}

.cover {
  width: 180rpx;
  height: 180rpx;
  border-radius: 16rpx;
  overflow: hidden;
  flex-shrink: 0;
  position: relative;
  background: #f3f4f6;
}
.cover :deep(.cms-img),
.cover :deep(.cms-ph) {
  width: 100%;
  height: 100%;
}

.cover-fallback {
  width: 100%;
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

.cover-letter {
  font-size: 64rpx;
  font-weight: 800;
  color: rgba(43, 37, 32, 0.25);
}

.body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.top {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.name {
  font-size: 30rpx;
  font-weight: 700;
  color: #111827;
}

.tag {
  font-size: 18rpx;
  color: #e11d48;
  background: #fff1f2;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
  font-weight: 700;
}

.desc {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #6b7280;
  line-height: 1.4;
  height: 60rpx;
  overflow: hidden;
}

.foot {
  margin-top: auto;
  padding-top: 12rpx;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12rpx;
}

.cta-hint {
  flex-shrink: 0;
  font-size: 20rpx;
  color: #fff;
  background: #111827;
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  font-weight: 600;
}
</style>
