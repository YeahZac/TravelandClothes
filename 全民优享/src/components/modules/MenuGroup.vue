<template>
  <view class="box">
    <view
      v-for="(item, idx) in items"
      :key="item.id || idx"
      class="row"
      :class="{ last: idx === items.length - 1, pending: !item.__ok }"
      @click="onTap(item)"
    >
      <view class="lead">
        <view class="ico-wrap" :style="iconBg(item, idx)">
          <CmsImage
            v-if="item.__ok && resolveIcon(item)"
            class="ico-fallback"
            :src="resolveIcon(item)"
            mode="aspectFit"
          />
          <VIcon
            v-else-if="item.__ok"
            :name="item.iconKey || 'coin'"
            :size="40"
            :color="iconColor(item, idx)"
            :stroke="iconStroke()"
          />
          <text v-else class="pending-mark">?</text>
        </view>
        <view class="txt">
          <text class="t">{{ item.__ok ? item.title : '待配置' }}</text>
          <text v-if="item.__ok && item.sub" class="sub">{{ item.sub }}</text>
          <text v-else-if="!item.__ok" class="sub">运营后台配置后显示</text>
        </view>
      </view>
      <view class="trail">
        <text v-if="item.__ok && item.badge" class="badge">{{ item.badge }}</text>
        <view class="chev">
          <VIcon name="arrow" :size="28" color="#9AA3B2" stroke="#9AA3B2" />
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { openLink } from '../../utils/navigate.js'
import { resolveIconSrc } from '../../utils/resolveMedia.js'
import { isEntryConfigured, normalizeEntryList } from '../../utils/entrySlots.js'
import VIcon from '../VIcon.vue'
import CmsImage from '../CmsImage.vue'

const props = defineProps({ mod: Object })
const items = computed(() => {
  const raw = (props.mod && props.mod.payload && props.mod.payload.items) || []
  return normalizeEntryList(raw).map((it) => ({
    ...it,
    __ok: isEntryConfigured({ ...it, name: it.title }),
  }))
})

function resolveIcon(item) {
  return resolveIconSrc(item)
}

const TONES = [
  { bg: '#E8EFE2', color: '#7FA67A' },
  { bg: '#ECE6F3', color: '#9B8FBF' },
  { bg: '#F3E8D4', color: '#C9A36B' },
  { bg: '#F4EDE6', color: '#6E6258' },
  { bg: '#E8EFE2', color: '#7FA67A' },
  { bg: '#F3E8D4', color: '#C9A36B' },
]

function iconBg(item, idx) {
  if (!item.__ok) return { background: '#E8E4DE' }
  const t = item.tone != null ? TONES[item.tone] : TONES[idx % TONES.length]
  return { background: (t && t.bg) || '#F4F6F8' }
}
function iconColor(item, idx) {
  const t = item.tone != null ? TONES[item.tone] : TONES[idx % TONES.length]
  return (t && t.color) || '#6E6258'
}
function iconStroke() {
  return '#121826'
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
.box {
  background: var(--paper-2);
  border-radius: 24rpx;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 24rpx;
  border-bottom: 1rpx solid var(--line-soft);
}
.row.last {
  border-bottom: none;
}
.row.pending {
  opacity: 0.75;
}
.lead {
  display: flex;
  align-items: center;
  gap: 20rpx;
  min-width: 0;
}
.ico-wrap {
  width: 72rpx;
  height: 72rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ico-fallback {
  width: 48rpx;
  height: 48rpx;
}
.pending-mark {
  font-size: 28rpx;
  font-weight: 700;
  color: #a89b91;
}
.txt {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.t {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--ink);
}
.sub {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: var(--mute);
}
.trail {
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.badge {
  font-size: 20rpx;
  color: #c23a2a;
}
.chev {
  width: 32rpx;
  height: 32rpx;
}
</style>
