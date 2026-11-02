# Custom Modules — Architecture Overview

## Purpose

This project is a **fork of [stablyai/orca](https://github.com/stablyai/orca)**. We regularly
merge upstream to stay current. Custom modules add features (hero banner, pomodoro timer, etc.)
that live **entirely outside upstream code** so merges stay conflict-free.

## Core Principle

> **Upstream code is never edited beyond trivially re-injectable one-liners.**
>
> All custom logic lives in `src/custom-modules/`. Upstream files receive at most
> 2-3 added lines that import from this directory. After any merge conflict,
> a single script re-applies those lines.

## Directory Layout

```
src/custom-modules/
├── docs/                          ← You are here. Documentation for AI agents & humans.
│   ├── ARCHITECTURE.md            ← This file — overall design.
│   ├── UPSTREAM-SYNC.md           ← Step-by-step merge workflow.
│   ├── HERO-MODULE.md             ← Hero banner internals.
│   └── ADDING-MODULES.md          ← How to add a new custom module.
│
├── MainWindowHero.tsx             ← Bridge file. The ONE thing upstream imports.
│                                     Lazy-loads hero/PetHeroBanner with Suspense.
│
├── inject-custom-modules.sh       ← Idempotent script. Adds our lines to upstream
│                                     files if missing. Safe to run anytime.
│
└── hero/                          ← Hero banner + pomodoro module.
    ├── PetHeroBanner.tsx          ← Main hero component.
    ├── pet-hero.css               ← All hero styling (animations, layout, responsive).
    ├── motto-store.ts             ← Zustand store for editable motto (localStorage).
    ├── panel.tsx                  ← Pomodoro sidebar panel (timer ring + controls).
    └── renderer/.../
        └── pomodoro-timer-store.ts ← Zustand store for pomodoro countdown logic.
```

## Upstream Touch Points

Only **2 files** and **3 lines** of upstream are modified:

### 1. `src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx`

```tsx
// Line added at imports:
import { MainWindowHero } from '../../../../custom-modules/MainWindowHero'

// Line added after the 4px drag strip:
;<MainWindowHero worktreeId={worktreeId} />
```

**Why this file?** `TabGroupSplitLayout` is the top-level component that wraps every
active workspace's editor/terminal area. The hero renders between the drag strip and
the tab group tree, making it visible in every workspace.

### 2. `src/renderer/src/assets/main.css`

```css
@import '../../../custom-modules/hero/pet-hero.css';
```

**Why?** CSS must be imported at the app stylesheet level. The hero's styles use Orca's
CSS custom properties (`--foreground`, `--border`, etc.) so they auto-adapt to themes.

### 3. Asset files in `resources/`

```
resources/cat-playing.svg
resources/cat-watermelon.svg
resources/cat-dance.svg
resources/mountain-landscape-transparent.svg
```

These are our files. Upstream doesn't have them, so they never conflict.

## Why MainWindowHero.tsx Exists

Instead of upstream importing `hero/PetHeroBanner` directly, it imports
`MainWindowHero` — a thin bridge that:

1. **Lazy-loads** the hero via `React.lazy()` — if the hero module breaks, the app
   still works (Suspense shows a placeholder).
2. **Decouples** upstream from internal module structure — we can rename, split, or
   replace the hero without touching upstream again.
3. **Single import** — upstream has exactly one line to maintain, not N per module.

## Data Flow

```
TabGroupSplitLayout (upstream)
  │
  ├── worktreeId prop
  │
  └── <MainWindowHero worktreeId={...}>        (our bridge)
        │
        └── <PetHeroBanner worktreeId={...}>   (our component)
              │
              ├── useAppStore()                 (Orca's Zustand store)
              │   ├── worktreesByRepo           → workspace name, branch, path
              │   ├── repos                     → project name, remote URL
              │   ├── agentStatusByPaneKey      → agent working/sleeping/resting
              │   ├── gitStatusByWorktree       → diff stats (+added/-removed)
              │   └── rightSidebarOpen          → layout adjustment
              │
              ├── usePomodoroStore()            (our Zustand store)
              │   ├── phase                     → focus / short-break / long-break
              │   ├── secondsLeft               → countdown
              │   └── running                   → live/paused
              │
              └── useMottoStore()               (our Zustand store)
                  └── motto                     → editable text, persisted to localStorage
```
