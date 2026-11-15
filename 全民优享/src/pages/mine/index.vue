/* Hallmark · genre: playful · macrostructure: app-shell · theme: cream-rose · designed-as-app */
<template>
  <view class="page">
    <view class="hero" :style="{ paddingTop: statusBar + 'px' }">
      <view class="hero-inner">
        <view class="profile" @click="onProfileTap">
          <view class="avatar">
            <CmsImage
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
            <text class="sn yx-num">{{ displayEnergy }}</text>
            <text class="mute">能量值</text>
          </view>
          <view class="sep" />
          <view v-if="playOn" class="si" @click="goFriends">
            <text class="sn yx-num">{{ loggedIn ? friendCount : 0 }}</text>
            <text class="mute">好友</text>
          </view>
          <view v-else class="si">
            <text class="sn yx-num">{{ displayStreak }}</text>
            <text class="mute">连签</text>
          </view>
        </view>
      </view>
    </view>

    <view class="body">
      <!-- 不再渲染 CMS 菜单/今日能量类模块；只保留个人中心列表 + 意见反馈 -->
      <view class="list-box">
        <view
          v-for="(row, idx) in serviceLinks"
          :key="row.key"
          class="list-row"
          :class="{ last: idx === serviceLinks.length - 1 }"
          @click="row.onTap"
        >
          <view class="list-lead">
            <view class="list-ico" :style="{ background: row.tone }">
              <VIcon :name="row.icon" :size="40" :color="row.color" stroke="#2B2520" />
            </view>
            <view class="list-txt">
              <text class="list-t">{{ row.title }}</text>
              <text v-if="row.sub" class="list-sub">{{ row.sub }}</text>
            </view>
          </view>
          <view class="list-chev">
            <VIcon name="arrow" :size="28" color="#9AA3B2" stroke="#9AA3B2" />
          </view>
        </view>
      </view>

      <ModuleRenderer v-for="mod in noteMods" :key="'n-' + mod.id" :mod="mod" />

      <view class="auth-box">
        <button v-if="!loggedIn" class="login-cta" @click="goLogin">微信登录</button>
        <button v-else class="logout-cta" @click="onLogout">退出登录</button>
      </view>
    </view>
    <RewardPopup />
    <LoginSheet />

    <view v-if="profileShow" class="mask" @click="profileShow = false">
      <view class="sheet" @click.stop>
        <text class="sheet-t">编辑资料</text>
        <button class="avatar-btn" open-type="chooseAvatar" @chooseavatar="onEditAvatar">
          <image
            v-if="editAvatar && (editAvatar.startsWith('wxfile://') || editAvatar.startsWith('http://tmp') || editAvatar.startsWith('http://usr'))"
            class="sheet-av"
            :src="editAvatar"
            mode="aspectFill"
          />
          <CmsImage
            v-else
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
        <picker mode="region" :value="editRegion" @change="onRegionChange">
          <view class="sheet-row">
            <text class="sheet-lab">地区</text>
            <text class="sheet-inp" :class="{ mute: !regionText }">{{ regionText || '请选择省 / 市 / 区' }}</text>
          </view>
        </picker>
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
import { session, resetToGuest } from '../../store/session.js'
import { syncTabBar } from '../../utils/tabbar.js'
import { isLoggedIn, logout, restoreSession, applyAuthSession, updateProfile } from '../../api/auth.js'
import { clearLocalCartOnly } from '../../store/cart.js'
import { clearLocalOrdersOnly } from '../../store/order.js'
import { uploadAvatarFile, pickAvatarStoragePath } from '../../utils/uploadAvatar.js'
import CmsImage from '../../components/CmsImage.vue'
import { isEnergyJarPlayEnabled } from '../../config/featureFlags.js'
import { getStatusBarHeight } from '../../utils/systemInfo.js'
import LoginSheet from '../../components/LoginSheet.vue'
import { goLogin as openLogin } from '../../utils/loginGate.js'

const playOn = isEnergyJarPlayEnabled()

const statusBar = ref(getStatusBarHeight(20))

const allMineMods = computed(() => pageModules('mine') || [])
/** 仅保留合规说明等富文本；菜单改由本页固定列表渲染 */
const noteMods = computed(() => allMineMods.value.filter((m) => m.type === 'rich_text'))
const friendCount = computed(() => (session.friends && session.friends.length) || 0)
/** 以 token 为准；session.user.loggedIn 仅作展示辅助，避免假登录态 */
const loggedIn = computed(() => isLoggedIn())
const displayEnergy = computed(() =>
  loggedIn.value ? Number(session.user.energy || session.user.points || 0) || 0 : 0
)
const displayStreak = computed(() => (loggedIn.value ? Number(session.checkin.streak) || 0 : 0))

