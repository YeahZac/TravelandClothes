# Design — 抽奖营销台

<!-- impeccable:design from built Blue Ledger · 2026-11-23 -->

## Genre / Mode

Operate desk with Persuade login landing. Brief-pinned **blue-white minimal**.

## Palette

- Paper: `#f5f8fc` / `#eef3f9` / `#ffffff`
- Ink: `#0f1b2d` / muted `#5b6b7f`
- Accent (cobalt): `#2563eb` · ink on accent `#ffffff`
- Rule: `#d7e2f0`

## Typography

- Display & body: Noto Sans SC
- Mono: IBM Plex Mono (labels / pills only)

## Layout

- Login: two-column SEO pitch + sticky auth card; mobile stacks pitch then auth
- Console: left rail + main workbench
- Code row: input +「获取验证码」always same horizontal row

## Components

- Primary button: filled cobalt, 46px control height
- Ghost button: white + rule border
- Tabs: segmented control on paper-2
- Panels: white, 1px rule, 12px radius, no decorative shadows excess

## Motion

Minimal state transitions only (160ms ease-out). No page-load choreography.
