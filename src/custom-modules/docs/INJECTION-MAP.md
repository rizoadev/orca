# Injection Map — Semua Touch Point Upstream

Dokumen ini mencatat **tepat di mana dan apa** yang di-inject ke file upstream.
Update dokumen ini setiap kali ada injection baru / setelah upstream pull.

**Last verified:** setelah merge `upstream/main` @ 2026-11-21 (4494 commit; merge-base `2724b03`).
`pnpm tc` = 0 error. Pipeline lint-staged (oxlint default / js-plugins / react-doctor / ast-grep / oxfmt) lolos.

Legend: `(C)` = file custom yang kita buat di luar `src/custom-modules/`, bukan edit upstream.

> ⚠️ Path di bawah sudah mengikuti struktur **setelah** merge. Upstream me-reorg banyak
> folder (lihat bagian "Merge 2026-11-21 — apa yang berubah" di akhir). Kalau ada path tak
> ditemukan, grep dulu sebelum menyimpulkan "hilang".

---

## Ringkasan Touch Point

| #   | File Upstream (path post-merge)                                                                       | Modul            | Yang Di-inject                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------- | --------------------------------------------------------------------------------------------------- |
| 1   | `src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx`                                       | hero             | import + `<MainWindowHero worktreeId>`                                                              |
| 2   | `src/renderer/src/assets/main.css`                                                                    | hero + turso     | `@import` hero CSS + `@keyframes turso-toast-progress`                                              |
| 3   | `src/shared/cloudflare-relay-settings.ts` (C)                                                         | cloudflare       | file baru (kontrak setting)                                                                         |
| 4   | `src/shared/cloudflare-relay-status.ts` (C)                                                           | cloudflare       | file baru (payload status)                                                                          |
| 5   | `src/shared/settings/global-settings-base.ts`                                                         | cloudflare+turso | import + intersect `CloudflareRelaySettings` + `TursoSettings`                                      |
| 6   | `src/shared/settings/default-global-settings.ts`                                                      | turso            | default `tursoDatabaseUrl`, `tursoAuthToken`                                                        |
| 7   | `src/preload/api/mobile/mobile-api.ts`                                                                | cloudflare       | import type + 3 method types                                                                        |
| 8   | `src/preload/api/mobile/mobile-bridge.ts`                                                             | cloudflare       | 3 `ipcRenderer.invoke`                                                                              |
| 9   | `src/main/ipc/mobile.ts`                                                                              | cloudflare       | import + `registerCloudflareRelayHandlers()`                                                        |
| 10  | `src/renderer/src/components/settings/mobile/MobilePane.tsx`                                          | cloudflare       | import + `<CloudflareRelaySection />`                                                               |
| 11  | `src/renderer/src/components/settings/runtime-environments/pairing/runtime-share-computer-button.tsx` | cloudflare       | import + `<CloudflareRuntimeHint />`                                                                |
| 12  | `src/renderer/src/components/status-bar/StatusBarSurface.tsx`                                         | cloudflare       | import + `<CloudflareRelayStatusSegment />` + dev badge                                             |
| 13  | `src/shared/ui-chrome/ui-chrome-types.ts`                                                             | right-sidebar    | union `'issues'`, `'voice'`, `'orchestration'` + list `STATIC_RIGHT_SIDEBAR_TABS` (source of truth) |
| 14  | `src/shared/rpc-contract/client-ui/client-ui-params.ts`                                               | right-sidebar    | import `STATIC_RIGHT_SIDEBAR_TABS` + validasi `RightSidebarTabParam` (tak ada literal)              |
| 15  | `src/shared/types.ts` (C)                                                                             | issues           | barrel re-export stabil (import site)                                                               |
| 16  | `src/renderer/src/store/slices/right-sidebar/right-sidebar-route.ts`                                  | right-sidebar    | whitelist `'issues'`, `'voice'` + re-export `ActiveRightSidebarTab`                                 |
| 17  | `src/renderer/src/components/right-sidebar/activity-bar/use-right-sidebar-activity-items.ts`          | right-sidebar    | import + `...getCustomActivityItems()`                                                              |
| 18  | `src/renderer/src/components/right-sidebar/right-sidebar-panel-content.tsx`                           | right-sidebar    | import + `<CustomPanelContent />`                                                                   |
| 19  | `src/renderer/src/components/editor/EditorContent.tsx`                                                | issues           | import + `<IssueDetailsSurface />`                                                                  |
| 20  | `src/main/ipc/source-control/gitlab.ts`                                                               | snippets(GitLab) | import + `registerGitLabSnippetHandlers()`                                                          |
| 21  | `src/preload/api/gitlab/gitlab-api.ts`                                                                | snippets(GitLab) | import type dari `custom-modules/snippets/shared/types`                                             |
| 22  | `src/renderer/src/components/right-sidebar/file-explorer/panel/FileExplorer.tsx`                      | snippets+turso   | import + `<SnippetBlock>` (GitLab) + `<TursoSnippetBlock>`                                          |
| 23  | `src/renderer/src/components/right-sidebar/file-explorer/panel/FileExplorerBackgroundMenu.tsx`        | snippets+turso   | "Sync to GitLab" + "Sync to Turso"                                                                  |
| 24  | `src/renderer/src/components/right-sidebar/file-explorer/panel/file-explorer-row-context-menu.tsx`    | snippets+turso   | "Sync to GitLab Snippet" + "Sync to Turso"                                                          |
| 25  | `src/shared/turso/turso-snippet-types.ts` (C)                                                         | turso            | file baru (kontrak tipe)                                                                            |
| 26  | `src/main/ipc/turso/turso-snippet-handlers.ts` (C)                                                    | turso            | file baru (IPC handlers)                                                                            |
| 27  | `src/main/ipc/register-core-handlers/register-core-handlers.ts` (+`.test.ts`)                         | turso            | import + `registerTursoSnippetHandlers()`                                                           |
| 28  | `src/preload/api/turso-bridge.ts` (C)                                                                 | turso            | file baru (bridge invoke)                                                                           |
| 29  | `src/preload/api-types.ts`                                                                            | turso            | import type + field `turso` (opsi `got`) di `PreloadApi`                                            |
| 30  | `src/preload/index.ts`                                                                                | turso            | import + `turso: tursoApi`                                                                          |
| 31  | `src/renderer/src/components/integrations/turso-integration-card.tsx` (C)                             | turso            | file baru (Settings UI)                                                                             |
| 32  | `src/renderer/src/components/settings/integrations/IntegrationsPane.tsx`                              | turso            | import + `<TursoIntegrationCard />`                                                                 |
| 33  | `src/shared/voice-call-types.ts` (C)                                                                  | voice (DISABLED) | file baru (kontrak tipe) — masih ada                                                                |
| 34  | `src/main/ipc/speech.ts`                                                                              | voice (DISABLED) | import + call dikomentari                                                                           |

