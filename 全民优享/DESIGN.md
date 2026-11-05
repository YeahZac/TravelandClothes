---
name: 全民优享
description: 蓝场充能的日活机台 — Utility Charge Arcade
colors:
  charge-blue: "#2d6bff"
  charge-blue-deep: "#1a4fd4"
  charge-blue-ledge: "#153db0"
  sky-rim: "#9ec4ff"
  sky-mid: "#d7e8ff"
  sky-soft: "#eef5ff"
  sheet-cool: "#f4f8ff"
  brand-navy: "#102448"
  ink: "#1a2233"
  mute: "#6b7a94"
  white: "#ffffff"
  coin-orange: "#ff6a00"
  coin-gold: "#ffbf1a"
  checkin-gold-top: "#ffd76a"
  checkin-gold-bot: "#ff9a1a"
  orange-cta-top: "#ffc34d"
  orange-cta-bot: "#ff5a00"
  orange-ledge: "#e04e00"
  mint: "#2bd67b"
  mint-top: "#5ef0b0"
  mint-ledge: "#1aa85c"
  ghost-fill: "#eaf1ff"
  done-fill: "#e8edf7"
  tag-warm: "#fff3e0"
  line: "rgba(26, 34, 51, 0.07)"
  tab-idle: "#8B93A7"
  nav-bar: "#E8F1FF"
typography:
  display:
    fontFamily: "PingFang SC, Hiragino Sans GB, Helvetica Neue, sans-serif"
    fontSize: "42rpx"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "normal"
  headline:
    fontFamily: "PingFang SC, Hiragino Sans GB, Helvetica Neue, sans-serif"
    fontSize: "40rpx"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "PingFang SC, Hiragino Sans GB, Helvetica Neue, sans-serif"
    fontSize: "32rpx"
    fontWeight: 800
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "PingFang SC, Hiragino Sans GB, Helvetica Neue, sans-serif"
    fontSize: "28rpx"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "PingFang SC, Hiragino Sans GB, Helvetica Neue, sans-serif"
    fontSize: "22rpx"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
rounded:
  tag: "12rpx"
  card-inner: "20rpx"
  card: "24rpx"
  banner: "28rpx"
  sheet: "36rpx"
  pill: "999rpx"
spacing:
  xs: "8rpx"
  sm: "16rpx"
  md: "24rpx"
  lg: "28rpx"
  xl: "40rpx"
  page-x: "28rpx"
  card-pad: "28rpx"
  btn-h: "80rpx"
  task-cta-h: "56rpx"
  disc: "96rpx"
components:
  button-primary:
    backgroundColor: "linear-gradient(180deg, #ffc34d 0%, #ff7a00 48%, #ff5a00 100%)"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    padding: "0 40rpx"
    height: "{spacing.btn-h}"
    typography: "{typography.body}"
  button-primary-active:
    backgroundColor: "linear-gradient(180deg, #ffc34d 0%, #ff7a00 48%, #ff5a00 100%)"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    padding: "0 40rpx"
    height: "{spacing.btn-h}"
  button-secondary:
    backgroundColor: "linear-gradient(180deg, #6ea0ff 0%, #2d6bff 55%, #1a4fd4 100%)"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    padding: "0 40rpx"
    height: "{spacing.btn-h}"
  button-ghost:
    backgroundColor: "{colors.ghost-fill}"
    textColor: "{colors.charge-blue-deep}"
    rounded: "{rounded.pill}"
    padding: "0 40rpx"
    height: "{spacing.btn-h}"
  button-mint:
    backgroundColor: "linear-gradient(180deg, #5ef0b0 0%, #2bd67b 100%)"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    padding: "0 40rpx"
    height: "{spacing.btn-h}"
  tag-warm:
    backgroundColor: "{colors.tag-warm}"
    textColor: "{colors.coin-orange}"
    rounded: "{rounded.tag}"
    padding: "0 14rpx"
    height: "40rpx"
    typography: "{typography.label}"
  tag-blue:
    backgroundColor: "#e8f0ff"
    textColor: "{colors.charge-blue}"
    rounded: "{rounded.tag}"
    padding: "0 14rpx"
    height: "40rpx"
  card-surface:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-pad}"
  sheet-surface:
    backgroundColor: "{colors.sheet-cool}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "{spacing.card-pad}"
  task-cta:
    backgroundColor: "linear-gradient(180deg, #6ea0ff, #2d6bff)"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    padding: "0 24rpx"
    height: "{spacing.task-cta-h}"
  task-cta-claim:
    backgroundColor: "linear-gradient(180deg, #ffc34d, #ff6a00)"
    textColor: "{colors.white}"
    rounded: "{rounded.pill}"
    padding: "0 24rpx"
    height: "{spacing.task-cta-h}"
  task-cta-done:
    backgroundColor: "{colors.done-fill}"
    textColor: "{colors.mute}"
    rounded: "{rounded.pill}"
    padding: "0 24rpx"
    height: "{spacing.task-cta-h}"
  tab-bar:
    backgroundColor: "{colors.white}"
    textColor: "{colors.tab-idle}"
    height: "auto"
