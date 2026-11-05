<template>
  <view class="yx-page friends yx-safe-bottom">
    <view class="hero">
      <text class="title">好友能量</text>
      <text class="sub">互偷不伤锁定进度 · 主要用来叫人回访</text>
    </view>

    <view class="team yx-card">
      <view class="team-head">
        <text class="block-title">{{ team.name }}</text>
        <text class="yx-tag">{{ team.gapTip }}</text>
      </view>
      <view class="members">
        <view
          v-for="(m, i) in team.members"
          :key="i"
          class="member"
          :class="{ empty: m.empty, me: m.me }"
        >
          <view class="avatar">{{ m.empty ? '+' : m.name.slice(0, 1) }}</view>
          <text class="m-name">{{ m.name }}</text>
          <text class="m-st">{{ m.empty ? '邀请' : m.done ? '已达标' : '未打开' }}</text>
        </view>
      </view>
      <text class="yx-muted">{{ team.reward }}</text>
      <button class="yx-btn yx-btn-blue team-btn" open-type="share" @click="onInviteTeam">
        喊 1 人上车
      </button>
    </view>

    <view class="list yx-card">
      <view class="block-head">
        <text class="block-title">可收取</text>
        <text class="yx-muted">今日还可帮别人助力 3 次</text>
      </view>
      <view
        v-for="f in session.friends"
        :key="f.id"
        class="friend-row"
      >
        <view class="f-avatar">{{ f.name.slice(0, 1) }}</view>
        <view class="f-body">
          <text class="f-name">{{ f.name }}</text>
          <text class="yx-muted">{{ f.tip }}</text>
        </view>
        <button
          v-if="f.status === 'stealable'"
          class="yx-btn yx-btn-mint f-btn"
          @click="onSteal(f.id)"
        >
          收 {{ f.energy }}
        </button>
        <button
          v-else-if="f.status === 'boost'"
          class="yx-btn yx-btn-ghost f-btn"
          @click="onBoost"
        >
          帮砍一下
        </button>
        <text v-else class="done-txt">已收完</text>
      </view>
    </view>

    <view class="copy-tip yx-card">
      <text class="block-title">求助文案（好玩不乞讨）</text>
      <text class="copy">「帮我点一下，我差最后一口粮」</text>
      <button class="yx-btn yx-btn-ghost" @click="copyTip">复制文案</button>
    </view>
  </view>
</template>

<script setup>
import { team } from '../../mock/data.js'
import { session, stealFriend } from '../../store/session.js'

function onSteal(id) {
  const r = stealFriend(id)
  uni.showToast({ title: r.msg, icon: 'none' })
}

function onBoost() {
  uni.showToast({ title: '已帮砍进度 2%（模拟）', icon: 'none' })
}

function onInviteTeam() {
  uni.showToast({ title: '请用右上角分享给好友', icon: 'none' })
}

function copyTip() {
  uni.setClipboardData({
    data: '帮我点一下，我差最后一口粮——全民优享能量罐',
  })
}
</script>

<style scoped lang="scss">
.friends {
  padding: 24rpx 32rpx;
  background: linear-gradient(180deg, #f0fbf8 0%, #fff7f2 40%);
  min-height: 100vh;
}

.title {
  display: block;
  font-size: 40rpx;
  font-weight: 800;
}

.sub {
  display: block;
  margin: 8rpx 0 24rpx;
  font-size: 24rpx;
  color: #5c574f;
}

.team,
.list,
.copy-tip {
  margin-bottom: 20rpx;
}

.team-head,
.block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20rpx;
}

.block-title {
  font-size: 30rpx;
  font-weight: 750;
}

.members {
  display: flex;
  gap: 24rpx;
  margin-bottom: 16rpx;
}

.member {
  flex: 1;
  text-align: center;
}

.avatar {
  width: 96rpx;
  height: 96rpx;
  margin: 0 auto 10rpx;
  border-radius: 50%;
  background: linear-gradient(135deg, #3fd4c6, #2ec4b6);
  color: #fff;
  font-size: 36rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.member.empty .avatar {
  background: rgba(28, 26, 23, 0.08);
  color: #9a948c;
  border: 2rpx dashed #9a948c;
}

.member.me .avatar {
  background: linear-gradient(135deg, #ff7a6b, #ff5c4a);
}

.m-name {
  display: block;
  font-size: 24rpx;
  font-weight: 600;
}

.m-st {
  display: block;
  font-size: 20rpx;
  color: #9a948c;
  margin-top: 4rpx;
}

.team-btn {
  margin-top: 20rpx;
  width: 100%;
}

.friend-row {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid rgba(28, 26, 23, 0.06);
}

.friend-row:last-child {
  border-bottom: none;
}

.f-avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: #ffe8dc;
  color: #e84636;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 20rpx;
}

.f-body {
  flex: 1;
}

.f-name {
  display: block;
  font-size: 28rpx;
  font-weight: 650;
}

.f-btn {
  height: 56rpx;
  padding: 0 24rpx;
  font-size: 22rpx;
  margin: 0;
}

.done-txt {
  font-size: 22rpx;
  color: #9a948c;
}

.copy {
  display: block;
  margin: 12rpx 0 20rpx;
  font-size: 28rpx;
  font-weight: 600;
  color: #1c1a17;
}
</style>
