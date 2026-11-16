import { reactive } from 'vue'

/** 当前页半屏登录（优先于跳转空白登录页） */
export const loginSheet = reactive({
  visible: false,
  redirect: '',
  /** 是否有页面挂载了 LoginSheet */
  _mounted: 0,
})

export function openLoginSheet(redirectPath = '') {
  loginSheet.redirect = redirectPath || ''
  loginSheet.visible = true
}

export function closeLoginSheet() {
  loginSheet.visible = false
}

export function markLoginSheetMounted(delta) {
  loginSheet._mounted = Math.max(0, (loginSheet._mounted || 0) + delta)
}
