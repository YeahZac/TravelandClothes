<template>
  <view class="page yx-safe-bottom">
    <view class="head">
      <text class="title">步数达标记录</text>
      <text class="sub">仅当日可领取 · 档位由运营后台配置</text>
    </view>

    <view class="legend">
      <text v-for="t in tiers" :key="t.steps" class="lg">{{ t.steps }}步 → +{{ t.energy }}能量值</text>
    </view>

    <view v-for="it in list" :key="it.dayKey" class="row" :class="{ today: it.isToday }">
      <view class="l">
        <text class="day">{{ it.dayKey }} · 周{{ it.weekday }}</text>
        <text class="meta">{{ it.steps || 0 }} 步 · {{ it.rewardText }}</text>
        <view v-if="it.tiers && it.tiers.length" class="chips">
          <text
            v-for="t in it.tiers"
            :key="t.steps"
            class="chip"
            :class="{ on: t.unlocked, got: t.claimed }"
          >{{ Math.round(t.steps / 1000) }}k{{ t.claimed ? '✓' : t.unlocked ? '达' : '' }}</text>
        </view>
      </view>
      <text class="st">{{ statusText(it) }}</text>
    </view>
    <view v-if="!list.length" class="empty">暂无记录</view>
  </view>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { request, USE_REMOTE, getToken } from '../../api/request.js'
import { appConfig } from '../../store/appConfig.js'

const list = ref([])
const tiers = ref([])

function statusText(it) {
  if (it.energyClaimed > 0) return '已领取'
  if (it.reached && it.isToday) return '可领取'
  if (it.reached) return '已过期'
  return '未达标'
}

onMounted(async () => {
  const fallbackTiers =
    (appConfig.game && appConfig.game.steps && appConfig.game.steps.tiers) || [
      { steps: 3000, energy: 30 },
      { steps: 6000, energy: 80 },
      { steps: 10000, energy: 120 },
    ]
  tiers.value = fallbackTiers
  if (!(USE_REMOTE && getToken())) {
    list.value = []
    return
  }
  try {
    const data = await request('/api/traffic/v1/steps/history?days=30')
    list.value = data.list || []
    if (data.tiers && data.tiers.length) tiers.value = data.tiers
  } catch (e) {
    list.value = []
  }
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #f6f3ee;
  padding: 24rpx 28rpx 48rpx;
}
.head {
  margin-bottom: 16rpx;
}
.title {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
  color: #1c1917;
}
.sub {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #8a8178;
}
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 20rpx;
}
.lg {
  font-size: 20rpx;
  color: #5a8055;
  background: rgba(127, 166, 122, 0.15);
  padding: 6rpx 14rpx;
  border-radius: 999rpx;
}
.row {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  padding: 24rpx;
  margin-bottom: 12rpx;
  background: #fff;
  border-radius: 18rpx;
}
.row.today {
  box-shadow: inset 0 0 0 2rpx #7fa67a;
}
.day {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: #1c1917;
}
.meta {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #8a8178;
}
.chips {
  display: flex;
  gap: 8rpx;
  margin-top: 10rpx;
}
.chip {
  font-size: 18rpx;
  color: #9c958c;
  background: #f0ebe3;
  padding: 4rpx 10rpx;
  border-radius: 8rpx;
}
.chip.on {
  color: #5a8055;
  background: rgba(127, 166, 122, 0.2);
}
.chip.got {
  color: #7a5a1f;
  background: rgba(201, 163, 107, 0.25);
}
.st {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #6e6258;
  font-weight: 600;
}
.empty {
  text-align: center;
  padding: 80rpx 0;
  color: #9c958c;
  font-size: 24rpx;
}
</style>
