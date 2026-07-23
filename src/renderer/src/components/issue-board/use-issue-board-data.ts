import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { GitLabWorkItem, Repo } from '../../../../shared/types'
import { getRepoIssueSourceContext } from '../right-sidebar/issues-panel-rows'

const PAGE_LIMIT = 100

export type IssueBoardStatus = 'idle' | 'loading' | 'ready' | 'error'

export type IssueBoardData = {
  status: IssueBoardStatus
  openIssues: GitLabWorkItem[]
  closedIssues: GitLabWorkItem[]
  error: string | null
  refresh: () => void
  moveIssue: (issue: GitLabWorkItem, toColumn: 'open' | 'closed') => Promise<void>
}

async function fetchColumn(
  repo: Repo,
  state: 'opened' | 'closed'
): Promise<{ items: GitLabWorkItem[]; error?: string }> {
  const sourceContext = getRepoIssueSourceContext(repo, 'gitlab')
  const result = (await window.api.gl.listIssues({
    repoPath: repo.path,
    repoId: repo.id,
    sourceContext,
    state,
    limit: PAGE_LIMIT
  })) as { items: GitLabWorkItem[]; error?: { type?: string; message: string } }
  if (result.error && result.error.type !== 'not_found') {
    return { items: [], error: result.error.message }
  }
  return { items: result.items }
}

/**
 * Loads open + closed GitLab issues for a single repo, with optimistic drag
 * updates. Keeps the two lists as separate state so a slow close mutation
 * doesn't visually snap the card back through the whole list.
 */
export function useIssueBoardData(repo: Repo | null): IssueBoardData {
  const [openIssues, setOpenIssues] = useState<GitLabWorkItem[]>([])
  const [closedIssues, setClosedIssues] = useState<GitLabWorkItem[]>([])
  const [status, setStatus] = useState<IssueBoardStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)
  const [refreshNonce, setRefreshNonce] = useState(0)

  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    cancelledRef.current = false
    if (!repo) {
      setOpenIssues([])
      setClosedIssues([])
      setStatus('idle')
      setError(null)
      return () => {
        cancelledRef.current = true
      }
    }
    setStatus('loading')
    setError(null)
    void (async () => {
      try {
        const [opened, closed] = await Promise.all([
          fetchColumn(repo, 'opened'),
          fetchColumn(repo, 'closed')
        ])
        if (cancelledRef.current) {
          return
        }
        const firstError = opened.error ?? closed.error ?? null
        setOpenIssues(opened.items)
        setClosedIssues(closed.items)
        setError(firstError)
        setStatus(firstError ? 'error' : 'ready')
      } catch (err) {
        if (cancelledRef.current) {
          return
        }
        setError(err instanceof Error ? err.message : String(err))
        setStatus('error')
      }
    })()
    return () => {
      cancelledRef.current = true
    }
  }, [repo, refreshNonce])

  const moveIssue = useCallback(
    async (issue: GitLabWorkItem, toColumn: 'open' | 'closed') => {
      if (!repo) {
        return
      }
      const targetState = toColumn === 'open' ? 'opened' : 'closed'
      const currentState = issue.state === 'closed' ? 'closed' : 'open'
      // Why: if the card is dropped back into the same column, there's nothing
      // to persist. Skip the round-trip so the API rate limit is spared.
      if (currentState === toColumn) {
        return
      }

      // Optimistic UI: pull from the source column, push into the target.
      const sourceIsOpen = currentState === 'open'
      const previousOpen = openIssues
      const previousClosed = closedIssues
      const moving: GitLabWorkItem = {
        ...issue,
        state: targetState
      }
      if (sourceIsOpen) {
        setOpenIssues((prev) => prev.filter((row) => row.id !== issue.id))
        setClosedIssues((prev) => [moving, ...prev.filter((row) => row.id !== issue.id)])
      } else {
        setClosedIssues((prev) => prev.filter((row) => row.id !== issue.id))
        setOpenIssues((prev) => [moving, ...prev.filter((row) => row.id !== issue.id)])
      }

      try {
        const sourceContext = getRepoIssueSourceContext(repo, 'gitlab')
        const result = await window.api.gl.updateIssue({
          repoPath: repo.path,
          repoId: repo.id,
          sourceContext,
          number: issue.number,
          updates: { state: targetState }
        })
        if (!result.ok) {
          throw new Error(result.error)
        }
      } catch (err) {
        // Rollback + toast.
        setOpenIssues(previousOpen)
        setClosedIssues(previousClosed)
        toast.error(err instanceof Error ? err.message : String(err))
      }
    },
    [repo, openIssues, closedIssues]
  )

  return {
    status,
    openIssues,
    closedIssues,
    error,
    refresh,
    moveIssue
  }
}
