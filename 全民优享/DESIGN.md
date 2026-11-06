# Design — 全民优享

A locked design system for this mini-program. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the system grows.

## Genre
playful — soft surfaces, low-chroma colour, friendly-but-restrained type. Young women 16–28,
碎片时间, 低思考成本闭环. Never childish, never quirk-for-quirk.

## Theme — Brand Magenta (restrained) + Cream + Sage (V3.3)
Anchored on warm cream paper. Brand magenta `#D83068` is a **CTA accent only**, not a
fill-the-UI colour. Sage carries growth/energy; gold carries coin/medal; ink carries
chrome (tab, default icons, body).

- `--paper`        #FBF8F4  warm cream page bg
- `--paper-2`      #FFFFFF  card surface
- `--paper-3`      #F4EDE6  deeper cream inset
- `--ink`          #2B2520  warm near-black — headings + tab selected
- `--ink-2`        #6E6258  body + default icon stroke
- `--ink-3`        #A89B91  captions + tab idle
- `--line`         #EAE0D5  warm hairline
- `--accent`       #D83068  brand magenta — **primary CTA fill only**
- `--accent-soft`  #FCE8F0  rare tint (≤1 soft chip per viewport)
- `--accent-deep`  #B01F52  CTA pressed
- `--accent-text`  #C0285A  rare text accent (price / "去完成"), never body
- `--sage`         #7FA67A  growth / energy / progress ring
- `--sage-soft`    #E8EFE2
- `--gold`         #C9A36B  coin · medal · day-7 reward — **never magenta**
- `--lavender`     #9B8FBF  tertiary icon tint

## Accent discipline (hard)
Magenta is expensive. Budget ≤5% of any viewport, almost always as a filled pill button.

| Surface | Colour |
| --- | --- |
| Primary CTA (签到 / 领取 / 去完成 / 确认) | `--accent` fill |
| Progress ring / energy growth | `--sage` |
| Coin / medal / 金币 float | `--gold` |
| Functional icons (bell, spark, grid, menu) | `--ink-2` or tone rotation sage/gold/lavender |
| Tab bar selected icon + label | `--ink` (#2B2520) |
| Tab bar idle | `--ink-3` |
| Body / heading text | `--ink` / `--ink-2` — never magenta |

Forbidden: magenta coin · magenta tab icons · magenta as VIcon default · magenta icon-grid wash.

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
- Primary CTA: brand-magenta fill (--accent), white ink, pill 999rpx, height 88rpx, weight 600, 30rpx
- Secondary CTA: transparent, 2rpx --ink border, --ink text, pill 999rpx, height 56–64rpx
- Never gradient fills on CTAs. Never drop-shadow "3D button" effect.
- Pressed state: background --accent-deep, scale 0.98.

## Icon family
2D vector, inline SVG via VIcon.vue. Single stroke weight 3.2, round caps, default `--ink-2`.
Fills use `--gold` / `--sage` / `--lavender` only — **not** `--accent`.
Icon containers: 22rpx rounded square, soft-tint bg matching the fill family (gold-soft / sage-soft / lavender-soft / paper-3). Never `--accent-soft` as a grid wash.
Tab icons: simplified monoline PNG, ink selected / ink-3 idle — never brand magenta.
Never circular icon containers (except the avatar). Never 3D gloss. **Never PNG coin —
use VIcon vector coin with `--gold`.**

## Per-page allowances
- All five tabs share the system. No theme rotation across tabs.
- Home: dashboard hero (energy number + progress ring + can thumbnail)
- Mall: shelf grid, cream paper; price may use accent-text sparingly
- Festival: editorial hero, warm cream, gold seal
- Energy: stage hero, cream paper, gold coins, sage actions
- Mine: cream hero, gold medal, ink/sage menu icons

## What pages MUST share
- The wordmark / brand mark (LOGO circle — the only large magenta surface besides CTAs)
- Accent discipline above (magenta = CTA, not chrome)
- The system font stack, weight discipline, numeral tabular-nums
- The CTA voice (pill shape, magenta fill, no gradient)
- Card radius 28rpx, card padding 36rpx, module gap 40rpx
- Icon containers: 22rpx rounded square, soft-tint bg

## What pages MAY differ on
- Hero archetype per tab (dashboard / shelf / editorial / stage / profile)
- Module ordering within the page (config-driven via fallback.json / CMS)

## Exports
See tokens.scss for the canonical token block. Mini-program context: hex values (not OKLCH),
system fonts (not Google Fonts), rpx units (not rem). The discipline is identical; the units adapt.
