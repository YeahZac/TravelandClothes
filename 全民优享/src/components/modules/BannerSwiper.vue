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
      <view class="card" :class="'tone-' + (item.tone || 'orange')">
        <CmsImage
          v-if="item.imageUrl"
          class="bg"
          :src="item.imageUrl"
          mode="aspectFill"
          :show-placeholder="false"
        />
      </view>
    </swiper-item>
  </swiper>
</template>

<script setup>
import { computed, watch } from 'vue'
import { openLink } from '../../utils/navigate.js'
import { prefetchImages } from '../../utils/cloudImage.js'
import CmsImage from '../CmsImage.vue'

const props = defineProps({ mod: Object })
const items = computed(() => (props.mod.payload && props.mod.payload.items) || [])

watch(
  items,
  (list) => {
    prefetchImages((list || []).map((i) => i.imageUrl).filter(Boolean))
  },
  { immediate: true }
)
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
  background: #dfe5ee;
}
.card.tone-orange { background: linear-gradient(135deg, #e8a87c, #c45c26); }
.card.tone-day { background: linear-gradient(135deg, #e8eef8, #b8c4d8); }
.card.tone-mint { background: linear-gradient(135deg, #c8e6d9, #0b6e4f); }
.card.tone-blue { background: linear-gradient(135deg, #c5d4f0, #3b5bdb); }
.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
</style>
