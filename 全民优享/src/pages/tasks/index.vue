<template>
  <view class="yx-page tasks yx-safe-bottom">
    <view class="head yx-card">
      <view class="head-row">
        <view>
          <text class="h-title">今日任务</text>
          <text class="yx-muted">做完 1～3 个就够 · 低思考闭环</text>
        </view>
        <view class="progress-chip">
          <text class="pc-n">{{ doneCount }}/{{ session.tasks.length }}</text>
          <text class="pc-u">完成</text>
        </view>
      </view>

      <view class="steps-box">
        <view class="steps-left">
          <text class="steps-n">{{ session.user.stepsToday }}</text>
          <text class="yx-muted">今日步数 · 已同步微信运动（模拟）</text>
        </view>
        <button class="yx-btn yx-btn-mint" size="mini" @click="onSteps">
          {{ stepsCta }}
        </button>
      </view>

      <view class="tiers">
        <view
          v-for="tier in stepTiers"
          :key="tier.n"
          class="tier"
          :class="{ on: session.user.stepsToday >= tier.n }"
        >
          <text class="tier-n">{{ tier.n / 1000 }}k</text>
          <text class="tier-r">+{{ tier.energy }}</text>
        </view>
      </view>
    </view>

    <view class="list yx-card">
      <TaskRow
        v-for="t in session.tasks"
        :key="t.id"
        :task="t"
        @action="onTask(t)"
      />
    </view>

    <view class="tip yx-muted">
      步数不能只靠 · 需配合签到与社交，防刷设备打穿（总纲 3.2）
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import TaskRow from '../../components/TaskRow.vue'
import { session, doCheckin, claimSteps } from '../../store/session.js'

const stepTiers = [
  { n: 3000, energy: 30 },
  { n: 6000, energy: 80 },
  { n: 10000, energy: 120 },
]

const doneCount = computed(
  () => session.tasks.filter((t) => t.status === 'done').length
)

const stepsCta = computed(() => {
  const t = session.tasks.find((x) => x.id === 't_steps')
  if (!t || t.status === 'done') return '已领取'
  if (t.status === 'claim') return '领能量'
  return '去授权'
})

function toast(msg) {
  uni.showToast({ title: msg, icon: 'none' })
}

function onSteps() {
  const r = claimSteps()
  toast(r.msg)
}

function onTask(t) {
  if (t.status === 'done') return
  if (t.action === 'checkin') {
    toast(doCheckin().msg)
    return
  }
  if (t.action === 'steps') return onSteps()
  if (t.action === 'friends') {
    uni.switchTab({ url: '/pages/friends/index' })
    return
  }
  if (t.action === 'mall') {
    uni.navigateTo({ url: '/pages/mall/index' })
    return
  }
  if (t.action === 'invite') {
    uni.navigateTo({ url: '/pages/invite/index' })
    return
  }
  if (t.action === 'ad') {
    session.user.energy += 30
    t.status = 'done'
    toast('模拟看完广告 · +30 能量')
  }
}
</script>

<style scoped lang="scss">
.tasks {
  padding: 24rpx 32rpx;
}

.head {
  margin-bottom: 20rpx;
}

.head-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.h-title {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
}

.progress-chip {
  text-align: right;
}

.pc-n {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
  color: #ff5c4a;
}

.pc-u {
  font-size: 20rpx;
  color: #9a948c;
}

.steps-box {
  margin-top: 24rpx;
  padding: 24rpx;
  border-radius: 20rpx;
  background: rgba(46, 196, 182, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.steps-n {
  display: block;
  font-size: 44rpx;
  font-weight: 800;
  color: #1a9e92;
  font-variant-numeric: tabular-nums;
}

.tiers {
  display: flex;
  gap: 12rpx;
  margin-top: 20rpx;
}

.tier {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: 16rpx;
  background: rgba(28, 26, 23, 0.04);
  opacity: 0.5;
}

.tier.on {
  opacity: 1;
  background: rgba(46, 196, 182, 0.16);
}

.tier-n {
  display: block;
  font-size: 24rpx;
  font-weight: 700;
}

.tier-r {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  color: #1a9e92;
}

.list {
  margin-bottom: 20rpx;
}

.tip {
  padding: 0 8rpx;
  line-height: 1.5;
}
</style>
