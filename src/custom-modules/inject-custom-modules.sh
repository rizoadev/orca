#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# inject-custom-modules.sh
#
# Run after every `git merge upstream/main` to re-apply the
# minimal upstream touch-points that wire custom modules in.
# Everything else lives in src/custom-modules/ untouched.
#
# Usage:
#   ./src/custom-modules/inject-custom-modules.sh
#   # or after upstream merge conflict:
#   git merge upstream/main
#   ./src/custom-modules/inject-custom-modules.sh
# ──────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FAIL=0

# ─────────────────────────────────────────────────────────────
# Helper: inject one import line after the last ^import in a file
# Usage: inject_import FILE "import { Foo } from './bar'"
# ─────────────────────────────────────────────────────────────
inject_import() {
  local file="$1" line="$2"
  if grep -qF "$line" "$file"; then
    return 0  # already present
  fi
  local last
  last=$(grep -n '^import ' "$file" | tail -1 | cut -d: -f1)
  if [ -z "$last" ]; then
    echo "✗ no import lines in $file"
    return 1
  fi
  sed -i "${last}a\\${line}" "$file"
}

# ─────────────────────────────────────────────────────────────
# ── 1. hero — TabGroupSplitLayout.tsx
# ─────────────────────────────────────────────────────────────
LAYOUT="$ROOT/src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx"
if [ ! -f "$LAYOUT" ]; then
  echo "✗ TabGroupSplitLayout.tsx not found"
  FAIL=1
else
  if grep -qF 'MainWindowHero' "$LAYOUT"; then
    echo "✓ TabGroupSplitLayout.tsx — already injected"
  else
    inject_import "$LAYOUT" "import { MainWindowHero } from '../../../../custom-modules/MainWindowHero'"
    RENDER_LINE="          <MainWindowHero worktreeId={worktreeId} />"
    if grep -qF 'data-terminal-focus-release-surface' "$LAYOUT"; then
      sed -i '/data-terminal-focus-release-surface/a\'"${RENDER_LINE}" "$LAYOUT"
      echo "✓ TabGroupSplitLayout.tsx — injected"
    else
      echo "✗ TabGroupSplitLayout.tsx — drag strip marker not found, inject <MainWindowHero> manually"
      FAIL=1
    fi
  fi
fi

# ─────────────────────────────────────────────────────────────
# ── 2. hero — main.css
# ─────────────────────────────────────────────────────────────
MAINCSS="$ROOT/src/renderer/src/assets/main.css"
CSS_IMPORT="@import '../../../custom-modules/hero/pet-hero.css';"
if [ ! -f "$MAINCSS" ]; then
  echo "✗ main.css not found"
  FAIL=1
else
  if grep -qF 'custom-modules/hero' "$MAINCSS"; then
    echo "✓ main.css — already injected"
  else
    LAST_CSS=$(grep -n '^@import ' "$MAINCSS" | tail -1 | cut -d: -f1)
    if [ -z "$LAST_CSS" ]; then
      sed -i "1i\\${CSS_IMPORT}" "$MAINCSS"
    else
      sed -i "${LAST_CSS}a\\${CSS_IMPORT}" "$MAINCSS"
    fi
    echo "✓ main.css — injected"
  fi
fi

# ─────────────────────────────────────────────────────────────
# ── 3. cloudflare — global-settings-types.ts (CloudflareRelaySettings intersection)
# ─────────────────────────────────────────────────────────────
SETTINGS="$ROOT/src/shared/global-settings-types.ts"
if [ ! -f "$SETTINGS" ]; then
  echo "✗ global-settings-types.ts not found"
  FAIL=1
else
  if grep -qF 'CloudflareRelaySettings' "$SETTINGS"; then
    echo "✓ global-settings-types.ts — already injected"
  else
    # Insert import after AgentLaunchChoices import and intersection on GlobalSettings
    inject_import "$SETTINGS" "import type { CloudflareRelaySettings } from './cloudflare-relay-settings'"
    if grep -qF 'GlobalSettings = GlobalSettingsBase &' "$SETTINGS"; then
      sed -i 's/GlobalSettings = GlobalSettingsBase & {/GlobalSettings = GlobalSettingsBase \& CloudflareRelaySettings \& {/' "$SETTINGS"
      echo "✓ global-settings-types.ts — injected"
    else
      echo "✗ global-settings-types.ts — GlobalSettings anchor not found, add intersection manually"
      FAIL=1
    fi
  fi
fi

# ─────────────────────────────────────────────────────────────
# ── 4. cloudflare — shared/cloudflare-relay-status.ts (new file)
# ─────────────────────────────────────────────────────────────
CF_SHARED="$ROOT/src/shared/cloudflare-relay-status.ts"
if [ -f "$CF_SHARED" ]; then
  echo "✓ shared/cloudflare-relay-status.ts — already present"
