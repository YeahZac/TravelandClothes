<template>
  <view class="rich">
    <rich-text v-if="html" class="html" :nodes="html" />
    <text v-else class="txt">{{ text }}</text>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { appConfig } from '../../store/appConfig.js'

const props = defineProps({ mod: Object })
const html = computed(() => (props.mod.payload && props.mod.payload.html) || '')
const text = computed(
  () =>
    (props.mod.payload && props.mod.payload.text) ||
    appConfig.copy.compliance ||
    ''
)
</script>

<style scoped>
.rich {
  padding: 8rpx 4rpx;
}
.txt {
  display: block;
  font-size: 22rpx;
  color: #5e6977;
  line-height: 1.5;
}
.html {
  display: block;
  font-size: 28rpx;
  color: #2b2520;
  line-height: 1.6;
  word-break: break-word;
}
</style>
