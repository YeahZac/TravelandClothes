<template>
  <view class="row" @click="$emit('action')">
    <image class="ico" :src="iconSrc" mode="aspectFit" />
    <view class="body">
      <view class="title-row">
        <text class="title">{{ task.title }}</text>
        <text class="reward">{{ task.reward }}</text>
      </view>
      <view class="meta">
        <text class="desc">{{ task.desc }}</text>
        <text v-if="task.progress" class="prog">{{ task.progress }}</text>
      </view>
    </view>
    <view
      class="cta"
      :class="{ done: task.status === 'done', claim: task.status === 'claim' }"
    >
      <text>{{ ctaText }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ task: { type: Object, required: true } })
defineEmits(['action'])

const map = {
  check: 'checkin',
  steps: 'steps',
  shop: 'mall',
  fest: 'festival',
  play: 'video',
  invite: 'invite',
  friends: 'invite',
}

const iconSrc = computed(
  () => `/static/ui/ico-${map[props.task.icon] || 'checkin'}.png`
)

const ctaText = computed(() => {
  if (props.task.status === 'done') return '已完成'
  if (props.task.status === 'claim') return '领取'
  return '去完成'
})
</script>

<style scoped lang="scss">
.row {
  display: flex;
  align-items: center;
  padding: 22rpx 0;
  border-bottom: 1rpx solid rgba(26, 34, 51, 0.06);
}
.row:last-child {
  border-bottom: none;
}
.ico {
  width: 84rpx;
  height: 84rpx;
  margin-right: 18rpx;
  flex-shrink: 0;
  filter: drop-shadow(0 6rpx 10rpx rgba(45, 107, 255, 0.2));
}
.body {
  flex: 1;
  min-width: 0;
}
.title-row {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
}
.title {
  font-size: 28rpx;
  font-weight: 700;
  color: #1a2233;
}
.reward {
  font-size: 22rpx;
  color: #ff6a00;
  font-weight: 800;
  flex-shrink: 0;
}
.meta {
  display: flex;
  justify-content: space-between;
  margin-top: 6rpx;
}
.desc,
.prog {
  font-size: 22rpx;
  color: #6b7a94;
}
.cta {
  margin-left: 14rpx;
  height: 56rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #6ea0ff, #2d6bff);
  color: #fff;
  font-size: 22rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  flex-shrink: 0;
  box-shadow: 0 6rpx 0 #1a4fd4;
}
.cta.claim {
  background: linear-gradient(180deg, #ffc34d, #ff6a00);
  box-shadow: 0 6rpx 0 #e04e00;
}
.cta.done {
  background: #e8edf7;
  color: #6b7a94;
  box-shadow: none;
}
</style>
