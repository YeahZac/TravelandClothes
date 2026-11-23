<template>
  <view class="page">
    <view class="card">
      <text class="ok">签到成功</text>
      <text class="name">{{ name || '嘉宾' }}</text>
      <text class="sub">{{ already ? '您已签到，可继续发送祝福弹幕' : '已上墙，请关注大屏抽奖' }}</text>
      <text class="code">场次 {{ code }}</text>
      <button class="cta" @click="goDanmaku">发送祝福弹幕</button>
      <button class="ghost" @click="goHome">返回首页</button>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { saveGalaPending } from '../../api/galaApi.js'

const name = ref('')
const code = ref('')
const eventId = ref(0)
const already = ref(false)

onLoad((q) => {
  name.value = decodeURIComponent((q && q.name) || '')
  code.value = String((q && q.code) || '').toUpperCase()
  eventId.value = Number((q && q.eventId) || 0)
  already.value = String((q && q.already) || '') === '1'
  if (code.value) saveGalaPending(code.value)
})

function goDanmaku() {
  uni.navigateTo({
    url: `/pages/gala/danmaku?eventId=${eventId.value}&code=${encodeURIComponent(code.value)}`,
  })
}

function goHome() {
  uni.switchTab({ url: '/pages/home/index' })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: linear-gradient(180deg, #c4162a, #f6efe6 50%);
  display: flex; align-items: center; justify-content: center; padding: 40rpx;
}
.card {
  width: 100%; background: #fff; border-radius: 28rpx; padding: 56rpx 36rpx;
  text-align: center; box-shadow: 0 16rpx 48rpx rgba(0,0,0,.08);
}
.ok { display: block; font-size: 44rpx; font-weight: 800; color: #c4162a; }
.name { display: block; margin-top: 16rpx; font-size: 36rpx; color: #2b241f; }
.sub { display: block; margin-top: 12rpx; font-size: 26rpx; color: #8a7366; }
.code { display: block; margin: 28rpx 0; font-size: 24rpx; color: #a09080; }
.cta {
  background: #c4162a; color: #fff; border-radius: 999rpx; font-weight: 700;
}
.cta::after, .ghost::after { border: 0; }
.ghost {
  margin-top: 16rpx; background: #f3ebe3; color: #5a4638; border-radius: 999rpx;
}
</style>
