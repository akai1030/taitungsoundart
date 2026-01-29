# 專案開發規格書 (SPEC.md) - Sound Art Edition
## 1. 核心技術棧
- **Framework**: Nuxt 3 (Stable)
- **Visual Engine**: TresJS (Three.js for Vue) + Custom GLSL Shaders
- **Audio Engine**: Tone.js (Interactive Music Generation)
- **Animation**: GSAP + Lenis
- **State**: XState + @xstate/vue
- **Recording**: MediaRecorder API + MP4 Muxer (Client-side encoding)
- **Data**: Directus SDK + TanStack Query
- **Styling**: Vanilla CSS (BEM) + SCSS (Global Injection)

## 2. 關鍵架構
- **SPA Flow**: Intro -> Play (Record) -> Review (Frame) -> Export.
- **Performance**: Strict Parallel Loading.
- **Audio**: User interaction required to start AudioContext.

## 3. 快取策略
- **Dev**: 關閉積極快取。
- **Prod**: 使用 ISR + Strict Headers。
