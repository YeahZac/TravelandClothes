<!-- 能量树多阶段舞台：种子→发芽→生长→开花→结果→落叶，按 seed.theme 换形 -->
<template>
  <view class="tree-stage" :class="['phase-' + phase, 'theme-' + theme]">
    <view class="sky" :class="'sky-' + phase">
      <view v-if="phase === 'leaf_fall'" class="sun pulse" />
      <view v-else-if="phase !== 'seed'" class="sun soft" />
      <view
        v-for="(flake, i) in leafFlakes"
        :key="'lf' + i"
        class="flake"
        :style="flake.style"
      />
    </view>

    <view class="plant" :style="plantCssVars">
      <!-- 种子 -->
      <view v-if="phase === 'seed'" class="seed-wrap">
        <view class="seed-body" />
        <view class="seed-gleam" />
      </view>

      <!-- 发芽 -->
      <view v-else-if="phase === 'sprout'" class="sprout">
        <view class="sprout-stem" />
        <view class="sprout-leaf left" />
        <view class="sprout-leaf right" />
      </view>

      <!-- 生长 / 开花 / 结果 / 落叶 -->
      <view v-else class="grown" :class="'size-' + sizeBand">
        <view class="trunk" :class="theme" />
        <view class="crown" :class="[theme, phase]">
          <view class="canopy c1" />
          <view class="canopy c2" />
          <view class="canopy c3" />
          <view v-if="theme === 'pine'" class="pine-tip" />
          <view v-if="theme === 'bamboo'" class="bamboo-nodes">
            <view class="node n1" /><view class="node n2" /><view class="node n3" />
          </view>
          <view v-if="phase === 'flower' || phase === 'fruit'" class="blooms">
            <view v-for="i in bloomCount" :key="'b' + i" class="bloom" :class="'b' + i" />
          </view>
          <view v-if="phase === 'fruit'" class="fruits">
            <view v-for="i in fruitCount" :key="'f' + i" class="fruit" :class="'f' + i" />
          </view>
        </view>
      </view>
    </view>

    <!-- 营养球 -->
    <view
      v-if="dropRemaining > 0"
      class="drops"
      @click="$emit('claim-drop')"
    >
      <view
        v-for="(d, i) in dropBalls"
        :key="'d' + i"
        class="drop"
        :style="d.style"
      >
        <text class="drop-n yx-num">{{ i === 0 ? dropRemaining : '' }}</text>
      </view>
      <text class="drop-hint">点吸收营养</text>
    </view>

    <!-- 玩法 HUD -->
    <view v-if="hudItems.length" class="hud">
      <text v-for="(h, i) in hudItems" :key="'h' + i" class="hud-chip" :class="h.cls">{{ h.text }}</text>
    </view>

    <view class="meta">
      <text class="meta-phase">{{ phaseName }} · 第 {{ cycle }} 轮</text>
      <text class="meta-seed">{{ seedName }} · 产出 ×{{ yieldLabel }}{{ playTag ? ' · ' + playTag : '' }}</text>
      <text class="meta-tip">{{ phaseTip }}</text>
      <view class="bar">
        <view class="bar-fill" :style="{ width: progress + '%' }" />
      </view>
      <text class="meta-nut yx-num">营养 {{ nutrition }}{{ nextHint }}</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  tree: { type: Object, default: null },
})
defineEmits(['claim-drop'])

const phase = computed(() => (props.tree && props.tree.phase) || 'seed')
const theme = computed(() => (props.tree && props.tree.seed && props.tree.seed.theme) || 'elm')
const phaseName = computed(() => (props.tree && props.tree.phaseName) || '种子')
const phaseTip = computed(() => (props.tree && props.tree.phaseTip) || '')
const seedName = computed(() => (props.tree && props.tree.seed && props.tree.seed.name) || '种子')
const playTag = computed(() => (props.tree && (props.tree.playTag || (props.tree.seed && props.tree.seed.playTag))) || '')
const cycle = computed(() => (props.tree && props.tree.cycle) || 1)
const progress = computed(() => (props.tree && props.tree.progress) || 0)
const nutrition = computed(() => (props.tree && props.tree.nutrition) || 0)
const yieldLabel = computed(() => {
  const y = (props.tree && (props.tree.yieldMult || (props.tree.seed && props.tree.seed.yieldMult))) || 1
  return Number(y).toFixed(2).replace(/\.?0+$/, '')
})
const dropRemaining = computed(() => {
  const d = props.tree && props.tree.dailyDrop
  return d ? Number(d.remaining) || 0 : 0
})

