/* Hallmark · genre: playful · macrostructure: app-shell · theme: cream-rose · designed-as-app */
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
        <button class="btn-ghost" @click.stop="onSteps">{{ stepsCta }}</button>
      </view>
    </view>

    <view v-for="t in rows" :key="t.id" class="row" @click="onTask(t)">
      <view class="ico-wrap" :class="'tone-' + toneFor(t)">
        <VIcon :name="iconFor(t)" :size="44" :color="iconColor(t)" />
      </view>
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
import VIcon from '../VIcon.vue'

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

function iconFor(t) {
  const a = t.action || t.id || ''
  if (a.includes('check')) return 'coin'
  if (a.includes('step')) return 'steps'
  if (a.includes('mall')) return 'mall'
  if (a.includes('festival')) return 'festival'
  if (a.includes('invite')) return 'invite'
  return 'lottery'
}
function toneFor(t) {
  const a = t.action || t.id || ''
  if (a.includes('check')) return 'gold'
  if (a.includes('step')) return 'sage'
  if (a.includes('mall')) return 'gold'
  if (a.includes('festival')) return 'lavender'
  if (a.includes('invite')) return 'sage'
  return 'gold'
}
function iconColor(t) {
  const map = {
    gold: '#C9A36B',
    sage: '#7FA67A',
    lavender: '#9B8FBF',
    ink: '#6E6258',
  }
  return map[toneFor(t)] || '#6E6258'
}

function onSteps() {
  const r = claimSteps()
  if (!r.ok) uni.showToast({ title: r.msg, icon: 'none' })
}
function onTask(t) {
  if (t.status === 'done') return
  if (t.path) return openLink(t)
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
  if (t.linkKey) return openLink(t.linkKey)
}
</script>

<style scoped>
.wrap {
  background: var(--paper-2);
  border-radius: var(--radius-card);
  padding: var(--card-pad-y) var(--card-pad);
  box-shadow: var(--shadow);
  border: 1rpx solid var(--line-soft);
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 16rpx;
}
.title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--ink);
}
.link {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--ink-2);
}
.mute {
  font-size: 22rpx;
  color: var(--ink-3);
}
.steps {
  margin: 20rpx 0 12rpx;
  border-radius: var(--radius-card);
  background: var(--paper-3);
  overflow: hidden;
}
.progress {
  height: 8rpx;
  background: var(--sage);
  width: 64%;
}
.steps-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 28rpx 32rpx 32rpx;
}
.sn-line {
  display: flex;
  align-items: baseline;
  gap: 6rpx;
}
.sn {
  font-size: 52rpx;
  font-weight: 800;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  line-height: 1.05;
  letter-spacing: -0.5rpx;
}
.unit {
  font-size: 22rpx;
  color: var(--ink-3);
}
.btn-ghost {
  margin: 0;
  height: 64rpx;
  padding: 0 28rpx;
  border-radius: var(--radius-pill);
  border: 2rpx solid var(--ink);
  background: transparent;
  color: var(--ink);
  font-size: 24rpx;
  font-weight: 600;
  line-height: 60rpx;
}
.btn-ghost::after {
  border: none;
}
.row {
  display: flex;
  align-items: center;
  gap: 24rpx;
  min-height: 132rpx;
  padding: 28rpx 0;
  border-bottom: 1rpx solid var(--line-soft);
}
.row:last-child {
  border-bottom: none;
  padding-bottom: 4rpx;
}
.ico-wrap {
  width: 88rpx;
  height: 88rpx;
  flex-shrink: 0;
  border-radius: var(--radius-icon);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ico-wrap.tone-gold {
  background: var(--gold-soft);
}
.ico-wrap.tone-amber {
  background: var(--gold-soft);
}
.ico-wrap.tone-sage {
  background: var(--sage-soft);
}
.ico-wrap.tone-lavender {
  background: var(--lavender-soft);
}
.body {
  flex: 1;
  min-width: 0;
}
.tr {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
  align-items: baseline;
}
.tn {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.3;
}
.rw {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--gold);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}.sub {
  margin-top: 8rpx;
  display: flex;
  justify-content: space-between;
  gap: 12rpx;
  align-items: baseline;
}
.act {
  flex-shrink: 0;
  width: 132rpx;
  height: 64rpx;
  margin: 0;
  padding: 0;
  border-radius: var(--radius-pill);
  font-size: 24rpx;
  font-weight: 600;
  line-height: 60rpx;
}
.act::after {
  border: none;
}
.act.todo {
  background: transparent;
  color: var(--ink);
  border: 2rpx solid var(--ink);
}
.act.claim {
  background: var(--accent);
  color: var(--ink-on-accent);
  border: none;
  line-height: 64rpx;
}
.act.claim:active {
  background: var(--accent-deep);
  transform: scale(0.98);
}
.done-t {
  flex-shrink: 0;
  font-size: 22rpx;
  color: var(--ink-3);
}
</style>