else
  cat > "$CF_SHARED" << 'EOF'
// Cloudflare Relay status types — shared between main process and renderer.
// Custom module: src/custom-modules/cloudflare/
// Why in shared/: preload/api/mobile-api.ts imports from here so the type
// is available in the renderer without crossing the custom-modules boundary.

export type CloudflareRelayStatusState = 'disabled' | 'provisioning' | 'running' | 'error'

export type CloudflareRelayStatusPayload = {
  configured: boolean
  state: CloudflareRelayStatusState
  hostname: string
  message?: string
  wsPort: number | null
}
EOF
  echo "✓ shared/cloudflare-relay-status.ts — created"
fi

# ─────────────────────────────────────────────────────────────
# ── 5. cloudflare — preload/api/mobile-api.ts (import + 3 methods)
# ─────────────────────────────────────────────────────────────
MOBILE_API="$ROOT/src/preload/api/mobile-api.ts"
if [ ! -f "$MOBILE_API" ]; then
  echo "✗ mobile-api.ts not found"
  FAIL=1
else
  if grep -qF 'cloudflare-relay-status' "$MOBILE_API"; then
    echo "✓ mobile-api.ts — already injected"
  else
    inject_import "$MOBILE_API" "import type { CloudflareRelayStatusPayload } from '../../shared/cloudflare-relay-status'"
    # Add 3 methods before closing brace of MobileApi type
    sed -i "/onUnpairedDeviceAuthFailure/a\\  getCloudflareRelayStatus?: () => Promise<CloudflareRelayStatusPayload>\\n  restartCloudflareRelay?: () => Promise<{ ok: boolean; error?: string }>\\n  setCloudflareRelay?: (enabled: boolean) => Promise<{ ok: boolean; error?: string }>" "$MOBILE_API"
    echo "✓ mobile-api.ts — injected"
  fi
fi

# ─────────────────────────────────────────────────────────────
# ── 6. cloudflare — main/ipc/mobile.ts (import + 1 call)
# ─────────────────────────────────────────────────────────────
MOBILE_IPC="$ROOT/src/main/ipc/mobile.ts"
if [ ! -f "$MOBILE_IPC" ]; then
  echo "✗ mobile.ts not found"
  FAIL=1
else
  if grep -qF 'registerCloudflareRelayHandlers' "$MOBILE_IPC"; then
    echo "✓ mobile.ts — already injected"
  else
    inject_import "$MOBILE_IPC" "import { registerCloudflareRelayHandlers } from '../../custom-modules/cloudflare/main/cloudflare-relay-ipc'"
    sed -i "/^): void {$/a\\  registerCloudflareRelayHandlers() \/\/ custom-modules\/cloudflare" "$MOBILE_IPC"
    echo "✓ mobile.ts — injected"
  fi
fi

# ─────────────────────────────────────────────────────────────
# ── 7. cloudflare — MobilePane.tsx (import + 1 render)
# ─────────────────────────────────────────────────────────────
MOBILE_PANE="$ROOT/src/renderer/src/components/settings/mobile/MobilePane.tsx"
if [ ! -f "$MOBILE_PANE" ]; then
  echo "✗ MobilePane.tsx not found"
  FAIL=1
else
  if grep -qF 'CloudflareRelaySection' "$MOBILE_PANE"; then
    echo "✓ MobilePane.tsx — already injected"
  else
    inject_import "$MOBILE_PANE" "import { CloudflareRelaySection } from '../../../../custom-modules/cloudflare/CloudflareRelaySection'"
    sed -i "/MobileAutoRestoreFitSection/,/\/>/{/\/>/{/MobileAutoRestoreFit/!d}}" "$MOBILE_PANE"
    # Simpler: add before closing </div> of the settings wrapper
    sed -i 's|      <MobileAutoRestoreFitSection|      <CloudflareRelaySection />\n      <MobileAutoRestoreFitSection|' "$MOBILE_PANE"
    echo "✓ MobilePane.tsx — injected"
  fi
fi

# ─────────────────────────────────────────────────────────────
# ── 8. right sidebar — custom activity items
# ─────────────────────────────────────────────────────────────
ACT_ITEMS="$ROOT/src/renderer/src/components/right-sidebar/use-right-sidebar-activity-items.ts"
if [ ! -f "$ACT_ITEMS" ]; then
  echo "✗ use-right-sidebar-activity-items.ts not found"
  FAIL=1
