<template>
  <view class="yx-page gift-list yx-safe-bottom">
    <view class="intro yx-card">
      <text class="title">兑礼中心</text>
      <text class="yx-muted">
        同一件小礼可用不同门槛放出：纯积分 / 邀人 / 连签 / 小额现金 / 抽奖
      </text>
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
      class="gift yx-card"
      @click="goDetail(g.id)"
    >
      <view class="cover" :class="'tone-' + (g.coverTone || 'mint')">
        <text class="cover-letter">{{ (g.name || '?').slice(0, 1) }}</text>
      </view>
      <view class="body">
        <view class="top">
          <text class="name">{{ g.name }}</text>
          <text class="yx-tag">{{ g.tag }}</text>
        </view>
        <text class="desc">{{ g.desc }}</text>
        <view class="foot">
          <text class="cost">{{ costText(g) }}</text>
          <text class="cta-hint">{{ gateHint(g) }}</text>
        </view>
        <text v-if="g.firstWave" class="wave">首兑</text>
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

const filter = ref('all')
const remoteGifts = ref([])
const modes = [
  { key: 'all', label: '全部' },
  { key: 'growth', label: '养成' },
  { key: 'points', label: '积分' },
  { key: 'points_invite', label: '邀人' },
  { key: 'points_streak', label: '连签' },
  { key: 'points_cash', label: '现金+' },
]

const allGifts = computed(() => {
  if (remoteGifts.value.length) return remoteGifts.value
  if (appConfig.catalog && appConfig.catalog.gifts && appConfig.catalog.gifts.length) {
    return appConfig.catalog.gifts
  }
  return mockGifts
})

const filtered = computed(() =>
  filter.value === 'all' ? allGifts.value : allGifts.value.filter((g) => g.mode === filter.value)
)

onMounted(async () => {
  if (!USE_REMOTE) return
  try {
    const data = await fetchGifts()
    remoteGifts.value = data.list || []
  } catch (e) {}
})

function costText(g) {
  const parts = []
  if (g.costEnergy) parts.push(`${g.costEnergy} 能量满兑`)
  if (g.costPoints) parts.push(`${g.costPoints} 积分`)
  if (g.needInvite) parts.push(`邀 ${g.needInvite} 人`)
  if (g.needStreak) parts.push(`连签 ${g.needStreak} 天`)
  if (g.needCash) parts.push(`¥${(g.needCash / 100).toFixed(0)}`)
  return parts.join(' · ') || '免费领取'
}

function gateHint(g) {
  const streak = session.checkin.streak || 0
  const invites = session.user.validInviteCount || 0
  if (g.needStreak && streak < g.needStreak) return `还差连签 ${g.needStreak - streak} 天`
  if (g.needInvite && invites < g.needInvite) return `还差邀 ${g.needInvite - invites} 人`
  if (g.costPoints && (session.user.points || 0) < g.costPoints) {
    return `还差 ${g.costPoints - (session.user.points || 0)} 积分`
  }
  return `库存 ${g.stock}`
}

function goDetail(id) {
  uni.navigateTo({ url: `/pages/gift/detail?id=${id}` })
}
</script>

<style scoped lang="scss">
.gift-list {
  padding: 24rpx 32rpx;
}

.intro {
  margin-bottom: 20rpx;
}

.title {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
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
  background: #f4ede6;
  font-size: 22rpx;
  color: #6e6258;
}

.mode.on {
  background: #fce8f0;
  color: #d83068;
  font-weight: 700;
}

.gift {
  position: relative;
  display: flex;
  gap: 20rpx;
  margin-bottom: 16rpx;
}
.wave {
  position: absolute;
  right: 16rpx;
  top: 16rpx;
  font-size: 20rpx;
  font-weight: 700;
  color: #c97830;
  background: #fff3e0;
  padding: 4rpx 12rpx;
  border-radius: 999rpx;
}
.cta-hint {
  font-size: 22rpx;
  color: #d83068;
}

.cover {
  width: 140rpx;
  height: 140rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.tone-peach { background: #ffe0d4; }
.tone-mint { background: #d8f6f2; }
.tone-lilac { background: #ebe4ff; }
.tone-sun { background: #ffe9c9; }
.tone-coral { background: #ffd5cf; }

.cover-letter {
  font-size: 56rpx;
  font-weight: 800;
  color: rgba(43, 37, 32, 0.25);
}

.body {
  flex: 1;
  min-width: 0;
}

.top {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.name {
  font-size: 30rpx;
  font-weight: 700;
}

.desc {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #6e6258;
}

.foot {
  display: flex;
  justify-content: space-between;
  margin-top: 16rpx;
}

.cost {
  font-size: 24rpx;
  font-weight: 700;
  color: #c0285a;
}
</style>
