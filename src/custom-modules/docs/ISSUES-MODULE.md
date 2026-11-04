# Issues Module

Right-sidebar Issues panel for GitHub / GitLab / Linear with AI plan + AI work,
issue detail dialog, and Convert-to-orchestration.

## Files

```
issues/
├── panel.tsx                                   entry (re-export, lazy-loaded)
├── shared/types.ts                             type barrel for the module
└── renderer/src/components/
    ├── editor/
    │   ├── issue-details-surface.tsx           main-view tab surface
    │   └── issue-details-tab.ts → shared/issue-details-tab.ts
    ├── issue-board/                            board view (unused by panel yet)
    └── right-sidebar/                          panel + rows, dialogs, AI actions
```

## Upstream touch points (all live)

- `src/shared/ui-chrome-types.ts` — `'issues'` and `'orchestration'` right-sidebar tabs
- `src/shared/rpc-contract/client-ui-params.ts` — both tabs in `STATIC_RIGHT_SIDEBAR_TABS`
- `src/main/persistence/applying-settings/ui-selection-normalization.ts` — persists both tabs
- `src/custom-modules/custom-right-sidebar-tabs.ts` / `custom-activity-items.ts` /
  `custom-panel-content.tsx` — tab registration and panel router
- `src/shared/tab-types.ts`, `src/shared/editor-tab-view-types.ts`,
  `src/renderer/src/store/slices/editor/**` — `issue-details` virtual editor tab mode
- `src/renderer/src/components/github-item-dialog/**` and
  `src/renderer/src/components/gitlab-item-dialog/**` — `tabBarTrailingSlot` prop carries the
  issue AI action bar into the dialog header

## Ported support modules

Restored because the panel needs them and orca-clean lacked the current versions:

- `src/shared/agent-run-attribution.ts`, `src/shared/agent-followup-coalesce.ts`
- `src/shared/issue-details-tab.ts`, `src/shared/linear-repo-binding.ts`
- `src/renderer/src/lib/issue-to-orchestration-task.ts` (RPC `orchestration.taskCreate`)
- `src/renderer/src/lib/github-work-item-background-{create,request}.ts`
- `src/renderer/src/lib/source-control-launch-platform.ts`
- `getSettingsForRepoRuntimeOwner` restored in `src/renderer/src/lib/repo-runtime-owner.ts`

## API drift handled during the port

| Upstream change                                                        | Adaptation                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------------- |
| `updateRepoById` removed                                               | `updateRepo(id, updates, { hostId })`                       |
| `listLinearProjectIssues` returns a read handle                        | `observeLinearIssueRead()` in the panel effect              |
| `launchAgentInNewTabWithOutcome` requires `requestId`                  | pass `newAgentLaunchRequestId()`                            |
| `removeWorktree` needs a host-qualified target                         | `{ id, executionHostId }` from `getKnownWorktreeById`       |
| setup/issue-command/pr-start helpers take a host                       | pass the repo owner host from `resolveDirectLaunchOwnerRow` |
| dialogs dropped `presentation`/`tabBarTrailingSlot`/`onOpenInMainView` | re-added as optional props                                  |
| `Repo` had no `linear` binding                                         | added `LinearRepoBinding` + persistence/sanitization        |

## Notes

- There is no IPC main module: data flows through `window.api.gh.*`, `window.api.gl.*`, the
  Linear store slice, and `orchestration.taskCreate`.
- `issues-panel-ai-work.ts` and `issue-ai-work-prompt.ts` both export a prompt builder; the
  richer one (`issue-ai-work-prompt.ts`, with `branchName` + focus comments) is the one under test.