---

## Detail Per File

### Hero

**1. `TabGroupSplitLayout.tsx`** — `import { MainWindowHero } from '…custom-modules/MainWindowHero'` +
`<MainWindowHero worktreeId={worktreeId} />`. Marker: `data-terminal-focus-release-surface`.
**2. `main.css`** — `@import '…/custom-modules/hero/pet-hero.css'` + `@keyframes turso-toast-progress`.

### Cloudflare Relay

**3–4.** `cloudflare-relay-settings.ts` / `cloudflare-relay-status.ts` (C) — kontrak.
**5. `settings/global-settings-base.ts`** (bukan `global-settings-types.ts` yang pas di batas `max-lines`):
intersect `CloudflareRelaySettings & TursoSettings` di `GlobalSettingsBase`.
**7. `preload/api/mobile/mobile-api.ts`** — 3 method (`getCloudflareRelayStatus`,
`restartCloudflareRelay`, `setCloudflareRelay`). **8. `mobile/mobile-bridge.ts`** — 3 `ipcRenderer.invoke`.
**9. `main/ipc/mobile.ts`** — `registerCloudflareRelayHandlers()` di awal `registerMobileHandlers()`.
**10. `MobilePane.tsx`** — `<CloudflareRelaySection />`. **11. `runtime-share-computer-button.tsx`** —
`<CloudflareRuntimeHint />`. **12. `StatusBarSurface.tsx`** — `<CloudflareRelayStatusSegment />` + dev badge.

> 📌 `src/custom-modules/cloudflare/main/cloudflare-relay-ipc.ts` — `getWsPort()` kini degraded ke `null`
> karena revisi upstream tidak lagi expose `state.runtimeRpc` di `mainProcessState`. Relay tetap jalan,
> hanya port WS tak terdeteksi (best-effort). Bukan crash.

### Right Sidebar (issues/voice/orchestration tabs)

**13. `ui-chrome/ui-chrome-types.ts`** — `'issues'|'voice'|'orchestration'` di union +
`ActiveRightSidebarTab` (re-export dari sini). **14. `client-ui/client-ui-params.ts`** —
`STATIC_RIGHT_SIDEBAR_TABS`. **16. `slices/right-sidebar/right-sidebar-route.ts`** — whitelist
`'issues'`/`'voice'` + re-export `ActiveRightSidebarTab`. **17. `activity-bar/use-right-sidebar-activity-items.ts`** —
`...getCustomActivityItems()`. **18. `right-sidebar-panel-content.tsx`** — `<CustomPanelContent />`.

⚠️ **Wajib**: tiap tab custom baru didaftarkan di #13/#14/#16, atau klik tab silent-redirect.

