# Adding a New Custom Module

## Checklist

- [ ] Create `src/custom-modules/<name>/`
- [ ] Write the module (component, stores, CSS)
- [ ] Export from `src/custom-modules/MainWindowHero.tsx` (if it's a main-window inject)
- [ ] Update `inject-custom-modules.sh` if new upstream touch points are needed
- [ ] Update `docs/ARCHITECTURE.md` with the new module
- [ ] Write `docs/<NAME>-MODULE.md` for the new module

## Case 1: Another Main-Window Banner / Section

If the new module also injects into `TabGroupSplitLayout` (above or below the hero),
add it to `MainWindowHero.tsx`:

```tsx
// src/custom-modules/MainWindowHero.tsx

const PetHeroBanner = React.lazy(() =>
  import('./hero/PetHeroBanner').then((m) => ({ default: m.PetHeroBanner }))
)

// Add your new module here:
const MyNewBanner = React.lazy(() =>
  import('./my-module/MyBanner').then((m) => ({ default: m.MyBanner }))
)

export function MainWindowHero({ worktreeId }: { worktreeId: string }) {
  return (
    <Suspense fallback={<div className="h-[154px] shrink-0 border-b border-border bg-card" />}>
      <PetHeroBanner worktreeId={worktreeId} />
      <MyNewBanner worktreeId={worktreeId} />
    </Suspense>
  )
}
```

No upstream change needed — `MainWindowHero` already has the inject point.

## Case 2: Right Sidebar Panel

If the new module adds a tab to the right sidebar, you need to touch 3 upstream files.
Add the injection to `inject-custom-modules.sh` following the same pattern as the
CSS injection, and document the exact lines in `docs/ARCHITECTURE.md`.

See `orca-old` in `/home/rizoa/PROJECTS_IKAMAI/orca-old/src/custom-modules/` for
a full example with `custom-activity-items.ts`, `custom-panel-content.tsx`, and
`custom-right-sidebar-tabs.ts`.

## Case 3: Module with CSS

If the module has its own CSS that uses Orca design tokens:

1. Write it as a standalone `.css` file in `src/custom-modules/<name>/`
2. Add an `@import` to `src/renderer/src/assets/main.css`
3. Add that import line to `inject-custom-modules.sh` so it survives upstream merges

## Case 4: Module with IPC (main process)

If the module needs to communicate with Electron's main process:

1. Write the IPC handler in `src/custom-modules/<name>/main/`
2. Touch `src/main/ipc/index.ts` to register it (new upstream touch point)
3. Add the preload bridge in `src/preload/`
4. Document the new touch point in `docs/ARCHITECTURE.md` and update `inject-custom-modules.sh`

## Naming Conventions

| Thing           | Convention      | Example                             |
| --------------- | --------------- | ----------------------------------- |
| Module folder   | kebab-case      | `hero`, `issues`, `voice-call`      |
| Component files | PascalCase      | `PetHeroBanner.tsx`, `MyPanel.tsx`  |
| Store files     | kebab-case      | `motto-store.ts`, `timer-store.ts`  |
| CSS files       | kebab-case      | `pet-hero.css`, `panel.css`         |
| Doc files       | SCREAMING-KEBAB | `HERO-MODULE.md`, `VOICE-MODULE.md` |

## Module Folder Structure (recommended)

```
src/custom-modules/<name>/
├── <Name>Banner.tsx       or <Name>Panel.tsx  ← main component
├── <name>.css             ← styles (if any)
├── <name>-store.ts        ← Zustand store (if any)
└── renderer/...           ← deep renderer files (stores accessed from multiple places)
```
