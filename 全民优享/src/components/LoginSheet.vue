<template>
  <view v-if="visible" class="mask" @click="onMask">
    <view class="sheet" @click.stop>
      <view class="handle" />

      <!-- 步骤1：真正的一键登录（仅 uni.login，官方已禁止静默拉头像昵称） -->
      <block v-if="step === 'login'">
        <text class="title">一键登录</text>
        <text class="sub">登录后即可签到、兑礼与抽奖</text>

        <view class="agree" @click="toggleAgree">
          <view class="box" :class="{ on: agreed }">
            <text v-if="agreed" class="tick">✓</text>
          </view>
          <view class="agree-txt">
            <text class="plain">我已阅读并同意</text>
            <text class="link" @click.stop="openLegal('tos')">《用户服务协议》</text>
            <text class="plain">、</text>
            <text class="link" @click.stop="openLegal('privacy')">《隐私政策》</text>
            <text class="plain">与</text>
            <text class="link" @click.stop="openLegal('energy')">《能量值规则》</text>
          </view>
        </view>

        <button
          class="wx-btn"
          :class="{ disabled: !agreed }"
          :loading="busy"
          :disabled="busy"
          @click="onLogin"
        >
          一键登录
        </button>

        <view v-if="showInvite" class="invite-field">
          <text class="invite-label">邀请码（选填）</text>
          <input
            class="invite-input"
            :class="{ err: inviteErr }"
            type="text"
            maxlength="16"
            :value="inviteCode"
            placeholder="有邀请码可填写，登录后不可改"
            placeholder-class="invite-ph"
            @input="onInviteInput"
            @blur="validateInvite"
          />
          <text v-if="inviteErr" class="invite-err">{{ inviteErr }}</text>
          <text v-else-if="inviteOk" class="invite-ok">邀请码有效</text>
        </view>

        <button class="cancel" @click="close">取消</button>
      </block>

      <!--
        步骤2：完善资料（可选，默认不强制）
        微信已禁止静默拉取头像昵称，只能 chooseAvatar + type=nickname，且无法与一键登录合成一步
      -->
      <block v-else>
        <text class="title">完善头像昵称</text>
        <text class="sub">微信不允许静默读取头像昵称，点选一次即可；也可跳过稍后在「我的」填写</text>

        <form @submit="onProfileSubmit">
          <button
            class="avatar-btn"
            open-type="chooseAvatar"
            form-type="button"
            @chooseavatar="onChooseAvatar"
          >
            <image
              class="avatar"
              :src="avatarUrl || defaultAvatar"
              mode="aspectFill"
            />
            <text class="avatar-hint">点击选择头像</text>
          </button>

          <view class="nick-row">
            <text class="nick-lab">昵称</text>
            <input
              class="nick-inp"
              name="nickName"
              type="nickname"
              :value="nickName"
              placeholder="点此可选用昵称"
              @input="onNickInput"
              @blur="onNickInput"
              @change="onNickInput"
              @nicknamereview="onNickReview"
            />
          </view>

          <view class="nick-row">
            <text class="nick-lab">性别</text>
            <view class="gender-row">
              <text
                v-for="g in genderOpts"
                :key="g"
                class="gender-chip"
                :class="{ on: gender === g }"
                @click="gender = g"
              >{{ g }}</text>
            </view>
          </view>

          <button
            class="wx-btn"
            form-type="submit"
            :loading="busy"
            :disabled="busy"
          >
            保存并进入
          </button>
        </form>

        <button class="cancel" @click="skipProfile">暂时跳过</button>
      </block>
    </view>
  </view>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { loginSheet, closeLoginSheet, markLoginSheetMounted } from '../store/loginSheet.js'
import {
  loginWithWeChat,
  fetchWxLoginCode,
  updateProfile,
  applyAuthSession,
  hasEverLogged,
} from '../api/auth.js'
import { fetchLegalMeta } from '../api/legal.js'
import { request, USE_REMOTE } from '../api/request.js'
import { runPostLoginSideEffects } from '../utils/postLogin.js'
import { readPendingInviteCode, clearPendingInvite } from '../utils/inviteCapture.js'
import { uploadAvatarFile, pickAvatarStoragePath, isTempAvatarPath } from '../utils/uploadAvatar.js'
import { session } from '../store/session.js'

function redirectPath() {
  return String(loginSheet.redirect || '')
}

