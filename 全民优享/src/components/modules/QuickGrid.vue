<template>
  <view class="grid">
    <view
      v-for="(item, idx) in items"
      :key="item.id || idx"
      class="item"
      :class="{ pending: !item.__ok }"
      @click="onTap(item)"
    >
      <view class="ico-wrap" :style="iconBg(item, idx)">
        <CmsImage
          v-if="item.__ok && resolveIcon(item)"
          class="ico"
          :src="resolveIcon(item)"
          mode="aspectFit"
        />
        <VIcon
          v-else-if="item.__ok"
          :name="item.iconKey || 'coin'"
          :size="56"
          :color="iconColor(item, idx)"
          :stroke="iconStroke()"
        />
        <text v-else class="pending-mark">?</text>
        <view v-if="item.__ok && badge(item)" class="dot">
          <text class="dot-num yx-num">{{ session.user.lotteryChance }}</text>
        </view>
      </view>
      <text class="name">{{ item.__ok ? item.name : '待配置' }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { openLink } from '../../utils/navigate.js'
import { session } from '../../store/session.js'
import { resolveIconSrc } from '../../utils/resolveMedia.js'
import { isEntryConfigured, normalizeEntryList } from '../../utils/entrySlots.js'
import VIcon from '../VIcon.vue'
import CmsImage from '../CmsImage.vue'

const props = defineProps({ mod: Object })
const items = computed(() => {
  const raw = (props.mod && props.mod.payload && props.mod.payload.items) || []
  return normalizeEntryList(raw)
    .slice(0, 5)
    .map((it) => ({ ...it, __ok: isEntryConfigured(it) }))
})

function resolveIcon(item) {
  return resolveIconSrc(item)
}

const TONES = [
  { bg: '#E8EFE2', color: '#7FA67A' },
  { bg: '#F3E8D4', color: '#C9A36B' },
  { bg: '#ECE6F3', color: '#9B8FBF' },
  { bg: '#F4EDE6', color: '#6E6258' },
  { bg: '#E8EFE2', color: '#7FA67A' },
]

function toneOf(item, idx) {
  return item.tone != null ? TONES[item.tone] : TONES[idx % TONES.length]
}
function iconBg(item, idx) {
  if (!item.__ok) return { background: '#E8E4DE' }
  return { background: (toneOf(item, idx) || {}).bg || '#F4F6F8' }
}
function iconColor(item, idx) {
  return (toneOf(item, idx) || {}).color || '#6E6258'
}
function iconStroke() {
  return '#121826'
}

function badge(item) {
  return (item.linkKey === 'lottery' || (item.id || '').includes('lottery')) && session.user.lotteryChance > 0
}

function onTap(item) {
  if (!item.__ok) {
    uni.showToast({ title: '待配置', icon: 'none' })
    return
  }
  openLink(item.path ? item : item.linkKey || item.link || item)
}
</script>

<style scoped>
.grid {
  display: flex;
  justify-content: space-between;
  padding: 8rpx 4rpx 4rpx;
}
.item {
  width: 140rpx;
  text-align: center;
}
.item.pending {
  opacity: 0.72;
}
.ico-wrap {
  position: relative;
  width: 120rpx;
  height: 120rpx;
  margin: 0 auto 14rpx;
  border-radius: var(--radius-icon);
  display: flex;
  align-items: center;
  justify-content: center;
}
.ico {
  width: 112rpx;
  height: 112rpx;
}
.pending-mark {
  font-size: 40rpx;
  font-weight: 700;
  color: #a89b91;
}
.dot {
  position: absolute;
  right: -4rpx;
  top: -4rpx;
  min-width: 32rpx;
  height: 32rpx;
  padding: 0 8rpx;
  border-radius: 999rpx;
  background: #c23a2a;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dot-num {
  font-size: 18rpx;
  color: #fff;
  font-weight: 700;
}
.name {
  display: block;
  font-size: 22rpx;
  color: var(--ink);
  line-height: 1.3;
}
.item.pending .name {
  color: #a89b91;
}
</style>
