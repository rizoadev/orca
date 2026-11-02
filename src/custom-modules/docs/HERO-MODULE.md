# Hero Module — Internals

## What It Is

The hero banner is a persistent 154px header that appears above the tab group in
every active workspace. It shows:

- **Greeting** — time-of-day greeting ("Pagi/Siang/Sore/Malam, Riza.") updated every second
- **Editable motto** — one-liner quote, click pencil icon to edit, persisted to localStorage
- **Workspace info** — project name / branch, clickable GitHub/GitLab icon links to repo
- **Path** — full filesystem path to the worktree
- **Scene** — stars, mountain silhouette, 3 animated cat sprites
- **Status bar** — live clock, agent mode (working/resting/sleeping/cooldown), git diff (+added/-removed)
- **Pomodoro chip** — current phase (focus/break/long break), countdown, live/paused state

## Files

```
src/custom-modules/hero/
├── PetHeroBanner.tsx              ← Main component. Reads from 3 stores, renders the header.
├── pet-hero.css                   ← Self-contained CSS. Uses Orca CSS custom properties.
├── motto-store.ts                 ← Zustand store for the motto text.
├── panel.tsx                      ← Pomodoro timer panel (renders in right sidebar).
└── renderer/src/components/right-sidebar/
    └── pomodoro-timer-store.ts    ← Zustand store for the pomodoro timer logic.

resources/
├── cat-playing.svg                ← Left cat (roam-left position)
├── cat-watermelon.svg             ← Center cat (roam-center)
├── cat-dance.svg                  ← Right cat (roam-right)
└── mountain-landscape-transparent.svg  ← Background mountain scene
```

## PetHeroBanner.tsx

### Props

```tsx
<PetHeroBanner worktreeId={string} />
```

`worktreeId` — the active workspace's ID from Orca's app store. Passed from
`TabGroupSplitLayout` → `MainWindowHero` → `PetHeroBanner`.

### Stores Used

**`useAppStore` (Orca's Zustand store)**

| Selector                                | Used For                                                      |
| --------------------------------------- | ------------------------------------------------------------- |
| `state.worktreesByRepo`                 | Finds the worktree by ID → gets branch, path, repoId          |
| `state.repos`                           | Gets project display name and remote URL                      |
| `state.agentStatusByPaneKey`            | Determines pet mode: working/waiting/blocked                  |
| `state.sleepingAgentSessionsByPaneKey`  | Determines pet mode: sleep                                    |
| `state.gitStatusByWorktree[worktreeId]` | Git diff stats (added/removed line counts)                    |
| `state.rightSidebarOpen`                | Adjusts right-side status/pomodoro position via CSS data attr |

**`usePomodoroStore` (our store)**

| Selector        | Used For                               |
| --------------- | -------------------------------------- |
| `s.phase`       | focus / short-break / long-break       |
| `s.secondsLeft` | Countdown number for the pomodoro chip |
| `s.running`     | "live" vs "paused" label               |

**`useMottoStore` (our store)**

| Selector     | Used For                    |
| ------------ | --------------------------- |
| `s.motto`    | The editable one-liner      |
| `s.setMotto` | Saves edits to localStorage |

### Pet Mode Logic

```
agentStatusByPaneKey has 'working' state  →  PetHeroMode = 'working'
agentStatusByPaneKey has 'waiting'/'blocked'  →  PetHeroMode = 'rest'
sleepingAgentSessionsByPaneKey has entry  →  PetHeroMode = 'sleep'
otherwise  →  PetHeroMode = 'rest'

Then overlaid with pomodoro:
pomodoroPhase !== 'focus'  →  effectiveMode = 'cooldown'
pomodoroRunning || petMode === 'working'  →  effectiveMode = 'working'
otherwise  →  effectiveMode = petMode (rest/sleep)
```

The `effectiveMode` is set as `data-pet-mode` on the `<header>` element.
CSS rules in `pet-hero.css` change the status dot color based on this attribute.

## pet-hero.css

Fully self-contained. Depends only on Orca CSS custom properties:

- `--background`, `--foreground`, `--card`, `--card-foreground`
- `--muted-foreground`, `--border`, `--ring`
- `--status-success`, `--status-success-background`
- `--annotation-highlight`, `--destructive`
- `--radius-sm`, `--font-mono`

**Key layout:**

```
.pet-hero {
  display: flex;
  flex: 0 0 154px;   ← Fixed height, never grows
  min-height: 154px;
}
  .pet-hero-copy     ← Left side: text content (width: min(43%, 360px))
  .pet-hero-scene    ← Right side: mountains + cats (flex: 1)
  .pet-hero-status   ← Absolute top-right: clock + mode + git diff
  .pet-hero-pomodoro ← Absolute bottom-right: phase + countdown chip
```

**Animations:**

- `@keyframes pet-hero-wander` — cats drift left/right/up with `translateX/Y`.
  Each cat has a different `animation-delay` so they move independently.
- `@media (prefers-reduced-motion: reduce)` — disables cat animation.

**Responsive breakpoint at 720px:**

- Hides motto (`pet-hero-description`)
- Shrinks cats and padding

## pomodoro-timer-store.ts

Zustand store running at **module scope** (not inside React). The tick loop
(`setInterval(pumpPomodoroTick, 250)`) starts when the module is first imported
and keeps running even if the pomodoro panel is unmounted (sidebar tab switched).

### State

```ts
phase: 'focus' | 'short-break' | 'long-break'
secondsLeft: number
running: boolean
completedFocusSessions: number
durationsMin: { focus: 25, 'short-break': 5, 'long-break': 15 }
endAt: number | null   // wall-clock deadline while running
```

### Actions

| Action                    | Effect                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `start()`                 | Sets `running: true`, computes `endAt = Date.now() + secondsLeft * 1000`                        |
| `pause()`                 | Sets `running: false`, clears `endAt`                                                           |
| `reset()`                 | Resets `secondsLeft` to full phase duration, `running: false`                                   |
| `skip()`                  | Advances to next phase, preserves previous run state                                            |
| `setDuration(phase, min)` | Updates duration, live-previews if current idle phase                                           |
| `completePhase()`         | (internal) Called by tick when `secondsLeft` hits 0 — advances phase, fires toast + audio chime |

### Phase Advance Logic

```
focus done    →  if completedFocusSessions >= 4: long-break (reset count)
                 else: short-break (increment count)
break done    →  focus (keep session count)
skip()        →  same as above but does not increment completedFocusSessions
```

## motto-store.ts

Simple Zustand store backed by `localStorage`.

```ts
key: 'orca-pet-hero-motto'
default: 'Semangat kerja ya — buat nabung rumah.'
```

The `EditableMotto` sub-component inside `PetHeroBanner` renders the motto with
a hidden pencil icon (visible on hover). Clicking opens an inline input; Enter or
blur commits the edit.

## MainWindowHero.tsx (bridge)

```tsx
const PetHeroBanner = React.lazy(() =>
  import('./hero/PetHeroBanner').then((m) => ({ default: m.PetHeroBanner }))
)

export function MainWindowHero({ worktreeId }) {
  return (
    <Suspense fallback={<div className="h-[154px] shrink-0 border-b border-border bg-card" />}>
      <PetHeroBanner worktreeId={worktreeId} />
    </Suspense>
  )
}
```

The `fallback` matches the hero's height (`154px`) and background so layout doesn't
jump while the lazy chunk loads.
