<template>
  <view class="wrap">
    <view class="head">
      <text class="title">{{ mod.title || '官方报名' }}</text>
      <text v-if="tag" class="tag">{{ tag }}</text>
    </view>
    <text v-if="freeNote" class="free">{{ freeNote }}</text>
    <view v-for="t in items" :key="t.id" class="ticket" @click="goBuy(t)">
      <view class="stub">
        <CmsImage
          v-if="imgOf(t)"
          class="cover"
          :src="imgOf(t)"
          mode="aspectFill"
          placeholder="/static/ui/banner-festival.jpg"
        />
        <view v-else class="cover-fallback" :class="'tc-' + (t.tone || 'orange')">
          <text class="cover-letter">{{ (t.tag || t.name || '票').slice(0, 2) }}</text>
        </view>
        <view class="notch top" /><view class="notch bot" />
      </view>
      <view class="dash" />
      <view class="body">
        <view class="tr">
          <text class="tn">{{ t.name }}</text>
          <text v-if="t.tag" class="ttag">{{ t.tag }}</text>
        </view>
        <text class="mute">{{ t.desc }}</text>
        <view class="foot">
          <view class="price-line">
            <text class="yen">¥</text>
            <text class="price yx-num">{{ t.price }}</text>
          </view>
          <text class="mute">{{ t.dayLabel || '' }}</text>
        </view>
      </view>
      <button class="buy" @click.stop="goBuy(t)">报名</button>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { resolveImageSrc } from '../../utils/resolveMedia.js'
import { USE_REMOTE, request } from '../../api/request.js'
import { requireAuth } from '../../utils/loginGate.js'
import CmsImage from '../CmsImage.vue'

const props = defineProps({ mod: Object })
const remoteItems = ref([])
const freeNote = ref('')

const payloadItems = computed(() => (props.mod.payload && props.mod.payload.items) || [])
const tag = computed(() => (props.mod.payload && props.mod.payload.tag) || '在线支付')
const items = computed(() => (remoteItems.value.length ? remoteItems.value : payloadItems.value))

function imgOf(t) {
  return resolveImageSrc(t && t.imageUrl)
}

async function loadTickets() {
  if (!USE_REMOTE) return
  try {
    const data = await request('/api/traffic/v1/festival/tickets', { timeout: 8000 })
    if (Array.isArray(data && data.list) && data.list.length) {
      remoteItems.value = data.list
    }
    if (data && data.freeNote) freeNote.value = data.freeNote
  } catch (_) {
    // 保留 payload 兜底票种，勿 toast 干扰其它 Tab
  }
}

function goBuy(t) {
  if (!requireAuth('/pages/festival/index')) return
  const id = t && t.id
  if (!id) return
  uni.navigateTo({ url: `/pages/festival/checkout?id=${encodeURIComponent(id)}` })
}

onMounted(loadTickets)
onShow(loadTickets)
</script>

<style scoped>
.wrap {
  padding: 0;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
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
.free {
  display: block;
  margin-bottom: 16rpx;
  font-size: 22rpx;
  color: #6e6258;
  line-height: 1.5;
}
.ticket {
  display: flex;
  align-items: center;
  background: #fff;
  border-radius: 20rpx;
  overflow: hidden;
  min-height: 196rpx;
  margin-bottom: 28rpx;
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
.cover-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cover-letter {
  font-size: 28rpx;
  font-weight: 800;
  color: rgba(28, 26, 23, 0.45);
}
.tc-blue {
  background: #dce9ff;
}
.tc-orange {
  background: #ffe4cc;
}
.tc-gold {
  background: #ffe9b8;
}
.tc-mint {
  background: #d8f6f2;
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
  font-weight: 700;
  color: #1f1814;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ttag {
  font-size: 18rpx;
  color: #8a4b2e;
  background: #f6efe8;
  padding: 2rpx 8rpx;
  border-radius: 6rpx;
  flex-shrink: 0;
}
.mute {
  display: block;
  margin-top: 6rpx;
  font-size: 22rpx;
  color: #8a837a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.foot {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: 12rpx;
}
.price-line {
  display: flex;
  align-items: baseline;
}
.yen {
  font-size: 22rpx;
  color: #c45c3e;
  font-weight: 700;
}
.price {
  font-size: 36rpx;
  color: #c45c3e;
  font-weight: 800;
}
.buy {
  margin: 0 16rpx 0 0;
  padding: 0 20rpx;
  height: 56rpx;
  line-height: 56rpx;
  font-size: 24rpx;
  font-weight: 700;
  color: #fff;
  background: #c45c3e;
  border-radius: 28rpx;
  flex-shrink: 0;
}
.buy::after {
  border: none;
}
</style>
