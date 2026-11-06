<template>
  <view>
    <text v-if="mod.title" class="title">{{ mod.title }}</text>
    <scroll-view scroll-x class="row">
      <view
        v-for="item in items"
        :key="item.id"
        class="card"
        :class="toneOf(item)"
        @click="openLink(item.linkKey || item.link)"
      >
        <CmsImage v-if="iconOf(item)" class="ico" :src="iconOf(item)" mode="aspectFit" />
        <view v-else class="ico ph"><text class="ph-t">{{ (item.name || '?').slice(0, 1) }}</text></view>
        <view class="copy">
          <text class="n">{{ item.name }}</text>
          <text class="d">{{ item.desc }}</text>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { openLink } from '../../utils/navigate.js'
import { session } from '../../store/session.js'
import { resolveIconSrc } from '../../utils/resolveMedia.js'
import CmsImage from '../CmsImage.vue'
const props = defineProps({ mod: Object })
const items = computed(() => {
  const list = (props.mod.payload && props.mod.payload.items) || []
  return list.map((item) => {
    if ((item.linkKey || '').includes('lottery') || (item.id || '').includes('lottery')) {
      return { ...item, desc: item.desc || `剩 ${session.user.lotteryChance} 次` }
    }
    return item
  })
})
function iconOf(item) {
  return resolveIconSrc(item)
}
function toneOf(item) {
  const k = item.linkKey || item.id || ''
  if (k.includes('lottery')) return 'tone-lottery'
  if (k.includes('friend')) return 'tone-friend'
  return 'tone-default'
}
</script>

<style scoped>
.title {
  display: block; font-size: 32rpx; font-weight: 600; color: #121826; margin-bottom: 16rpx;
}
.row { white-space: nowrap; }
.card {
  position: relative; display: inline-flex; align-items: center; gap: 16rpx;
  width: 320rpx; height: 180rpx; margin-right: 16rpx; padding: 24rpx;
  border-radius: 24rpx; overflow: hidden; vertical-align: top; box-sizing: border-box;
}
.tone-lottery { background: linear-gradient(135deg, #2a4a9b, #1a2d66); }
.tone-friend { background: linear-gradient(135deg, #1f8a5b, #145c3d); }
.tone-default { background: linear-gradient(135deg, #3d5a80, #243b55); }
.ico { width: 96rpx; height: 96rpx; flex-shrink: 0; }
.ico.ph {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 20rpx;
  background: rgba(255, 255, 255, 0.18);
}
.ph-t { font-size: 40rpx; font-weight: 700; color: #fff; }
.copy { min-width: 0; }
.n { display: block; font-size: 28rpx; font-weight: 600; color: #fff; }
.d { display: block; margin-top: 8rpx; font-size: 22rpx; color: rgba(255,255,255,.85); }
</style>