### Issues

**19. `editor/EditorContent.tsx`** — `<IssueDetailsSurface />`. **15. `shared/types.ts` (C)** — barrel type.

> 📌 AI-work / AI-plan (`custom-modules/issues/renderer/.../issues-panel-ai-{work,plan}.ts`) kini pakai
> `launchAgentInNewTabWithOutcome` + `createNonSecureContextUuid` (bukan lagi `launchAgentBackgroundSession`
> yang sudah dihapus, cluster dead-code).

### Snippets (GitLab)

**20. `main/ipc/source-control/gitlab.ts`** — `registerGitLabSnippetHandlers()`.
**21. `preload/api/gitlab/gitlab-api.ts`** — import type dari `custom-modules/snippets/shared/types`.
**22–24. File Explorer** — `<SnippetBlock>` (hanya repo GitLab) + menu "Sync to GitLab Snippet".

### Snippets (Turso)

**25. `shared/turso/turso-snippet-types.ts` (C)**, **25b. `shared/turso/turso-settings.ts` (C)**,
**26. `main/ipc/turso/turso-snippet-handlers.ts` (C)**, **27. `register-core-handlers.ts`**,
**28. `preload/api/turso-bridge.ts` (C)**, **29. `preload/api-types.ts`** (field `turso`;
opsional `got?: { generatePlan }` untuk GoT plan IPC upstream), **30. `preload/index.ts`**,
**31–32. `TursoIntegrationCard`** di `IntegrationsPane.tsx`, **6. `settings/default-global-settings.ts`**.

> 📌 Bridge baca kredensial dari **settings store** (`settings.tursoDatabaseUrl` + `tursoAuthToken`), bukan env.
> `issues-panel-create-dialog.tsx` pakai `window.api.got!.generatePlan` (guard `typeof … === 'function'`).

### Voice (DISABLED — Google Voice / Pi Standby)

**33. `shared/voice-call-types.ts` (C)** masih ada. **34. `main/ipc/speech.ts`** import + call dikomentari.
Panel & activity item juga dikomentari di `custom-panel-content.tsx`, `custom-activity-items.ts`,
`custom-right-sidebar-tabs.ts`. **Jangan re-enable** kecuali diminta.

---

## Merge 2026-11-21 — apa yang berubah

**Reorg path upstream (old → new) yang kena file custom / surgical:**

| old (pre-merge)                                       | new (post-merge)                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| `src/shared/global-settings-base.ts`                  | `src/shared/settings/global-settings-base.ts`                        |
| `src/shared/global-settings-types.ts`                 | `src/shared/settings/global-settings-types.ts`                       |
| `src/shared/default-global-settings.ts`               | `src/shared/settings/default-global-settings.ts`                     |
| `src/preload/api/mobile-api.ts` / `mobile-bridge.ts`  | `src/preload/api/mobile/{mobile-api,mobile-bridge}.ts`               |
| `src/preload/api/gitlab-api.ts`                       | `src/preload/api/gitlab/gitlab-api.ts`                               |
| `src/shared/ui-chrome-types.ts`                       | `src/shared/ui-chrome/ui-chrome-types.ts`                            |
| `src/shared/rpc-contract/client-ui-params.ts`         | `src/shared/rpc-contract/client-ui/client-ui-params.ts`              |
| `src/renderer/src/store/right-sidebar-route.ts`       | `src/renderer/src/store/slices/right-sidebar/right-sidebar-route.ts` |
| `…/right-sidebar/use-right-sidebar-activity-items.ts` | `…/right-sidebar/activity-bar/use-right-sidebar-activity-items.ts`   |

**Cluster fork dihapus (dead-code / orphan, zero importers):**

- Pi-usage (14 file: `src/main/pi-usage/*`, `usage-snapshot-rollups.ts`, `usage-provider-paths.ts`,
  `pi-usage-bridge.ts`, `pi-usage-types.ts`, `PiTokenUsageStatusSegment{,.test}.tsx`) +
  `usage-overview-daily-series.ts` direvert ke upstream.
- Bg-session (8 file: `launch-agent-background-session.ts` dll di `renderer/src/lib`).
- Work-item-background (4 file: `github-work-item-background-{create,request,preflight}.ts`,
  `source-control-launch-platform.ts`). `issues-panel-workspace-actions.ts` GitHub path kini pakai
  `openGitHubIssueWorkspaceComposer` (sama seperti GitLab/Linear).

**Perubahan tipe/ikon:**

- `ConfirmFn` (issues-panel-close-confirm) = `ReturnType<typeof useConfirmationDialog>`;
  `icon` dihapus dari `confirm()` snippet (upstream `ConfirmationDialogOptions` tak punya `icon`).
