/* Hallmark · genre: playful · macrostructure: app-shell · theme: cream-rose · designed-as-app */
<template>
  <view class="feed">
    <text v-if="mod.title" class="title">{{ displayTitle }}</text>
    <view class="list">
      <view
        v-for="item in items"
        :key="item.id"
        class="row"
        @click="openLink(item.linkKey || item.link)"
      >
        <view class="tag-wrap">
          <text class="tag" :class="tagClass(item)">{{ item.tag }}</text>
        </view>
        <view class="body">
          <text class="t">{{ item.title }}</text>
          <text class="mute">{{ item.summary }}</text>
        </view>
        <text class="time">{{ item.time }}</text>
      </view>
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
  background: var(--paper-2);
  border-radius: var(--radius-card);
  padding: var(--card-pad-y) var(--card-pad);
  box-shadow: var(--shadow);
  border: 1rpx solid var(--line-soft);
}
.title {
  display: block;
  font-size: 32rpx;
  font-weight: 700;
  color: var(--ink);
  margin-bottom: 20rpx;
  line-height: 1.25;
}
.list {
  display: flex;
  flex-direction: column;
}
.row {
  display: flex;
  gap: 20rpx;
  align-items: flex-start;
  padding: 28rpx 0;
  border-bottom: 1rpx solid var(--line-soft);
}
.row:last-child {
  border-bottom: none;
  padding-bottom: 4rpx;
}
.tag-wrap {
  flex-shrink: 0;
  padding-top: 4rpx;
}
.tag {
  display: inline-block;
  padding: 6rpx 14rpx;
  border-radius: var(--radius-pill);
  font-size: 20rpx;
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: 0.5rpx;
}
.tag.policy {
  background: var(--sage-soft);
  color: var(--sage-deep);
}
.tag.news {
  background: var(--paper-3);
  color: var(--ink-2);
}
.body {
  flex: 1;
  min-width: 0;
}
.t {
  display: block;
  font-size: 28rpx;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.3;
  margin-bottom: 8rpx;
}
.mute {
  display: block;
  font-size: 22rpx;
  font-weight: 400;
  color: var(--ink-3);
  line-height: 1.45;
}
.time {
  flex-shrink: 0;
  margin-top: 6rpx;
  font-size: 20rpx;
  color: var(--ink-3);
  font-variant-numeric: tabular-nums;
}
</style>
