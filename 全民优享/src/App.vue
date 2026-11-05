<script>
import { loadAppConfig } from './store/appConfig.js'

export default {
  async onLaunch() {
    try {
      await loadAppConfig(true)
    } catch (e) {
      console.warn('[App] bootstrap failed', e)
    }
  },
}
</script>

<style lang="scss">
@import './styles/tokens.scss';

page {
  font-family: var(--font);
  color: var(--ink);
  background: var(--canvas);
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
  background: linear-gradient(180deg, var(--orange-hot), var(--orange));
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
  box-shadow: 0 6rpx 0 var(--orange-depth);
  line-height: 1;
}
.yx-btn-fill::after {
  border: none;
}
.yx-btn-fill:active {
  transform: scale(0.98);
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
  color: var(--mute);
  font-size: 28rpx;
  font-weight: 600;
  line-height: 1;
  box-shadow: none;
}
.yx-btn-mute::after {
  border: none;
}

.yx-card {
  background: var(--paper);
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
  color: var(--mute);
  line-height: 1.35;
}

.yx-link {
  font-size: 22rpx;
  font-weight: 600;
  color: var(--link);
}
</style>
