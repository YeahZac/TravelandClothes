<template>
  <view class="vicon" :style="{ width: size + 'rpx', height: size + 'rpx' }">
    <image
      class="img"
      :src="dataUri"
      mode="aspectFit"
      :style="{ width: size + 'rpx', height: size + 'rpx' }"
    />
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, required: true },
  size: { type: Number, default: 48 },
  color: { type: String, default: '#E5A23E' },
  stroke: { type: String, default: '#2B2520' },
})

// 2D 矢量图标家族：统一 48x48 viewBox，描边 3.2 round，实色填充
// 风格：单色块 + 描边 + 留白，无 3D 渲染、无渐变光
const ICONS = {
  coin: (c, s) => `
    <circle cx="24" cy="24" r="16" fill="${c}" stroke="${s}" stroke-width="3.2"/>
    <circle cx="24" cy="24" r="10" fill="none" stroke="${s}" stroke-width="2.4"/>
    <path d="M24 17v14 M20 21h8 M20 27h8" stroke="${s}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`,
  chest: (c, s) => `
    <rect x="8" y="20" width="32" height="20" rx="3" fill="${c}" stroke="${s}" stroke-width="3.2"/>
    <path d="M8 26h32" stroke="${s}" stroke-width="3.2"/>
    <path d="M14 20v-4a10 10 0 0 1 20 0v4" fill="none" stroke="${s}" stroke-width="3.2"/>
    <rect x="21" y="22" width="6" height="8" rx="1.5" fill="#fff" stroke="${s}" stroke-width="2.4"/>`,
  lottery: (c, s) => `
    <rect x="6" y="10" width="36" height="30" rx="4" fill="${c}" stroke="${s}" stroke-width="3.2"/>
    <circle cx="16" cy="20" r="3" fill="#fff" stroke="${s}" stroke-width="2"/>
    <circle cx="32" cy="20" r="3" fill="#fff" stroke="${s}" stroke-width="2"/>
    <circle cx="16" cy="30" r="3" fill="#fff" stroke="${s}" stroke-width="2"/>
    <circle cx="32" cy="30" r="3" fill="#fff" stroke="${s}" stroke-width="2"/>
    <circle cx="24" cy="25" r="3" fill="#fff" stroke="${s}" stroke-width="2"/>`,
  gift: (c, s) => `
    <rect x="8" y="18" width="32" height="22" rx="2.5" fill="${c}" stroke="${s}" stroke-width="3.2"/>
    <rect x="6" y="12" width="36" height="8" rx="2.5" fill="${c}" stroke="${s}" stroke-width="3.2"/>
    <path d="M24 12v28 M24 12c-3-6-9-6-9-2s6 2 9 2zM24 12c3-6 9-6 9-2s-6 2-9 2z" fill="#fff" stroke="${s}" stroke-width="2.8" stroke-linejoin="round"/>`,
  steps: (c, s) => `
    <path d="M16 36c0-6 4-8 8-8s8-2 8-8" fill="none" stroke="${s}" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="14" cy="36" r="4" fill="${c}" stroke="${s}" stroke-width="3.2"/>
    <circle cx="34" cy="20" r="4" fill="${c}" stroke="${s}" stroke-width="3.2"/>
    <path d="M30 12l4-4 4 4 M34 8v8" stroke="${s}" stroke-width="3.2" stroke-linecap="round" fill="none"/>`,
  invite: (c, s) => `
    <circle cx="18" cy="18" r="6" fill="${c}" stroke="${s}" stroke-width="3.2"/>
    <path d="M8 38c0-6 4-10 10-10s10 4 10 10" fill="none" stroke="${s}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M30 14l8 8 M38 14l-8 8" stroke="${c}" stroke-width="3.6" stroke-linecap="round"/>`,
  checkin: (c, s) => `
    <rect x="8" y="8" width="32" height="36" rx="4" fill="#fff" stroke="${s}" stroke-width="3.2"/>
    <path d="M16 6h16v8H16z" fill="${c}" stroke="${s}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M16 24l5 5 11-11" stroke="${c}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  mall: (c, s) => `
    <path d="M10 20h28l-2 22H12z" fill="${c}" stroke="${s}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M16 20a8 8 0 0 1 16 0" fill="none" stroke="${s}" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M18 28v8 M24 28v8 M30 28v8" stroke="${s}" stroke-width="2.6" stroke-linecap="round"/>`,
  festival: (c, s) => `
    <path d="M24 6l4 6 7 1-5 5 1 7-7-3-7 3 1-7-5-5 7-1z" fill="${c}" stroke="${s}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M24 22v18 M16 40h16" stroke="${s}" stroke-width="3.2" stroke-linecap="round"/>`,
  energy: (c, s) => `
    <path d="M24 6l14 8v12l-14 8-14-8V14z" fill="${c}" stroke="${s}" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M24 18l-6 10h6l-2 8 8-12h-6z" fill="#fff" stroke="${s}" stroke-width="2.4" stroke-linejoin="round"/>`,
  home: (c, s) => `
    <path d="M8 22l16-14 16 14v18a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z" fill="${c}" stroke="${s}" stroke-width="3.2" stroke-linejoin="round"/>
    <rect x="20" y="28" width="8" height="14" fill="#fff" stroke="${s}" stroke-width="2.8"/>`,
  mine: (c, s) => `
    <circle cx="24" cy="18" r="7" fill="${c}" stroke="${s}" stroke-width="3.2"/>
    <path d="M10 40c0-8 6-12 14-12s14 4 14 12" fill="${c}" stroke="${s}" stroke-width="3.2" stroke-linecap="round"/>`,
  order: (c, s) => `
    <rect x="10" y="8" width="28" height="32" rx="3" fill="#fff" stroke="${s}" stroke-width="3.2"/>
    <path d="M16 16h16 M16 22h16 M16 28h10" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="32" cy="32" r="5" fill="${c}" stroke="${s}" stroke-width="2.8"/>`,
  ticket: (c, s) => `
    <path d="M6 18a4 4 0 0 1 4-4h28a4 4 0 0 1 4 4v4a4 4 0 0 0 0 8v4a4 4 0 0 1-4 4H10a4 4 0 0 1-4-4v-4a4 4 0 0 0 0-8z" fill="${c}" stroke="${s}" stroke-width="3.2"/>
    <path d="M22 14v20" stroke="#fff" stroke-width="3" stroke-dasharray="3 3"/>`,
  medal: (c, s) => `
    <circle cx="24" cy="28" r="10" fill="${c}" stroke="${s}" stroke-width="3.2"/>
    <path d="M16 8l4 8 M32 8l-4 8" stroke="${s}" stroke-width="3.2" stroke-linecap="round" fill="none"/>
    <path d="M20 26l3 3 5-6" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`,
  arrow: (c, s) => `
    <path d="M18 14l10 10-10 10" fill="none" stroke="${c}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  bell: (c, s) => `
    <path d="M24 8a8 8 0 0 1 8 8v10l4 6H12l4-6V16a8 8 0 0 1 8-8z" fill="${c}" stroke="${s}" stroke-width="3.2" stroke-linejoin="round"/>
    <circle cx="24" cy="38" r="3" fill="${s}"/>`,
  heart: (c, s) => `
    <path d="M24 38S8 28 8 18a8 8 0 0 1 16-2 8 8 0 0 1 16 2c0 10-16 20-16 20z" fill="${c}" stroke="${s}" stroke-width="3.2" stroke-linejoin="round"/>`,
  help: (c, s) => `
    <circle cx="24" cy="24" r="16" fill="#fff" stroke="${s}" stroke-width="3.2"/>
    <path d="M18 18a6 6 0 1 1 8 6c-2 1-2 3-2 4" fill="none" stroke="${c}" stroke-width="3.2" stroke-linecap="round"/>
    <circle cx="24" cy="32" r="2" fill="${c}"/>`,
  settings: (c, s) => `
    <circle cx="24" cy="24" r="6" fill="#fff" stroke="${s}" stroke-width="3.2"/>
    <path d="M24 6v6 M24 36v6 M6 24h6 M36 24h6 M12 12l4 4 M32 32l4 4 M36 12l-4 4 M16 32l-4 4" stroke="${s}" stroke-width="3.2" stroke-linecap="round"/>`,
}

const dataUri = computed(() => {
  const draw = ICONS[props.name] || ICONS.coin
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48">${draw(props.color, props.stroke)}</svg>`
  // 小程序无 btoa，用 encodeURIComponent 编码（# 等特殊字符会被转义）
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
})
</script>

<style scoped>
.vicon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.img {
  display: block;
}
</style>