---

# Design System: 全民优享

## Overview

**Creative North Star: "Utility Charge Arcade"**

全民优享的视觉世界是一台蓝场充能日活机台：天空蓝舞台托住资产与 Banner，白/冷白纸面承载签到、任务与列表，金币橙与金签到圆点把「换钱感」钉死在奖励语法上。它是运营向的充电/步数兑礼机台，不是软粉 AI 卡片墙，也不是文旅官网叙事站。

气质偏密、偏硬、偏玩具机台：3D 立体按钮（色阶 + 底边 ledge）、高光圆盘金刚区、清晰数字资产条。Operate 模式优先扫读与点按；品牌落在蓝顶、金币数字、橙色主 CTA，而不是大段营销文案。

确认拒绝：紫粉渐变 AI 卡片墙、奶油衬线编辑风、扁平幽灵边框「高级感」、无阴影无 ledge 的软按钮、把首屏做成内容杂志或仪表盘。

**Key Characteristics:**
- Sky stage → white/cool sheet：上蓝下白的舞台分层
- Gold coin + orange CTA：奖励与主行动永远同色族
- Glossy disc icons：圆形金刚入口，不做方卡 icon 墙
- Arcade ledge buttons：色阶按钮带实体底边，按下下沉
- 7-day gold check-in：金签到圆点是首页签名件

## Colors

机台调色：充能蓝做舞台与次行动，金币橙做奖励与主 CTA，冷白纸面托任务，墨色只做信息。

### Primary
- **Charge Blue** (`#2d6bff`): 舞台强调、Tab 选中、次级 CTA、今日签到高亮环、链接。源 token `$yx-blue`。
- **Charge Blue Deep** (`#1a4fd4`): 蓝按钮底部色阶与 ledge 相关深色。
- **Charge Blue Ledge** (`#153db0`): 蓝按钮实体底边。

### Secondary
- **Coin Orange** (`#ff6a00`): 金币数字、奖励文案、Banner 指示点、限时倒计时、暖标签字色。源 `$yx-orange`。
- **Coin Gold** (`#ffbf1a`): 金币材质高光参考；签到完成态用 `#ffd76a`→`#ff9a1a` 金渐变。
- **Orange CTA Top/Bot** (`#ffc34d` / `#ff5a00`) + **Orange Ledge** (`#e04e00`): 主按钮「立即签到 / 立即领取」的色阶与底边。

### Tertiary
- **Mint Charge** (`#2bd67b` / top `#5ef0b0`): 正向完成、成功态、部分 Banner tone；ledge `#1aa85c`。
- **Hot Tag** (`linear-gradient(90deg, #ff7a4d, #ff3d5a)`): 限时开兑等紧急角标，稀用。

### Neutral
- **Sky Rim / Mid / Soft** (`#9ec4ff` / `#d7e8ff` / `#eef5ff`): 页面纵向天空渐变与 page 底色。
- **Sheet Cool** (`#f4f8ff`): 白纸面上一层的冷白 sheet，承接签到与列表。
- **White** (`#ffffff`): 卡片与 Tab 底。
- **Brand Navy** (`#102448`): 蓝顶上的品牌字与页标题。
- **Ink** (`#1a2233`): 正文与区块标题。
- **Mute** (`#6b7a94`): 辅助说明。
- **Line** (`rgba(26, 34, 51, 0.07)`): 列表分割；更淡 `0.06` 亦见。
- **Ghost / Done Fill** (`#eaf1ff` / `#e8edf7`): 幽灵按钮与已完成态。
- **Nav Bar / Tab Idle** (`#E8F1FF` / `#8B93A7`): 系统导航与底栏未选中。

