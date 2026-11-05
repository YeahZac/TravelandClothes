<template>
  <swiper
    class="banner"
    circular
    autoplay
    :interval="4000"
    indicator-dots
    indicator-color="rgba(255,255,255,.35)"
    indicator-active-color="#ffffff"
  >
    <swiper-item
      v-for="item in items"
      :key="item.id"
      @click="openLink(item.linkKey || item.link)"
    >
      <view class="card">
        <image class="bg" :src="item.imageUrl" mode="aspectFill" />
        <view class="scrim" :class="{ light: item.tone === 'blue' || item.tone === 'day' }" />
        <view class="copy">
          <text class="t" :class="{ dark: item.tone === 'blue' || item.tone === 'day' }">{{ item.title }}</text>
          <text class="s" :class="{ dark: item.tone === 'blue' || item.tone === 'day' }">{{ item.sub }}</text>
        </view>
      </view>
    </swiper-item>
  </swiper>
</template>

<script setup>
import { computed } from 'vue'
import { openLink } from '../../utils/navigate.js'

const props = defineProps({ mod: Object })
const items = computed(() => (props.mod.payload && props.mod.payload.items) || [])
</script>

<style scoped>
.banner {
  height: 280rpx;
  width: 100%;
}
.card {
  position: relative;
  height: 280rpx;
  border-radius: 28rpx;
  overflow: hidden;
}
.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(12, 18, 32, 0.55) 0%, rgba(12, 18, 32, 0.2) 48%, transparent 72%);
}
.scrim.light {
  background: linear-gradient(90deg, rgba(244, 246, 248, 0.82) 0%, rgba(244, 246, 248, 0.35) 50%, transparent 75%);
}
.copy {
  position: relative;
  z-index: 1;
  height: 100%;
  padding: 0 28rpx;
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 62%;
}
.t {
  font-size: 34rpx;
  font-weight: 700;
  color: #fff;
  line-height: 1.25;
}
.s {
  margin-top: 8rpx;
  font-size: 24rpx;
  font-weight: 400;
  color: rgba(255, 255, 255, 0.92);
  line-height: 1.35;
}
.t.dark,
.s.dark {
  color: #121826;
}
.s.dark {
  color: #5e6977;
}
</style>
