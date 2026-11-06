<template>
  <view v-if="visible" class="mask" @click="onClose">
    <view class="sheet" @click.stop>
      <text class="title">{{ title }}</text>
      <text class="copy">{{ copy }}</text>
      <button class="cta" open-type="share" @click="onShare">喊好友搭把手</button>
      <button class="later" @click="onClose">稍后再说</button>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { session } from '../store/session.js'
import { appConfig } from '../store/appConfig.js'

const props = defineProps({
  visible: Boolean,
  kind: { type: String, default: 'progress' }, // progress | invite
  progress: { type: Number, default: 0 },
})
const emit = defineEmits(['close', 'share'])

const pool = computed(() => {
  const cfg = (appConfig.game && appConfig.game.share && appConfig.game.share.nearmiss) || {}
  return cfg.copyPool || [
    '就差一口气，帮我吹一下？',
    '进度 95% 了，别让罐子寂寞',
    '还差 1 人上车，座位给你留着',
  ]
})

const copy = computed(() => {
  const list = pool.value
  return list[Math.floor(Math.random() * list.length)] || '帮我点一下，我差最后一口粮'
})

const title = computed(() => {
  if (props.kind === 'invite') return '再差 1 人满档'
  return `进度已到 ${props.progress}%`
})

function onClose() {
  emit('close')
}

function onShare() {
  emit('share', {
    title: copy.value,
    path: `/pages/index/index?invite=${session.user.inviteCode || ''}&channel=share_nearmiss&from=${props.kind}`,
  })
}
</script>

<style scoped>
.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(20, 18, 16, 0.45);
  z-index: 1000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet {
  width: 100%;
  background: #fffaf4;
  border-radius: 32rpx 32rpx 0 0;
  padding: 48rpx 40rpx calc(40rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.title {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
  color: #1c1a17;
}
.copy {
  display: block;
  margin-top: 16rpx;
  font-size: 28rpx;
  color: #5c574f;
  line-height: 1.5;
}
.cta {
  margin-top: 36rpx;
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 999rpx;
  background: #ff5c4a;
  color: #fff;
  font-size: 30rpx;
  font-weight: 700;
  border: none;
}
.cta::after { border: none; }
.later {
  margin-top: 16rpx;
  width: 100%;
  height: 72rpx;
  line-height: 72rpx;
  background: transparent;
  color: #9a948c;
  font-size: 26rpx;
  border: none;
}
.later::after { border: none; }
</style>
