# Design — 全民优享

A locked design system for this mini-program. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the system grows.

## Genre
playful — soft surfaces, low-chroma colour, friendly-but-restrained type. Young women 16–28,
碎片时间, 低思考成本闭环. Never childish, never quirk-for-quirk.

## Theme — Soft Cream + Dusty Rose
Anchored on warm cream paper + a single dusty-rose accent. Antique gold reserved for coin and
medal only (the "object feel" the brand wants). No saturated consumer-app pinks, no orange.

- `--paper`        #FBF7F3  warm cream page bg
- `--paper-2`      #FFFFFF  card surface
- `--paper-3`      #F4EDE6  deeper cream inset
- `--ink`          #2B2520  warm near-black, headings
- `--ink-2`        #6E6258  warm grey body
- `--ink-3`        #A89B91  light warm grey, captions
- `--line`         #EAE0D5  warm hairline
- `--accent`       #DB8A8F  dusty rose — primary brand
- `--accent-soft`  #F6E0E1  rose tint bg
- `--accent-deep`  #B56168  pressed
- `--gold`         #C9A36B  antique gold — coin/medal only
- `--mint`         #9DB89A  soft sage — success
- `--lavender`     #B3A4CC  soft lavender — tertiary

## Typography
System font stack (mp-weixin cannot load external fonts). Discipline lives in weight, size,
tracking, line-height — not family choice.

- Display: system stack, weight 700–800, tracking -0.5rpx on ≥44rpx
- Body:    system stack, weight 400, color --ink-2
- Caption: system stack, weight 400, color --ink-3, size 22rpx
- Numerals: tabular-nums everywhere a number reads as data (coins, energy, countdown, stats)

## Spacing — 4pt named scale
Values live in tokens.scss. Pages must use named tokens (`var(--space-md)`), never raw values.

- page-x: 36rpx (page horizontal padding)
- mod-gap: 40rpx (between modules)
- card-pad: 36rpx (card horizontal padding)
- card-pad-y: 40rpx (card vertical padding)

## Radius — unified
- card: 28rpx · card-lg: 32rpx · input: 16rpx · pill: 999rpx · icon: 22rpx
Never mix radii within a page. Icons sit in 22rpx rounded squares, not circles.

## Motion
- Easings: --ease-out cubic-bezier(0.16,1,0.3,1) · --ease-in cubic-bezier(0.7,0,0.84,0)
- Reveal: none on scroll (mini-program, not web). Active state: scale 0.98, 180ms.
- No spring physics. No bounce. No celebratory toasts — silent success.
- Reduced-motion: opacity-only ≤150ms (mp-weixin honours prefers-reduced-motion via system).

## Microinteractions stance
- silent success over celebratory toasts
- optimistic update + Undo over confirmation dialogs
- tap feedback: scale 0.98, no shadow expansion
- hover delay 800ms · focus delay 0ms (web only; mp has no hover)

## CTA voice
- Primary CTA: dusty-rose fill (--accent), white ink, pill 999rpx, height 88rpx, weight 600, 30rpx
- Secondary CTA: transparent, 2rpx --ink border, --ink text, pill 999rpx, height 56–64rpx
- Never gradient fills on CTAs. Never drop-shadow "3D button" effect.
- Pressed state: background --accent-deep, scale 0.98.

## Icon family
2D vector, inline SVG via VIcon.vue. Single stroke weight 3.2, round caps, --ink stroke.
Fills use --accent / --gold / --mint / --lavender at full chroma but small footprint.
Icon containers: 22rpx rounded square, --accent-soft / --gold-soft / --mint-soft / --lavender-soft bg.
Never circular icon containers (except the avatar). Never 3D gloss.

## Per-page allowances
- All five tabs share the system. No theme rotation across tabs.
- Home: dashboard hero (energy number + progress ring + can thumbnail)
- Mall: shelf grid, cream paper, rose price tags
- Festival: editorial hero, warm cream, gold seal
- Energy: stage hero (can illustration), cream paper, gold coins
- Mine: cream + rose hero (no gradient), medal, icon menu rows

## What pages MUST share
- The wordmark / brand mark
- The dusty-rose accent and its placement (≤5% per viewport)
- The system font stack, weight discipline, numeral tabular-nums
- The CTA voice (pill shape, rose fill, no gradient)
- Card radius 28rpx, card padding 36rpx, module gap 40rpx
- Icon containers: 22rpx rounded square, soft-tint bg

## What pages MAY differ on
- Hero archetype per tab (dashboard / shelf / editorial / stage / profile)
- Module ordering within the page (config-driven via fallback.json / CMS)

## Exports
See tokens.scss for the canonical token block. Mini-program context: hex values (not OKLCH),
system fonts (not Google Fonts), rpx units (not rem). The discipline is identical; the units adapt.
