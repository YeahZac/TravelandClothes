<template>
  <view class="yx-page detail yx-safe-bottom">
    <view class="yx-card">
      <text class="yx-tag yx-tag-blue">{{ item?.type === 'policy' ? '政策' : '动态' }}</text>
      <text class="title">{{ title }}</text>
      <text class="yx-muted">{{ item?.time || '' }}</text>
      <text class="body">{{ body }}</text>
      <button class="yx-btn yx-btn-blue" @click="back">我知道了</button>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { contents } from '../../mock/data.js'

const id = ref('')
const title = ref('')

onLoad((q) => {
  id.value = q.id || ''
  title.value = q.title ? decodeURIComponent(q.title) : '详情'
})

const item = computed(() => contents.find((c) => c.id === id.value))

const body = computed(() => {
  if (item.value?.type === 'policy') {
    return '本页为前端模拟公告。激励综合成本含采购、运费、包材、支付与售后；月激励预算可熔断；能量与积分不可提现或交易；汉服节门票退改规则以购票页须知为准。正式内容将由运营后台配置。'
  }
  return item.value?.summary || '运营内容详情占位，后续接入内容管理。'
})

function back() {
  uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/home/index' }) })
}
</script>

<style scoped lang="scss">
.detail {
  padding: 24rpx 28rpx;
}
.title {
  display: block;
  margin: 16rpx 0 8rpx;
  font-size: 36rpx;
  font-weight: 800;
}
.body {
  display: block;
  margin: 24rpx 0 32rpx;
  font-size: 28rpx;
  color: #5c574f;
  line-height: 1.7;
}
.yx-btn {
  width: 100%;
}
</style>
