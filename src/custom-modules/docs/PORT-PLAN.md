# Port Plan — Custom Modules dari orca-old ke orca-clean

Source: `/home/rizoa/PROJECTS_IKAMAI/orca-old/src/custom-modules/`
Target: `/home/rizoa/PROJECTS_IKAMAI/orca-clean/src/custom-modules/`

Status per module:

| Module       | Complexity | IPC Main?        | Status     |
| ------------ | ---------- | ---------------- | ---------- |
| `hero`       | Low        | No               | ✅ Done    |
| `issues`     | High       | No               | ⏳ Pending |
| `snippets`   | Medium     | Yes              | ⏳ Pending |
| `s3`         | Medium     | Yes              | ⏳ Pending |
| `cloudflare` | Medium     | Yes (status bar) | ⏳ Pending |
| `voice`      | High       | Yes              | ⏳ Pending |

---

## Module 1: `hero` ✅ Done

Sudah di-port. Lihat `HERO-MODULE.md`.

---

## Module 2: `issues`

**Apa**: Panel right sidebar untuk browsing dan manajemen issues dari GitHub, GitLab, dan Linear.

**Fitur**:

- List open issues dengan provider tab switcher (GitHub / GitLab / Linear)
- Create issue (dialog form)
- Close issue dengan konfirmasi
- Detail modal per provider
- AI Plan: kirim issue ke agent untuk dibuatkan implementation plan (comment ke issue)
- AI Work: assign issue ke agent untuk langsung dikerjakan
- Convert to Orchestration task
- Linear project picker + attachment
- Issue strands chat: chat panel per-issue dengan reasoning bubble

**File**:

```
issues/
├── panel.tsx                          ← Entry stub (placeholder, real panel di renderer/)
└── renderer/src/components/
    ├── editor/
    │   └── issue-details-tab.ts       ← Integrasi issue context ke editor tab
    ├── issue-board/
    │   ├── IssueBoardPage.tsx         ← Full kanban board view
    │   ├── IssueBoardColumn.tsx       ← Kolom kanban (To Do / In Progress / Done)
    │   ├── IssueBoardCard.tsx         ← Card issue di board
    │   ├── issue-board-filters.ts     ← Filter logic (label, assignee, milestone)
    │   └── use-issue-board-data.ts    ← Data fetching hook untuk board
    └── right-sidebar/
        ├── IssuesPanel.tsx            ← Main panel component (orchestration hub)
        ├── issues-panel-rows.ts       ← Normalize GitHub/GitLab/Linear → IssueRow
        ├── issues-panel-list.tsx      ← Virtualized list + row actions
        ├── issues-panel-empty.tsx     ← Empty state component
        ├── issues-panel-create-dialog.tsx  ← Form create issue
        ├── issues-panel-create-actions.ts  ← API calls untuk create/close issue
        ├── issues-panel-detail-modals.tsx  ← GitHub/GitLab detail sheet
        ├── issues-panel-close-confirm.ts   ← Confirmation dialog helper
        ├── issues-panel-workspace-actions.ts ← "Use this issue" → open workspace
        ├── issues-panel-agent-order.ts     ← Order agent tasks berdasarkan issues
        ├── issues-panel-ai-plan.ts    ← Launch AI plan commenter ke issue
        ├── issues-panel-ai-work.ts    ← Launch AI worker untuk kerjakan issue
        ├── issue-ai-work-registry.ts  ← Track in-progress AI work per issue
        ├── issue-ai-work-claim.ts     ← Claim/release AI work lock
        ├── issue-ai-work-badge.tsx    ← Badge "AI working" di issue row
        ├── issue-ai-work-actions.tsx  ← Action buttons (plan/work/stop)
        ├── issue-ai-work-completion-watcher.ts ← Watch agent done → update issue
        ├── issue-ai-work-prompt.ts    ← System prompt builder untuk AI work
        ├── issue-detail-action-bar.tsx ← Action bar di detail sheet
        ├── issue-detail-metadata-controls.tsx ← Assignee/label/milestone controls
        ├── issue-detail-metadata-menus.tsx    ← Dropdown menus untuk metadata
        ├── issue-row-ai-menus.tsx     ← Context menu AI actions di row
        ├── issue-strands-chat-panel.tsx  ← Chat panel per-issue (strands)
        ├── issue-strands-chat-header.tsx ← Header chat panel
        ├── issue-strands-chat-messages.tsx ← Message list + rendering
        └── issue-strands-reasoning-bubble.tsx ← Reasoning/tool call bubble
```

**IPC Main**: Tidak. Semua data fetching lewat existing Orca API (`window.api.gh.*`, `window.api.gl.*`, `useAppStore.listLinearProjectIssues`).

