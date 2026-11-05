<template>
  <view class="wrap">
    <view class="hero">
      <image class="bg" :src="p.imageUrl || '/static/ui/banner-festival.png'" mode="aspectFill" />
      <view class="scrim" />
      <text v-if="p.seal" class="seal">{{ p.seal }}</text>
      <view class="copy">
        <text class="slogan">{{ p.slogan }}</text>
        <text class="sub">{{ p.subtitle }}</text>
      </view>
    </view>
    <view v-if="(p.meta || []).length" class="meta">
      <text class="meta-t">{{ metaLine }}</text>
    </view>
    <view v-if="p.intro" class="block">
      <text class="bt">活动介绍</text>
      <text class="intro">{{ p.intro }}</text>
    </view>
    <view v-if="(p.guests || []).length" class="block bare">
      <text class="bt">拟邀嘉宾</text>
      <scroll-view scroll-x class="guests">
        <view v-for="g in p.guests" :key="g.name" class="guest">
          <view class="gav"><view class="silhouette" /></view>
          <text class="gn">{{ g.name }}</text>
          <text class="mute">{{ g.role }}</text>
        </view>
      </scroll-view>
    </view>
    <view v-if="(p.highlights || []).length" class="block">
      <text class="bt">活动亮点</text>
      <view v-for="(h, i) in p.highlights" :key="h.id" class="hl">
        <text class="no">{{ String(i + 1).padStart(2, '0') }}</text>
        <view>
          <text class="hn">{{ h.name }}</text>
          <text class="mute">{{ h.desc }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({ mod: Object })
const p = computed(() => props.mod.payload || {})
const metaLine = computed(() =>
  (p.value.meta || []).map((m) => m.value).filter(Boolean).join(' · ')
)
</script>

<style scoped>
.wrap {
  margin: 0 -32rpx;
}
.hero {
  position: relative;
  height: 520rpx;
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
  background: linear-gradient(180deg, transparent 35%, rgba(12, 18, 32, 0.72) 100%);
}
.seal {
  position: absolute;
  top: 32rpx;
  right: 32rpx;
  z-index: 2;
  padding: 8rpx 14rpx;
  border-radius: 8rpx;
  background: rgba(18, 24, 38, 0.72);
  color: #f5b942;
  font-size: 22rpx;
  font-weight: 500;
}
.copy {
  position: absolute;
  left: 32rpx;
  right: 32rpx;
  bottom: 56rpx;
  z-index: 2;
}
.slogan {
  display: block;
  font-size: 40rpx;
  font-weight: 700;
  color: #fff;
  line-height: 1.2;
}
.sub {
  display: block;
  margin-top: 10rpx;
  font-size: 24rpx;
  color: rgba(255, 255, 255, 0.85);
}
.meta {
  margin: -32rpx 32rpx 0;
  position: relative;
  z-index: 3;
  height: 72rpx;
  border-radius: 999rpx;
  background: #fff;
  box-shadow: 0 8rpx 24rpx rgba(18, 24, 38, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 28rpx;
}
.meta-t {
  font-size: 28rpx;
  font-weight: 600;
  color: #121826;
}
.block {
  margin: 64rpx 32rpx 0;
  background: #fff;
  border-radius: 24rpx;
  padding: 28rpx;
  box-shadow: 0 8rpx 24rpx rgba(18, 24, 38, 0.06);
}
.block.bare {
  background: transparent;
  box-shadow: none;
  padding: 0;
}
.bt {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: #121826;
  margin-bottom: 16rpx;
}
.intro {
  display: block;
  font-size: 26rpx;
  font-weight: 400;
  color: #3a4252;
  line-height: 1.6;
}
.guests {
  white-space: nowrap;
}
.guest {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  width: 140rpx;
  margin-right: 16rpx;
}
.gav {
  width: 96rpx;
  height: 96rpx;
  border-radius: 50%;
  background: #e6e8ee;
  margin-bottom: 8rpx;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
}
.silhouette {
  width: 48rpx;
  height: 56rpx;
  border-radius: 40rpx 40rpx 8rpx 8rpx;
  background: #c0c6d0;
  margin-bottom: 8rpx;
}
.gn {
  font-size: 24rpx;
  font-weight: 600;
  color: #121826;
}
.mute {
  font-size: 20rpx;
  color: #5e6977;
}
.hl {
  display: flex;
  gap: 16rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #e6e8ee;
}
.hl:last-child {
  border-bottom: none;
}
.no {
  font-size: 28rpx;
  font-weight: 700;
  color: #c23a2a;
  font-variant-numeric: tabular-nums;
  width: 48rpx;
}
.hn {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #121826;
  margin-bottom: 4rpx;
}
</style>