- `findAgentStatusForTab` → `ReadonlyMap` (issue-ai-work-badge).
- `GitHubItemDialogProps`/`GitLabItemDialogProps` + `GitLabItemDialogView`: tambah
  `tabBarTrailingSlot?`, `onOpenInMainView?`, `presentation?`, `hideFooterExternalActions?`.
- `Repo` type: `linear?: LinearRepoBinding | null` (`shared/linear-repo-binding.ts`, fork-only).
- `SnippetBlock`/`TursoSnippetBlock`: pattern `selectedBranch` state+sync-effect diganti
  "user-override" flag (fix `react(no-deriving-state-in-effects)`; default tetap ikut `currentBranch`).

---

## Checklist Verifikasi Setelah Upstream Merge

Semua harus output non-zero / `exists`. Ada `0` / `MISSING` → re-inject manual
(atau `./src/custom-modules/inject-custom-modules.sh` untuk #1–12).

```bash
# Hero
grep -c 'MainWindowHero' src/renderer/src/components/tab-group/TabGroupSplitLayout.tsx
grep -c 'custom-modules/hero' src/renderer/src/assets/main.css
# Cloudflare
test -f src/shared/cloudflare-relay-settings.ts && echo exists || echo MISSING
test -f src/shared/cloudflare-relay-status.ts && echo exists || echo MISSING
grep -c 'CloudflareRelaySettings' src/shared/settings/global-settings-base.ts
grep -c 'getCloudflareRelayStatus' src/preload/api/mobile/mobile-api.ts
grep -c 'getCloudflareRelayStatus' src/preload/api/mobile/mobile-bridge.ts
grep -c 'registerCloudflareRelayHandlers' src/main/ipc/mobile.ts
grep -c 'CloudflareRelaySection' src/renderer/src/components/settings/mobile/MobilePane.tsx
grep -c 'CloudflareRuntimeHint' src/renderer/src/components/settings/runtime-environments/pairing/runtime-share-computer-button.tsx
grep -c 'CloudflareRelayStatusSegment' src/renderer/src/components/status-bar/StatusBarSurface.tsx
# Right sidebar
grep -c "'issues'" src/shared/ui-chrome/ui-chrome-types.ts
grep -c STATIC_RIGHT_SIDEBAR_TABS src/shared/rpc-contract/client-ui/client-ui-params.ts
grep -c "'issues'" src/shared/ui-chrome/ui-chrome-types.ts
grep -c "'issues'" src/renderer/src/store/slices/right-sidebar/right-sidebar-route.ts
grep -c 'getCustomActivityItems' src/renderer/src/components/right-sidebar/activity-bar/use-right-sidebar-activity-items.ts
grep -c 'CustomPanelContent' src/renderer/src/components/right-sidebar/right-sidebar-panel-content.tsx
# Issues
grep -c 'IssueDetailsSurface' src/renderer/src/components/editor/EditorContent.tsx
test -f src/shared/types.ts && echo exists || echo MISSING
# Snippets GitLab
grep -c 'registerGitLabSnippetHandlers' src/main/ipc/source-control/gitlab.ts
grep -c 'custom-modules/snippets' src/preload/api/gitlab/gitlab-api.ts
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
grep -c 'TursoSettings' src/shared/settings/global-settings-base.ts
grep -c 'tursoDatabaseUrl' src/shared/settings/default-global-settings.ts
```

Setelah semua lolos:

```bash
pnpm tc          # typecheck (paling penting: import path upstream sering pindah)
# lint hanya file yang berubah:
pnpm exec oxlint <files>
pnpm exec oxlint --config config/oxlint-react-doctor.json <files>
pnpm exec oxfmt --check <files>
```

---

## Files Custom — tidak pernah disentuh upstream

```
src/custom-modules/                                  ← seluruhnya
src/shared/cloudflare-relay-settings.ts
src/shared/cloudflare-relay-status.ts
src/shared/voice-call-types.ts
src/shared/types.ts
src/shared/linear-repo-binding.ts
src/shared/issue-details-tab.ts
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
   `global-settings-*` → `shared/settings/global-settings-*`,
   `preload/api/*` → `preload/api/{mobile,gitlab}/*`,
   `ui-chrome-types` → `ui-chrome/ui-chrome-types`, `right-sidebar-route` → `slices/right-sidebar/…`.
2. **Relative depth custom-modules berubah** saat file upstream dipindah folder.
3. **Union/whitelist tab** (#13/#14/#16) — kalau upstream refactor routing, tab bisa
   silent-redirect walau komponennya ada.
4. **`PreloadApi` shape** berubah → bridge turso/cloudflare gagal `satisfies`.
5. **`mainProcessState` field** (mis. `runtimeRpc`) bisa hilang → degraded handler
   (cloudflare `getWsPort` → null). Cek `grep runtimeRpc`.
