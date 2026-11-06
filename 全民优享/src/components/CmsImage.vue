<template>
  <image
    v-if="display"
    class="cms-img"
    :src="display"
    :mode="mode"
    :lazy-load="lazyLoad"
    @error="onError"
    @load="onLoad"
  />
  <view v-else-if="showPlaceholder" class="cms-ph" />
</template>

<script setup>
import { ref, watch } from 'vue'
import { ensureLocalImage } from '../utils/cloudImage.js'

const props = defineProps({
  src: { type: String, default: '' },
  mode: { type: String, default: 'aspectFill' },
  placeholder: { type: String, default: '' },
  lazyLoad: { type: Boolean, default: true },
  showPlaceholder: { type: Boolean, default: false },
})

const emit = defineEmits(['error', 'load'])
const display = ref('')
let seq = 0

async function load(url) {
  const my = ++seq
  display.value = ''
  if (!url) {
    display.value = props.placeholder || ''
    return
  }
  if (String(url).startsWith('/static/')) {
    display.value = url
    return
  }
  try {
    const local = await ensureLocalImage(url)
    if (my !== seq) return
    display.value = local || props.placeholder || ''
  } catch (_) {
    if (my !== seq) return
    display.value = props.placeholder || ''
  }
}

watch(
  () => props.src,
  (v) => {
    load(v)
  },
  { immediate: true }
)

function onError(e) {
  emit('error', e)
  if (props.placeholder && display.value !== props.placeholder) {
    display.value = props.placeholder
  }
}
function onLoad(e) {
  emit('load', e)
}
</script>

<style scoped>
.cms-img {
  width: 100%;
  height: 100%;
}
.cms-ph {
  width: 100%;
  height: 100%;
  background: #e8ecf2;
}
</style>
