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
            <text class="sn yx-num">{{ session.user.energy || session.user.points || 0 }}</text>
            <text class="mute">能量值</text>
          </view>
          <view class="sep" />
          <view v-if="playOn" class="si" @click="goFriends">
            <text class="sn yx-num">{{ friendCount }}</text>
            <text class="mute">好友</text>
          </view>
          <view v-else class="si">
            <text class="sn yx-num">{{ session.checkin.streak || 0 }}</text>
            <text class="mute">连签</text>
          </view>
        </view>
      </view>
    </view>

    <view class="body">
      <view class="energy-card" @click="goEnergy">
        <view class="ec-left">
          <text class="ec-label">今日能量</text>
          <text class="ec-num yx-num">{{ session.user.energy || 0 }}</text>
          <view class="ec-meta">
            <text>连签 {{ session.checkin.streak || 0 }} 天</text>
            <text class="dot">·</text>
            <text>步数 {{ session.user.stepsToday || 0 }}</text>
          </view>
        </view>
        <view class="ec-right">
          <text v-if="playOn" class="ec-growth">养成 {{ session.growth.current || 0 }}%</text>
          <text v-else class="ec-growth muted">养成玩法下版</text>
          <text class="ec-cta">去能量罐 ›</text>
        </view>
      </view>

      <ModuleRenderer v-for="mod in checkinMods" :key="'ck-' + mod.id" :mod="mod" />
      <ModuleRenderer v-for="mod in otherMods" :key="mod.id" :mod="mod" />

      <view class="link-card" @click="goLotteryWins">
        <text class="link-t">我的中奖记录</text>
        <text class="link-a">去兑奖 ›</text>
      </view>

      <view class="auth-box">
        <button v-if="!loggedIn" class="login-cta" @click="goLogin">微信登录</button>
        <button v-else class="logout-cta" @click="onLogout">退出登录</button>
      </view>
    </view>
    <RewardPopup />

    <view v-if="profileShow" class="mask" @click="profileShow = false">
      <view class="sheet" @click.stop>
        <text class="sheet-t">完善资料</text>
        <button class="avatar-btn" open-type="chooseAvatar" @chooseavatar="onEditAvatar">
          <image
            class="sheet-av"
            :src="editAvatar || session.user.avatarUrl || '/static/ui/ico-invite.png'"
            mode="aspectFill"
          />
          <text class="sheet-hint">点选微信头像</text>
        </button>
        <view class="sheet-row">
          <text class="sheet-lab">昵称</text>
          <input
            class="sheet-inp"
            type="nickname"
            :value="editNick"
            placeholder="点此填入微信昵称"
            @input="onEditNick"
            @blur="onEditNick"
          />
        </view>
        <view class="sheet-row">
          <text class="sheet-lab">性别</text>
          <view class="gopts">
            <text
              v-for="g in genderOpts"
              :key="g"
              class="gopt"
              :class="{ on: editGender === g }"
              @click="editGender = g"
            >{{ g }}</text>
          </view>
        </view>
        <button class="sheet-save" :loading="profileBusy" @click="saveProfile">保存</button>
      </view>
    </view>
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
import { isLoggedIn, logout, restoreSession, applyAuthSession, updateProfile } from '../../api/auth.js'
import { uploadAvatarFile } from '../../utils/uploadAvatar.js'
import { isEnergyJarPlayEnabled } from '../../config/featureFlags.js'

const playOn = isEnergyJarPlayEnabled()

const statusBar = ref(20)
try {
  statusBar.value = uni.getSystemInfoSync().statusBarHeight || 20
} catch (e) {}

const modules = computed(() => {
  const mine = pageModules('mine') || []
  const homeCheckin = (pageModules('home') || []).filter((m) => m.type === 'checkin_strip')
  // 兼容：签到模块若仍挂在首页配置，个人中心也渲染
  const hasMineCheckin = mine.some((m) => m.type === 'checkin_strip')
  return hasMineCheckin ? mine : [...homeCheckin, ...mine]
})
const checkinMods = computed(() => modules.value.filter((m) => m.type === 'checkin_strip'))
const otherMods = computed(() => modules.value.filter((m) => m.type !== 'checkin_strip'))
const friendCount = computed(() => (session.friends && session.friends.length) || 0)
const loggedIn = computed(() => !!(session.user.loggedIn || isLoggedIn()))
const displayName = computed(() =>
  loggedIn.value ? session.user.nickName || '微信用户' : '点击登录'
)
const metaText = computed(() => {
  if (!loggedIn.value) return '登录后同步能量 · 签到 · 兑礼'
  const g = session.user.gender ? ` · ${session.user.gender}` : ''
  return `${session.user.levelName || '能量新星'}${g} · 连签 ${session.checkin.streak || 0} 天`
})

const profileShow = ref(false)
const profileBusy = ref(false)
const editNick = ref('')
const editAvatar = ref('')
const editGender = ref('')
const genderOpts = ['男', '女', '保密']

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' })
}

function openProfileSheet() {
  editNick.value = session.user.nickName || ''
  editAvatar.value = ''
  editGender.value = session.user.gender || ''
  profileShow.value = true
}

function onProfileTap() {
  if (!loggedIn.value) {
    goLogin()
    return
  }
  openProfileSheet()
}