### Named Rules
**The Arcade Dual Rule.** 主行动用橙金 CTA；次行动/导航用充能蓝。不要用第三种高饱和色抢 CTA。

**The Coin Voice Rule.** 一切可感「钱/奖」的数字与标签用 Coin Orange（或金签到渐变），不要改成中性灰或品牌蓝。

## Typography

**Display Font:** PingFang SC（Hiragino Sans GB / Helvetica Neue 回退）  
**Body Font:** 同上（系统无衬线；小程序不引入自定义 webfont）  
**Label/Mono Font:** 同族；倒计时用 `tabular-nums`

**Character:** 粗短有力的运营黑体感——800 字重标题、700 正文，无衬线、无装饰字距；数字资产要一眼可读。

### Hierarchy
- **Display** (800, 42rpx): 首页品牌「全民优享」。
- **Headline** (800, 40rpx): 能量罐等页标题。
- **Title** (800, 32rpx): 区块标题（`.yx-section-title`）、签到条标题。
- **Body** (700, 28rpx; page 默认 28rpx / 1.4): 任务名、列表主文、按钮字 30rpx/700。
- **Label** (600–700, 18–24rpx): 口号、静音说明、金刚名、签到日标、标签 20rpx/700。

### Named Rules
**The Heavy Scan Rule.** 可点可领的文案保持 700–800；Mute 只承担说明，不承担主信息。

## Layout

手机单列 Operate 布局（uni-app 小程序）。水平节奏统一 `28rpx` page-x；区块纵向 gap 约 `24rpx`；卡片内边距 `28rpx`。

首屏固定语法（首页）：蓝顶资产条（品牌 + 金币/能量胶囊）→ Banner swiper（高约 200rpx）→ 冷白 sheet（圆角 36rpx 顶）内依次为 7 日金签、3 列圆形金刚、可选限时开兑条、白卡片任务/活动列表。底栏五席固定：首页 / 商城 / 汉服节 / 能量罐 / 我的。

能量罐页：蓝顶 + 中央充能舞台（约 460rpx）+ 冷白 sheet 任务区。商城/兑礼等二级页沿用冷白底与白卡，导航条 `#E8F1FF`。

无桌面多栏；rpx 为规范单位（约 2rpx ≈ 1px @375 宽）。

### Named Rules
**The Stage-then-Sheet Rule.** 可操作内容落在 sheet/白卡上；蓝顶只放品牌、资产与英雄舞台，不堆长列表。

## Elevation & Depth

混合深度：浅蓝 tint 阴影托起白卡，arcade ledge（实体底边）让按钮像机台键，drop-shadow 托住金币与圆盘图标。不是 Material  elev 阶梯，也不是纯扁平。

### Shadow Vocabulary
- **Card lift** (`0 10rpx 28rpx rgba(26, 79, 212, 0.08)`): 白卡片、签到条、区块。
- **Sheet lift** (`0 -10rpx 30rpx rgba(45, 107, 255, 0.08)`): sheet 上沿。
- **Banner lift** (`0 14rpx 28rpx rgba(26, 79, 212, 0.22)`): Banner 卡片。
- **Wallet glass** (`0 8rpx 20rpx rgba(26, 79, 212, 0.12)` + 半透白底): 资产胶囊。
- **Orange ledge** (`0 10rpx 0 #e04e00` + `0 14rpx 24rpx rgba(255, 106, 0, 0.35)`): 主 CTA；active 时 ledge 变矮并 `translateY(4rpx)`。
- **Blue ledge** (`0 8rpx 0 #153db0` + 蓝光阴影): 次 CTA / 任务「去完成」。
- **Gold day ledge** (`0 6rpx 0 #e07a00` + 金光): 已签到日圆点。
- **Modal depth** (`0 24rpx 60rpx rgba(0, 0, 0, 0.28)` + 遮罩 `rgba(12, 28, 64, 0.62)`): 领奖弹层。
- **Icon gloss** (`drop-shadow` 蓝或橙): 金刚盘、电池、金币。

### Named Rules
**The Ledge Affordance Rule.** 可点主按钮必须有色阶 + 底边；按下缩短 ledge。幽灵/已完成态去掉 ledge。

