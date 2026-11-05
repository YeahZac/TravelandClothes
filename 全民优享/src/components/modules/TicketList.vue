<template>
  <view class="wrap">
    <view class="head">
      <text class="title">{{ mod.title }}</text>
      <text v-if="tag" class="tag">{{ tag }}</text>
    </view>
    <view v-for="t in items" :key="t.id" class="ticket" @click="openLink(t.linkKey || t.link)">
      <view class="stub">
        <image class="cover" :src="t.imageUrl || '/static/ui/banner-festival.png'" mode="aspectFill" />
        <view class="notch top" /><view class="notch bot" />
      </view>
      <view class="dash" />
      <view class="body">
        <view class="tr">
          <text class="tn">{{ t.name }}</text>
          <text v-if="t.tag" class="ttag" :class="{ hot: (t.stock || 99) < 20 }">{{ t.tag }}</text>
        </view>
        <text class="mute">{{ t.desc }}</text>
        <view class="foot">
          <view class="price-line">
            <text class="yen">¥</text>
            <text class="price yx-num">{{ t.price }}</text>
          </view>
          <text class="mute">余 {{ t.stock }}</text>
        </view>
      </view>
      <button class="buy" @click.stop="openLink(t.linkKey || t.link)">购票</button>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { openLink } from '../../utils/navigate.js'
const props = defineProps({ mod: Object })
const items = computed(() => (props.mod.payload && props.mod.payload.items) || [])
const tag = computed(() => props.mod.payload && props.mod.payload.tag)
</script>

<style scoped>
.wrap {
  padding: 0;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}
.title {
  font-size: 32rpx;
  font-weight: 600;
  color: #121826;
}
.tag {
  font-size: 20rpx;
  color: #c23a2a;
  background: #fdecec;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
}
.ticket {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 20rpx;
  overflow: hidden;
  min-height: 196rpx;
  margin-bottom: 48rpx;
  box-shadow: 0 8rpx 24rpx rgba(18, 24, 38, 0.06);
}
.ticket:last-child {
  margin-bottom: 0;
}
.stub {
  position: relative;
  width: 168rpx;
  height: 196rpx;
  flex-shrink: 0;
  background: #f3f4f6;
}
.cover {
  width: 100%;
  height: 100%;
}
.notch {
  position: absolute;
  right: -16rpx;
  width: 32rpx;
  height: 32rpx;
  border-radius: 50%;
  background: #f6f1ea;
}
.notch.top {
  top: -16rpx;
}
.notch.bot {
  bottom: -16rpx;
}
.dash {
  width: 0;
  height: 140rpx;
  border-left: 2rpx dashed #e6e8ee;
  margin-right: 4rpx;
}
.body {
  flex: 1;
  min-width: 0;
  padding: 20rpx 12rpx 20rpx 16rpx;
}
.tr {
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.tn {
  font-size: 28rpx;
  font-weight: 600;
  color: #121826;
}
.ttag {
  font-size: 20rpx;
  color: #e25a00;
}
.ttag.hot {
  color: #b42318;
  background: #fdecec;
  padding: 2rpx 8rpx;
  border-radius: 6rpx;
}
.mute {
  display: block;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: #5e6977;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.foot {
  margin-top: 16rpx;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.price-line {
  display: flex;
  align-items: baseline;
}
.yen {
  font-size: 28rpx;
  font-weight: 700;
  color: #121826;
}
.price {
  font-size: 36rpx;
  font-weight: 700;
  color: #121826;
  font-variant-numeric: tabular-nums;
}
.buy {
  flex-shrink: 0;
  width: 120rpx;
  height: 64rpx;
  margin: 0 20rpx 0 8rpx;
  padding: 0;
  border: none;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #ff8a2a, #f06400);
  color: #fff;
  font-size: 24rpx;
  font-weight: 600;
  line-height: 64rpx;
}
.buy::after {
  border: none;
}
</style>
