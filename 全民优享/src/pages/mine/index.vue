/* Hallmark · genre: playful · macrostructure: app-shell · theme: cream-rose · designed-as-app */
<template>
  <view class="page">
    <view class="hero" :style="{ paddingTop: statusBar + 'px' }">
      <view class="hero-inner">
        <view class="profile" @click="onProfileTap">
          <view class="avatar">
            <image
              v-if="session.user.avatarUrl"
              class="avatar-img"
              :src="session.user.avatarUrl"
              mode="aspectFill"
            />
            <view v-else class="sil" />
          </view>
          <view class="who">
            <view class="name-row">
              <text class="name">{{ displayName }}</text>
              <view v-if="loggedIn" class="medal">
                <VIcon name="medal" :size="30" color="#C9A36B" stroke="#7A5A1F" />
                <text class="medal-t">Lv.{{ session.user.level || 1 }}</text>
              </view>
            </view>
            <text class="meta">{{ metaText }}</text>
          </view>
        </view>
        <view class="stats">
          <view class="si">
            <text class="sn yx-num">{{ session.user.energy || 0 }}</text>
            <text class="mute">能量</text>
          </view>
          <view class="sep" />
          <view class="si">
            <text class="sn yx-num">{{ session.user.points || 0 }}</text>
            <text class="mute">积分</text>
          </view>
          <view class="sep" />
          <view class="si" @click="goFriends">
            <text class="sn yx-num">{{ friendCount }}</text>
            <text class="mute">好友</text>
          </view>
        </view>
      </view>
    </view>

    <view class="body">
      <ModuleRenderer v-for="mod in modules" :key="mod.id" :mod="mod" />

      <view class="auth-box">
        <button v-if="!loggedIn" class="login-cta" @click="goLogin">微信登录</button>
        <button v-else class="logout-cta" @click="onLogout">退出登录</button>
      </view>
    </view>
    <RewardPopup />
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import ModuleRenderer from '../../components/modules/ModuleRenderer.vue'
import RewardPopup from '../../components/RewardPopup.vue'
import VIcon from '../../components/VIcon.vue'
import { pageModules, refreshAppConfigIfNeeded } from '../../store/appConfig.js'
import { session } from '../../store/session.js'
import { syncTabBar } from '../../utils/tabbar.js'
import { isLoggedIn, logout, restoreSession, applyAuthSession } from '../../api/auth.js'

const statusBar = ref(20)
try {
  statusBar.value = uni.getSystemInfoSync().statusBarHeight || 20
} catch (e) {}

const modules = computed(() => pageModules('mine'))
const friendCount = computed(() => (session.friends && session.friends.length) || 0)
const loggedIn = computed(() => !!(session.user.loggedIn || isLoggedIn()))
const displayName = computed(() =>
  loggedIn.value ? session.user.nickName || '微信用户' : '点击登录'
)
const metaText = computed(() => {
  if (!loggedIn.value) return '登录后同步能量 · 签到 · 兑礼'
  return `${session.user.levelName || '能量新星'} · 连签 ${session.checkin.streak || 0} 天`
})

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' })
}

function onProfileTap() {
  if (!loggedIn.value) goLogin()
}

function goFriends() {
  if (!loggedIn.value) {
    goLogin()
    return
  }
  uni.navigateTo({ url: '/pages/friends/index' })
}

async function onLogout() {
  uni.showModal({
    title: '退出登录',
    content: '退出后本地登录态清除，可随时重新微信登录',
    success: async (res) => {
      if (!res.confirm) return
      await logout()
      uni.showToast({ title: '已退出', icon: 'none' })
    },
  })
}

onShow(async () => {
  await refreshAppConfigIfNeeded()
  syncTabBar(4)
  if (isLoggedIn()) {
    try {
      const data = await restoreSession()
      if (data && data.loggedIn) applyAuthSession(data)
    } catch (e) {}
  }
})
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--paper);
  padding-bottom: 140rpx;
}
.hero {
  background: var(--paper-3);
  padding: 0 var(--page-x) 40rpx;
  border-bottom-left-radius: 36rpx;
  border-bottom-right-radius: 36rpx;
}
.hero-inner {
  display: flex;
  flex-direction: column;
}
.profile {
  display: flex;
  gap: 24rpx;
  align-items: center;
  min-height: 132rpx;
  padding: 20rpx 0 32rpx;
}
.avatar {
  position: relative;
  width: 120rpx;
  height: 120rpx;
  border-radius: 50%;
  background: var(--paper-2);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
  box-shadow: var(--shadow-soft);
  border: 3rpx solid var(--paper-2);
}
.avatar-img {
  width: 100%;
  height: 100%;
}
.sil {
  width: 60rpx;
  height: 68rpx;
  border-radius: 40rpx 40rpx 12rpx 12rpx;
  background: var(--line);
  margin-bottom: 12rpx;
}
.who {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.name {
  font-size: 42rpx;
  font-weight: 800;
  color: var(--ink);
  line-height: 1.2;
  letter-spacing: -0.5rpx;
}
.medal {
  display: flex;
  align-items: center;
  gap: 6rpx;
  background: var(--paper-2);
  padding: 6rpx 16rpx 6rpx 6rpx;
  border-radius: var(--radius-pill);
  border: 1rpx solid var(--gold-soft);
}
.medal-t {
  font-size: 22rpx;
  font-weight: 700;
  color: var(--gold);
  font-variant-numeric: tabular-nums;
}
.meta {
  margin-top: 10rpx;
  font-size: 24rpx;
  color: var(--ink-2);
}
.stats {
  background: var(--paper-2);
  border-radius: var(--radius-card);
  padding: 32rpx 0;
  display: flex;
  align-items: center;
  box-shadow: var(--shadow-soft);
  border: 1rpx solid var(--line-soft);
}
.si {
  flex: 1;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.sep {
  width: 1rpx;
  height: 56rpx;
  background: var(--line);
}
.sn {
  font-size: 44rpx;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  line-height: 1.1;
  letter-spacing: -0.5rpx;
}
.mute {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: var(--ink-3);
}
.body {
  padding: 36rpx var(--page-x);
  display: flex;
  flex-direction: column;
  gap: var(--mod-gap);
}
.auth-box {
  margin-top: 12rpx;
}
.login-cta {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 999rpx;
  border: none;
  background: #07c160;
  color: #fff;
  font-size: 30rpx;
  font-weight: 700;
}
.login-cta::after {
  border: none;
}
.logout-cta {
  width: 100%;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 999rpx;
  border: 1rpx solid var(--line);
  background: var(--paper-2);
  color: var(--ink-3);
  font-size: 28rpx;
}
.logout-cta::after {
  border: none;
}
</style>