## Shapes

圆角偏玩具机台：卡片 24rpx，Banner 28rpx，sheet 顶 36rpx，标签 12rpx，按钮与资产胶囊全 pill（999rpx）。签到日与金刚入口为正圆/圆盘；任务 CTA 为小 pill。分割线用淡 ink 线，不用重描边框。

### Named Rules
**The Disc Not Tile Rule.** 首页快捷入口用圆形 glossy disc（约 96rpx），不要改成圆角方卡 icon 栅格。

## Components

### Buttons
- **Shape:** 全宽或 inline pill（999rpx），高 80rpx，字 30rpx/700。
- **Primary (orange arcade):** 金→橙竖向渐变 + 橙 ledge + 轻 text-shadow；active 下沉。用于签到、领奖确认。
- **Secondary (blue arcade):** 浅蓝→深蓝渐变 + 蓝 ledge。用于次要行动与任务「去完成」。
- **Claim:** 任务条上的橙小 pill（高 56rpx），同橙 ledge。
- **Ghost / Done:** `#eaf1ff` 字深蓝，或 `#e8edf7` 字 mute，无 ledge。
- **Mint:** 成功/正向强调，绿 ledge。

### Chips / Tags
- **Warm:** `#fff3e0` 底 + 橙字；**Blue:** `#e8f0ff` + 充能蓝；**Hot:** 红橙渐变白字，限时场景。

### Cards / Containers
- **Corner:** 24rpx（内嵌热区 20rpx）。
- **Background:** 白卡；sheet 用 `#f4f8ff`。
- **Shadow:** Card lift / Sheet lift。
- **Internal Padding:** 28rpx。

### Inputs / Fields
- 当前 mock 阶段无统一表单控件库；新表单应对齐白底、24rpx 圆角、charge-blue 焦点，避免重描边。

### Navigation
- **Custom 蓝顶页：** 品牌/标题左，资产胶囊右；字 Brand Navy。
- **系统导航条：** 背景 `#E8F1FF`，黑字。
- **Tab Bar：** 白底，未选 `#8B93A7`，选中 `#2F6BFF`（≈ charge-blue），五席文案固定。

### Checkin Strip（签名件）
白卡内 7 日圆点：未签灰圆 `#edf2fb`；已签金渐变 + 金 ledge；今日蓝渐变 + 外环光晕；第 7 日宝箱图。底部全宽橙 CTA 或幽灵「今日已签到」。

### Quick Disc Grid（签名件）
3 列圆形 96rpx 图标 + 22rpx/700 标签；图标带蓝 drop-shadow。

### Energy Can Stage（签名件）
中央电池图 bob 动画 + 漂浮金币；百分比 48rpx/800；可选半透 hint pill。

### Reward Popup（签名件）
深蓝遮罩；奶油顶→白底面板 36rpx；大金币 + 橙金额；全宽橙 CTA；入场 `pop` 弹性缩放。

### Task Row
左 glossy 任务图标，中标题+橙奖励+mute 说明，右状态 pill（蓝去完成 / 橙领取 / 灰已完成）。

## Do's and Don'ts

### Do:
- **Do** 保持 Sky stage → cool sheet → white card 的分层，首页首屏含资产条、Banner、7 日金签、圆盘金刚。
- **Do** 主 CTA 用橙金 arcade 渐变 + `#e04e00` ledge；次 CTA 用充能蓝 + 蓝 ledge。
- **Do** 金币/积分/倒计时等奖励数字用 Coin Orange，字重 800。
- **Do** 快捷入口用圆形 glossy disc，签到用金/蓝圆点语法。
- **Do** 新页面复用 `.yx-page` / `.yx-card` / `.yx-btn-*` / `.yx-tag*`，单位用 rpx。

### Don't:
- **Don't** 做成软粉/紫系 AI 卡片墙或奶油衬线编辑风。
- **Don't** 去掉按钮 ledge 做成扁平幽灵主按钮。
- **Don't** 把金刚区改成方卡或多行统计仪表盘。
- **Don't** 用可提现红包绿或第三套高饱和主色替换橙金奖励语法。
- **Don't** 在蓝顶堆长列表或把商城/汉服节视觉逻辑反客为主改掉账户充能引擎气质。