function onEditAvatar(e) {
  const url = e && e.detail && e.detail.avatarUrl
  if (url) editAvatar.value = url
}

function onEditNick(e) {
  editNick.value = (e && e.detail && e.detail.value) || editNick.value
}

async function saveProfile() {
  if (profileBusy.value) return
  const nick = (editNick.value || '').trim()
  if (!nick) {
    uni.showToast({ title: '请填写昵称', icon: 'none' })
    return
  }
  profileBusy.value = true
  try {
    let avatarPath = ''
    if (editAvatar.value) {
      const up = await uploadAvatarFile(editAvatar.value)
      avatarPath = (up && (up.path || (up.user && up.user.avatarUrl))) || ''
      if (up && up.user) {
        applyAuthSession(up)
      }
    }
    await updateProfile({
      nickName: nick,
      avatarUrl: avatarPath || undefined,
      gender: editGender.value || undefined,
    })
    profileShow.value = false
    uni.showToast({ title: '已保存', icon: 'success' })
  } catch (e) {
    uni.showToast({ title: (e && e.message) || '保存失败', icon: 'none' })
  } finally {
    profileBusy.value = false
  }
}

function needsProfile(data) {
  const u = (data && data.user) || session.user || {}
  const nick = u.nickName || ''
  const av = u.avatarUrl || ''
  return !av || !nick || nick === '微信用户' || nick === '点击登录'
}

function goFriends() {
  if (!playOn) {
    uni.showToast({ title: '养成玩法下版开放', icon: 'none' })
    return
  }
  if (!loggedIn.value) {
    goLogin()
    return
  }
  uni.navigateTo({ url: '/pages/friends/index' })
}

function goEnergy() {
  uni.switchTab({ url: '/pages/energy/index' })
}

function goLotteryWins() {
  if (!loggedIn.value) {
    goLogin()
    return
  }
  uni.navigateTo({ url: '/pages/lottery/index' })
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
      const ju = data && data.invite && data.invite.justUnlocked
      if (ju && ju.unlocked && ju.unlocked.length) {
        uni.showToast({ title: ju.msg || '邀请奖励已到账', icon: 'none' })
      }
      if (needsProfile(data)) {
        // 已登录但缺头像昵称：引导完善（微信不允许静默拉取）
        setTimeout(() => {
          if (!profileShow.value) openProfileSheet()
        }, 400)
      }
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
.energy-card {
  padding: 28rpx;
  border-radius: 24rpx;
  background: #fff;
  box-shadow: var(--shadow);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16rpx;
}
.ec-growth.muted {
  color: #a89b91;
  font-weight: 600;
}
.ec-label {
  display: block;
  font-size: 22rpx;
  color: var(--mute);
}
.ec-num {
  display: block;
  margin-top: 6rpx;
  font-size: 48rpx;
  font-weight: 800;
  color: var(--ink);
  line-height: 1.1;
}
.ec-meta {
  margin-top: 10rpx;
  display: flex;
  gap: 8rpx;
  font-size: 22rpx;
  color: var(--mute);
}
.dot {
  opacity: 0.5;
}
.ec-right {
  text-align: right;
}
.ec-growth {
  display: block;
  font-size: 26rpx;
  font-weight: 700;
  color: #e11d48;
}
.ec-cta {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: var(--mute);
}
.link-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx;
  border-radius: 24rpx;
  background: #fff;
  box-shadow: var(--shadow);
}
.link-t {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--ink);
}
.link-a {
  font-size: 24rpx;
  color: #e11d48;
  font-weight: 600;
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
.mask {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet {
  width: 100%;
  background: #fff;
  border-radius: 28rpx 28rpx 0 0;
  padding: 36rpx 32rpx calc(36rpx + env(safe-area-inset-bottom));
  box-sizing: border-box;
}
.sheet-t {
  display: block;
  text-align: center;
  font-size: 32rpx;
  font-weight: 800;
  color: var(--ink);
  margin-bottom: 24rpx;
}
.avatar-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: transparent;
  border: none;
  padding: 0;
  margin: 0 0 24rpx;
  line-height: 1.2;
}
.avatar-btn::after {
  border: none;
}
.sheet-av {
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
  background: #f3f0ea;
}
.sheet-hint {
  margin-top: 12rpx;
  font-size: 22rpx;
  color: var(--ink-3);
}
.sheet-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx 20rpx;
  border-radius: 16rpx;
  background: #f6f4ef;
  margin-bottom: 16rpx;
}
.sheet-lab {
  font-size: 24rpx;
  color: var(--ink-3);
  flex-shrink: 0;
}
.sheet-inp {
  flex: 1;
  font-size: 28rpx;
  color: var(--ink);
  height: 44rpx;
}
.gopts {
  display: flex;
  gap: 12rpx;
  flex: 1;
}
.gopt {
  padding: 8rpx 20rpx;
  border-radius: 999rpx;
  font-size: 24rpx;
  color: var(--ink-3);
  background: #fff;
  border: 1rpx solid var(--line);
}
.gopt.on {
  color: #fff;
  background: #07c160;
  border-color: #07c160;
}
.sheet-save {
  margin-top: 12rpx;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 999rpx;
  background: #e11d48;
  color: #fff;
  font-size: 30rpx;
  font-weight: 700;
  border: none;
}
.sheet-save::after {
  border: none;
}
</style>
