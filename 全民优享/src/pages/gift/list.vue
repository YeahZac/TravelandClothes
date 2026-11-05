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
      <view class="cover" :class="'tone-' + g.coverTone">
        <text class="cover-letter">{{ g.name.slice(0, 1) }}</text>
      </view>
      <view class="body">
        <view class="top">
          <text class="name">{{ g.name }}</text>
          <text class="yx-tag">{{ g.tag }}</text>
        </view>
        <text class="desc">{{ g.desc }}</text>
        <view class="foot">
          <text class="cost">{{ costText(g) }}</text>
          <text class="yx-muted">库存 {{ g.stock }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { gifts } from '../../mock/data.js'

const filter = ref('all')
const modes = [
  { key: 'all', label: '全部' },
  { key: 'growth', label: '养成' },
  { key: 'points', label: '积分' },
  { key: 'points_invite', label: '邀人' },
  { key: 'points_streak', label: '连签' },
  { key: 'points_cash', label: '现金+' },
]

const filtered = computed(() =>
  filter.value === 'all' ? gifts : gifts.filter((g) => g.mode === filter.value)
)

function costText(g) {
  const parts = []
  if (g.costEnergy) parts.push(`${g.costEnergy} 能量满兑`)
  if (g.costPoints) parts.push(`${g.costPoints} 积分`)
  if (g.needInvite) parts.push(`邀 ${g.needInvite} 人`)
  if (g.needStreak) parts.push(`连签 ${g.needStreak} 天`)
  if (g.needCash) parts.push(`¥${(g.needCash / 100).toFixed(0)}`)
  return parts.join(' · ') || '免费领取'
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
  margin-bottom: 8rpx;
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
  font-size: 22rpx;
  background: rgba(28, 26, 23, 0.05);
  color: #5c574f;
}

.mode.on {
  background: #ff5c4a;
  color: #fff;
  font-weight: 600;
}

.gift {
  display: flex;
  gap: 20rpx;
  margin-bottom: 16rpx;
  padding: 20rpx !important;
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
  font-size: 48rpx;
  font-weight: 800;
  color: rgba(28, 26, 23, 0.35);
}

.body {
  flex: 1;
  min-width: 0;
}

.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.name {
  font-size: 30rpx;
  font-weight: 750;
}

.desc {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #9a948c;
  line-height: 1.4;
}

.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16rpx;
}

.cost {
  font-size: 24rpx;
  font-weight: 700;
  color: #e84636;
}
</style>
