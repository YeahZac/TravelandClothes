<template>
  <view class="feed">
    <text v-if="mod.title" class="title">{{ displayTitle }}</text>
    <view
      v-for="item in items"
      :key="item.id"
      class="row"
      @click="openLink(item.linkKey || item.link)"
    >
      <text class="tag" :class="tagClass(item)">{{ item.tag }}</text>
      <view class="body">
        <text class="t">{{ item.title }}</text>
        <text class="mute">{{ item.summary }}</text>
      </view>
      <text class="time">{{ item.time }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { openLink } from '../../utils/navigate.js'

const props = defineProps({ mod: Object })
const items = computed(() => ((props.mod.payload && props.mod.payload.items) || []).slice(0, 3))
const displayTitle = computed(() => {
  const t = props.mod.title || '公告'
  return t.includes('内容') ? '公告' : t
})
function tagClass(item) {
  return item.type === 'policy' || item.tag === '政策' ? 'policy' : 'news'
}
</script>

<style scoped>
.feed {
  padding: 0;
}
.title {
  display: block;
  font-size: 32rpx;
  font-weight: 600;
  color: #121826;
  margin-bottom: 8rpx;
  line-height: 1.25;
}
.row {
  display: flex;
  gap: 16rpx;
  align-items: flex-start;
  padding: 24rpx 0;
  border-bottom: 1rpx solid #e6e8ee;
}
.row:last-child {
  border-bottom: none;
}
.tag {
  flex-shrink: 0;
  margin-top: 4rpx;
  padding: 4rpx 12rpx;
  border-radius: 8rpx;
  font-size: 20rpx;
  font-weight: 500;
  line-height: 1.2;
}
.tag.policy {
  background: #e8eef9;
  color: #245bdb;
}
.tag.news {
  background: #f4f6f8;
  color: #5e6977;
  border: 1rpx solid #e6e8ee;
}
.body {
  flex: 1;
  min-width: 0;
}
.t {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: #121826;
  line-height: 1.3;
  margin-bottom: 6rpx;
}
.mute {
  display: block;
  font-size: 22rpx;
  font-weight: 400;
  color: #5e6977;
  line-height: 1.4;
}
.time {
  flex-shrink: 0;
  margin-top: 6rpx;
  font-size: 20rpx;
  color: #5e6977;
}
</style>