**Upstream touch points yang perlu ditambah**:

- Right sidebar activity bar (tab icon)
- Right sidebar panel content router
- `ui-chrome-types.ts` (tab ID `'issues'`)

**Kompleksitas port**: Medium-High. File banyak tapi tidak ada IPC baru. Sebagian besar bisa copy langsung, perlu cek `@/` alias dan import dari `../../../../shared/types`.

**Dependency pada Orca internals**:

- `useActiveWorktree`, `useRepoById` (store selectors)
- `useAppStore`: `fetchWorkItems`, `openModal`, `listLinearProjectIssues`, `setRightSidebarTab`, `openOrchestrationBoardPage`
- `window.api.gl.listIssues`
- `createOrchestrationTaskFromIssue` (Orca lib)
- `LinearIssueWorkspace` (Orca component)
- `useConfirmationDialog`

---

## Module 3: `snippets`

**Apa**: Panel right sidebar untuk GitLab snippets dan env variable sync antar branch.

**Fitur**:

- List project snippets dari GitLab
- Create / edit / delete snippet dengan rich markdown editor
- Sync `.env` variables: pull dari snippet, push ke snippet
- Preview dialog untuk snippet content
- File explorer section (snippet shortcut di sidebar file tree)

**File**:

```
snippets/
├── panel.tsx                    ← Entry stub (placeholder)
├── FileExplorerSnippetSection.tsx ← Section di file explorer sidebar
├── shared/
│   └── types.ts                 ← GitLabSnippet, SnippetFile types
├── main/
│   ├── snippets-ipc.ts          ← registerGitLabSnippetHandlers() — IPC handlers
│   └── gitlab/
│       ├── snippets.ts          ← GitLab API calls (list/get/create/update/delete)
│       ├── snippet-mutations.ts ← Create/update/delete mutations
│       ├── snippet-mutation-support.ts ← Shared helpers untuk mutations
│       ├── snippet-path.ts      ← Path resolution untuk snippet files
│       └── gl-utils.ts          ← GitLab API utilities
└── renderer/src/components/right-sidebar/
    ├── GitLabSnippetsPanel.tsx  ← Main panel
    ├── gitlab-snippet-dialog.tsx ← Create/edit dialog
    ├── gitlab-snippet-dialog-form.tsx ← Form fields
    ├── snippet-rich-markdown-editor.tsx ← Editor komponen
    ├── env-snippet-sync-section.tsx ← Env sync UI section
    ├── env-snippet-sync-list.tsx    ← List env vars
    ├── env-snippet-sync-extras.tsx  ← Extra actions (push all/pull all)
    ├── env-snippet-sync-actions.ts  ← Business logic sync
    ├── env-snippet-sync-encoding.ts ← Base64 encode/decode env files
    ├── env-snippet-sync-store.ts    ← Zustand store untuk sync state
    ├── env-snippet-preview-dialog.tsx ← Preview diff sebelum sync
    └── use-env-snippet-sync-actions.ts ← Hook untuk sync actions
```

**IPC Main**: Ya. `snippets-ipc.ts` mendaftarkan handlers:

- `gl:listProjectSnippets`
- `gl:getProjectSnippet`
- `gl:createProjectSnippet`
- `gl:updateProjectSnippet`
- `gl:deleteProjectSnippet`

Perlu `registerGitLabSnippetHandlers(store)` dipanggil di main process IPC setup.

**Upstream touch points**:

- Right sidebar activity bar + panel router
- `ui-chrome-types.ts` (tab ID `'snippets'`)
- Main IPC registration file (1 function call)

**Dependency pada Orca internals**:

- `Store` dari `main/persistence`
- `assertRegisteredRepo`, `localGitOptionArgs`, `repoConnectionId` dari `main/ipc/gitlab-repo-access`

---

## Module 4: `s3`

**Apa**: Panel right sidebar untuk browse dan upload ke S3-compatible object storage.

**Fitur**:

- Connect ke S3 endpoint (custom/AWS/MinIO/R2) dengan credentials form
- Browse bucket objects dengan prefix filter
- Upload file dari worktree ke bucket
- Upload progress tracking (per-file progress bar)
- Delete / download object
- Settings integration card

**File**:

