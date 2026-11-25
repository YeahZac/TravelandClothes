# 001 — Gala screen: vertical reel draw + clean result (no box art)

- **Status**: DONE
- **Commit**: `99cd657`
- **Severity**: HIGH
- **Category**: Purpose & frequency · Physicality · Cohesion · Missed opportunities
- **Estimated scope**: 1 file (`traffic-cms/public/gala-screen/index.html`), CSS + `slotHtml` / `renderBlueSlots` / `renderCrowd` / roll timer; stamp bump in same file + `traffic-cms/src/server.js` `codeStamp`

## Problem

PC 年会大屏抽奖三段 UE 混在一套 Y 轴翻转盲盒里，和产品意图冲突：

1. **待开奖**应保持现状（闭合盲盒 `box-closed.png`）——不要动。
2. **进行中**每 540ms 整卡 `rotateY` 重播 `boxFold`，看起来「来回转」，不是老虎机式上下翻头像+姓名；且滚动态仍挂在 3D 翻面结构上。
3. **揭晓**叠 `box-result.png`（橙盒+光效），头像被素材压住，观感差；产品要求揭晓**不要任何装饰素材**，只呈现中奖者头像 + 姓名/昵称。

Evidence（`99cd657`）：

```css
/* traffic-cms/public/gala-screen/index.html:339 — current rolling */
.slot.rolling .slot-flip {
  transition: none;
  animation: boxFold 0.48s cubic-bezier(0.45, 0.05, 0.55, 0.95);
}
@keyframes boxFold {
  0% { transform: rotateY(0deg) scale(1); }
  42% { transform: rotateY(92deg) scale(0.9); }
  100% { transform: rotateY(180deg) scale(1); }
}
```

```javascript
/* traffic-cms/public/gala-screen/index.html:1197 — current result still uses box-result.png */
back = `<div class="slot-face slot-face-back">
  <img class="box-art" src="./assets/box-result.png" alt="" />
  <img class="who" src="..." />
  <div class="label">...</div>
</div>`
```

```javascript
/* traffic-cms/public/gala-screen/index.html:1147 — flip-paced timer */
rollTimer = setTimeout(tick, 540)
```

Why it matters: 开奖是稀有高情绪时刻，允许更长动效预算；但错误的「每 tick 整卡翻面」会让主持人和观众眩晕，揭晓素材又盖住唯一该记住的信息（人是谁）。

## Target

### A. 待开奖（standby）— 零视觉 diff

- 继续用 `slotHtml({ state: 'standby' })`：仅正面 `./assets/box-closed.png`。
- **禁止**改 standby 的尺寸、阴影、素材路径或入场方式（可保留现有 `stage-in` 淡入）。

### B. 进行中（rolling）— 上下翻滚，无盲盒、无 Y 翻转

结构目标（每槽一个「视窗」，内部卡片 `translateY` 进出）：

```html
<div class="slot is-reel">
  <div class="reel-window">
    <div class="reel-card">
      <img class="who who-roll" src="AVATAR" alt="" />
      <div class="label">DISPLAY_NAME</div>
    </div>
  </div>
</div>
```

CSS 目标值（写入同一 `<style>`，复用已有 token）：

```css
.slot.is-reel {
  perspective: none;
  filter: drop-shadow(0 14px 24px oklch(8% 0.05 250 / 0.4));
}
.reel-window {
  position: absolute; inset: 0;
  overflow: hidden;
  border-radius: 22px;
  background: oklch(14% 0.04 250 / 0.55);
  border: 1px solid oklch(70% 0.1 220 / 0.35);
}
.reel-card {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 10px;
  animation: reelY 110ms linear; /* constant motion → linear (AUDIT §2) */
}
.reel-card .who-roll {
  width: 56%; margin-top: 0; border-radius: 18px;
}
@keyframes reelY {
  from { transform: translateY(42%); opacity: 0.4; }
  to   { transform: translateY(0);   opacity: 1; }
}
```

- 滚动态 **不得** 使用 `box-closed.png` / `box-result.png` / `boxFold` / `rotateY`。
- `startAvatarRoll` 的 tick 间隔改为 **`120`**（配合 110ms `reelY`，略重叠一点以保证连续感）。
- 姓名：`displayName(p, '抽取中')`（真实姓名优先，否则微信昵称）——与现逻辑一致。

### C. 揭晓（result）— 纯头像 + 姓名，无任何盒/光素材

```html
<div class="slot is-result reveal-in">
  <div class="result-card">
    <img class="who" src="AVATAR" alt="" />
    <div class="label">
      <span class="nm-primary">真实姓名或昵称</span>
      <!-- 仅当 realName 与 nickName 都有且不同时显示副行 -->
      <small class="nm-secondary">微信昵称</small>
      <!-- 可选奖品名继续用 small -->
    </div>
  </div>
</div>
```

```css
.slot.is-result { perspective: none; }
.result-card {
  position: absolute; inset: 0;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 12px;
  border-radius: 22px;
  background: oklch(16% 0.05 250 / 0.55);
  border: 1px solid oklch(78% 0.08 220 / 0.4);
}
.slot.is-result .who {
  width: 58%; margin-top: 0; border-radius: 50%;
}
.slot.reveal-in .result-card {
  animation: resultIn 280ms var(--ease-out) both;
}
@keyframes resultIn {
  from { transform: translateY(12px) scale(0.96); opacity: 0; }
  to   { transform: none; opacity: 1; }
}
```