else
  if grep -qF 'getCustomActivityItems' "$ACT_ITEMS"; then
    echo "✓ use-right-sidebar-activity-items.ts — already injected"
  else
    inject_import "$ACT_ITEMS" "import { getCustomActivityItems } from '../../../../custom-modules/custom-activity-items'"
    sed -i '/const activityItems = useMemo/,/]/ { /]/i\      ...getCustomActivityItems(),\n }' "$ACT_ITEMS"
    echo "✓ use-right-sidebar-activity-items.ts — injected"
  fi
fi

# ─────────────────────────────────────────────────────────────
# ── 9. right sidebar — custom panel content
# ─────────────────────────────────────────────────────────────
PANEL_CONTENT="$ROOT/src/renderer/src/components/right-sidebar/right-sidebar-panel-content.tsx"
if [ ! -f "$PANEL_CONTENT" ]; then
  echo "✗ right-sidebar-panel-content.tsx not found"
  FAIL=1
else
  if grep -qF 'CustomPanelContent' "$PANEL_CONTENT"; then
    echo "✓ right-sidebar-panel-content.tsx — already injected"
  else
    inject_import "$PANEL_CONTENT" "import { CustomPanelContent } from '../../../../custom-modules/custom-panel-content'"
    sed -i 's|<Suspense fallback={null}>|<Suspense fallback={null}>\n          <CustomPanelContent tab={effectiveTab} rightSidebarOpen={rightSidebarOpen} />|' "$PANEL_CONTENT"
    echo "✓ right-sidebar-panel-content.tsx — injected"
  fi
fi

# ─────────────────────────────────────────────────────────────
# ── 10. voice — preload/api-types.ts & preload/index.ts
# DISABLED: Google Voice (Pi Standby) dimatikan. Section dipertahankan
# sebagai referensi; jangan di-uncomment kecuali mau re-enable fitur.
# ─────────────────────────────────────────────────────────────
# PRELOAD_INDEX="$ROOT/src/preload/index.ts"
# if [ ! -f "$PRELOAD_INDEX" ]; then
#   echo "✗ preload/index.ts not found"
#   FAIL=1
# else
#   if grep -qF 'voiceCallBridge' "$PRELOAD_INDEX"; then
#     echo "✓ preload/index.ts — already injected"
#   else
#     inject_import "$PRELOAD_INDEX" "import { voiceCallBridge } from './api/voice-call-bridge'"
#     sed -i '/speech: speechApi/a\  voiceCall: voiceCallBridge,' "$PRELOAD_INDEX"
#     echo "✓ preload/index.ts — injected"
#   fi
# fi

# ─────────────────────────────────────────────────────────────
# ── 11. voice — main/ipc/speech.ts (DISABLED — Pi Standby)
# ─────────────────────────────────────────────────────────────
# SPEECH_IPC="$ROOT/src/main/ipc/speech.ts"
# if [ ! -f "$SPEECH_IPC" ]; then
#   echo "✗ main/ipc/speech.ts not found"
#   FAIL=1
# else
#   if grep -qF 'registerVoiceCallHandlers' "$SPEECH_IPC"; then
#     echo "✓ main/ipc/speech.ts — already injected"
#   else
#     inject_import "$SPEECH_IPC" "import { registerVoiceCallHandlers } from '../../custom-modules/voice/main/ipc/voice-call'"
#     sed -i '/export function registerSpeechHandlers/a\  registerVoiceCallHandlers() // custom-modules/voice' "$SPEECH_IPC"
#     echo "✓ main/ipc/speech.ts — injected"
#   fi
# fi

# ─────────────────────────────────────────────────────────────
# ── Summary
# ─────────────────────────────────────────────────────────────
echo ""
if [ $FAIL -eq 0 ]; then
  echo "✅ All custom module injection points applied."
  echo ""
  echo "Upstream files touched:"
  echo "  1. src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx  — hero banner"
  echo "  2. src/renderer/src/assets/main.css                               — hero CSS"
  echo "  3. src/shared/global-settings-types.ts                            — cloudflare fields"
  echo "  4. src/shared/cloudflare-relay-status.ts                          — new shared type"
  echo "  5. src/preload/api/mobile-api.ts                                  — cloudflare methods"
  echo "  6. src/main/ipc/mobile.ts                                         — cloudflare handlers"
  echo "  7. src/renderer/src/components/settings/mobile/MobilePane.tsx          — cloudflare UI"
  echo "  8. src/renderer/src/components/right-sidebar/use-right-sidebar-activity-items.ts — sidebar tab buttons"
  echo "  9. src/renderer/src/components/right-sidebar/right-sidebar-panel-content.tsx    — sidebar panel router"
  echo " 10. src/preload/index.ts                                           — voice preload bridge"
  echo " 11. src/main/ipc/speech.ts                                         — voice IPC handlers"
else
  echo "⚠️  Some injections failed — check messages above and apply manually."
  echo "     See src/custom-modules/docs/ for exact lines."
  exit 1
fi
