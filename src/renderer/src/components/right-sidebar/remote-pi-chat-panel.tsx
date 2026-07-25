/**
 * Pi agent chat panel for the remote-chat sidebar tab.
 * Reuses IssueStrandsChatPanel with a worktree-scoped session
 * (no issue context — general coding assistant for the workspace).
 */
import { IssueStrandsChatPanel } from './issue-strands-chat-panel'
import { splitWorktreeId } from '../../../../shared/worktree-id'
import { translate } from '@/i18n/i18n'

type RemotePiChatPanelProps = {
  isVisible: boolean
  worktreeId: string
  /** Absolute local path of the worktree — used as cwd for the pi session. */
  cwd: string
}

/** Sanitize worktreeId to a safe session key. */
function piSessionId(worktreeId: string): string {
  return `pi-chat:${worktreeId}`
}

export default function RemotePiChatPanel({
  worktreeId,
  cwd
}: RemotePiChatPanelProps): React.JSX.Element {
  const parsed = splitWorktreeId(worktreeId)
  // Why: use the worktree filesystem path as cwd when available;
  // fall back to the prop cwd (SSH / remote path already resolved by caller).
  const resolvedCwd = parsed?.worktreePath ?? cwd

  if (!resolvedCwd) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
        {translate(
          'auto.components.right.sidebar.RemotePiChatPanel.noCwd',
          'Could not resolve workspace path for pi chat.'
        )}
      </div>
    )
  }

  return (
    <IssueStrandsChatPanel
      sessionId={piSessionId(worktreeId)}
      cwd={resolvedCwd}
      issueContext={translate(
        'auto.components.right.sidebar.RemotePiChatPanel.context',
        'You are a coding assistant for this workspace. Help with code, files, and shell commands.'
      )}
      className="rounded-none border-0"
    />
  )
}