/** 访客种子曾误用「点击登录」当昵称，登录后残留会看起来像未登录 */
function isPlaceholderNick(nick) {
  const n = String(nick || '').trim()
  return !n || n === '点击登录' || n === '微信用户' || n === '游客'
}

const displayName = computed(() => {
  if (!loggedIn.value) return '点击登录'
  if (isPlaceholderNick(session.user.nickName)) return '完善资料'
  return session.user.nickName
})
const serviceLinks = [
  { key: 'cart', title: '购物车', sub: '去结算', icon: 'order', tone: '#E8EFE2', color: '#7FA67A', onTap: () => goCart() },
  { key: 'orders', title: '我的订单', sub: '待付 / 物流', icon: 'order', tone: '#ECE6F3', color: '#9B8FBF', onTap: () => goOrders() },
  { key: 'address', title: '收货地址', sub: '兑礼必填', icon: 'order', tone: '#F3E8D4', color: '#C9A36B', onTap: () => goAddress() },
  { key: 'wins', title: '我的中奖记录', sub: '待兑奖 / 已兑奖', icon: 'lottery', tone: '#F4EDE6', color: '#6E6258', onTap: () => goRecords('wins') },
  { key: 'redeem', title: '兑换记录', sub: '已兑奖待发货', icon: 'gift', tone: '#E8EFE2', color: '#7FA67A', onTap: () => goRecords('redeem') },
  { key: 'shipped', title: '发货记录', sub: '物流单号', icon: 'order', tone: '#ECE6F3', color: '#9B8FBF', onTap: () => goRecords('shipped') },
  { key: 'feedback', title: '意见反馈', sub: '问题与建议', icon: 'bell', tone: '#F3E8D4', color: '#C9A36B', onTap: () => goFeedback() },
]
const metaText = computed(() => {
  if (!loggedIn.value) return '登录后同步能量 · 签到 · 兑礼'
  const g = session.user.gender ? ` · ${session.user.gender}` : ''
  const region = [session.user.province, session.user.city, session.user.district]
    .filter(Boolean)
    .join(' ')
  const reg = region ? ` · ${region}` : ''
  return `${session.user.levelName || '能量新星'}${g}${reg} · 连签 ${displayStreak.value} 天`
})

const profileShow = ref(false)
const profileBusy = ref(false)
/** 本会话只自动引导一次完善资料，避免每次 onShow 打断 */
let profilePromptedOnce = false
const editNick = ref('')
const editAvatar = ref('')
const editGender = ref('')
const editRegion = ref(['', '', ''])
const genderOpts = ['男', '女', '保密']
const regionText = computed(() => (editRegion.value || []).filter(Boolean).join(' '))

function goLogin() {
  openLogin('/pages/mine/index')
}

function openProfileSheet() {
  editNick.value = isPlaceholderNick(session.user.nickName) ? '' : session.user.nickName || ''
  editAvatar.value = ''
  editGender.value = session.user.gender || ''
  editRegion.value = [
    session.user.province || '',
    session.user.city || '',
    session.user.district || '',
  ]
  profileShow.value = true
}

