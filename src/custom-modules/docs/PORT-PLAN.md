# Port Plan — Custom Modules dari orca-old ke orca-clean

Source: `/home/rizoa/PROJECTS_IKAMAI/orca-old/src/custom-modules/`
Target: `/home/rizoa/PROJECTS_IKAMAI/orca-clean/src/custom-modules/`

## Status

| Module       | Complexity | IPC Main? | Status     | Notes                                                |
| ------------ | ---------- | --------- | ---------- | ---------------------------------------------------- |
| `hero`       | Low        | No        | ✅ Done    | Lihat `HERO-MODULE.md`                               |
| `cloudflare` | Medium     | Yes       | ✅ Done    | Lihat `CLOUDFLARE-MODULE.md`                         |
| `issues`     | High       | No        | ⏳ Pending | `openOrchestrationBoardPage` tidak ada di orca-clean |
| `snippets`   | Medium     | Yes       | ⏳ Pending | Dependency upstream OK                               |
| `s3`         | Medium     | Yes       | ⏳ Pending | Dependency upstream OK                               |
| `voice`      | High       | Yes       | ⏳ Pending | `window.api.piIssueChat` & `voiceCall` belum ada     |

---

## Module 1: `hero` ✅ Done

Lihat `HERO-MODULE.md` dan `INJECTION-MAP.md`.

---

## Module 2: `cloudflare` ✅ Done

Lihat `CLOUDFLARE-MODULE.md` dan `INJECTION-MAP.md`.

---

## Module 3: `issues`

**Apa**: Panel right sidebar untuk GitHub / GitLab / Linear issues dengan AI work integration.

**Dependency check** (semua di orca-clean):

- `fetchWorkItems` — ✅ ada di store
- `listLinearProjectIssues` — ✅ ada di store
- `setRightSidebarTab` — ✅ ada di store
- `LinearIssueWorkspace` component — ✅ ada
- `window.api.gh.*`, `window.api.gl.*` — ✅ ada
- `openOrchestrationBoardPage` — ❌ **tidak ada** di orca-clean
- `createOrchestrationTaskFromIssue` — ❌ **tidak ada** di orca-clean

**Strategi port**: Copy semua file, hapus/stub bagian orchestration (`handleConvertToOrchestration`,
`convertingIssueId`, `openOrchestrationBoardPage`). Fitur core issues + AI plan/work tetap jalan.

**Files yang perlu di-copy** (dari orca-old):

```
issues/
├── panel.tsx                          ← Entry stub — sudah bersih
└── renderer/src/components/
    ├── right-sidebar/
    │   ├── IssuesPanel.tsx            ← Hapus orchestration section
    │   ├── issues-panel-rows.ts
    │   ├── issues-panel-list.tsx
    │   ├── issues-panel-empty.tsx
    │   ├── issues-panel-create-dialog.tsx
    │   ├── issues-panel-create-actions.ts
    │   ├── issues-panel-detail-modals.tsx
    │   ├── issues-panel-close-confirm.ts
    │   ├── issues-panel-workspace-actions.ts
    │   ├── issues-panel-ai-plan.ts
    │   ├── issues-panel-ai-work.ts
    │   ├── issues-panel-ai-work-registry.ts
    │   ├── issues-panel-ai-work-claim.ts
    │   ├── issues-panel-ai-work-badge.tsx
    │   ├── issues-panel-ai-work-actions.tsx
    │   ├── issues-panel-ai-work-completion-watcher.ts
    │   ├── issues-panel-ai-work-prompt.ts
    │   ├── issues-panel-detail-action-bar.tsx
    │   ├── issues-panel-detail-metadata-controls.tsx
    │   ├── issues-panel-detail-metadata-menus.tsx
    │   ├── issue-row-ai-menus.tsx
    │   ├── issues-panel-agent-order.ts
    │   ├── IssuesPanel.tsx
    │   ├── issues-panel-workspace-actions.ts
    │   ├── issue-strands-chat-panel.tsx
    │   ├── issue-strands-chat-header.tsx
    │   ├── issue-strands-chat-messages.tsx
    │   └── issue-strands-reasoning-bubble.tsx
    └── issue-board/
        ├── IssueBoardPage.tsx
        ├── IssueBoardColumn.tsx
        ├── IssueBoardCard.tsx
        ├── issue-board-filters.ts
        └── use-issue-board-data.ts
```

**Upstream touch points** (right sidebar registry — belum dibuat):

- `src/shared/ui-chrome-types.ts` — tambah `'issues'` ke `RightSidebarTab`
- `src/renderer/src/components/right-sidebar/use-right-sidebar-activity-items.ts` — tambah activity item
- `src/renderer/src/components/right-sidebar/right-sidebar-panel-content.tsx` — tambah panel router

**IPC Main**: Tidak. Semua data via existing `window.api.gh.*`, `window.api.gl.*`, store.

---

## Module 4: `snippets`

**Apa**: Panel right sidebar GitLab snippets + env variable sync.

**Dependency check**:

- `assertRegisteredRepo`, `localGitOptionArgs`, `repoConnectionId` — ✅ ada di `main/ipc/gitlab-repo-access.ts`
- `Store` dari `main/persistence` — ✅ ada
- `window.api.gl.*` — ✅ ada

**Files yang perlu di-copy**:

