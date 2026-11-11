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

    <view
      v-for="t in rows"
      :key="t.id"
      class="row"
      :class="{ pending: !t.__ok }"
      @click="onTask(t)"
    >
      <view class="ico-wrap" :class="t.__ok ? 'tone-' + toneFor(t) : 'tone-pending'">
        <CmsImage
          v-if="t.__ok && t.iconUrl"
          class="ico-img"
          :src="t.iconUrl"
          mode="aspectFit"
        />
        <VIcon v-else-if="t.__ok" :name="iconFor(t)" :size="44" :color="iconColor(t)" />
        <text v-else class="pending-mark">?</text>
      </view>
      <view class="body">
        <view class="tr">
          <text class="tn">{{ t.__ok ? t.title : '待配置' }}</text>
          <text v-if="t.__ok" class="rw">{{ t.reward }}</text>
        </view>
        <view class="sub">
          <text class="mute">{{ t.__ok ? t.desc : '运营后台配置后可完成' }}</text>
          <text v-if="t.__ok && t.progress" class="mute yx-num">{{ t.progress }}</text>
        </view>
      </view>
      <button
        v-if="t.__ok && t.status !== 'done'"
        class="act"
        :class="t.status === 'claim' ? 'claim' : 'todo'"
        @click.stop="onTask(t)"
      >
        {{ t.status === 'claim' ? '领取' : '去完成' }}
      </button>
      <text v-else-if="t.__ok" class="done-t">已完成</text>
      <text v-else class="done-t">待配置</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { session, doCheckin, browseMallDone, visitFestivalDone } from '../../store/session.js'
import { openLink } from '../../utils/navigate.js'
import { isEntryConfigured, normalizeEntryList } from '../../utils/entrySlots.js'
import VIcon from '../VIcon.vue'
import CmsImage from '../CmsImage.vue'

const props = defineProps({ mod: Object })
const p = computed(() => props.mod.payload || {})
const cfgItems = computed(() => p.value.items || [])
const allLink = computed(() => p.value.allLinkKey || '')
const allLabel = computed(() => p.value.allLabel || '全部')
const limit = computed(() => p.value.limit || 0)

function isStepsTask(item) {
  const a = String((item && (item.action || item.id)) || '').toLowerCase()
  return a === 'steps' || a.includes('step')
}

const rows = computed(() => {
  const mapped = normalizeEntryList(cfgItems.value)
    .filter((item) => !isStepsTask(item))
    .map((item) => {
      const local = session.tasks.find((t) => t.id === item.id)
      return {
        ...item,
        status: (local && local.status) || 'todo',
        __ok: isEntryConfigured({ ...item, name: item.title }),
      }
    })
  return limit.value > 0 ? mapped.slice(0, limit.value) : mapped
})

const done = computed(() => rows.value.filter((t) => t.__ok && t.status === 'done').length)

function iconFor(t) {
  if (t.iconKey) return t.iconKey
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

function onTask(t) {
  if (!t.__ok) {
    uni.showToast({ title: '待配置', icon: 'none' })
    return
  }
  if (t.status === 'done') return
  if (t.path) return openLink(t)
  if (t.action === 'checkin') return doCheckin()
  if (t.action === 'steps') return openLink('home')
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
.ico-wrap.tone-pending {
  background: #e8e4de;
}
.ico-img {
  width: 56rpx;
  height: 56rpx;
}
.pending-mark {
  font-size: 32rpx;
  font-weight: 700;
  color: #a89b91;
}
.row.pending {
  opacity: 0.78;
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