function currentRoute() {
  try {
    const pages = getCurrentPages()
    const cur = pages && pages.length ? pages[pages.length - 1] : null
    return cur && cur.route ? String(cur.route) : ''
  } catch (_) {
    return ''
  }
}

/** 年会签到/祝福链路：不展示邀请码；资料在签到页收集 */
function isGalaFlow() {
  if (/pages\/gala\//.test(redirectPath())) return true
  if (/pages\/gala\//.test(currentRoute())) return true
  return false
}

/** 微信官方示例默认灰头像 */
const defaultAvatar =
  'https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0'

const visible = ref(false)
const step = ref('login')
const busy = ref(false)
const agreed = ref(false)
const inviteCode = ref('')
const inviteErr = ref('')
const inviteOk = ref(false)
/** 仅本机首次登录展示邀请码；曾登录过则隐藏 */
const showInvite = ref(true)
const tosVersion = ref('1.0.0')
const privacyVersion = ref('1.0.0')
const nickName = ref('')
const avatarUrl = ref('')
const avatarLocal = ref('')
const gender = ref('')
const genderOpts = ['男', '女', '保密']

const TAB_ROOTS = [
  '/pages/home/index',
  '/pages/mall/index',
  '/pages/festival/index',
  '/pages/energy/index',
  '/pages/mine/index',
]

onMounted(() => {
  markLoginSheetMounted(1)
  visible.value = !!loginSheet.visible
  if (visible.value) bootstrap()
})
onUnmounted(() => markLoginSheetMounted(-1))

watch(
  () => loginSheet.visible,
  (v) => {
    visible.value = !!v
    if (v) bootstrap()
  }
)

async function bootstrap() {
  step.value = 'login'
  busy.value = false
  agreed.value = false
  inviteErr.value = ''
  inviteOk.value = false
  // 年会签到页：强制隐藏邀请码（不依赖 redirect 是否带上）
  if (isGalaFlow()) {
    clearPendingInvite()
    showInvite.value = false
    inviteCode.value = ''
  } else {
    showInvite.value = !hasEverLogged()
    // readPendingInviteCode 会自动丢掉「场次码误存」的脏数据
    inviteCode.value = showInvite.value ? readPendingInviteCode() : ''
    if (!inviteCode.value) clearPendingInvite()
  }
  nickName.value = ''
  avatarUrl.value = ''
  avatarLocal.value = ''
  try {
    const meta = await Promise.race([
      fetchLegalMeta(),
      new Promise((r) => setTimeout(() => r(null), 3000)),
    ])
    if (meta && meta.tos && meta.tos.version) tosVersion.value = meta.tos.version
    if (meta && meta.privacy && meta.privacy.version) privacyVersion.value = meta.privacy.version
  } catch (_) {}
  if (showInvite.value && inviteCode.value) {
    const ok = await validateInvite()
    if (ok === false) {
      // 错误默认码直接清掉，避免挡住一键登录
      inviteCode.value = ''
      inviteErr.value = ''
      clearPendingInvite()
    }
  } else inviteErr.value = ''
}

function isLoginPage() {
  try {
    const pages = getCurrentPages()
    const cur = pages && pages.length ? pages[pages.length - 1] : null
    return !!(cur && cur.route && String(cur.route).includes('pages/login/index'))
  } catch (_) {
    return false
  }
}

function close() {
  closeLoginSheet()
  if (isLoginPage()) {
    uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/home/index' }) })
  }
}

function onMask() {
  if (!busy.value) close()
}

function toggleAgree() {
  agreed.value = !agreed.value
}

function openLegal(id) {
  uni.navigateTo({ url: `/pages/legal/detail?id=${id}` })
}

function onInviteInput(e) {
  const v = (e && e.detail && e.detail.value) || ''
  inviteCode.value = String(v)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
  inviteErr.value = ''
  inviteOk.value = false
}

async function validateInvite() {
  const code = inviteCode.value
  if (!code) {
    inviteErr.value = ''
    inviteOk.value = false
    return true
  }
  if (!USE_REMOTE) return true
  try {
    const r = await request(`/api/traffic/v1/invite/check?code=${encodeURIComponent(code)}`, {
      method: 'GET',
      timeout: 5000,
    })
    if (r && r.valid) {
      inviteErr.value = ''
      inviteOk.value = true
      return true
    }
    inviteErr.value = (r && r.msg) || '邀请码错误或不存在'
    inviteOk.value = false
    return false
  } catch (_) {
    inviteErr.value = ''
    inviteOk.value = false
    return true
  }
}

function isPlaceholderNick(n) {
  const s = String(n || '').trim()
  return !s || ['优享用户', '微信用户', '点击登录', '游客', '本地用户'].includes(s)
}

/**
 * 登录后是否还要强制「完善头像昵称」
 * 微信禁止静默获取头像昵称；为避免鸿蒙等机型「设了又要设」，默认不强制：
 * - 年会：签到页收集
 * - 已有头像或真实昵称：跳过
 * - 其余：直接进业务，可在「我的」补
 */
function needProfile() {
  if (isGalaFlow()) return false
  const nick = session.user.nickName || ''
  const av = String(session.user.avatarUrl || '').trim()
  if (av && !isPlaceholderNick(nick)) return false
  if (av) return false
  if (!isPlaceholderNick(nick)) return false
  // 全新账号也不再打断一键登录；资料延后收集
  return false
}

function afterLoginNav() {
  const redirect = loginSheet.redirect || ''
  const onLoginRoute = isLoginPage()
  closeLoginSheet()
  if (onLoginRoute) {
    if (!redirect) {
      uni.switchTab({ url: '/pages/mine/index' })
      return
    }
    const raw = decodeURIComponent(redirect)
    const pathOnly = String(raw).split('?')[0]
    const isTab = TAB_ROOTS.some((t) => pathOnly === t || pathOnly.endsWith(t))
    if (isTab) {
      uni.switchTab({ url: pathOnly, fail: () => uni.switchTab({ url: '/pages/mine/index' }) })
      return
    }
    uni.redirectTo({
      url: raw.startsWith('/') ? raw : `/${raw}`,
      fail: () => uni.switchTab({ url: '/pages/mine/index' }),
    })
    return
  }
  if (!redirect) return
  const raw = decodeURIComponent(redirect)
  const pathOnly = String(raw).split('?')[0]
  try {
    const pages = getCurrentPages()
    const cur = pages && pages.length ? pages[pages.length - 1] : null
    const route = cur && cur.route ? `/${cur.route}` : ''
    if (route && (pathOnly === route || pathOnly.endsWith(route))) return
  } catch (_) {}
  const isTab = TAB_ROOTS.some((t) => pathOnly === t || pathOnly.endsWith(t))
  if (isTab) {
    uni.switchTab({ url: pathOnly, fail: () => {} })
    return
  }
  uni.navigateTo({
    url: raw.startsWith('/') ? raw : `/${raw}`,
    fail: () => {},
  })
}

async function onLogin() {
  if (busy.value) return
  if (!agreed.value) {
    uni.showToast({ title: '请先勾选同意协议', icon: 'none' })
    return
  }
  busy.value = true
  try {
    // 邀请码校验与 uni.login 并行，减少串行等待
    const inviteTask = inviteCode.value ? validateInvite() : Promise.resolve(true)
    const codeTask = USE_REMOTE ? fetchWxLoginCode() : Promise.resolve('')
    const [inviteOkResult, wxCode] = await Promise.all([inviteTask, codeTask])
    if (inviteCode.value && inviteOkResult === false) {
      // 选填邀请码错误：清空后仍允许登录（不阻断）
      inviteCode.value = ''
      inviteErr.value = ''
      clearPendingInvite()
    }
    // 若当前页（如签到）已选过头像昵称，登录时一并带上，避免登录后再要一次
    const preNick = !isPlaceholderNick(nickName.value) ? String(nickName.value).trim() : ''
    const preAvatar = String(avatarLocal.value || avatarUrl.value || '').trim()
    const loginResult = await loginWithWeChat({
      nickName: preNick,
      avatarUrl: preAvatar && !isTempAvatarPath(preAvatar) ? preAvatar : '',
      agreeLegal: true,
      tosVersion: tosVersion.value,
      privacyVersion: privacyVersion.value,
      inviteCode: inviteCode.value || '',
      code: wxCode || '',
    })
    runPostLoginSideEffects({
      needCheckinSync: !!(loginResult && loginResult.needCheckinSync),
    }).catch(() => {})
    // 临时头像：登录成功后再异步上传，不挡进页
    if (preAvatar && isTempAvatarPath(preAvatar)) {
      uploadAvatarFile(preAvatar)
        .then((up) => {
          const path = pickAvatarStoragePath(up)
          if (path) {
            updateProfile({ avatarUrl: path, nickName: preNick || undefined }).catch(() => {})
            session.user.avatarUrl = path
            if (preNick) session.user.nickName = preNick
          }
        })
        .catch(() => {})
    }
    if (needProfile()) {
      step.value = 'profile'
      const sn = session.user.nickName || ''
      const sa = session.user.avatarUrl || ''
      nickName.value = !isPlaceholderNick(sn) ? sn : preNick || ''
      avatarUrl.value = sa || (preAvatar && !isTempAvatarPath(preAvatar) ? preAvatar : '') || ''
      avatarLocal.value = preAvatar && isTempAvatarPath(preAvatar) ? preAvatar : ''
      gender.value = session.user.gender || ''
      return
    }
    uni.showToast({ title: '登录成功', icon: 'success' })
    setTimeout(afterLoginNav, 350)
  } catch (e) {
    let msg = (e && e.message) || '登录失败，请重试'
    if (/invalid code|code been used|js_code/i.test(msg)) {
      msg = '一键登录凭证失效，请关闭小程序重开后再试'
    } else if (/繁忙|503/i.test(msg)) {
      msg = '服务繁忙，请稍后重试'
    } else if (/callContainer|云托管|timeout|TIMED_OUT|超时/i.test(msg)) {
      msg = '连接云服务失败，请检查网络后重试'
    } else if (/邀请码/.test(msg)) {
      inviteErr.value = msg
    }
    console.error('[login]', msg, e)
    uni.showModal({
      title: '登录失败',
      content: String(msg).slice(0, 160),
      showCancel: false,
    })
  } finally {
    busy.value = false
  }
}

function onChooseAvatar(e) {
  const url = e && e.detail && e.detail.avatarUrl
  if (!url) return
  avatarLocal.value = url
  avatarUrl.value = url
}

function onNickInput(e) {
  nickName.value = ((e && e.detail && e.detail.value) || '').trim()
}

function onNickReview(e) {
  const d = (e && e.detail) || {}
  if (d.pass === false) {
    nickName.value = ''
    uni.showToast({ title: '昵称未通过安全检测', icon: 'none' })
  }
}

async function persistProfile(nick) {
  let finalAvatar = pickAvatarStoragePath(avatarUrl.value)
  const local = avatarLocal.value || avatarUrl.value
  let avatarWarn = ''
  if (local && (isTempAvatarPath(local) || !finalAvatar)) {
    try {
      const up = await uploadAvatarFile(local)
      finalAvatar = pickAvatarStoragePath(up) || finalAvatar
      if (up && up.user) applyAuthSession(up)
    } catch (ae) {
      avatarWarn = (ae && ae.message) || '头像上传失败'
      console.warn('[LoginSheet] avatar', avatarWarn)
    }
  }
  const name = String(nick || nickName.value || '').trim()
  if (!name && !finalAvatar) {
    if (avatarWarn) throw new Error(avatarWarn)
    return false
  }
  await updateProfile({
    nickName: name || undefined,
    avatarUrl: finalAvatar || undefined,
    gender: gender.value || undefined,
  })
  if (name) session.user.nickName = name
  if (finalAvatar) session.user.avatarUrl = finalAvatar
  if (gender.value) session.user.gender = gender.value
  if (avatarWarn) {
    uni.showToast({ title: `资料已保存（${avatarWarn}）`, icon: 'none' })
  }
  return true
}

async function onProfileSubmit(e) {
  if (busy.value) return
  // form submit：官方推荐用此方式取 nickname，避免 blur 安检清空
  const formNick =
    (e && e.detail && e.detail.value && e.detail.value.nickName) || nickName.value || ''
  const nick = String(formNick).trim()
  if (!nick && !avatarUrl.value) {
    uni.showToast({ title: '请选择头像或填写昵称', icon: 'none' })
    return
  }
  busy.value = true
  try {
    await persistProfile(nick)
    uni.showToast({ title: '已保存', icon: 'success' })
    setTimeout(afterLoginNav, 350)
  } catch (err) {
    uni.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
  } finally {
    busy.value = false
  }
}

function skipProfile() {
  uni.showToast({ title: '登录成功', icon: 'success' })
  setTimeout(afterLoginNav, 350)
}
</script>

<style scoped>
.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 10000;
  background: rgba(12, 18, 16, 0.45);
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.sheet {
  background: #fffaf4;
  border-radius: 32rpx 32rpx 0 0;
  padding: 20rpx 40rpx calc(28rpx + env(safe-area-inset-bottom));
  box-shadow: 0 -12rpx 40rpx rgba(0, 0, 0, 0.12);
  max-height: 88vh;
  overflow-y: auto;
}
.handle {
  width: 64rpx;
  height: 8rpx;
  border-radius: 999rpx;
  background: #d8d2ca;
  margin: 8rpx auto 28rpx;
}
.title {
  display: block;
  font-size: 36rpx;
  font-weight: 800;
  color: #1c1a17;
  text-align: center;
}
.sub {
  display: block;
  margin-top: 10rpx;
  margin-bottom: 28rpx;
  font-size: 24rpx;
  color: #8a948c;
  text-align: center;
  line-height: 1.45;
}
.agree {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  margin-bottom: 28rpx;
}
.box {
  width: 32rpx;
  height: 32rpx;
  margin-top: 4rpx;
  border-radius: 8rpx;
  border: 2rpx solid #b7c4b9;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-sizing: border-box;
}
.box.on {
  background: #07c160;
  border-color: #07c160;
}
.tick {
  color: #fff;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 1;
}
.agree-txt {
  flex: 1;
  font-size: 22rpx;
  line-height: 1.55;
  color: #6e6258;
}
.link {
  color: #1a7f4b;
  font-weight: 600;
}
.wx-btn {
  width: 100%;
  height: 96rpx;
  line-height: 96rpx;
  border-radius: 999rpx;
  border: none;
  background: #07c160;
  color: #fff;
  font-size: 32rpx;
  font-weight: 700;
}
.wx-btn::after {
  border: none;
}
.wx-btn.disabled {
  background: #b7dcc4;
}
.invite-field {
  margin-top: 28rpx;
}
.invite-label {
  display: block;
  font-size: 22rpx;
  color: #6e6258;
  margin-bottom: 12rpx;
  font-weight: 600;
}
.invite-input {
  width: 100%;
  height: 80rpx;
  padding: 0 24rpx;
  box-sizing: border-box;
  border-radius: 16rpx;
  border: 2rpx solid #d8e0d9;
  background: #fff;
  font-size: 28rpx;
  font-weight: 700;
  letter-spacing: 2rpx;
  color: #1c1a17;
}
.invite-input.err {
  border-color: #e85d4c;
}
.invite-ph {
  color: #a8b0a9;
  font-weight: 400;
  letter-spacing: 0;
}
.invite-err {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: #e85d4c;
}
.invite-ok {
  display: block;
  margin-top: 10rpx;
  font-size: 22rpx;
  color: #1a7f4b;
}
.cancel {
  margin-top: 12rpx;
  width: 100%;
  height: 80rpx;
  line-height: 80rpx;
  background: transparent;
  border: none;
  color: #8a948c;
  font-size: 28rpx;
}
.cancel::after {
  border: none;
}
.avatar-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: transparent;
  border: none;
  margin-bottom: 20rpx;
  padding: 0;
}
.avatar-btn::after {
  border: none;
}
.avatar {
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
  background: #eee;
  border: 4rpx solid #e8e2d8;
}
.avatar-hint {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: #1a7f4b;
  font-weight: 700;
}
.nick-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 28rpx;
  padding: 0 8rpx;
}
.nick-lab {
  font-size: 26rpx;
  color: #6e6258;
  font-weight: 600;
  width: 80rpx;
}
.nick-inp {
  flex: 1;
  height: 72rpx;
  padding: 0 20rpx;
  border-radius: 12rpx;
  border: 2rpx solid #d8e0d9;
  background: #fff;
  font-size: 28rpx;
}
.gender-row {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.gender-chip {
  padding: 12rpx 28rpx;
  border-radius: 999rpx;
  border: 2rpx solid #d8e0d9;
  background: #fff;
  font-size: 26rpx;
  color: #6e6258;
}
.gender-chip.on {
  border-color: #07c160;
  background: rgba(7, 193, 96, 0.12);
  color: #1a7f4b;
  font-weight: 700;
}
</style>
