<template>
  <!-- 兜底页：无半屏挂载时跳转至此，自动打开同一套 LoginSheet -->
  <view class="page">
    <LoginSheet />
  </view>
</template>

<script setup>
import { onLoad } from '@dcloudio/uni-app'
import LoginSheet from '../../components/LoginSheet.vue'
import { openLoginSheet } from '../../store/loginSheet.js'
import { session } from '../../store/session.js'

const TAB_ROOTS = [
  '/pages/home/index',
  '/pages/mall/index',
  '/pages/festival/index',
  '/pages/energy/index',
  '/pages/mine/index',
]

onLoad((q) => {
  const redirect = (q && q.redirect) || ''
  if (session.user && session.user.loggedIn) {
    goRedirect(redirect)
    return
  }
  openLoginSheet(redirect)
})

function goRedirect(redirect) {
  if (redirect) {
    const raw = decodeURIComponent(redirect)
    const pathOnly = String(raw).split('?')[0]
    const isTab = TAB_ROOTS.some((t) => pathOnly === t || pathOnly.endsWith(t))
    if (isTab) {
      uni.switchTab({ url: pathOnly, fail: () => uni.switchTab({ url: '/pages/home/index' }) })
      return
    }
    uni.redirectTo({
      url: raw.startsWith('/') ? raw : `/${raw}`,
      fail: () => uni.switchTab({ url: '/pages/home/index' }),
    })
    return
  }
  uni.switchTab({ url: '/pages/mine/index' })
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  background: #1a2e28;
}
</style>
