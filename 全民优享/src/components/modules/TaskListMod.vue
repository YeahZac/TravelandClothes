<template>
  <view class="wrap">
    <view class="head">
      <text class="title">{{ mod.title || '今日任务' }}</text>
      <text
        v-if="allLink"
        class="link"
        @click="openLink(allLink)"
      >{{ allLabel }}</text>
      <text v-else class="mute">{{ done }}/{{ rows.length }}</text>
    </view>

    <view v-if="showSteps" class="steps">
      <view class="progress" />
      <view class="steps-row">
        <view>
          <view class="sn-line">
            <text class="sn yx-num">{{ session.user.stepsToday }}</text>
            <text class="unit">步</text>
          </view>
          <text class="mute">{{ stepsLabel }}</text>
        </view>
        <button class="yx-btn-ghost" @click.stop="onSteps">{{ stepsCta }}</button>
      </view>
    </view>

    <view v-for="t in rows" :key="t.id" class="row" @click="onTask(t)">
      <image class="ico" :class="{ dim: t.status === 'done' }" :src="t.iconUrl || defaultIcon(t)" mode="aspectFit" />
      <view class="body">
        <view class="tr">
          <text class="tn">{{ t.title }}</text>
          <text class="rw">{{ t.reward }}</text>
        </view>
        <view class="sub">
          <text class="mute">{{ t.desc }}</text>
          <text v-if="t.progress" class="mute yx-num">{{ t.progress }}</text>
        </view>
      </view>
      <button
        v-if="t.status !== 'done'"
        class="act"
        :class="t.status === 'claim' ? 'claim' : 'todo'"
        @click.stop="onTask(t)"
      >
        {{ t.status === 'claim' ? '领取' : '去完成' }}
      </button>
      <text v-else class="done-t">已完成</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { session, doCheckin, claimSteps, browseMallDone, visitFestivalDone } from '../../store/session.js'
import { openLink } from '../../utils/navigate.js'

const props = defineProps({ mod: Object })
const p = computed(() => props.mod.payload || {})
const cfgItems = computed(() => p.value.items || [])
const showSteps = computed(() => !!p.value.showSteps)
const stepsLabel = computed(() => p.value.stepsLabel || '已达今日档')
const stepsCta = computed(() => p.value.stepsCta || '兑换')
const allLink = computed(() => p.value.allLinkKey || '')
const allLabel = computed(() => p.value.allLabel || '全部')
const limit = computed(() => p.value.limit || 0)

const rows = computed(() => {
  const mapped = cfgItems.value.map((item) => {
    const local = session.tasks.find((t) => t.id === item.id)
    return { ...item, status: (local && local.status) || 'todo' }
  })
  return limit.value > 0 ? mapped.slice(0, limit.value) : mapped
})

const done = computed(() => rows.value.filter((t) => t.status === 'done').length)

function defaultIcon(t) {
  const a = t.action || t.id || ''
  if (a.includes('check')) return '/static/ui/ico-coin.png'
  if (a.includes('step')) return '/static/ui/ico-steps.png'
  if (a.includes('mall')) return '/static/ui/ico-gift.png'
  if (a.includes('festival')) return '/static/ui/banner-festival.png'
  if (a.includes('invite')) return '/static/ui/ico-invite.png'
  return '/static/ui/ico-lottery.png'
}
function onSteps() {
  const r = claimSteps()
  if (!r.ok) uni.showToast({ title: r.msg, icon: 'none' })
}
function onTask(t) {
  if (t.status === 'done') return
  if (t.action === 'checkin') return doCheckin()
  if (t.action === 'steps') return onSteps()
  if (t.action === 'mall') {
    browseMallDone()
    return openLink('mall')
  }
  if (t.action === 'festival') {
    visitFestivalDone()
    return openLink('festival')
  }
  if (t.action === 'invite') return openLink('invite')
  if (t.action === 'ad') {
    session.user.energy += 30
    const local = session.tasks.find((x) => x.id === t.id)
    if (local) local.status = 'done'
    uni.showToast({ title: '+30 能量', icon: 'none' })
  }
}
</script>

<style scoped>
.wrap {
  background: #fff;
  border-radius: 24rpx;
  padding: 28rpx 32rpx;
  box-shadow: 0 8rpx 24rpx rgba(18, 24, 38, 0.06);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8rpx;
}
.title {
  font-size: 32rpx;
  font-weight: 600;
  color: #121826;
}
.link {
  font-size: 22rpx;
  font-weight: 600;
  color: #245bdb;
}
.mute {
  font-size: 22rpx;
  color: #5e6977;
}
.steps {
  margin: 16rpx 0 8rpx;
  border-radius: 20rpx;
  background: #f4f6f8;
  overflow: hidden;
}
.progress {
  height: 8rpx;
  background: linear-gradient(90deg, #1fbf73, #8ef0c0);
  width: 64%;
}
.steps-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 32rpx 28rpx;
}
.sn-line {
  display: flex;
  align-items: baseline;
  gap: 6rpx;
}
.sn {
  font-size: 48rpx;
  font-weight: 700;
  color: #121826;
  font-variant-numeric: tabular-nums;
  line-height: 1.05;
}
.unit {
  font-size: 22rpx;
  color: #5e6977;
}
.yx-btn-ghost {
  margin: 0;
  height: 56rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  border: 2rpx solid #121826;
  background: transparent;
  color: #121826;
  font-size: 22rpx;
  font-weight: 600;
  line-height: 52rpx;
}
.yx-btn-ghost::after {
  border: none;
}
.row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  min-height: 120rpx;
  padding: 24rpx 0;
  border-bottom: 1rpx solid #e6e8ee;
}
.row:last-child {
  border-bottom: none;
}
.ico {
  width: 80rpx;
  height: 80rpx;
  flex-shrink: 0;
  border-radius: 16rpx;
  background: #f4f6f8;
}
.ico.dim {
  opacity: 0.5;
}
.body {
  flex: 1;
  min-width: 0;
}
.tr {
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
}
.tn {
  font-size: 28rpx;
  font-weight: 600;
  color: #121826;
  line-height: 1.3;
}
.rw {
  font-size: 24rpx;
  font-weight: 700;
  color: #e25a00;
  flex-shrink: 0;
}
.sub {
  margin-top: 6rpx;
  display: flex;
  justify-content: space-between;
  gap: 8rpx;
}
.act {
  flex-shrink: 0;
  width: 128rpx;
  height: 56rpx;
  margin: 0;
  padding: 0;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 600;
  line-height: 52rpx;
}
.act::after {
  border: none;
}
.act.todo {
  background: transparent;
  color: #121826;
  border: 2rpx solid #121826;
}
.act.claim {
  background: linear-gradient(180deg, #ff8a2a, #f06400);
  color: #fff;
  border: none;
  line-height: 56rpx;
}
.done-t {
  flex-shrink: 0;
  font-size: 22rpx;
  color: #5e6977;
}
</style>
