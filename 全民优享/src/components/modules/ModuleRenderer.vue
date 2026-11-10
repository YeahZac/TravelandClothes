<template>
  <view class="yx-mod" v-if="mod && mod.type">
    <BannerSwiper v-if="mod.type === 'banner_swiper'" :mod="mod" />
    <CheckinStripMod v-else-if="mod.type === 'checkin_strip'" :mod="mod" />
    <QuickGrid v-else-if="mod.type === 'quick_grid'" :mod="mod" />
    <FlashRedeemBar v-else-if="mod.type === 'flash_redeem' || mod.type === 'countdown_bar'" :mod="mod" />
    <ActivityTicker v-else-if="mod.type === 'activity_ticker'" :mod="mod" />
    <ContentFeed v-else-if="mod.type === 'content_feed'" :mod="mod" />
    <EnergyHero v-else-if="mod.type === 'energy_hero'" :mod="mod" />
    <TaskListMod v-else-if="mod.type === 'task_list'" :mod="mod" />
    <HotGrid v-else-if="mod.type === 'hot_grid'" :mod="mod" />
    <GoodsGrid v-else-if="mod.type === 'goods_grid'" :mod="mod" />
    <FestivalHero v-else-if="mod.type === 'festival_hero'" :mod="mod" />
    <TicketList v-else-if="mod.type === 'ticket_list'" :mod="mod" />
    <MenuGroup v-else-if="mod.type === 'menu_group'" :mod="mod" />
    <RichTextMod v-else-if="mod.type === 'rich_text'" :mod="mod" />
    <ShareBarMod v-else-if="mod.type === 'share_bar'" :mod="mod" />
  </view>
</template>

<script setup>
import BannerSwiper from './BannerSwiper.vue'
import CheckinStripMod from './CheckinStripMod.vue'
import QuickGrid from './QuickGrid.vue'
import FlashRedeemBar from './FlashRedeemBar.vue'
import ActivityTicker from './ActivityTicker.vue'
import ContentFeed from './ContentFeed.vue'
import EnergyHero from './EnergyHero.vue'
import TaskListMod from './TaskListMod.vue'
import HotGrid from './HotGrid.vue'
import GoodsGrid from './GoodsGrid.vue'
import FestivalHero from './FestivalHero.vue'
import TicketList from './TicketList.vue'
import MenuGroup from './MenuGroup.vue'
import RichTextMod from './RichTextMod.vue'
import ShareBarMod from './ShareBarMod.vue'

defineProps({ mod: { type: Object, required: true } })
</script>

<style scoped>
.yx-mod {
  margin-bottom: 48rpx;
}
.yx-mod:last-child {
  margin-bottom: 0;
}
</style>