```
snippets/
├── panel.tsx
├── FileExplorerSnippetSection.tsx
├── shared/types.ts
├── main/
│   ├── snippets-ipc.ts              ← registerGitLabSnippetHandlers(store)
│   └── gitlab/
│       ├── snippets.ts
│       ├── snippet-mutations.ts
│       ├── snippet-mutation-support.ts
│       ├── snippet-path.ts
│       └── gl-utils.ts
└── renderer/src/components/right-sidebar/
    ├── GitLabSnippetsPanel.tsx
    ├── gitlab-snippet-dialog.tsx
    ├── gitlab-snippet-dialog-form.tsx
    ├── snippet-rich-markdown-editor.tsx
    ├── env-snippet-sync-section.tsx
    ├── env-snippet-sync-list.tsx
    ├── env-snippet-sync-extras.tsx
    ├── env-snippet-sync-actions.ts
    ├── env-snippet-sync-encoding.ts
    ├── env-snippet-sync-store.ts
    ├── env-snippet-preview-dialog.tsx
    └── use-env-snippet-sync-actions.ts
```

**Upstream touch points**:

- `src/shared/ui-chrome-types.ts` — tambah `'snippets'`
- Right sidebar registry (activity item + panel router)
- `src/main/ipc/` — `registerGitLabSnippetHandlers(store)` 1 call
- Preload bridge — expose `window.api.gl.listProjectSnippets` etc (cek apakah sudah ada)

---

## Module 5: `s3`

**Apa**: Panel right sidebar S3-compatible object browser + upload.

**Dependency check**:

- Pure Node.js, tidak ada Electron API khusus — ✅ clean

**Files yang perlu di-copy**:

```
s3/
├── panel.tsx
├── S3ConnectDialog.tsx
├── S3IntegrationCard.tsx
├── shared/s3-types.ts              ← Copy ke src/shared/s3-types.ts juga
├── main/
│   ├── s3-ipc.ts                   ← registerS3Handlers()
│   ├── integration-error-message.ts
│   └── s3/
│       ├── client.ts
│       ├── s3-object-ops.ts
│       └── sigv4.ts
└── renderer/src/components/right-sidebar/
    ├── s3-object-browser-section.tsx
    ├── s3-filter-bar.tsx
    ├── s3-object-key.ts
    ├── s3-upload-manager.ts
    └── s3-upload-progress-row.tsx
```

**Upstream touch points**:

- `src/shared/ui-chrome-types.ts` — tambah `'s3'`
- Right sidebar registry
- `src/main/ipc/` — `registerS3Handlers()` 1 call
- Preload — expose `window.api.s3.*`

---

## Module 6: `voice`

**Apa**: Panel right sidebar voice call real-time (Gemini Live / OpenAI Realtime) + Pi SDK coding mode.

**Dependency check**:

- `window.api.voiceCall` — ❌ belum ada di orca-clean preload
- `window.api.piIssueChat.listModels` — ❌ belum ada
- `useAppStore.settings.agentDefaultEnv` — perlu cek

**Catatan**: Module ini paling kompleks. Butuh:

1. AudioWorklet (`mic-worklet.mjs`) — perlu Vite config untuk handle `.mjs` worklet
2. `voice-call-pi-task.ts` — integrasi Pi SDK, perlu verifikasi API masih sama di orca-clean
3. Preload bridge baru yang cukup besar

**Files yang perlu di-copy**:

```
voice/
├── panel.tsx
├── VoiceIntegrationCard.tsx
├── shared/
│   ├── voice-call-types.ts
│   └── pi-issue-chat-types.ts
├── main/
│   ├── voice-key-ipc.ts
│   ├── ipc/voice-call.ts           ← registerVoiceCallHandlers()
│   └── voice/
│       ├── gemini-api-key-store.ts
│       ├── openai-api-key-store.ts
│       ├── gemini-live-client.ts
│       ├── openai-realtime-client.ts
│       ├── voice-call-session.ts
│       ├── voice-call-pi-task.ts
│       └── voice-call-prompts.ts
└── renderer/src/
    ├── components/right-sidebar/
    │   ├── VoiceCallPanel.tsx
    │   ├── voice-call-controls.tsx
    │   ├── voice-call-api-key-setup.tsx
    │   └── voice-call-transcript.tsx
    ├── hooks/use-voice-mic.ts
    └── voice/mic-worklet.mjs
```

**Upstream touch points**:

- `src/shared/ui-chrome-types.ts` — tambah `'voice'`
- Right sidebar registry
- Main IPC — `registerVoiceCallHandlers()`
- Preload — expose `window.api.voiceCall.*` (banyak methods)

---

## Right Sidebar Registry (dibutuhkan semua sidebar modules)

Saat port issues/snippets/s3/voice, perlu bikin 3 registry files dan sentuh 3 upstream files:

### Files baru di custom-modules (kita buat):

```
src/custom-modules/
├── custom-right-sidebar-tabs.ts    ← CUSTOM_SIDEBAR_TAB_IDS + isCustomSidebarTab()
├── custom-activity-items.ts        ← getCustomActivityItems() — icon + title per tab
└── custom-panel-content.tsx        ← <CustomPanelContent> — router tab → panel
```

### Upstream touch points tambahan:

```
src/shared/ui-chrome-types.ts
  → tambah ke RightSidebarTab union: | 'issues' | 'snippets' | 's3' | 'voice'

src/renderer/src/components/right-sidebar/use-right-sidebar-activity-items.ts
  → import + spread getCustomActivityItems()

src/renderer/src/components/right-sidebar/right-sidebar-panel-content.tsx
  → import + render <CustomPanelContent tab={effectiveTab} />
```

---

## Urutan Port yang Disarankan

1. **Bikin right sidebar registry dulu** — dibutuhkan semua module berikutnya
2. **`snippets`** — dependency paling bersih, IPC sederhana
3. **`s3`** — IPC self-contained, tidak ada dependency Orca internal berat
4. **`issues`** — port tanpa orchestration dulu, bisa ditambah nanti
5. **`voice`** — port terakhir, paling kompleks
