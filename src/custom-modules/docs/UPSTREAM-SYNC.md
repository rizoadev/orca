# Upstream Sync — Step-by-Step Workflow

## Background

This repo forks [stablyai/orca](https://github.com/stablyai/orca). We track upstream
to get bug fixes, performance improvements, and new features.

Our custom code in `src/custom-modules/` is intentionally invisible to upstream —
that directory doesn't exist in the original repo, so there are never structural
conflicts from it. The only conflicts that can happen are in the 2 upstream files
we minimally touch.

## Setup (one-time, if not done)

```bash
git remote add upstream https://github.com/stablyai/orca.git
git fetch upstream
```

## Regular Sync Workflow

```bash
# 1. Fetch latest upstream
git fetch upstream

# 2. Merge into our branch
git merge upstream/main

# 3a. If merge completes cleanly:
#     Our 3 lines in the 2 upstream files usually survive.
#     Verify they're still there:
grep -c 'MainWindowHero' src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx
grep -c 'custom-modules/hero' src/renderer/src/assets/main.css
#     Both should output "1" or "2". If yes — done.

# 3b. If merge produced conflicts or the grep above outputs "0":
./src/custom-modules/inject-custom-modules.sh
#     This re-adds our lines idempotently. Safe to run even if already present.

# 4. Build and test
pnpm run build:electron-vite
```

## Conflict Scenarios

### Scenario A: Conflict in `TabGroupSplitLayout.tsx`

Upstream refactored the file. Resolve by:

1. Accept the upstream version: `git checkout --theirs src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx`
2. Stage it: `git add src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx`
3. Continue merge: `git merge --continue`
4. Re-inject: `./src/custom-modules/inject-custom-modules.sh`

If the inject script fails (upstream changed the file structure significantly),
check `docs/ARCHITECTURE.md` for exactly what 2 lines to add manually.

### Scenario B: Conflict in `main.css`

Same approach — accept upstream, then inject.

### Scenario C: Upstream removed `TabGroupSplitLayout.tsx`

Upstream restructured the workspace layout. Check what replaced it:

```bash
git log upstream/main --diff-filter=R -- src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx
```

Find the new injection point and update `inject-custom-modules.sh` and `docs/ARCHITECTURE.md`.

### Scenario D: Files in `src/custom-modules/` conflict

This should never happen — upstream doesn't have this directory.
If it somehow does, always keep ours: `git checkout --ours src/custom-modules/`.

## What inject-custom-modules.sh Does

The script:

1. Checks if `MainWindowHero` is already imported in `TabGroupSplitLayout.tsx` → skips if yes
2. If not, appends the import after the last existing `import` line
3. Appends the `<MainWindowHero ...>` render after the `data-terminal-focus-release-surface` div
4. Checks if `hero/pet-hero.css` is already imported in `main.css` → skips if yes
5. If not, appends the import after the last existing `@import` line

The script is **idempotent** — running it multiple times is safe.

## Checking Injection Status

```bash
# Quick check — both should return 1+
grep -c 'MainWindowHero' src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx
grep -c 'custom-modules/hero' src/renderer/src/assets/main.css

# Or run the script — it will say "already injected" for each
./src/custom-modules/inject-custom-modules.sh
```

## Files We Own (never upstream)

```
src/custom-modules/          — all of it
resources/cat-playing.svg
resources/cat-watermelon.svg
resources/cat-dance.svg
resources/mountain-landscape-transparent.svg
```

## Files Upstream Owns (we add minimal lines)

```
src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx  (+2 lines)
src/renderer/src/assets/main.css                              (+1 line)
```
