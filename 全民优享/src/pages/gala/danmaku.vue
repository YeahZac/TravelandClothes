<template>
  <view class="page">
    <view class="card">
      <text class="title">发送祝福弹幕</text>
      <text class="sub">内容将飘过大屏，请文明发言</text>
      <textarea
        class="area"
        maxlength="40"
        :value="content"
        placeholder="写下你的祝福，最多 40 字"
        @input="onInput"
      />
      <button class="cta" :loading="busy" :disabled="busy" @click="send">发送到大屏</button>
    </view>
    <LoginSheet />
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import LoginSheet from '../../components/LoginSheet.vue'
import { isLoggedIn } from '../../api/auth.js'
import { requireAuth } from '../../utils/loginGate.js'
import { galaPostDanmaku, readGalaPending, fetchGalaByCode } from '../../api/galaApi.js'

const eventId = ref(0)
const content = ref('')
const busy = ref(false)

function onInput(e) {
  content.value = ((e && e.detail && e.detail.value) || '').slice(0, 40)
}

async function resolveEvent(q) {
  eventId.value = Number((q && q.eventId) || 0)
  if (eventId.value) return
  const code = String((q && q.code) || readGalaPending() || '').toUpperCase()
  if (!code) return
  try {
    const data = await fetchGalaByCode(code)
    eventId.value = (data && data.event && data.event.id) || 0
  } catch (_) {}
}

async function send() {
  if (!isLoggedIn()) {
    requireAuth('/pages/gala/danmaku')
    return
  }
  if (!eventId.value) {
    uni.showToast({ title: '请先扫码签到', icon: 'none' })
    return
  }
  const text = content.value.trim()
  if (!text) {
    uni.showToast({ title: '请输入内容', icon: 'none' })
    return
  }
  busy.value = true
  try {
    await galaPostDanmaku(eventId.value, text)
    content.value = ''
    uni.showToast({ title: '已发送', icon: 'success' })
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '发送失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

onLoad((q) => {
  resolveEvent(q)
})
</script>

<style scoped>
.page {
  min-height: 100vh; background: var(--paper, #f6f1ea); padding: 40rpx 32rpx;
}
.card {
  background: #fff; border-radius: 24rpx; padding: 36rpx 28rpx;
}
.title { display: block; font-size: 34rpx; font-weight: 800; color: #2b241f; }
.sub { display: block; margin: 8rpx 0 24rpx; font-size: 24rpx; color: #8a7366; }
.area {
  width: 100%; min-height: 200rpx; background: #f7f1ea; border-radius: 16rpx;
  padding: 20rpx; font-size: 28rpx; box-sizing: border-box;
}
.cta {
  margin-top: 24rpx; background: #c4162a; color: #fff; border-radius: 999rpx; font-weight: 700;
}
.cta::after { border: 0; }
</style>
