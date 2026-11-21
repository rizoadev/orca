# Injection Map — Semua Touch Point Upstream

Dokumen ini mencatat **tepat di mana dan apa** yang di-inject ke file upstream.
Update dokumen ini setiap kali ada injection baru.

**Last verified:** before upstream pull (custom: hero + cloudflare + right-sidebar +
issues + snippets(GitLab) + snippets(Turso) + voice[disabled]).

Legend: `(C)` = file custom yang kita buat di luar `src/custom-modules/`, bukan edit upstream.

---

## Ringkasan Touch Point

| #   | File Upstream                                                                              | Modul            | Yang Di-inject                                                 |
| --- | ------------------------------------------------------------------------------------------ | ---------------- | -------------------------------------------------------------- |
| 1   | `src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx`                            | hero             | import + `<MainWindowHero worktreeId>`                         |
| 2   | `src/renderer/src/assets/main.css`                                                         | hero + turso     | `@import` hero CSS + `@keyframes turso-toast-progress`         |
| 3   | `src/shared/cloudflare-relay-settings.ts` (C)                                              | cloudflare       | file baru (kontrak setting)                                    |
| 4   | `src/shared/cloudflare-relay-status.ts` (C)                                                | cloudflare       | file baru (payload status)                                     |
| 5   | `src/shared/global-settings-base.ts`                                                       | cloudflare+turso | import + intersect `CloudflareRelaySettings` + `TursoSettings` |
| 6   | `src/shared/default-global-settings.ts`                                                    | turso            | default `tursoDatabaseUrl`, `tursoAuthToken`                   |
| 7   | `src/preload/api/mobile-api.ts`                                                            | cloudflare       | import type + 3 method types                                   |
| 8   | `src/preload/api/mobile-bridge.ts`                                                         | cloudflare       | 3 `ipcRenderer.invoke`                                         |
| 9   | `src/main/ipc/mobile.ts`                                                                   | cloudflare       | import + `registerCloudflareRelayHandlers()`                   |
| 10  | `src/renderer/.../settings/mobile/MobilePane.tsx`                                          | cloudflare       | import + `<CloudflareRelaySection />`                          |
| 11  | `src/renderer/.../settings/runtime-environments/pairing/runtime-share-computer-button.tsx` | cloudflare       | import + `<CloudflareRuntimeHint />`                           |
| 12  | `src/renderer/.../status-bar/StatusBarSurface.tsx`                                         | cloudflare       | import + `<CloudflareRelayStatusSegment />` + dev badge        |
| 13  | `src/shared/ui-chrome-types.ts`                                                            | right-sidebar    | union `'issues'`, `'voice'`, `'orchestration'`                 |
| 14  | `src/shared/rpc-contract/client-ui-params.ts`                                              | right-sidebar    | tab di `STATIC_RIGHT_SIDEBAR_TABS`                             |
| 15  | `src/shared/types.ts` (C)                                                                  | issues           | barrel re-export stabil (import site)                          |
| 16  | `src/renderer/src/store/right-sidebar-route.ts`                                            | right-sidebar    | whitelist `'issues'`, `'voice'`                                |
| 17  | `src/renderer/.../right-sidebar/use-right-sidebar-activity-items.ts`                       | right-sidebar    | import + `...getCustomActivityItems()`                         |
| 18  | `src/renderer/.../right-sidebar/right-sidebar-panel-content.tsx`                           | right-sidebar    | import + `<CustomPanelContent />`                              |
| 19  | `src/renderer/src/components/editor/EditorContent.tsx`                                     | issues           | import + `<IssueDetailsSurface />`                             |
| 20  | `src/main/ipc/source-control/gitlab.ts`                                                    | snippets(GitLab) | import + `registerGitLabSnippetHandlers()`                     |
| 21  | `src/preload/api/gitlab-api.ts`                                                            | snippets(GitLab) | import type dari `custom-modules/snippets/shared/types`        |
| 22  | `src/renderer/.../file-explorer/panel/FileExplorer.tsx`                                    | snippets+turso   | import + `<SnippetBlock>` (GitLab) + `<TursoSnippetBlock>`     |
| 23  | `src/renderer/.../file-explorer/panel/FileExplorerBackgroundMenu.tsx`                      | snippets+turso   | "Sync to GitLab" + "Sync to Turso"                             |
| 24  | `src/renderer/.../file-explorer/panel/file-explorer-row-context-menu.tsx`                  | snippets+turso   | "Sync to GitLab Snippet" + "Sync to Turso"                     |
| 25  | `src/shared/turso/turso-snippet-types.ts` (C)                                              | turso            | file baru (kontrak tipe)                                       |
| 26  | `src/main/ipc/turso/turso-snippet-handlers.ts` (C)                                         | turso            | file baru (IPC handlers)                                       |
| 27  | `src/main/ipc/register-core-handlers/register-core-handlers.ts` (+`.test.ts`)              | turso            | import + `registerTursoSnippetHandlers()`                      |
| 28  | `src/preload/api/turso-bridge.ts` (C)                                                      | turso            | file baru (bridge invoke)                                      |
| 29  | `src/preload/api-types.ts`                                                                 | turso            | import type + field `turso` di `PreloadApi`                    |
| 30  | `src/preload/index.ts`                                                                     | turso            | import + `turso: tursoApi`                                     |
| 31  | `src/renderer/.../integrations/turso-integration-card.tsx` (C)                             | turso            | file baru (Settings UI)                                        |
| 32  | `src/renderer/.../settings/integrations/IntegrationsPane.tsx`                              | turso            | import + `<TursoIntegrationCard />`                            |
| 33  | `src/shared/voice-call-types.ts` (C)                                                       | voice (DISABLED) | file baru (kontrak tipe) — masih ada                           |
| 34  | `src/main/ipc/speech.ts`                                                                   | voice (DISABLED) | import + call dikomentari                                      |