```
s3/
├── panel.tsx                  ← Entry stub (placeholder)
├── S3ConnectDialog.tsx        ← Dialog connect/configure credentials
├── S3IntegrationCard.tsx      ← Settings page card
├── shared/
│   └── s3-types.ts            ← S3ConnectionConfig, S3ObjectSummary, dll types
├── main/
│   ├── s3-ipc.ts              ← registerS3Handlers() — 8 IPC handlers
│   ├── integration-error-message.ts ← Error message helpers
│   └── s3/
│       ├── client.ts          ← S3 client state (connect/disconnect/upload/list/delete/download)
│       ├── client.test.ts     ← Unit tests client
│       ├── s3-object-ops.ts   ← Low-level S3 object operations
│       └── sigv4.ts           ← SigV4 request signing (no AWS SDK)
└── renderer/src/components/right-sidebar/
    ├── s3-object-browser-section.tsx ← Main browser UI
    ├── s3-filter-bar.tsx             ← Search/filter bar
    ├── s3-object-key.ts              ← Key parsing dan display helpers
    ├── s3-upload-manager.ts          ← Upload queue + progress tracking
    └── s3-upload-progress-row.tsx    ← Progress row UI per upload
```

**IPC Main**: Ya. `s3-ipc.ts` mendaftarkan:

- `s3:getStatus`
- `s3:connect`
- `s3:disconnect`
- `s3:testConnection`
- `s3:uploadFile`
- `s3:listObjects`
- `s3:deleteObject`
- `s3:downloadObject`

Perlu `registerS3Handlers()` dipanggil di main IPC setup (tanpa argumen — stateful singleton).

**Upstream touch points**:

- Right sidebar activity bar + panel router
- `ui-chrome-types.ts` (tab ID `'s3'`)
- Main IPC registration + preload bridge

**Dependency pada Orca internals**: Minimal. S3 client adalah pure Node.js (tidak pakai AWS SDK). SigV4 diimplementasi sendiri.

---

## Module 5: `cloudflare`

**Apa**: Bukan panel sidebar — ini **status bar segment** dan **settings section**. Mengelola Cloudflare Tunnel untuk expose local port ke internet (untuk mobile pairing atau remote access).

**Fitur**:

- Provision dan manage Cloudflare tunnel via `cloudflared` binary
- Status indicator di status bar (Wifi icon: running/error/disabled)
- Copy tunnel URL ke clipboard
- Restart tunnel dari status bar
- Settings section (token + domain input)

**File**:

```
cloudflare/
├── CloudflareRelaySection.tsx     ← Settings section (token/domain form)
├── CloudflareRelayStatusSegment.tsx ← Status bar segment component
├── shared/
│   └── cloudflare-relay-status.ts ← CloudflareRelayStatusPayload type
└── main/
    ├── cloudflare-relay-ipc.ts    ← initCloudflareRelayIpc() — IPC + service init
    ├── persistence/
    │   └── index.ts               ← Read cloudflareRelayToken/Domain dari settings
    └── runtime/cloudflare-relay/
        ├── cloudflare-relay.ts    ← CloudflareRelayService — manage cloudflared process
        ├── cloudflare-relay-provision.ts ← Download/verify cloudflared binary
        └── cloudflare-relay.test.ts
```

**IPC Main**: Ya. `cloudflare-relay-ipc.ts` mendaftarkan via `mobile:*` namespace (shared dengan mobile pairing IPC):

- `mobile:getCloudflareRelayStatus`
- `mobile:restartCloudflareRelay`

Perlu `initCloudflareRelayIpc()` dipanggil setelah `firstWindowStartupServicesReady`.

**Upstream touch points**:

- Status bar component (inject `<CloudflareRelayStatusSegment>`)
- `ui-chrome-types.ts` — tidak ada tab ID baru, tapi mungkin perlu settings type
- Main IPC init file

**Dependency pada Orca internals**:

- `mainProcessState` dari `main/startup/main-process-state`
- `getCanonicalUserDataPath` dari `main/persistence`
- Settings fields: `cloudflareRelayToken`, `cloudflareRelayDomain` (perlu tambah ke settings schema jika belum ada)

---

## Module 6: `voice`

**Apa**: Panel right sidebar untuk voice call real-time (Gemini Live API atau OpenAI Realtime API) yang bisa mendelegasikan coding tasks ke Pi SDK agent.

**Fitur**:

- Connect ke Gemini Live atau OpenAI Realtime WebSocket
- Mic input via AudioWorklet (low-latency, no UI thread blocking)
- Real-time transcript (user speech + agent response)
- "Coding mode": utterance → Pi SDK task → agent report → spoken summary
- Provider switcher (Gemini / OpenAI)
- Voice selector per provider
- API key management (save/clear per provider, encrypted)
- Pi model selector
- Rate control (playback speed)
- Stop button saat agent sedang working

**File**:

