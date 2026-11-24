# Design — 抽奖营销台

<!-- impeccable:design from built Stage+Console Blue Ledger · 2026-11-24 -->

## Genre / Mode

Operate desk (Stage+Console) with Persuade login landing. Brief-pinned **blue-white**.

## Structure (seed 94d89932 · grounded #4)

- Hub = inventory + create composer
- Event desk centers a dark **control stage**; sticky toolbar owns「打开大屏」
- Jump: create → 奖项 tab；无奖项时 next-step banner → 去配奖；列表按是否已配奖切换 CTA

## Palette

- Paper: `#f3f6fb` / `#e8eef8` / `#ffffff`
- Ink: `#0b1526` / muted `#5a6b82`
- Accent (cobalt): `#2563eb` → hover `#1d4ed8` · soft `#eff6ff`
- Stage: `#0b1526` with cobalt radial wash
- Rule: `#d5deec`

## Typography

- Display & body: Noto Sans SC
- Mono: IBM Plex Mono (codes / badges)

## Layout & scale

- Rail 248px with user card + `aria-current` nav
- Controls: sm 36 / default 44 / lg 52
- Panels: 16px radius, light panel shadow
- Login: offer + checklist left, sticky auth card right
- Hub: page head CTA · stats · accent composer · session list
- Desk tabs: underline selected (not segmented pills)

## Components

- Primary / ghost / danger + size variants
- Composer: accent-bordered create block
- Next-step banner when prizes empty
- Control stage: min-height ~300px, lg pill actions

## Motion

160ms ease-out on interactive states only.