---

## Detail Per File (baris persis)

### Hero

**1. `TabGroupSplitLayout.tsx`**

```tsx
import { MainWindowHero } from '../../../../custom-modules/MainWindowHero'
// ...setelah div data-terminal-focus-release-surface:
;<MainWindowHero worktreeId={worktreeId} />
```

Marker: `data-terminal-focus-release-surface`

**2. `main.css`**

```css
@import '../../../custom-modules/hero/pet-hero.css';
```

Plus keyframes tetap inline di akhir file (bukan import):

```css
@keyframes turso-toast-progress {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(250%);
  }
}
```

Marker: `@import` terakhir / akhir file.

### Cloudflare Relay

**3. `src/shared/cloudflare-relay-settings.ts` (C)** dan **4. `cloudflare-relay-status.ts` (C)**
→ Kalau hilang, buat ulang (lihat `docs/CLOUDFLARE-MODULE.md`).

**5. `global-settings-base.ts`** (bukan `global-settings-types.ts`!)

`global-settings-types.ts` pas **300 baris** (batas oxlint `max-lines` untuk `.ts`), jadi
inject di situ langsung gagal. Field custom dipasang di `global-settings-base.ts` yang
masih punya headroom:

```typescript
import type { CloudflareRelaySettings } from './cloudflare-relay-settings'
import type { TursoSettings } from './turso/turso-settings'
// ...
export type GlobalSettingsBase = ClaudeAgentViewSettings &
  // ...
  EditorSaveSettings &
  CloudflareRelaySettings &
  TursoSettings
```

Marker: `EditorSaveSettings` (baris terakhir intersection)

**7. `preload/api/mobile-api.ts`** — import `CloudflareRelayStatusPayload` + 3 method
(`getCloudflareRelayStatus`, `restartCloudflareRelay`, `setCloudflareRelay`).
Marker: `onUnpairedDeviceAuthFailure`

**8. `preload/api/mobile-bridge.ts`** — 3 `ipcRenderer.invoke('mobile:*')` sebelum
`} satisfies PreloadApi['mobile']`.

**9. `main/ipc/mobile.ts`** — import `registerCloudflareRelayHandlers` + panggil di awal
`registerMobileHandlers()`. Marker: `registerMobileHandlers`

**10. `.../settings/mobile/MobilePane.tsx`** — `<CloudflareRelaySection />`.
Marker: `MobileAutoRestoreFitSection`
(NB: script lama menaruh render **sebelum** `MobileAutoRestoreFitSection`.)

**11. `.../pairing/runtime-share-computer-button.tsx`** — `<CloudflareRuntimeHint />`.