```
voice/
├── panel.tsx                  ← Main panel (self-contained, full voice call UI)
├── VoiceIntegrationCard.tsx   ← Settings page card
├── shared/
│   ├── voice-call-types.ts    ← VoiceCallProvider, VoiceCallStatus, VoiceCallEvent types
│   └── pi-issue-chat-types.ts ← PiIssueChatEvent types (shared dengan issue chat)
├── main/
│   ├── voice-key-ipc.ts       ← Key management IPC (save/clear/status)
│   ├── ipc/
│   │   └── voice-call.ts      ← registerVoiceCallHandlers() — full IPC handler set
│   └── voice/
│       ├── gemini-api-key-store.ts   ← Encrypted Gemini key storage
│       ├── openai-api-key-store.ts   ← Encrypted OpenAI key storage
│       ├── gemini-live-client.ts     ← Gemini Live WebSocket client
│       ├── openai-realtime-client.ts ← OpenAI Realtime WebSocket client
│       ├── voice-call-session.ts     ← Session management (start/send/stop/close)
│       ├── voice-call-pi-task.ts     ← Pi SDK task runner untuk coding mode
│       └── voice-call-prompts.ts     ← System prompts untuk coding/chat mode
└── renderer/src/
    ├── components/right-sidebar/
    │   ├── VoiceCallPanel.tsx         ← (legacy, superseded oleh panel.tsx)
    │   ├── voice-call-controls.tsx    ← Header controls (provider/voice/model/rate)
    │   ├── voice-call-api-key-setup.tsx ← Setup screen saat key belum ada
    │   └── voice-call-transcript.tsx  ← Transcript display component
    ├── hooks/
    │   └── use-voice-mic.ts           ← Hook: mic stream → AudioWorklet → IPC
    └── voice/
        └── mic-worklet.mjs            ← AudioWorklet processor (PCM16 capture)
```

**IPC Main**: Ya, paling kompleks. `voice-call.ts` mendaftarkan:

- `voiceCall:getKeyStatus` (aggregated gemini + openai)
- `voiceCall:saveGeminiApiKey` / `clearGeminiApiKey`
- `voiceCall:saveOpenAiApiKey` / `clearOpenAiApiKey`
- `voiceCall:start` / `voiceCall:send` / `voiceCall:stop` / `voiceCall:close`
- `voiceCall:setContext` (coding mode + piModelRef)
- `voiceCall:sendAudioChunk` / `voiceCall:sendAudioStreamEnd` (mic stream)

Renderer ↔ Main communication:

- Main → Renderer push via `sender.send('voiceCall:event', event)` (streaming events)

Perlu `registerVoiceCallHandlers()` di main IPC setup + preload bridge untuk expose ke `window.api.voiceCall`.

**Upstream touch points**:

- Right sidebar activity bar + panel router
- `ui-chrome-types.ts` (tab ID `'voice'`)
- Main IPC registration + preload bridge (paling banyak perubahan)

**Dependency pada Orca internals**:

- Pi SDK task runner integration (`voice-call-pi-task.ts` pakai Orca's agent/task system)
- `window.api.piIssueChat.listModels` (untuk Pi model picker)
- Encrypted key storage (pakai pattern yang sama dengan Orca's secret store)

---

## Urutan Port yang Disarankan

Port dari yang paling mudah ke yang paling kompleks:

1. **`issues`** — renderer-only, tidak ada IPC baru, paling banyak fitur yang langsung jalan
2. **`snippets`** — IPC sederhana, GitLab integration sudah ada di Orca
3. **`s3`** — IPC self-contained, tidak ada dependency Orca internals yang berat
4. **`cloudflare`** — perlu cek settings schema dan mobile IPC namespace
5. **`voice`** — paling kompleks, perlu Pi SDK integration dan preload bridge besar

## Custom Registry Files (dari orca-old, perlu di-port juga)

Di `orca-old` ada 3 file registry di root `custom-modules/`:

```
custom-activity-items.ts    ← Daftar icon + title semua custom tabs
custom-panel-content.tsx    ← Router: tab ID → lazy component
custom-right-sidebar-tabs.ts ← Type definitions custom tab IDs
```

Di `orca-clean` kita belum punya ini (hanya ada `hero` yang inject langsung ke main window).
Ketika port issues/snippets/s3/voice, kita perlu bikin versi baru file-file ini untuk
wire semua ke right sidebar.

Upstream files yang perlu disentuh saat port sidebar modules:

- `src/shared/ui-chrome-types.ts` — tambah tab IDs ke `RightSidebarTab` union
- `src/renderer/src/components/right-sidebar/use-right-sidebar-activity-items.ts` — spread custom items
- `src/renderer/src/components/right-sidebar/right-sidebar-panel-content.tsx` — render custom panels
