<template>
  <text class="txt">{{ text }}</text>
</template>

<script setup>
import { computed } from 'vue'
import { appConfig } from '../../store/appConfig.js'
const props = defineProps({ mod: Object })
const text = computed(
  () =>
    (props.mod.payload && props.mod.payload.text) ||
    appConfig.copy.compliance ||
    ''
)
</script>

<style scoped>
.txt { display: block; font-size: 22rpx; color: #5e6977; line-height: 1.5; padding: 0 8rpx; }
</style>