- **删除** result 路径对 `./assets/box-result.png` 的引用（`slotHtml` result 分支与 `renderCrowd` 的 `wcard .box-art`）。
- Crowd 揭晓：`wcard` 同样去掉 `box-wrap` / `box-art`，只留圆形头像 + `displayName`（+ 可选奖品行）。
- 入场用 `resultIn`（ease-out ≤300ms），**禁止** `revealFlip` / `rotateY(180deg)`。
- `prefers-reduced-motion: reduce`：`.reel-card, .slot.reveal-in .result-card { animation: none; opacity: 1; transform: none; }`

### D. 清理

- 删除仅被盲盒翻面使用的死代码：`boxFold`、`revealFlip`（若无引用）、`.slot.is-open` / `.slot-flip` 在 rolling/result 上的依赖。Standby 若仍用 flip 壳包一层 front-only 盒图，可保留最小 DOM，但 **rolling/result 不得走 flip**。
- 版本戳：`GALA_SCREEN 2026-11-25-draw-reel-v24`；`traffic-cms/src/server.js` 的 `codeStamp: 'gala-screen-draw-reel-v24'`。

## Repo conventions to follow

- Motion tokens 已在文件顶：`--ease-out: cubic-bezier(0.22, 1, 0.36, 1);`、`--ease-in-out`、`--dur: 220ms`（`index.html:19-21`）。新曲线/时长优先用这些；`reelY` 用 **`linear`**（持续滚动）。
- 姓名：`displayName` 已实现真实姓名优先（`index.html:1171`）；结果副行仅补充不同昵称，不要改优先级。
- 单文件 SPA：改动只落在 `traffic-cms/public/gala-screen/index.html`（+ stamp 的 `server.js`）。
- 弹幕已在非 checkin 关闭——**不要**改弹幕逻辑。

## Steps

1. **CSS**：在 `.slots` 段落后方，新增 `.slot.is-reel` / `.reel-window` / `.reel-card` / `@keyframes reelY` 与 `.slot.is-result` / `.result-card` / `@keyframes resultIn`（值见 Target）。在现有 `@media (prefers-reduced-motion: reduce)` 块内追加 reel/result 禁用位移。
2. **删/停用 rolling 翻面**：去掉 `.slot.rolling .slot-flip { animation: boxFold … }` 与对 rolling 有意义的 `rotateY` 链；`boxFold` keyframes 若无引用则删除。
3. **重写 `slotHtml`**：
   - `standby`：保持现有闭合盒（可继续用 `slot-flip` 仅正面，或等价静态盒），**视觉不变**。
   - `rolling`：输出 Target B 的 reel DOM（无 `box-art`）。
   - `result`：输出 Target C 的 result DOM（无 `box-result.png`）；副行：`realName` 与 `nickName` 皆非空且不相等时才渲染 `nm-secondary`。
4. **`renderCrowd`**：standby 仍用 `box-closed.png`；spinning 改为与 blue 相同的上下翻 `reel-card`（或共享 helper）；result 去掉 `box-art`。
5. **`startAvatarRoll`**：`setTimeout(tick, 120)`（原 540）。
6. **Stamp**：`index.html` 的 `.screen-build` 与 `server.js` `codeStamp` → `…-draw-reel-v24`。
7. 全文检索确认：rolling/result 路径无 `box-result.png`、无 `boxFold`、无 `revealFlip`（standby 可保留 `box-closed.png`）。

## Boundaries

- Do NOT 改待开奖（standby）盲盒外观、尺寸或素材。
- Do NOT 把 `box-result.png` / 光效图重新加回揭晓。
- Do NOT 改签到墙弹幕、孔明灯、ctrl 条文案与抽奖 API。
- Do NOT 改 `全民优享` 小程序或 `gala-admin`。
- Do NOT 新增 npm 依赖或拆文件。
- 若发现 `99cd657` 后文件已漂移（例如 `slotHtml` 签名变了），STOP 并报告，勿臆造第二套结构。

## Verification

- **Mechanical**：
  - `rg -n "box-result|boxFold|revealFlip" traffic-cms/public/gala-screen/index.html` → rolling/result 相关应为 0；`box-closed` 仅出现在 standby/crowd 待机。
  - `rg -n "reelY|is-reel|resultIn|draw-reel-v24" traffic-cms/public/gala-screen/index.html traffic-cms/src/server.js` 均有命中。
- **Feel check**（大屏页 / 开发者工具）：
  1. 进入待开奖：闭合橙粉盲盒与改前一致，**不闪、不翻**。
  2. 点「开始抽奖」：盒消失，槽内头像+姓名 **自下而上**连续滚；无左右翻面、无盒素材。
  3. 点「停止抽奖」：滚停 → 干净头像卡（可有轻 `translateY(12px)+scale(0.96)` 入场），**无**橙盒/紫光；姓名为真实姓名优先，有独立昵称时副行可见。
  4. Animations 面板 10% 速度：确认 `reelY` 为竖直位移而非 `rotateY`；揭晓单次 `resultIn` ≤300ms 量级。
  5. Rendering → `prefers-reduced-motion: reduce`：滚动无位移，直接切帧；揭晓无位移动画但仍显示结果。
- **Done when**：三段 UE 符合「待机不变 / 滚动上下翻头像名 / 揭晓无素材纯人像」，戳为 `v24`，且抽奖过程中槽位不再 Y 轴来回转。
