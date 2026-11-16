<template>
  <text
    v-if="energyFx.show"
    :key="energyFx.token"
    class="delta"
    :class="energyFx.delta >= 0 ? 'up' : 'down'"
  >{{ energyFx.delta >= 0 ? '+' : '' }}{{ energyFx.delta }}</text>
</template>

<script setup>
import { energyFx } from '../utils/energyFx.js'
</script>

<style scoped>
.delta {
  position: absolute;
  left: 50%;
  top: -8rpx;
  transform: translateX(-50%);
  font-size: 22rpx;
  font-weight: 800;
  line-height: 1;
  white-space: nowrap;
  pointer-events: none;
  z-index: 5;
  animation: energy-pop 1.35s ease-out forwards;
}
.delta.up {
  color: #16a34a;
}
.delta.down {
  color: #e11d48;
}
@keyframes energy-pop {
  0% {
    opacity: 0;
    transform: translateX(-50%) translateY(8rpx) scale(0.85);
  }
  18% {
    opacity: 1;
    transform: translateX(-50%) translateY(-6rpx) scale(1.12);
  }
  70% {
    opacity: 1;
    transform: translateX(-50%) translateY(-22rpx) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateX(-50%) translateY(-36rpx) scale(0.96);
  }
}
</style>
