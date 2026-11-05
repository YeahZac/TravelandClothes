<template>
  <view class="yx-page invite yx-safe-bottom">
    <view class="hero yx-card">
      <text class="title">邀请有礼</text>
      <text class="sub">只结算有效新增 · 奖励冻结 24 小时</text>
      <view class="code-box">
        <text class="code-label">我的邀请码</text>
        <text class="code">{{ session.user.inviteCode }}</text>
      </view>
      <view class="frozen">
        冻结中奖励：{{ session.user.frozenInviteReward }} 能量
      </view>
    </view>

    <view class="yx-card rules">
      <text class="block-title">有效新用户需同时满足</text>
      <text class="rl">1. 新设备 / 新账号首次进入</text>
      <text class="rl">2. 完成授权</text>
      <text class="rl">3. 完成签到或首个非分享任务</text>
      <text class="rl">4. 24h 内未命中风控</text>
      <text class="rl">5. 奖励冻结 24h 后到账</text>
    </view>

    <view class="yx-card">
      <text class="block-title">自然分享触点</text>
      <text class="rl">· 养成进度 80% / 95%</text>
      <text class="rl">· 抽奖中奖海报</text>
      <text class="rl">· 组队差 1 人</text>
      <text class="rl">· 限时开兑前</text>
      <text class="rl">· 兑换成功晒单</text>
    </view>

    <button class="yx-btn yx-btn-orange share" @click="onShare">
      生成邀请卡片（模拟）
    </button>
  </view>
</template>

<script setup>
import { session } from '../../store/session.js'

function onShare() {
  uni.showModal({
    title: '邀请卡片',
    content: `码 ${session.user.inviteCode}\n文案：帮我点一下，我差最后一口粮`,
    confirmText: '复制',
    success(res) {
      if (res.confirm) {
        uni.setClipboardData({
          data: `【全民优享】帮我点一下，我差最后一口粮。邀请码 ${session.user.inviteCode}`,
        })
      }
    },
  })
}
</script>

<style scoped lang="scss">
.invite {
  padding: 24rpx 32rpx;
}

.hero,
.rules {
  margin-bottom: 20rpx;
}

.title {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
}

.sub {
  display: block;
  margin-top: 8rpx;
  font-size: 24rpx;
  color: #5c574f;
}

.code-box {
  margin-top: 28rpx;
  padding: 28rpx;
  border-radius: 20rpx;
  background: linear-gradient(135deg, #ff7a6b, #ff5c4a);
  color: #fff;
  text-align: center;
}

.code-label {
  display: block;
  font-size: 22rpx;
  opacity: 0.85;
}

.code {
  display: block;
  margin-top: 8rpx;
  font-size: 48rpx;
  font-weight: 800;
  letter-spacing: 6rpx;
}

.frozen {
  margin-top: 16rpx;
  font-size: 24rpx;
  color: #c97830;
  font-weight: 600;
}

.block-title {
  display: block;
  font-size: 28rpx;
  font-weight: 750;
  margin-bottom: 12rpx;
}

.rl {
  display: block;
  font-size: 24rpx;
  color: #5c574f;
  line-height: 1.7;
}

.share {
  margin-top: 32rpx;
  width: 100%;
}
</style>
