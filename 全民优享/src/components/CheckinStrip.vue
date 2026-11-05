<template>
  <view class="strip">
    <view class="head">
      <text class="title">连续签到</text>
      <view class="remind">
        <text class="yx-muted">已连签 {{ streak }} 天</text>
      </view>
    </view>
    <view class="days">
      <view
        v-for="r in rewards"
        :key="r.day"
        class="day"
        :class="{
          done: r.day < dayIndex || (r.day === dayIndex && todayDone),
          today: r.day === dayIndex && !todayDone,
        }"
      >
        <view v-if="r.day === 7" class="chest-wrap">
          <image class="chest" src="/static/ui/chest.png" mode="aspectFit" />
        </view>
        <view v-else class="dot">
          <text>{{ r.day }}</text>
        </view>
        <text class="lab">{{ r.label }}</text>
      </view>
    </view>
    <button
      class="yx-btn"
      :class="todayDone ? 'yx-btn-ghost' : 'yx-btn-orange'"
      @click="$emit('checkin')"
    >
      {{ todayDone ? '今日已签到' : '立即签到领奖励' }}
    </button>
  </view>
</template>

<script setup>
defineProps({
  rewards: { type: Array, default: () => [] },
  dayIndex: { type: Number, default: 1 },
  todayDone: { type: Boolean, default: false },
  streak: { type: Number, default: 0 },
})
defineEmits(['checkin'])
</script>

<style scoped lang="scss">
.strip {
  background: #fff;
  border-radius: 24rpx;
  padding: 28rpx;
  box-shadow: 0 10rpx 28rpx rgba(26, 79, 212, 0.08);
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 22rpx;
}

.title {
  font-size: 32rpx;
  font-weight: 800;
}

.days {
  display: flex;
  justify-content: space-between;
  margin-bottom: 28rpx;
}

.day {
  width: 78rpx;
  text-align: center;
}

.dot {
  width: 64rpx;
  height: 64rpx;
  margin: 0 auto 10rpx;
  border-radius: 50%;
  background: #edf2fb;
  color: #6b7a94;
  font-size: 24rpx;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 -4rpx 0 rgba(26, 34, 51, 0.06);
}

.day.done .dot {
  background: linear-gradient(180deg, #ffd76a, #ff9a1a);
  color: #fff;
  text-shadow: 0 1rpx 0 rgba(160, 80, 0, 0.3);
  box-shadow: 0 6rpx 0 #e07a00, 0 8rpx 14rpx rgba(255, 154, 26, 0.35);
}

.day.today .dot {
  background: linear-gradient(180deg, #7eb0ff, #2d6bff);
  color: #fff;
  box-shadow: 0 0 0 8rpx rgba(45, 107, 255, 0.18), 0 6rpx 0 #1a4fd4;
}

.chest-wrap {
  height: 64rpx;
  margin-bottom: 10rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}

.chest {
  width: 68rpx;
  height: 68rpx;
}

.lab {
  font-size: 18rpx;
  color: #6b7a94;
  font-weight: 600;
}

.day.done .lab,
.day.today .lab {
  color: #ff6a00;
}

.yx-btn {
  width: 100%;
}
</style>
