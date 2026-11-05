<template>
  <view class="gi" :class="'gi-' + kind" :style="{ width: size + 'rpx', height: size + 'rpx' }">
    <!-- 抽奖转盘 -->
    <view v-if="kind === 'lottery'" class="wheel">
      <view class="q q1" /><view class="q q2" /><view class="q q3" /><view class="q q4" />
      <view class="hub" /><view class="needle" />
    </view>
    <!-- 礼盒 -->
    <view v-else-if="kind === 'gift'" class="box">
      <view class="lid" /><view class="body" /><view class="ribbon-v" /><view class="ribbon-h" />
    </view>
    <!-- 步数鞋 -->
    <view v-else-if="kind === 'steps'" class="shoe">
      <view class="sole" /><view class="vamp" /><view class="lace" />
    </view>
    <!-- 邀请 -->
    <view v-else-if="kind === 'invite'" class="people">
      <view class="p a" /><view class="p b" /><view class="spark" />
    </view>
    <!-- 签到台历 -->
    <view v-else-if="kind === 'checkin'" class="cal">
      <view class="cal-top" /><view class="cal-sheet" /><view class="cal-coin" />
    </view>
    <!-- 汉服团扇 -->
    <view v-else-if="kind === 'festival'" class="fan">
      <view class="blade" /><view class="stick" />
    </view>
    <!-- 商城纸袋 -->
    <view v-else-if="kind === 'mall'" class="bag">
      <view class="handle" /><view class="bag-body" />
    </view>
    <!-- 金币 -->
    <view v-else-if="kind === 'coin'" class="coin">
      <view class="rim" /><view class="bolt" />
    </view>
    <!-- 宝箱 -->
    <view v-else-if="kind === 'chest'" class="chest">
      <view class="c-lid" /><view class="c-body" /><view class="c-lock" />
    </view>
    <!-- 默认罐 -->
    <view v-else class="can">
      <view class="can-rim" /><view class="can-glass"><view class="liquid" /></view>
    </view>
    <view class="shade" />
  </view>
</template>

<script setup>
defineProps({
  kind: { type: String, default: 'can' },
  size: { type: Number, default: 112 },
})
</script>

