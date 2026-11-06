<script>
import { loadAppConfig } from './store/appConfig.js'
import { restoreSession, applyAuthSession } from './api/auth.js'
import { detectPlatformSafe } from './utils/platform.js'

export default {
  async onLaunch(options) {
    try {
      const q = (options && options.query) || {}
      if (q.invite) {
        try {
          uni.setStorageSync('qmyx_pending_invite', String(q.invite))
        } catch (e) {}
      }
      if (q.channel) {
        try {
          uni.setStorageSync('qmyx_pending_channel', String(q.channel))
        } catch (e) {}
      }
      await loadAppConfig(true)
      // 有 token 才恢复会话；不再静默 demo 登录
      const data = await restoreSession(detectPlatformSafe())
      if (data && data.loggedIn) applyAuthSession(data)
    } catch (e) {
      console.warn('[App] bootstrap failed', e)
    }
  },
  onShow(options) {
    const q = (options && options.query) || {}
    if (q.invite) {
      try {
        uni.setStorageSync('qmyx_pending_invite', String(q.invite))
      } catch (e) {}
    }
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
