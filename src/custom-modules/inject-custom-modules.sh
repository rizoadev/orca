#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# inject-custom-modules.sh
#
# Run after every `git merge upstream/main` to re-apply the
# minimal upstream touch-points that wire custom modules in.
#
# Only 2 files are patched (one-liners each).
# Everything else lives in src/custom-modules/ untouched.
#
# Usage:
#   ./src/custom-modules/inject-custom-modules.sh
#   # or after merge conflicts:
#   git merge upstream/main
#   ./src/custom-modules/inject-custom-modules.sh
# ──────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAIL=0

# ── 1. TabGroupSplitLayout.tsx — hero banner injection ──────
LAYOUT="$ROOT/src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx"
if [ ! -f "$LAYOUT" ]; then
  echo "✗ TabGroupSplitLayout.tsx not found"
  FAIL=1
else
  IMPORT_LINE="import { MainWindowHero } from '../../../../custom-modules/MainWindowHero'"
  RENDER_LINE="          <MainWindowHero worktreeId={worktreeId} />"

  if grep -qF 'MainWindowHero' "$LAYOUT"; then
    echo "✓ TabGroupSplitLayout.tsx — already injected"
  else
    # Add import after last existing import
    LAST_IMPORT=$(grep -n '^import ' "$LAYOUT" | tail -1 | cut -d: -f1)
    if [ -z "$LAST_IMPORT" ]; then
      echo "✗ TabGroupSplitLayout.tsx — no import lines found, inject manually"
      FAIL=1
    else
      sed -i "${LAST_IMPORT}a\\${IMPORT_LINE}" "$LAYOUT"

      # Add render after the 4px drag strip div
      if grep -qF 'data-terminal-focus-release-surface' "$LAYOUT"; then
        sed -i '/data-terminal-focus-release-surface/a\'"${RENDER_LINE}" "$LAYOUT"
        echo "✓ TabGroupSplitLayout.tsx — injected"
      else
        echo "✗ TabGroupSplitLayout.tsx — drag strip marker not found, inject <MainWindowHero> manually"
        FAIL=1
      fi
    fi
  fi
fi

# ── 2. main.css — pet-hero.css import ──────────────────────
MAINCSS="$ROOT/src/renderer/src/assets/main.css"
CSS_IMPORT="@import '../../../custom-modules/hero/pet-hero.css';"

if [ ! -f "$MAINCSS" ]; then
  echo "✗ main.css not found"
  FAIL=1
else
  if grep -qF 'custom-modules/hero' "$MAINCSS"; then
    echo "✓ main.css — already injected"
  else
    # Append after last @import
    LAST_CSS_IMPORT=$(grep -n '^@import ' "$MAINCSS" | tail -1 | cut -d: -f1)
    if [ -z "$LAST_CSS_IMPORT" ]; then
      # No imports? Add at top
      sed -i "1i\\${CSS_IMPORT}" "$MAINCSS"
    else
      sed -i "${LAST_CSS_IMPORT}a\\${CSS_IMPORT}" "$MAINCSS"
    fi
    echo "✓ main.css — injected"
  fi
fi

# ── Summary ─────────────────────────────────────────────────
echo ""
if [ $FAIL -eq 0 ]; then
  echo "✅ All custom module injection points applied."
  echo ""
  echo "Upstream files touched:"
  echo "  1. src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx  (2 lines)"
  echo "  2. src/renderer/src/assets/main.css                              (1 line)"
else
  echo "⚠️  Some injections failed — check messages above and apply manually."
  exit 1
fi
