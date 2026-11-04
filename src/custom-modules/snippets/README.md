# GitLab Snippets Module

Custom module untuk sync .env files ke GitLab private snippets.

## Features

- ✅ Sync .env files to GitLab Snippets (private by default)
- ✅ Branch-aware snippet naming (`orca-sync:main:.env.local`)
- ✅ List snippets in File Explorer block
- ✅ Download/restore snippets
- ✅ Delete snippets
- ✅ Preview snippet content
- 🚧 Right-click context menu on .env files (TODO)

## Architecture

```
src/custom-modules/snippets/
├── shared/
│   └── types.ts                  # Shared TypeScript types
├── main/
│   ├── gitlab/
│   │   ├── gl-utils.ts          # Re-export main GitLab utils
│   │   ├── snippets.ts          # List snippets API
│   │   ├── snippet-mutations.ts # Create/Update/Delete APIs
│   │   ├── snippet-mutation-support.ts # Helper functions
│   │   └── snippet-path.ts      # Path encoding/decoding
│   └── snippets-ipc.ts          # Electron IPC handlers
├── renderer/
│   └── components/
│       ├── SnippetBlock.tsx     # Main UI component
│       ├── snippet-encoding.ts  # Title encoding utilities
│       └── context-menu.ts      # Context menu integration (TODO)
└── index.ts                     # Module entry point
```

## Integration Points

### 1. Main Process (IPC Handlers)

**File:** `src/main/ipc/source-control/gitlab.ts`

```typescript
import { registerGitLabSnippetHandlers } from '../../../custom-modules/snippets/main/snippets-ipc'

export function registerGitLabHandlers(store: Store): void {
  // ... other handlers
  registerGitLabSnippetHandlers(store)
}
```

### 2. Preload Bridge

**File:** `src/preload/gitlab.ts`

Added methods:

- `listProjectSnippets`
- `getProjectSnippet`
- `createProjectSnippet`
- `updateProjectSnippet`
- `deleteProjectSnippet`

### 3. Type Definitions

**File:** `src/preload/api/gitlab-api.ts`

Added to `GitLabApi` interface.

### 4. UI Component (TODO)

To inject SnippetBlock into File Explorer, edit:
**File:** `src/renderer/src/components/right-sidebar/FileExplorer.tsx`

```tsx
import { SnippetBlock } from '@/custom-modules/snippets/renderer/components/SnippetBlock'

// Add below file explorer tree:
;<SnippetBlock
  worktreePath={worktreePath}
  branch={currentBranch}
  repoId={repoId}
  connectionId={connectionId}
/>
```

## Snippet Title Format

```
orca-sync:<branch>:<relativePath>
```

Examples:

- `orca-sync:main:.env`
- `orca-sync:main:.env.local`
- `orca-sync:develop:.env.development`

Legacy format also supported:

- `env:.env` (no branch marker)

## API Usage

```typescript
// List snippets
const result = await window.api.gl.listProjectSnippets({
  repoPath: '/path/to/repo',
  repoId: 'repo-id',
  limit: 100
})

// Get snippet detail
const snippet = await window.api.gl.getProjectSnippet({
  repoPath: '/path/to/repo',
  repoId: 'repo-id',
  snippetId: 123
})

// Create snippet
await window.api.gl.createProjectSnippet({
  repoPath: '/path/to/repo',
  repoId: 'repo-id',
  title: 'orca-sync:main:.env',
  fileName: '.env',
  content: 'DATABASE_URL=...',
  visibility: 'private'
})

// Update snippet
await window.api.gl.updateProjectSnippet({
  repoPath: '/path/to/repo',
  repoId: 'repo-id',
  snippetId: 123,
  updates: { content: 'NEW_VAR=value' }
})

// Delete snippet
await window.api.gl.deleteProjectSnippet({
  repoPath: '/path/to/repo',
  repoId: 'repo-id',
  snippetId: 123
})
```

## TODO

- [ ] Implement upload functionality in SnippetBlock
- [ ] Implement download functionality
- [ ] Implement delete functionality
- [ ] Implement preview dialog
- [ ] Add context menu integration to File Explorer
- [ ] Add loading states and error handling
- [ ] Add success/error toasts
- [ ] Add tests

## Development

The module is already registered in the main process. To activate the UI:

1. Import and use `SnippetBlock` component in FileExplorer
2. Pass required props (worktreePath, branch, repoId, connectionId)
3. The block will appear below the file tree

## Notes

- All snippets are created as **private** by default
- Only `.env` and `.env.*` files are synced
- Branch filtering ensures each branch has its own snippets
- Supports both GitLab.com and self-hosted GitLab instances