<style scoped>
.gi {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.shade {
  position: absolute;
  left: 18%;
  right: 18%;
  bottom: 4%;
  height: 10%;
  border-radius: 50%;
  background: rgba(18, 24, 38, 0.12);
  filter: blur(2px);
  z-index: 0;
}
.wheel, .box, .shoe, .people, .cal, .fan, .bag, .coin, .chest, .can {
  position: relative;
  z-index: 1;
  width: 78%;
  height: 78%;
}
.wheel {
  border-radius: 50%;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 6rpx 12rpx rgba(18,24,38,.18);
}
.q { position: absolute; width: 50%; height: 50%; }
.q1 { left: 0; top: 0; background: #6ea8ff; }
.q2 { right: 0; top: 0; background: #ffd76a; }
.q3 { left: 0; bottom: 0; background: #8ef0c0; }
.q4 { right: 0; bottom: 0; background: #ff8a2a; }
.hub {
  position: absolute; left: 50%; top: 50%; width: 22%; height: 22%;
  margin: -11% 0 0 -11%; border-radius: 50%; background: #fff;
  box-shadow: 0 2rpx 4rpx rgba(18,24,38,.2); z-index: 2;
}
.needle {
  position: absolute; left: 50%; top: 2%; width: 0; height: 0; z-index: 3;
  margin-left: -10rpx;
  border-left: 10rpx solid transparent;
  border-right: 10rpx solid transparent;
  border-bottom: 22rpx solid #121826;
}
.box .lid {
  height: 28%; border-radius: 10rpx 10rpx 4rpx 4rpx;
  background: linear-gradient(180deg, #ffb347, #f06400);
}
.box .body {
  height: 58%; margin-top: 4%; border-radius: 6rpx 6rpx 12rpx 12rpx;
  background: linear-gradient(180deg, #ffd08a, #e88920);
  box-shadow: 0 6rpx 10rpx rgba(18,24,38,.12);
}
.ribbon-v {
  position: absolute; left: 46%; top: 8%; width: 10%; height: 78%;
  background: #c23a2a; border-radius: 4rpx;
}
.ribbon-h {
  position: absolute; left: 12%; top: 36%; width: 76%; height: 10%;
  background: #c23a2a; border-radius: 4rpx;
}
.shoe .sole {
  position: absolute; left: 8%; right: 8%; bottom: 12%; height: 22%;
  border-radius: 40rpx; background: #245bdb;
}
.shoe .vamp {
  position: absolute; left: 18%; right: 22%; bottom: 28%; height: 42%;
  border-radius: 40rpx 60rpx 20rpx 30rpx;
  background: linear-gradient(135deg, #8ebeff, #245bdb);
}
.shoe .lace {
  position: absolute; left: 36%; top: 28%; width: 28%; height: 8%;
  border-radius: 8rpx; background: #fff;
}
.people .p {
  position: absolute; bottom: 14%; width: 34%; height: 58%;
  border-radius: 40rpx 40rpx 16rpx 16rpx;
  background: linear-gradient(180deg, #ffd76a, #f06400);
}
.people .p.a { left: 12%; }
.people .p.b { right: 12%; background: linear-gradient(180deg, #8ebeff, #245bdb); }
.people .spark {
  position: absolute; left: 42%; top: 18%; width: 16%; height: 16%;
  border-radius: 50%; background: #8ef0c0;
  box-shadow: 0 0 12rpx #1fbf73;
}
.cal-top {
  height: 18%; border-radius: 10rpx 10rpx 0 0; background: #c23a2a;
}
.cal-sheet {
  height: 70%; border-radius: 0 0 12rpx 12rpx; background: #fff;
  box-shadow: 0 6rpx 12rpx rgba(18,24,38,.12); border: 2rpx solid #e6e8ee;
}
.cal-coin {
  position: absolute; left: 30%; top: 40%; width: 40%; height: 36%;
  border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ffe08a, #f5b942 55%, #c8880a);
  box-shadow: 0 4rpx 0 #c8880a;
}
.fan .blade {
  position: absolute; left: 8%; top: 8%; width: 78%; height: 62%;
  border-radius: 50% 50% 8% 8%;
  background: linear-gradient(135deg, #ffb4a0, #c23a2a);
  box-shadow: 0 8rpx 14rpx rgba(18,24,38,.16);
}
.fan .stick {
  position: absolute; left: 46%; top: 58%; width: 8%; height: 36%;
  border-radius: 8rpx; background: #8b5a2b;
}
.bag .handle {
  position: absolute; left: 22%; top: 4%; width: 56%; height: 28%;
  border: 6rpx solid #245bdb; border-bottom: none; border-radius: 40rpx 40rpx 0 0;
}
.bag .bag-body {
  position: absolute; left: 12%; top: 28%; width: 76%; height: 58%;
  border-radius: 8rpx 8rpx 16rpx 16rpx;
  background: linear-gradient(180deg, #6ea8ff, #245bdb);
  box-shadow: 0 8rpx 14rpx rgba(18,24,38,.16);
}
.coin {
  border-radius: 50%;
  background: radial-gradient(circle at 32% 28%, #ffe9a8, #f5b942 48%, #c8880a);
  box-shadow: 0 6rpx 0 #a87308, 0 10rpx 16rpx rgba(18,24,38,.18);
}
.coin .rim {
  position: absolute; inset: 10%; border-radius: 50%; border: 3rpx solid rgba(160,100,0,.35);
}
.coin .bolt {
  position: absolute; left: 42%; top: 30%; width: 16%; height: 40%;
  background: #fff6d6; border-radius: 4rpx;
  box-shadow: 8rpx 10rpx 0 #fff6d6;
}
.chest .c-lid {
  height: 32%; border-radius: 12rpx 12rpx 4rpx 4rpx;
  background: linear-gradient(180deg, #d4a24a, #8b5a2b);
}
.chest .c-body {
  height: 52%; margin-top: 4%; border-radius: 6rpx 6rpx 14rpx 14rpx;
  background: linear-gradient(180deg, #c8880a, #6b3f12);
  box-shadow: 0 6rpx 12rpx rgba(18,24,38,.18);
}
.chest .c-lock {
  position: absolute; left: 42%; top: 42%; width: 16%; height: 16%;
  border-radius: 50%; background: #f5b942;
}
.can-rim {
  height: 12%; margin: 0 18%; border-radius: 8rpx; background: #c0c6d0;
}
.can-glass {
  height: 78%; margin: 2% 16% 0; border-radius: 0 0 28rpx 28rpx;
  background: rgba(255,255,255,.55); border: 3rpx solid rgba(255,255,255,.8);
  overflow: hidden; box-shadow: 0 10rpx 18rpx rgba(36,91,219,.25);
}
.liquid {
  position: absolute; left: 0; right: 0; bottom: 0; height: 62%;
  background: linear-gradient(180deg, #8ef0c0, #1fbf73);
}
</style>
