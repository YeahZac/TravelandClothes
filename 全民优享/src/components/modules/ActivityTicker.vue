<template>
  <view class="ticker" v-if="items.length">
    <view class="head">
      <text class="title">{{ mod.title || '兑换动态' }}</text>
    </view>
    <swiper
      class="sw"
      vertical
      autoplay
      circular
      :interval="1300"
      :duration="400"
      :display-multiple-items="1"
    >
      <swiper-item v-for="it in items" :key="it.id">
        <view class="row">
          <image class="av" :src="it.avatarUrl || '/static/ui/ico-invite.png'" mode="aspectFill" />
          <text class="msg">
            <text class="nick">{{ it.nickMask }}</text>
            {{ it.actionText }}
            <text class="gift">{{ it.giftName }}</text>
          </text>
        </view>
      </swiper-item>
    </swiper>
  </view>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { request, USE_REMOTE } from '../../api/request.js'

const props = defineProps({ mod: Object })
const items = ref([])
let timer = null

async function load() {
  if (USE_REMOTE) {
    try {
      const data = await request('/api/traffic/v1/activity/feed?limit=50')
      items.value = data.items || []
      return
    } catch (e) {}
  }
  // 离线兜底
  const local = (props.mod.payload && props.mod.payload.items) || []
  items.value = local.length
    ? local
    : [
        { id: 'd1', nickMask: '阿*柚', actionText: '成功兑换', giftName: '便携化妆镜', avatarUrl: '' },
        { id: 'd2', nickMask: '小*林', actionText: '抽中', giftName: '趣味冰箱贴', avatarUrl: '' },
        { id: 'd3', nickMask: 'M*mo', actionText: '成功兑换', giftName: '香囊挂件', avatarUrl: '' },
      ]
}

onMounted(() => {
  load()
  timer = setInterval(load, 60000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
watch(
  () => props.mod && props.mod.payload,
  () => load(),
  { deep: true }
)
</script>

<style scoped>
.ticker {
  background: #fff;
  border-radius: 20rpx;
  padding: 16rpx 20rpx 8rpx;
  box-shadow: 0 6rpx 20rpx rgba(17, 24, 39, 0.05);
}
.head {
  margin-bottom: 4rpx;
}
.title {
  font-size: 24rpx;
  font-weight: 700;
  color: #6b7280;
}
.sw {
  height: 64rpx;
}
.row {
  height: 64rpx;
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.av {
  width: 40rpx;
  height: 40rpx;
  border-radius: 50%;
  background: #f3f4f6;
  flex-shrink: 0;
}
.msg {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  color: #374151;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.nick {
  font-weight: 700;
  color: #111827;
}
.gift {
  font-weight: 700;
  color: #e11d48;
}
</style>
