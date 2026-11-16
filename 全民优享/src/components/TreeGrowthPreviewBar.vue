<!--
  【仅开发态】树苗成长视觉预览条。
  不调用种植/收取/照料 API，不改 jar 正式状态；由父组件用 previewTree 覆盖 TreeStage 展示。
-->
<template>
  <view v-if="visible" class="preview-bar">
    <view class="preview-head">
      <text class="preview-badge">测</text>
      <text class="preview-title">成长预览 · 不上线</text>
      <text class="preview-sub">{{ phaseLabel }}</text>
    </view>

    <view class="preview-row">
      <view class="preview-btn" @click="onRestart">从种子</view>
      <view class="preview-btn primary" :class="{ busy: playing }" @click="onPlayOrStep">
        {{ playing ? '播放中…' : '下一步' }}
      </view>
      <view class="preview-btn accent" :class="{ busy: playing }" @click="onAutoPlay">
        一键演完
      </view>
      <view class="preview-btn ghost" @click="onExit">退出预览</view>
    </view>

    <scroll-view scroll-x class="seed-scroll" :show-scrollbar="false">
      <view
        v-for="s in seeds"
        :key="s.id"
        class="seed-chip"
        :class="{ on: seedId === s.id }"
        @click="onPickSeed(s.id)"
      >
        <text class="seed-chip-t">{{ s.name }}</text>
        <text class="seed-chip-s">{{ s.playTag }} · ×{{ s.yieldMult }}</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup>
import { computed, onUnmounted, ref, watch } from 'vue'
import {
  PREVIEW_PHASES,
  PREVIEW_SEEDS,
  buildPreviewTree,
  isTreePreviewEnabled,
} from '../dev/treeGrowthPreview.js'

const props = defineProps({
  active: { type: Boolean, default: false },
})
const emit = defineEmits(['update:active', 'change', 'exit'])

const visible = computed(() => isTreePreviewEnabled() && props.active)
const seeds = PREVIEW_SEEDS
const seedId = ref(PREVIEW_SEEDS[0].id)
const phaseIndex = ref(0)
const playing = ref(false)
let playTimer = null

const phaseLabel = computed(() => {
  const p = PREVIEW_PHASES[phaseIndex.value]
  return p ? `${phaseIndex.value + 1}/${PREVIEW_PHASES.length} · ${p.name}` : ''
})

function pushState() {
  emit('change', buildPreviewTree(seedId.value, phaseIndex.value))
}

function stopPlay() {
  playing.value = false
  if (playTimer) {
    clearInterval(playTimer)
    playTimer = null
  }
}

function onRestart() {
  stopPlay()
  phaseIndex.value = 0
  pushState()
  uni.showToast({ title: '预览：种子', icon: 'none' })
}

function onPlayOrStep() {
  if (playing.value) return
  if (phaseIndex.value >= PREVIEW_PHASES.length - 1) {
    phaseIndex.value = 0
  } else {
    phaseIndex.value += 1
  }
  pushState()
  const p = PREVIEW_PHASES[phaseIndex.value]
  uni.showToast({ title: `预览：${p.name}`, icon: 'none' })
}

function onAutoPlay() {
  if (playing.value) return
  stopPlay()
  phaseIndex.value = 0
  pushState()
  playing.value = true
  let i = 0
  playTimer = setInterval(() => {
    i += 1
    if (i >= PREVIEW_PHASES.length) {
      stopPlay()
      uni.showToast({ title: '预览演完 · 成树', icon: 'none' })
      return
    }
    phaseIndex.value = i
    pushState()
  }, 900)
}

function onPickSeed(id) {
  seedId.value = id
  // 换种保留当前阶段，方便对比同阶段不同树种外观
  pushState()
  const s = PREVIEW_SEEDS.find((x) => x.id === id)
  uni.showToast({ title: `预览树种：${(s && s.name) || id}`, icon: 'none' })
}

function onExit() {
  stopPlay()
  emit('update:active', false)
  emit('exit')
}

watch(
  () => props.active,
  (on) => {
    if (on && isTreePreviewEnabled()) {
      phaseIndex.value = 0
      pushState()
    } else {
      stopPlay()
    }
  },
  { immediate: true }
)

onUnmounted(stopPlay)
</script>

<style scoped>
.preview-bar {
  margin: 12rpx 0 20rpx;
  padding: 16rpx 18rpx 18rpx;
  border-radius: 20rpx;
  background: linear-gradient(135deg, #2b2520 0%, #3d342c 100%);
  border: 2rpx dashed #c9a36b;
}
.preview-head {
  display: flex;
  align-items: center;
  gap: 10rpx;
  margin-bottom: 14rpx;
}
.preview-badge {
  font-size: 18rpx;
  font-weight: 800;
  color: #2b2520;
  background: #c9a36b;
  padding: 2rpx 10rpx;
  border-radius: 8rpx;
}
.preview-title {
  font-size: 24rpx;
  font-weight: 700;
  color: #f7f1ea;
}
.preview-sub {
  margin-left: auto;
  font-size: 20rpx;
  color: #c9a36b;
}
.preview-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-bottom: 14rpx;
}
.preview-btn {
  padding: 10rpx 18rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  color: #f7f1ea;
  background: rgba(255, 255, 255, 0.1);
  border: 1rpx solid rgba(255, 255, 255, 0.16);
}
.preview-btn.primary {
  background: #7fa67a;
  border-color: #7fa67a;
  color: #1e281c;
  font-weight: 700;
}
.preview-btn.accent {
  background: #c9a36b;
  border-color: #c9a36b;
  color: #2b2520;
  font-weight: 700;
}
.preview-btn.ghost {
  background: transparent;
  color: #a89b91;
}
.preview-btn.busy {
  opacity: 0.55;
}
.seed-scroll {
  white-space: nowrap;
  width: 100%;
}
.seed-chip {
  display: inline-flex;
  flex-direction: column;
  vertical-align: top;
  margin-right: 10rpx;
  padding: 12rpx 16rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.08);
  border: 2rpx solid transparent;
  min-width: 132rpx;
}
.seed-chip.on {
  border-color: #c9a36b;
  background: rgba(201, 163, 107, 0.18);
}
.seed-chip-t {
  font-size: 22rpx;
  font-weight: 700;
  color: #f7f1ea;
}
.seed-chip-s {
  margin-top: 4rpx;
  font-size: 18rpx;
  color: #a89b91;
}
</style>
