<template>
  <view class="page yx-safe-bottom">
    <view v-if="loading" class="state">加载中…</view>
    <view v-else-if="error" class="state err">{{ error }}</view>
    <scroll-view v-else scroll-y class="scroll" :show-scrollbar="false">
      <view class="head">
        <text class="title">{{ title }}</text>
        <text v-if="version" class="meta">版本 {{ version }}<text v-if="effective"> · {{ effective }}</text></text>
      </view>
      <text class="body">{{ body }}</text>
    </scroll-view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { fetchLegalDoc } from '../../api/legal.js'

const loading = ref(true)
const error = ref('')
const title = ref('协议')
const version = ref('')
const effective = ref('')
const body = ref('')

onLoad(async (q) => {
  const id = (q && (q.id || q.doc)) || 'tos'
  uni.setNavigationBarTitle({
    title: id === 'privacy' ? '隐私政策' : '用户服务协议',
  })
  loading.value = true
  error.value = ''
  try {
    const doc = await fetchLegalDoc(id)
    title.value = doc.title || doc.label || '协议'
    version.value = doc.version || ''
    effective.value = doc.effective || ''
    body.value = doc.body || ''
    if (title.value) uni.setNavigationBarTitle({ title: title.value })
  } catch (e) {
    error.value = (e && e.message) || '加载失败'
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #fbf8f4;
}
.scroll {
  height: 100vh;
  padding: 32rpx 36rpx 80rpx;
  box-sizing: border-box;
}
.head {
  margin-bottom: 28rpx;
  padding-bottom: 20rpx;
  border-bottom: 1rpx solid rgba(43, 37, 32, 0.08);
}
.title {
  display: block;
  font-size: 36rpx;
  font-weight: 700;
  color: #1c1a17;
  line-height: 1.35;
}
.meta {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: #8a948c;
}
.body {
  display: block;
  font-size: 26rpx;
  line-height: 1.75;
  color: #3a3530;
  white-space: pre-wrap;
  word-break: break-word;
}
.state {
  padding: 120rpx 40rpx;
  text-align: center;
  color: #8a948c;
  font-size: 28rpx;
}
.state.err {
  color: #c45c4a;
}
</style>