function onProfileTap() {
  // 未登录：只走登录；已登录才编辑资料（勿把「点击登录」当昵称误开编辑）
  if (!isLoggedIn()) {
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

function onRegionChange(e) {
  const v = (e && e.detail && e.detail.value) || []
  editRegion.value = [v[0] || '', v[1] || '', v[2] || '']
}

async function saveProfile() {
  if (profileBusy.value) return
  if (!isLoggedIn()) {
    profileShow.value = false
    goLogin()
    return
  }
  const nick = (editNick.value || '').trim()
  if (!nick || isPlaceholderNick(nick)) {
    uni.showToast({ title: '请填写昵称', icon: 'none' })
    return
  }
  profileBusy.value = true
  let avatarWarn = ''
  try {
    let avatarPath = ''
    if (editAvatar.value) {
      try {
        const up = await uploadAvatarFile(editAvatar.value)
        avatarPath = pickAvatarStoragePath(up)
        if (up && up.user) applyAuthSession(up)
        if (avatarPath) session.user.avatarUrl = avatarPath
      } catch (ae) {
        // 头像失败不阻断昵称/地区保存
        avatarWarn = (ae && ae.message) || '头像上传失败'
        console.warn('[mine] avatar upload', avatarWarn)
      }
    }
    const data = await updateProfile({
      nickName: nick,
      avatarUrl: avatarPath || undefined,
      gender: editGender.value || undefined,
      province: editRegion.value[0] || '',
      city: editRegion.value[1] || '',
      district: editRegion.value[2] || '',
    })
    if (data) applyAuthSession(data)
    session.user.nickName = nick
    profileShow.value = false
    uni.showToast({
      title: avatarWarn ? `资料已保存（${avatarWarn}）` : '已保存',
      icon: 'none',
    })
  } catch (e) {
    const msg = (e && e.message) || '保存失败'
    if (/未登录|token|401/i.test(msg)) {
      profileShow.value = false
      uni.showToast({ title: '登录已失效，请重新登录', icon: 'none' })
      setTimeout(() => goLogin(), 400)
      return
    }
    uni.showToast({ title: msg, icon: 'none' })
  } finally {
    profileBusy.value = false
  }
}

function needsProfile(data) {
  const u = (data && data.user) || session.user || {}
  const nick = u.nickName || ''
  const av = u.avatarUrl || ''
  return !av || isPlaceholderNick(nick)
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

function goRecords(tab = 'wins') {
  if (!loggedIn.value) {
    goLogin()
    return
  }
  uni.navigateTo({ url: `/pages/mine/records?tab=${encodeURIComponent(tab)}` })
}

function goFeedback() {
  if (!loggedIn.value) {
    goLogin()
    return
  }
  uni.navigateTo({ url: '/pages/mine/feedback' })
}

function goCart() {
  uni.navigateTo({ url: '/pages/cart/index' })
}

function goOrders() {
  if (!loggedIn.value) {
    goLogin()
    return
  }
  uni.navigateTo({ url: '/pages/order/list' })
}

function goAddress() {
  if (!loggedIn.value) {
    goLogin()
    return
  }
  uni.navigateTo({ url: '/pages/address/list' })
}

async function onLogout() {
  uni.showModal({
    title: '退出登录',
    content: '退出后本地登录态清除，可随时重新微信登录',
    success: async (res) => {
      if (!res.confirm) return
      await logout()
      clearLocalCartOnly()
      clearLocalOrdersOnly()
      uni.showToast({ title: '已退出', icon: 'none' })
    },
  })
}

onShow(async () => {
  await refreshAppConfigIfNeeded()
  syncTabBar(4)
  if (!isLoggedIn()) {
    resetToGuest()
    return
  }
  try {
    const data = await restoreSession()
    if (data && data.loggedIn) {
      if (!data.offline) applyAuthSession(data)
    } else {
      resetToGuest()
      return
    }
    const ju = data && data.invite && data.invite.justUnlocked
    if (ju && ju.unlocked && ju.unlocked.length) {
      uni.showToast({ title: ju.msg || '邀请奖励已到账', icon: 'none' })
    }
    if (!data.offline && needsProfile(data) && !profilePromptedOnce) {
      profilePromptedOnce = true
      // 已登录但缺头像昵称：引导完善（微信不允许静默拉取）；本会话仅一次
      setTimeout(() => {
        if (!profileShow.value) openProfileSheet()
      }, 400)
    }
  } catch (e) {
    // 非鉴权异常不踢登录；token 仍在则保持已登录 UI
    if (!isLoggedIn()) resetToGuest()
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
.list-box {
  background: var(--paper-2);
  border-radius: 24rpx;
  overflow: hidden;
  box-shadow: var(--shadow);
}
.list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 28rpx 24rpx;
  border-bottom: 1rpx solid var(--line-soft);
  gap: 16rpx;
}
.list-row.last {
  border-bottom: none;
}
.list-lead {
  display: flex;
  align-items: center;
  gap: 20rpx;
  min-width: 0;
}
.list-ico {
  width: 72rpx;
  height: 72rpx;
  border-radius: 18rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.list-txt {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.list-t {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--ink);
}
.list-sub {
  margin-top: 4rpx;
  font-size: 22rpx;
  color: var(--mute);
}
.list-chev {
  width: 32rpx;
  height: 32rpx;
  flex-shrink: 0;
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
  line-height: 44rpx;
}
.sheet-inp.mute {
  color: var(--ink-3);
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
