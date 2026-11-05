<template>
  <button class="share" open-type="share">{{ label }}</button>
</template>

<script setup>
import { computed } from 'vue'
const props = defineProps({ mod: Object })
const label = computed(
  () => (props.mod.payload && props.mod.payload.label) || props.mod.title || '分享给好友'
)
</script>

<style scoped>
.share {
  width: 100%; height: 80rpx; border: none; border-radius: 999rpx;
  background: #245bdb; color: #fff; font-size: 28rpx; font-weight: 600;
}
.share::after { border: none; }
</style>
