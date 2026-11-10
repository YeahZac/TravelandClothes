<template>
  <view class="pm" :class="['sz-' + size, 'mode-' + mix.payMode]">
    <view class="main">
      <template v-if="mix.payMode === 'mix'">
        <text class="pts yx-num">{{ mix.payPoints }}</text>
        <text class="unit">能量</text>
        <text class="plus">+</text>
        <text class="yen">¥</text>
        <text class="cash yx-num">{{ cashNum }}</text>
      </template>
      <template v-else-if="mix.payMode === 'energy' || mix.payMode === 'points'">
        <text class="pts yx-num">{{ mix.payPoints }}</text>
        <text class="unit">能量</text>
      </template>
      <template v-else-if="mix.payMode === 'cash'">
        <text class="yen">¥</text>
        <text class="cash yx-num">{{ cashNum }}</text>
      </template>
      <template v-else>
        <text class="free">免费领</text>
      </template>
      <text v-if="mix.showList && size !== 'sm'" class="list">¥{{ listNum }}</text>
    </view>
    <view v-if="badge || mix.saveHint" class="badges">
      <text v-if="badge" class="bd hot">{{ badge }}</text>
      <text v-if="mix.saveHint" class="bd save">{{ mix.saveHint }}</text>
      <text v-if="mix.payMode === 'mix'" class="bd mix">能量+微信</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { resolvePayMix, formatCashCent } from '../utils/payMix.js'

const props = defineProps({
  item: { type: Object, default: () => ({}) },
  qty: { type: Number, default: 1 },
  size: { type: String, default: 'md' }, // sm | md | lg
  badge: { type: String, default: '' },
})

const mix = computed(() => resolvePayMix(props.item || {}, { qty: props.qty }))
const cashNum = computed(() => formatCashCent(mix.value.payCashCent))
const listNum = computed(() => {
  const y = mix.value.listPriceYuan
  return y.toFixed(y % 1 ? 2 : 0)
})
</script>

<style scoped>
.pm {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
}
.main {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 2rpx;
  line-height: 1.1;
}
.yen {
  font-weight: 800;
  color: #e11d48;
  margin-right: 2rpx;
}
.cash,
.pts {
  font-weight: 800;
  color: #e11d48;
  font-variant-numeric: tabular-nums;
}
.unit,
.plus {
  font-weight: 700;
  color: #e11d48;
  margin: 0 4rpx;
}
.free {
  font-weight: 800;
  color: #059669;
}
.list {
  margin-left: 10rpx;
  font-size: 22rpx;
  color: #9ca3af;
  text-decoration: line-through;
  font-weight: 500;
}
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
}
.bd {
  font-size: 18rpx;
  font-weight: 700;
  padding: 2rpx 8rpx;
  border-radius: 6rpx;
  line-height: 1.4;
}
.bd.hot {
  background: #fff1f2;
  color: #e11d48;
}
.bd.save {
  background: #fff7ed;
  color: #c2410c;
}
.bd.mix {
  background: linear-gradient(90deg, #fff1f2, #fff7ed);
  color: #be123c;
}

.sz-sm .cash,
.sz-sm .pts {
  font-size: 28rpx;
}
.sz-sm .yen,
.sz-sm .unit,
.sz-sm .plus {
  font-size: 20rpx;
}
.sz-sm .free {
  font-size: 24rpx;
}
.sz-sm .badges {
  display: none;
}

.sz-md .cash,
.sz-md .pts {
  font-size: 34rpx;
}
.sz-md .yen {
  font-size: 24rpx;
}
.sz-md .unit,
.sz-md .plus {
  font-size: 22rpx;
}
.sz-md .free {
  font-size: 28rpx;
}

.sz-lg .cash,
.sz-lg .pts {
  font-size: 48rpx;
}
.sz-lg .yen {
  font-size: 32rpx;
}
.sz-lg .unit,
.sz-lg .plus {
  font-size: 28rpx;
}
.sz-lg .free {
  font-size: 36rpx;
}
.sz-lg .list {
  font-size: 26rpx;
}
</style>