const hudItems = computed(() => {
  const s = (props.tree && props.tree.seed) || {}
  const items = []
  if (s.stealResist > 0) items.push({ text: `抗偷 ${Math.round(s.stealResist * 100)}%`, cls: 'shield' })
  if (s.eventResist != null && s.eventResist < 1) {
    items.push({ text: `抗虫 ×${s.eventResist}`, cls: 'shield' })
  }
  if (s.checkinBonusNutrition > 0) items.push({ text: `连签 +${s.checkinBonusNutrition}营养`, cls: 'checkin' })
  if (s.leafSunlightBonus > 0 && phase.value === 'leaf_fall') {
    items.push({ text: `阳光 +${s.leafSunlightBonus}`, cls: 'sun' })
  }
  if (s.yieldMult >= 1.75 && (phase.value === 'fruit' || phase.value === 'leaf_fall')) {
    items.push({ text: '收果暴击就绪', cls: 'crit' })
  }
  if (theme.value === 'maple') items.push({ text: '日掉丰产', cls: 'drop' })
  return items.slice(0, 3)
})

const sizeBand = computed(() => {
  const p = phase.value
  if (p === 'grow') return 'm'
  if (p === 'flower') return 'l'
  if (p === 'fruit' || p === 'leaf_fall') return 'xl'
  return 's'
})

const plantCssVars = computed(() => {
  const s = (props.tree && props.tree.seed) || {}
  return {
    '--leaf': s.leafTone || '#5B7A4A',
    '--trunk': s.trunkTone || '#6B4A2E',
    '--flower': s.flowerTone || '#C9A36B',
    '--fruit': s.fruitTone || '#8B5A2B',
  }
})

const nextHint = computed(() => {
  const n = props.tree && props.tree.nextPhase
  if (!n) return ' · 可收果开新轮'
  const parts = []
  if (n.nutritionLeft > 0) parts.push(`差 ${n.nutritionLeft} 营养`)
  if (n.daysLeft > 0) parts.push(`${n.daysLeft} 天`)
  return parts.length ? ` · 距${n.name} ${parts.join('/')}` : ` · 将至${n.name}`
})

const bloomCount = computed(() => {
  if (theme.value === 'peach' || theme.value === 'paulownia') return 5
  return 3
})
const fruitCount = computed(() => {
  if (theme.value === 'elm' || theme.value === 'maple') return 4
  if (theme.value === 'paulownia') return 5
  return 3
})

const dropBalls = computed(() => {
  const n = Math.min(5, Math.max(1, Math.ceil(dropRemaining.value / 4)))
  return Array.from({ length: n }).map((_, i) => ({
    style: {
      left: `${18 + i * 14}%`,
      top: `${28 + (i % 3) * 10}%`,
      animationDelay: `${i * 0.18}s`,
    },
  }))
})

const leafFlakes = computed(() => {
  if (phase.value !== 'leaf_fall') return []
  return Array.from({ length: 6 }).map((_, i) => ({
    style: {
      left: `${10 + i * 14}%`,
      animationDelay: `${i * 0.4}s`,
      background: 'var(--leaf)',
    },
  }))
})
</script>

