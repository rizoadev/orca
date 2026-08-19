import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { useAllWorktrees, useRepoMap } from '@/store/selectors'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { installWindowVisibilityInterval } from '@/lib/window-visibility-interval'
import { getRepoIdFromWorktreeId } from '../../../../shared/worktree-id'
import type { OrchestrationBoardCreateScopeOption } from './OrchestrationBoardCreateDialog'
import { shortWorktreeLabel, type OrchestrationBoardTask } from './orchestration-board-model'

export const ALL_REPOS = '__all__'
const POLL_MS = 4_000
const LOCAL_RUNTIME_TARGET = { kind: 'local' as const }

type TaskListResult = {
  tasks: OrchestrationBoardTask[]
  count: number
  total?: number
  truncated?: boolean
}

export function useOrchestrationBoardLoad(): {
  repoFilter: string
  setRepoFilter: (value: string) => void
  tasks: OrchestrationBoardTask[]
  loading: boolean
  error: string | null
  truncated: boolean
  scopeOptions: OrchestrationBoardCreateScopeOption[]
  createDefaultWorktreeId: string | null
  repoOptions: string[]
  load: (opts?: { showSpinner?: boolean }) => Promise<void>
} {
  const activeWorktreeId = useAppStore((s) => s.activeWorktreeId)
  const repoMap = useRepoMap()
  const allWorktrees = useAllWorktrees()

  const defaultRepoFilter = useMemo(() => {
    if (!activeWorktreeId) {
      return ALL_REPOS
    }
    return getRepoIdFromWorktreeId(activeWorktreeId) || ALL_REPOS
  }, [activeWorktreeId])

  const [repoFilter, setRepoFilter] = useState(defaultRepoFilter)
  const [tasks, setTasks] = useState<OrchestrationBoardTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const generationRef = useRef(0)

  useEffect(() => {
    setRepoFilter(defaultRepoFilter)
  }, [defaultRepoFilter])

  const load = useCallback(
    async (opts?: { showSpinner?: boolean }) => {
      const generation = ++generationRef.current
      if (opts?.showSpinner) {
        setLoading(true)
      }
      try {
        const listParams = repoFilter !== ALL_REPOS ? { repoId: repoFilter } : {}
        const result = await callRuntimeRpc<TaskListResult>(
          LOCAL_RUNTIME_TARGET,
          'orchestration.taskList',
          listParams,
          { timeoutMs: 15_000, skipCompatibilityCheck: true }
        )
        if (generation !== generationRef.current) {
          return
        }
        setTasks(result.tasks ?? [])
        setTruncated(result.truncated === true)
        setError(null)
      } catch (err) {
        if (generation !== generationRef.current) {
          return
        }
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (generation === generationRef.current) {
          setLoading(false)
        }
      }
    },
    [repoFilter]
  )

  useEffect(() => {
    void load({ showSpinner: true })
    return installWindowVisibilityInterval({
      run: () => {
        void load({ showSpinner: false })
      },
      intervalMs: POLL_MS
    })
  }, [load])

  const scopeOptions = useMemo((): OrchestrationBoardCreateScopeOption[] => {
    return allWorktrees
      .map((worktree) => {
        const repo = repoMap.get(worktree.repoId)
        return {
          worktreeId: worktree.id,
          repoId: worktree.repoId,
          repoLabel: repo?.displayName ?? worktree.repoId,
          worktreeLabel:
            worktree.displayName?.trim() || shortWorktreeLabel(worktree.id) || worktree.id
        }
      })
      .sort((a, b) => {
        const repoCmp = a.repoLabel.localeCompare(b.repoLabel)
        return repoCmp !== 0 ? repoCmp : a.worktreeLabel.localeCompare(b.worktreeLabel)
      })
  }, [allWorktrees, repoMap])

  const createDefaultWorktreeId = useMemo(() => {
    if (activeWorktreeId && scopeOptions.some((option) => option.worktreeId === activeWorktreeId)) {
      return activeWorktreeId
    }
    if (repoFilter !== ALL_REPOS) {
      return scopeOptions.find((option) => option.repoId === repoFilter)?.worktreeId ?? null
    }
    return null
  }, [activeWorktreeId, repoFilter, scopeOptions])

  const repoOptions = useMemo(() => {
    const ids = new Set<string>()
    for (const task of tasks) {
      if (task.repo_id) {
        ids.add(task.repo_id)
      }
    }
    for (const option of scopeOptions) {
      ids.add(option.repoId)
    }
    if (repoFilter !== ALL_REPOS) {
      ids.add(repoFilter)
    }
    return [...ids].sort()
  }, [tasks, repoFilter, scopeOptions])

  return {
    repoFilter,
    setRepoFilter,
    tasks,
    loading,
    error,
    truncated,
    scopeOptions,
    createDefaultWorktreeId,
    repoOptions,
    load
  }
}