**12. `.../status-bar/StatusBarSurface.tsx`** — import `CloudflareRelayStatusSegment`
(setelah `SshStatusSegment`) + dev badge `{import.meta.env.DEV ? <span data-dev-badge>dev</span> : null}`.

### Right Sidebar (issues/voice/orchestration tabs)

**13. `src/shared/ui-chrome-types.ts`** — tambah `'issues' | 'voice' | 'orchestration'` ke union.
**14. `src/shared/rpc-contract/client-ui-params.ts`** — tambah `'issues','voice','orchestration'`
ke `STATIC_RIGHT_SIDEBAR_TABS`.
**16. `src/renderer/src/store/right-sidebar-route.ts`** — whitelist `tab === 'issues' || tab === 'voice'`.
**17. `use-right-sidebar-activity-items.ts`** — import `getCustomActivityItems` + spread di array.
**18. `right-sidebar-panel-content.tsx`** — import `CustomPanelContent` + `isCustomSidebarTab` + render
di dalam `<Suspense>`.

⚠️ **Wajib**: setiap tab custom baru HARUS didaftarkan di #13/#14/#16, atau klik tab silent-redirect.

### Issues

**19. `editor/EditorContent.tsx`** — import + `<IssueDetailsSurface />`.
**15. `src/shared/types.ts` (C)** — barrel type untuk issues (import site stabil).

### Snippets (GitLab)

**20. `main/ipc/source-control/gitlab.ts`** — import + `registerGitLabSnippetHandlers()`.
**21. `preload/api/gitlab-api.ts`** — import type dari `custom-modules/snippets/shared/types`.
**22–24. File Explorer** — `<SnippetBlock>` (hanya repo GitLab) + menu "Sync to GitLab Snippet".

### Snippets (Turso) — integration baru

