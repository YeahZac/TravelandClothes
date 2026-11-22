<script>
import { loadAppConfig } from './store/appConfig.js'
import { refreshMeIfStale, applyAuthSession } from './api/auth.js'
import { CLOUD_ENV_ID, getToken } from './api/request.js'

function getTokenSafe() {
  try {
    return !!getToken()
  } catch (e) {
    return false
  }
}
import { syncCartAfterAuth } from './utils/postLogin.js'
import { maybeAutoSyncSteps } from './utils/stepsAutoSync.js'
import { captureInviteFromLaunch } from './utils/inviteCapture.js'
import { resetToGuest } from './store/session.js'
import { ensureShareMenuVisible } from './utils/share.js'
import { installUiGuard } from './utils/uiGuard.js'
import { isLoggedIn } from './api/auth.js'

export default {
  async onLaunch(options) {
    installUiGuard()
    // 真机调试桥抖动时，原生 toast/loading 拆除会刷 Uncaught (in promise)；与业务无关，直接吞掉
    try {
      if (typeof uni !== 'undefined' && typeof uni.onUnhandledRejection === 'function') {
        uni.onUnhandledRejection((ev) => {
          const msg = String(
            (ev && ev.reason && (ev.reason.errMsg || ev.reason.message)) ||
              (ev && ev.reason) ||
              ''
          )
          if (/no root view to removeBaseView|removeTextView|removeImageView|invalid call frame/i.test(msg)) {
            if (ev && typeof ev.preventDefault === 'function') ev.preventDefault()
            return true
          }
          return false
        })
      }
    } catch (_) {}
    try {
      // #ifdef MP-WEIXIN
      try {
        if (typeof wx !== 'undefined' && wx.cloud && typeof wx.cloud.init === 'function') {
          wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true })
        }
      } catch (e) {
        console.warn('[App] wx.cloud.init failed', e)
      }
      // #endif
      captureInviteFromLaunch(options)
      // 配置与登录态并行；登录用 stale 快照秒开，不堵首页
      const configTask = loadAppConfig(false).catch((e) => {
        console.warn('[App] loadAppConfig', e && e.message)
        return null
      })
      const sessionTask = refreshMeIfStale({ maxAgeMs: 60 * 1000 })
        .then((data) => {
          if (data && data.loggedIn) {
            if (!data.offline) {
              applyAuthSession(data)
              syncCartAfterAuth().catch(() => {})
            }
          } else if (!getTokenSafe()) {
            resetToGuest()
          }
          return data
        })
        .catch((e) => {
          console.warn('[App] session', e && e.message)
          if (!getTokenSafe()) resetToGuest()
          return null
        })
      // 最多等 2.5s 配置；超时仍进首页（fallback/磁盘缓存已可渲染）
      await Promise.race([
        Promise.all([configTask, sessionTask]),
        new Promise((r) => setTimeout(r, 2500)),
      ])
    } catch (e) {
      console.warn('[App] bootstrap failed', e)
      if (!getTokenSafe()) resetToGuest()
    }
  },
  onShow(options) {
    captureInviteFromLaunch(options)
    ensureShareMenuVisible()
    // 登录后每次打开 / 回前台：官方链路自动同步微信运动（无手动按钮）
    try {
      if (getTokenSafe() && isLoggedIn()) {
        maybeAutoSyncSteps({
          silent: true,
          minIntervalMs: 45 * 1000,
          requestAuth: false,
        }).catch(() => {})
      }
    } catch (_) {}
  },
}
</script>

<style lang="scss">
@import './styles/tokens.scss';

page {
  font-family: var(--font);
  color: var(--ink);
  background: var(--paper, var(--canvas));
  font-size: 26rpx;
  font-weight: 400;
  line-height: 1.5;
  box-sizing: border-box;
}

view,
text,
button,
image {
  box-sizing: border-box;
}

.yx-num {
  font-family: var(--font-num);
  font-variant-numeric: tabular-nums;
}

.yx-page-x {
  padding-left: var(--page-x);
  padding-right: var(--page-x);
}

.yx-mod + .yx-mod {
  margin-top: var(--mod-gap);
}

.yx-btn-fill {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80rpx;
  border-radius: 999rpx;
  border: none;
  background: var(--accent, #e5a23e);
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1;
}
.yx-btn-fill::after {
  border: none;
}
.yx-btn-fill:active {
  transform: scale(0.98);
  background: var(--accent-deep, #b87a1f);
}

.yx-btn-ghost {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 56rpx;
  padding: 0 24rpx;
  border-radius: 999rpx;
  border: 2rpx solid var(--ink);
  background: transparent;
  color: var(--ink);
  font-size: 22rpx;
  font-weight: 600;
  line-height: 1;
}
.yx-btn-ghost::after {
  border: none;
}

.yx-btn-mute {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80rpx;
  border-radius: 999rpx;
  border: 2rpx solid var(--line);
  background: var(--paper);
  color: var(--ink-3, var(--mute));
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1;
  box-shadow: none;
}
.yx-btn-mute::after {
  border: none;
}

.yx-card {
  background: var(--paper-2, var(--paper));
  border-radius: var(--radius-card);
  box-shadow: var(--shadow);
}

.yx-section-title {
  font-size: 32rpx;
  font-weight: 600;
  color: var(--ink);
  line-height: 1.25;
}

.yx-mute {
  font-size: 22rpx;
  font-weight: 400;
  color: var(--ink-3, var(--mute));
  line-height: 1.35;
}

.yx-link {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--accent-text, var(--link));
}

.yx-page {
  min-height: 100vh;
  box-sizing: border-box;
}
.yx-safe-bottom {
  padding-bottom: calc(24rpx + env(safe-area-inset-bottom));
}
.yx-muted {
  color: var(--ink-3, #9a948c);
  font-size: 24rpx;
}
.yx-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 28rpx;
  height: 64rpx;
  border-radius: 999rpx;
  border: none;
  font-size: 26rpx;
  font-weight: 600;
  background: #f0ebe4;
  color: #2b2520;
}
.yx-btn::after {
  border: none;
}
.yx-btn-mint {
  background: #2ec4b6;
  color: #fff;
}
.yx-btn-orange {
  background: #ff5c4a;
  color: #fff;
}
.yx-btn-blue {
  background: #4a7dff;
  color: #fff;
}
.yx-tag {
  display: inline-block;
  padding: 4rpx 14rpx;
  border-radius: 999rpx;
  background: #fce8f0;
  color: #d83068;
  font-size: 20rpx;
  font-weight: 600;
}
</style>
