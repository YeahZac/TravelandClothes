<template>
  <view v-if="visible" class="mask" @click="onClose">
    <view class="card" @click.stop>
      <CmsImage
        v-if="cfg.ready && cfg.imageUrl"
        class="cover"
        :src="cfg.imageUrl"
        mode="aspectFill"
      />
      <view v-else class="cover ph" :class="{ pending: !cfg.ready }">
        <text class="ph-t">{{ cfg.ready ? cfg.title || '今日推荐' : '待配置' }}</text>
        <text v-if="!cfg.ready" class="ph-s">请在运营台「系统设置 · 入口与模块」配置广告图与跳转</text>
      </view>
      <view class="actions">
        <button class="btn ghost" @click="onClose">关闭</button>
        <button class="btn primary" :class="{ disabled: !cfg.ready }" @click="onConfirm">
          {{ cfg.ready ? cfg.confirmText || '去看看' : '待配置' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { appConfig } from '../store/appConfig.js'
import { openLink } from '../utils/navigate.js'
import CmsImage from './CmsImage.vue'

const STORAGE_KEY = 'qmyx_home_entry_popup_day'
const visible = ref(false)

const cfg = computed(() => {
  const raw =
    (appConfig.ops && appConfig.ops.homePopup) ||
    (appConfig.game && appConfig.game.homePopup) ||
    {}
  const imageUrl = String(raw.imageUrl || '').trim()
  const confirmPath = String(raw.confirmPath || raw.linkKey || '').trim()
  const title = String(raw.title || '').trim()
  return {
    enabled: raw.enabled !== false,
    imageUrl,
    title,
    confirmText: raw.confirmText || '去看看',
    confirmPath,
    // daily = 每个自然日首次；once = 终身一次
    frequency: raw.frequency || 'daily',
    // 图 + 跳转齐全才算可点进业务；否则灰显待配置（仍可关闭）
    ready: !!(imageUrl && confirmPath),
  }
})

function todayKey() {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function shouldShow() {
  if (!cfg.value.enabled) return false
  try {
    const prev = uni.getStorageSync(STORAGE_KEY)
    if (cfg.value.frequency === 'once') return !prev
    return prev !== todayKey()
  } catch (_) {
    return true
  }
}

function markShown() {
  try {
    uni.setStorageSync(STORAGE_KEY, cfg.value.frequency === 'once' ? 'once' : todayKey())
  } catch (_) {}
}

function tryOpen() {
  if (shouldShow()) visible.value = true
}

function onClose() {
  visible.value = false
  markShown()
}

function onConfirm() {
  if (!cfg.value.ready) {
    uni.showToast({ title: '待配置', icon: 'none' })
    return
  }
  markShown()
  visible.value = false
  const path = cfg.value.confirmPath
  if (!path) return
  if (String(path).startsWith('/')) {
    uni.navigateTo({ url: path })
  } else {
    openLink(path)
  }
}

onShow(() => {
  // 稍延迟，避免与首屏抢焦点
  setTimeout(tryOpen, 400)
})

watch(
  () => cfg.value.imageUrl,
  () => {},
  { immediate: true }
)
</script>

<style scoped>
.mask {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(17, 24, 39, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48rpx;
}
.card {
  width: 100%;
  max-width: 620rpx;
  background: #fff;
  border-radius: 28rpx;
  overflow: hidden;
  box-shadow: 0 24rpx 64rpx rgba(0, 0, 0, 0.2);
}
.cover {
  width: 100%;
  height: 640rpx;
  display: block;
  background: #f3f4f6;
}
.cover.ph {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  padding: 32rpx;
  background: linear-gradient(135deg, #fff1f2, #fff7ed);
}
.cover.ph.pending {
  background: #e8e4de;
}
.ph-t {
  font-size: 36rpx;
  font-weight: 800;
  color: #e11d48;
}
.cover.ph.pending .ph-t {
  color: #6e6258;
}
.ph-s {
  font-size: 22rpx;
  color: #8a7f74;
  text-align: center;
  line-height: 1.4;
}
.btn.disabled {
  opacity: 0.55;
}
.actions {
  display: flex;
  gap: 16rpx;
  padding: 24rpx;
}
.btn {
  flex: 1;
  height: 80rpx;
  line-height: 80rpx;
  margin: 0;
  border-radius: 999rpx;
  font-size: 28rpx;
  font-weight: 700;
}
.btn::after {
  border: none;
}
.ghost {
  background: #f3f4f6;
  color: #374151;
}
.primary {
  background: linear-gradient(90deg, #e11d48, #f97316);
  color: #fff;
}
</style>
