import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { updateIssueAiWorkOutcome } from './issue-ai-work-registry'

/**
 * Watches agentStatusByPaneKey for the first working→idle/done transition on
 * any pane belonging to this worktree, then marks the run as succeeded.
 * Failure is inferred later from the tab process exit (currently surfaced via
 * the standard terminal notification, not this subscription).
 */
export function subscribeCompletionForWorktree(
  registryId: string,
  worktreeId: string,
  issueNumber: number
): void {
  let sawWorking = false
  const unsub = useAppStore.subscribe((state) => {
    const tabs = state.tabsByWorktree[worktreeId] ?? []
    for (const tab of tabs) {
      const prefix = `${tab.id}:`
      for (const [paneKey, entry] of Object.entries(state.agentStatusByPaneKey ?? {})) {
        if (!paneKey.startsWith(prefix) || !entry) {
          continue
        }
        if (entry.state === 'working') {
          sawWorking = true
        }
        if (sawWorking && entry.state === 'done') {
          updateIssueAiWorkOutcome(registryId, 'succeeded')
          toast.success(
            translate(
              'auto.components.right.sidebar.issuesPanel.aiWorkCompleted',
              'AI finished issue #{{value0}}. Review the branch, then create a PR/MR or discard.',
              { value0: issueNumber }
            )
          )
          unsub()
          return
        }
      }
    }
  })
}
