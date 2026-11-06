<template>
  <button class="share" open-type="share" @click="prep">{{ label }}</button>
</template>

<script setup>
import { computed } from 'vue'
import { buildInvitePath, setPendingShare } from '../../utils/share.js'

const props = defineProps({ mod: Object })
const label = computed(
  () => (props.mod.payload && props.mod.payload.label) || props.mod.title || '分享给好友'
)
const title = computed(
  () => (props.mod.payload && props.mod.payload.shareTitle) || '帮我点一下，我差最后一口粮'
)

function prep() {
  setPendingShare({
    title: title.value,
    path: buildInvitePath({ channel: 'share_bar' }),
  })
}
</script>

<style scoped>
.share {
  width: 100%;
  height: 80rpx;
  border: none;
  border-radius: 999rpx;
  background: #245bdb;
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
}
.share::after {
  border: none;
}
</style>