<style scoped>
.tree-stage {
  position: relative;
  width: 100%;
  height: 520rpx;
  overflow: hidden;
  border-radius: 28rpx 28rpx 0 0;
}
.sky {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, #dceee4 0%, #f6f1e6 55%, #e8dcc8 100%);
}
.sky-seed {
  background: linear-gradient(180deg, #e8efe6 0%, #f3ebe0 100%);
}
.sky-flower {
  background: linear-gradient(180deg, #f3e4ef 0%, #f7f0e4 60%, #e8dcc8 100%);
}
.sky-fruit {
  background: linear-gradient(180deg, #f0e6c8 0%, #f7f0e4 55%, #e4d4b8 100%);
}
.sky-leaf_fall {
  background: linear-gradient(180deg, #c9b896 0%, #e8d4a8 45%, #d4b888 100%);
}
.theme-maple.phase-leaf_fall .sky,
.theme-maple .sky-leaf_fall {
  background: linear-gradient(180deg, #e8b090 0%, #f0d0b0 50%, #d4a080 100%);
}
.theme-paulownia .sky-flower {
  background: linear-gradient(180deg, #d8d0e8 0%, #f0eaf6 55%, #e0d4c8 100%);
}
.theme-ginkgo .sky-leaf_fall {
  background: linear-gradient(180deg, #e8c860 0%, #f5e6a8 50%, #d4b060 100%);
}
.hud {
  position: absolute;
  left: 16rpx;
  top: 16rpx;
  z-index: 4;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  align-items: flex-start;
}
.hud-chip {
  font-size: 18rpx;
  padding: 6rpx 14rpx;
  border-radius: 16rpx;
  background: rgba(255, 255, 255, 0.78);
  color: #4a443c;
}
.hud-chip.shield {
  color: #3d6b4f;
}
.hud-chip.checkin {
  color: #5a7a4a;
}
.hud-chip.sun {
  color: #a87820;
}
.hud-chip.crit {
  color: #6b4a9b;
  font-weight: 700;
}
.hud-chip.drop {
  color: #b84a2a;
}
.sun {
  position: absolute;
  right: 48rpx;
  top: 36rpx;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #fff6c8, #e8b84a 70%);
  box-shadow: 0 0 40rpx rgba(232, 184, 74, 0.45);
}
.sun.pulse {
  animation: sunPulse 2.4s ease-in-out infinite;
}
@keyframes sunPulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.9;
  }
  50% {
    transform: scale(1.12);
    opacity: 1;
  }
}
.flake {
  position: absolute;
  top: -20rpx;
  width: 18rpx;
  height: 18rpx;
  border-radius: 40% 60% 55% 45%;
  opacity: 0.75;
  animation: fall 3.6s linear infinite;
}
@keyframes fall {
  to {
    transform: translateY(520rpx) rotate(160deg);
    opacity: 0.2;
  }
}

.plant {
  position: absolute;
  left: 50%;
  bottom: 120rpx;
  transform: translateX(-50%);
  width: 280rpx;
  height: 340rpx;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

/* 种子 */
.seed-wrap {
  position: relative;
  width: 56rpx;
  height: 68rpx;
  margin-bottom: 24rpx;
}
.seed-body {
  width: 100%;
  height: 100%;
  border-radius: 50% 50% 48% 48%;
  background: radial-gradient(circle at 35% 30%, #c9a36b, var(--trunk, #6b4a2e));
  box-shadow: 0 8rpx 16rpx rgba(60, 40, 20, 0.25);
}
.seed-gleam {
  position: absolute;
  left: 14rpx;
  top: 14rpx;
  width: 14rpx;
  height: 18rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.45);
}

/* 发芽 */
.sprout {
  position: relative;
  width: 80rpx;
  height: 120rpx;
}
.sprout-stem {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 8rpx;
  height: 80rpx;
  margin-left: -4rpx;
  border-radius: 8rpx;
  background: var(--leaf);
}
.sprout-leaf {
  position: absolute;
  bottom: 56rpx;
  width: 36rpx;
  height: 22rpx;
  border-radius: 50% 10% 50% 10%;
  background: var(--leaf);
}
.sprout-leaf.left {
  left: 4rpx;
  transform: rotate(-35deg);
}
.sprout-leaf.right {
  right: 4rpx;
  transform: rotate(35deg) scaleX(-1);
}

/* 成树 */
.grown {
  position: relative;
  width: 100%;
  height: 100%;
}
.grown.size-m .trunk {
  height: 140rpx;
}
.grown.size-l .trunk {
  height: 180rpx;
}
.grown.size-xl .trunk {
  height: 210rpx;
}
.trunk {
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 28rpx;
  height: 110rpx;
  margin-left: -14rpx;
  border-radius: 10rpx 10rpx 4rpx 4rpx;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.12), transparent 40%), var(--trunk);
}
.theme-bamboo .trunk {
  width: 18rpx;
  margin-left: -9rpx;
  background: linear-gradient(180deg, #a8d4a0, var(--trunk));
}
.theme-pine .trunk {
  width: 22rpx;
  margin-left: -11rpx;
}
.theme-elm .trunk {
  width: 30rpx;
  margin-left: -15rpx;
  border-radius: 12rpx 12rpx 4rpx 4rpx;
}
.theme-maple .trunk {
  width: 26rpx;
  margin-left: -13rpx;
}
.theme-paulownia .trunk {
  width: 36rpx;
  margin-left: -18rpx;
  height: 230rpx;
}
.theme-paulownia.size-xl .trunk {
  height: 250rpx;
}
.crown {
  position: absolute;
  left: 50%;
  bottom: 90rpx;
  width: 220rpx;
  height: 180rpx;
  margin-left: -110rpx;
}
.grown.size-m .crown {
  bottom: 120rpx;
}
.grown.size-l .crown,
.grown.size-xl .crown {
  bottom: 150rpx;
  height: 220rpx;
}
.canopy {
  position: absolute;
  border-radius: 50%;
  background: var(--leaf);
  opacity: 0.92;
}
.canopy.c1 {
  width: 140rpx;
  height: 110rpx;
  left: 40rpx;
  top: 40rpx;
}
.canopy.c2 {
  width: 110rpx;
  height: 90rpx;
  left: 10rpx;
  top: 60rpx;
  opacity: 0.85;
}
.canopy.c3 {
  width: 100rpx;
  height: 88rpx;
  right: 8rpx;
  top: 55rpx;
  opacity: 0.88;
}
.theme-pine .canopy {
  border-radius: 50% 50% 40% 40%;
  clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
  width: 160rpx;
  height: 120rpx;
}
.theme-pine .c1 {
  left: 30rpx;
  top: 20rpx;
}
.theme-pine .c2 {
  width: 130rpx;
  height: 100rpx;
  left: 45rpx;
  top: 70rpx;
}
.theme-pine .c3 {
  width: 100rpx;
  height: 80rpx;
  left: 60rpx;
  top: 110rpx;
}
.theme-ginkgo .canopy {
  border-radius: 50% 50% 40% 40%;
  background: linear-gradient(160deg, #e8c547, var(--leaf));
}
.theme-elm .canopy {
  border-radius: 50%;
}
.theme-elm .c1 {
  width: 160rpx;
  height: 130rpx;
  left: 30rpx;
  top: 30rpx;
}
.theme-maple .canopy {
  border-radius: 40% 60% 45% 55%;
  background: linear-gradient(150deg, #e87a4a, var(--leaf));
}
.theme-maple .c1 {
  width: 150rpx;
  height: 120rpx;
}
.theme-paulownia .canopy {
  border-radius: 48% 52% 45% 55%;
  background: linear-gradient(160deg, #8a9ab8, var(--leaf));
}
.theme-paulownia .c1 {
  width: 180rpx;
  height: 140rpx;
  left: 20rpx;
  top: 20rpx;
}
.theme-paulownia .bloom {
  background: radial-gradient(circle at 40% 40%, #fff, var(--flower));
  width: 26rpx;
  height: 26rpx;
}
.theme-paulownia .fruit {
  background: radial-gradient(circle at 35% 30%, #fff, var(--fruit));
  border-radius: 50%;
}
.theme-bamboo .canopy {
  width: 70rpx;
  height: 40rpx;
  border-radius: 40% 60%;
}
.theme-bamboo .c1 {
  left: 20rpx;
  top: 30rpx;
}
.theme-bamboo .c2 {
  left: 90rpx;
  top: 50rpx;
}
.theme-bamboo .c3 {
  left: 130rpx;
  top: 20rpx;
}
.crown.leaf_fall .canopy {
  opacity: 0.55;
  filter: saturate(0.7);
}
.pine-tip {
  position: absolute;
  left: 50%;
  top: 0;
  width: 0;
  height: 0;
  margin-left: -20rpx;
  border-left: 20rpx solid transparent;
  border-right: 20rpx solid transparent;
  border-bottom: 40rpx solid var(--leaf);
}
.bamboo-nodes .node {
  position: absolute;
  left: 50%;
  width: 22rpx;
  height: 6rpx;
  margin-left: -11rpx;
  background: rgba(255, 255, 255, 0.35);
  border-radius: 4rpx;
}
.bamboo-nodes .n1 {
  bottom: 40rpx;
}
.bamboo-nodes .n2 {
  bottom: 90rpx;
}
.bamboo-nodes .n3 {
  bottom: 140rpx;
}

.bloom {
  position: absolute;
  width: 22rpx;
  height: 22rpx;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 40%, #fff, var(--flower));
  box-shadow: 0 0 8rpx rgba(232, 160, 181, 0.35);
}
.bloom.b1 {
  left: 40%;
  top: 30%;
}
.bloom.b2 {
  left: 62%;
  top: 42%;
}
.bloom.b3 {
  left: 28%;
  top: 55%;
}
.bloom.b4 {
  left: 55%;
  top: 22%;
}
.bloom.b5 {
  left: 70%;
  top: 58%;
}

.fruit {
  position: absolute;
  width: 24rpx;
  height: 28rpx;
  border-radius: 50% 50% 45% 45%;
  background: radial-gradient(circle at 35% 30%, #fff8, var(--fruit));
}
.fruit.f1 {
  left: 36%;
  top: 48%;
}
.fruit.f2 {
  left: 58%;
  top: 55%;
}
.fruit.f3 {
  left: 48%;
  top: 68%;
}
.fruit.f4 {
  left: 68%;
  top: 40%;
}

.drops {
  position: absolute;
  inset: 0;
  z-index: 3;
}
.drop {
  position: absolute;
  width: 48rpx;
  height: 48rpx;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #e8f5c8, #7fa67a);
  box-shadow: 0 6rpx 16rpx rgba(80, 120, 60, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: bob 1.6s ease-in-out infinite;
}
@keyframes bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10rpx);
  }
}
.drop-n {
  font-size: 20rpx;
  font-weight: 800;
  color: #2b3528;
}
.drop-hint {
  position: absolute;
  left: 50%;
  bottom: 88rpx;
  transform: translateX(-50%);
  font-size: 20rpx;
  color: #5a6b52;
  background: rgba(255, 255, 255, 0.72);
  padding: 6rpx 16rpx;
  border-radius: 20rpx;
}

.meta {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 8rpx;
  padding: 0 24rpx;
  z-index: 2;
  text-align: center;
}
.meta-phase {
  display: block;
  font-size: 26rpx;
  font-weight: 750;
  color: #2b2520;
}
.meta-seed {
  display: block;
  margin-top: 2rpx;
  font-size: 20rpx;
  color: #6e6258;
}
.meta-tip {
  display: block;
  margin-top: 4rpx;
  font-size: 20rpx;
  color: #8a7f74;
}
.bar {
  margin: 10rpx auto 6rpx;
  width: 70%;
  height: 10rpx;
  border-radius: 10rpx;
  background: rgba(43, 37, 32, 0.08);
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  border-radius: 10rpx;
  background: linear-gradient(90deg, #7fa67a, #c9a36b);
}
.meta-nut {
  display: block;
  font-size: 20rpx;
  color: #5c574f;
}
</style>