**25. `src/shared/turso/turso-snippet-types.ts` (C)** — kontrak tipe.
**25b. `src/shared/turso/turso-settings.ts` (C)** — `TursoSettings` (diintersect di
`global-settings-base.ts`, lihat #5).
**26. `src/main/ipc/turso/turso-snippet-handlers.ts` (C)** — handler `turso:snippets:{create,list,get,delete}`
(fetch ke Turso `/v2/pipeline`).
**27. `register-core-handlers.ts`** — import + `registerTursoSnippetHandlers()`.
**28. `preload/api/turso-bridge.ts` (C)** — bridge.
**29. `preload/api-types.ts`** — field `turso` di `PreloadApi`.
**30. `preload/index.ts`** — `turso: tursoApi`.
**31–32. Settings** — `<TursoIntegrationCard />` di `IntegrationsPane.tsx`.
**5. `global-settings-types.ts` + 6. `default-global-settings.ts`** — `tursoDatabaseUrl`, `tursoAuthToken`.

⚠️ Bridge membaca kredensial dari **settings store**, bukan env: `settings.tursoDatabaseUrl` +
`settings.tursoAuthToken`. Kalau settings store berubah shape, cek `turso-integration-card.tsx`.

### Voice (DISABLED — Google Voice / Pi Standby)

**33. `src/shared/voice-call-types.ts` (C)** — tipe, masih ada.
**34. `main/ipc/speech.ts`** — import + `registerVoiceCallHandlers()` **dikomentari**.
Panel & activity item juga dikomentari di `custom-panel-content.tsx`, `custom-activity-items.ts`,
`custom-right-sidebar-tabs.ts`. **Jangan re-enable** kecuali diminta.

---

## Checklist Verifikasi Setelah Upstream Merge

Semua command harus output non-zero / `exists`. Kalau ada `0` / `MISSING` → re-inject manual
(atau jalankan `./src/custom-modules/inject-custom-modules.sh` untuk #1–12).

```bash
# Hero
grep -c 'MainWindowHero' src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx
grep -c 'custom-modules/hero' src/renderer/src/assets/main.css
# Cloudflare
test -f src/shared/cloudflare-relay-settings.ts && echo exists || echo MISSING
test -f src/shared/cloudflare-relay-status.ts && echo exists || echo MISSING
grep -c 'CloudflareRelaySettings' src/shared/global-settings-base.ts
grep -c 'getCloudflareRelayStatus' src/preload/api/mobile-api.ts
grep -c 'getCloudflareRelayStatus' src/preload/api/mobile-bridge.ts
grep -c 'registerCloudflareRelayHandlers' src/main/ipc/mobile.ts
grep -c 'CloudflareRelaySection' src/renderer/src/components/settings/mobile/MobilePane.tsx
grep -c 'CloudflareRuntimeHint' src/renderer/src/components/settings/runtime-environments/pairing/runtime-share-computer-button.tsx
grep -c 'CloudflareRelayStatusSegment' src/renderer/src/components/status-bar/StatusBarSurface.tsx
# Right sidebar
grep -c "'issues'" src/shared/ui-chrome-types.ts
grep -c "'issues'" src/shared/rpc-contract/client-ui-params.ts
grep -c "'issues'" src/renderer/src/store/right-sidebar-route.ts
grep -c 'getCustomActivityItems' src/renderer/src/components/right-sidebar/use-right-sidebar-activity-items.ts
grep -c 'CustomPanelContent' src/renderer/src/components/right-sidebar/right-sidebar-panel-content.tsx
# Issues
grep -c 'IssueDetailsSurface' src/renderer/src/components/editor/EditorContent.tsx
test -f src/shared/types.ts && echo exists || echo MISSING
# Snippets GitLab
grep -c 'registerGitLabSnippetHandlers' src/main/ipc/source-control/gitlab.ts
grep -c 'custom-modules/snippets' src/preload/api/gitlab-api.ts
grep -c 'SnippetBlock' src/renderer/src/components/right-sidebar/file-explorer/panel/FileExplorer.tsx
# Turso
grep -c 'TursoSnippetBlock' src/renderer/src/components/right-sidebar/file-explorer/panel/FileExplorer.tsx
grep -c 'turso' src/renderer/src/components/right-sidebar/file-explorer/panel/file-explorer-row-context-menu.tsx
grep -c 'turso' src/renderer/src/components/right-sidebar/file-explorer/panel/FileExplorerBackgroundMenu.tsx
grep -c 'registerTursoSnippetHandlers' src/main/ipc/register-core-handlers/register-core-handlers.ts
grep -c 'turso' src/preload/api-types.ts
grep -c 'tursoApi' src/preload/index.ts
test -f src/main/ipc/turso/turso-snippet-handlers.ts && echo exists || echo MISSING
test -f src/preload/api/turso-bridge.ts && echo exists || echo MISSING
grep -c 'TursoIntegrationCard' src/renderer/src/components/settings/integrations/IntegrationsPane.tsx
grep -c 'TursoSettings' src/shared/global-settings-base.ts
grep -c 'tursoDatabaseUrl' src/shared/default-global-settings.ts
```

Setelah semua lolos:

```bash
pnpm tc          # typecheck (paling penting: import path upstream sering pindah)
pnpm exec oxlint <file yang berubah>
```

---

## Files Custom — tidak pernah disentuh upstream

```
src/custom-modules/                                  ← seluruhnya
src/shared/cloudflare-relay-settings.ts
src/shared/cloudflare-relay-status.ts
src/shared/voice-call-types.ts
src/shared/types.ts
src/shared/turso/turso-snippet-types.ts
src/shared/turso/turso-settings.ts
src/custom-modules/snippets/renderer/components/turso-sync.tsx
src/main/ipc/turso/                                   ← seluruhnya
src/preload/api/turso-bridge.ts
src/renderer/src/components/integrations/turso-integration-card.tsx
resources/cat-playing.svg
resources/cat-watermelon.svg
resources/cat-dance.svg
resources/mountain-landscape-transparent.svg
```

## Risiko Utama Saat Merge Upstream

1. **Import path upstream sering dipindah** → `pnpm tc` wajib. Contoh yang sudah kena:
   `shared/git-status-types` → `shared/git/status/git-status-types`,
   `shared/source-control-launch-agent-selection` → `shared/source-control/ai/...`,
   `shared/agent-status-types` → `shared/agent-status/contracts/agent-status-types`.
2. **Relative depth custom-modules berubah** saat file upstream dipindah folder
   (mis. `../../../../custom-modules/...` → `../../../../../../custom-modules/...`).
3. **Union/whitelist tab** (#13/#14/#16) — kalau upstream refactor routing, tab bisa
   silent-redirect walau komponennya ada.
4. **`PreloadApi` shape** berubah → bridge turso/cloudflare gagal `satisfies`.
