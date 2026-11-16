<template>
  <view class="ticker">
    <view class="head">
      <text class="title">{{ mod.title || '兑礼动态' }}</text>
    </view>
    <swiper
      v-if="items.length"
      class="sw"
      vertical
      autoplay
      circular
      :interval="1600"
      :duration="450"
      :display-multiple-items="1"
    >
      <swiper-item v-for="it in items" :key="it.id">
        <view class="row">
          <CmsImage
            class="av"
            :src="it.avatarUrl || ''"
            mode="aspectFill"
            placeholder="/static/ui/ico-invite.png"
            :show-placeholder="true"
          />
          <text class="msg">
            <text class="nick">{{ it.nickMask }}</text>
            {{ it.actionText }}
            <text class="gift">{{ it.giftName }}</text>
          </text>
        </view>
      </swiper-item>
    </swiper>
    <view v-else class="empty">
      <text class="empty-t">{{ emptyText }}</text>
    </view>
  </view>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch, computed } from 'vue'
import { request, USE_REMOTE } from '../../api/request.js'
import { appConfig } from '../../store/appConfig.js'
import CmsImage from '../CmsImage.vue'

const props = defineProps({ mod: Object })
const items = ref([])
let timer = null

const emptyText = computed(() => '真实兑礼与中奖动态将出现在这里')

async function load() {
  if (USE_REMOTE) {
    try {
      const data = await request('/api/traffic/v1/activity/feed?limit=30')
      items.value = data.items || []
      return
    } catch (e) {}
  }
  const allowDemo = !!(appConfig.ops && appConfig.ops.demoActivityFeed)
  const local = (props.mod.payload && props.mod.payload.items) || []
  if (local.length) {
    items.value = local
    return
  }
  items.value = allowDemo
    ? [
        { id: 'd1', nickMask: '阿*柚', actionText: '成功兑换', giftName: '便携化妆镜', avatarUrl: '' },
        { id: 'd2', nickMask: '小*林', actionText: '抽中', giftName: '趣味冰箱贴', avatarUrl: '' },
        { id: 'd3', nickMask: 'M*mo', actionText: '兑到', giftName: '香囊挂件', avatarUrl: '' },
      ]
    : []
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
  overflow: hidden;
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
.empty {
  height: 64rpx;
  display: flex;
  align-items: center;
}
.empty-t {
  font-size: 22rpx;
  color: #9ca3af;
}
</style>
