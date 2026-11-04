/**
 * Issue row actions for the Issues panel: open detail, AI plan/work, close, create,
 * and "use this issue" workspace starters. Extracted to keep the panel within
 * the max-lines budget.
 */
import { useCallback } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { confirmCloseIssue } from './issues-panel-close-confirm'
import { closeRepoIssue, createRepoIssue } from './issues-panel-create-actions'
import type { CreateIssueSubmitInput } from './issues-panel-create-dialog'
import { issueRowBody, type IssueRow } from './issues-panel-rows'
import {
  startGitHubIssueFromPanel,
  startGitLabIssueFromPanel,
  startLinearIssueFromPanel
} from './issues-panel-workspace-actions'
import { launchIssueAiPlanCommenter } from './issues-panel-ai-plan'
import { launchIssueAiWorker, type IssueAiWorkMode } from './issues-panel-ai-work'
import type { useConfirmationDialog } from '@/components/confirmation-dialog-context'
import type {
  GitHubWorkItem,
  GitLabWorkItem,
  LinearIssue,
  Repo,
  TuiAgent
} from '../../../../../../shared/types'

type Confirm = ReturnType<typeof useConfirmationDialog>
type Selected = {
  githubId: string | null
  gitlabId: string | null
  linearId: string | null
}

type Args = {
  repo: Repo | null
  worktreeId: string | null
  providerTab: 'github' | 'gitlab' | 'linear'
  linearBinding: { workspaceId: string; projectId: string } | null
  confirm: Confirm
  selected: Selected
  setSelectedGitHub: (item: GitHubWorkItem | null) => void
  setSelectedGitLab: (item: GitLabWorkItem | null) => void
  setSelectedLinear: (item: LinearIssue | null) => void
  setRows: React.Dispatch<React.SetStateAction<IssueRow[]>>
  setCreateOpen: (open: boolean) => void
  setCreateSubmitting: (busy: boolean) => void
  setAiPlanningId: React.Dispatch<React.SetStateAction<string | null>>
  setAiWorkingId: React.Dispatch<React.SetStateAction<string | null>>
  setClosingId: React.Dispatch<React.SetStateAction<string | null>>
  bumpRefresh: () => void
}

function rowTarget(row: IssueRow) {
  return {
    provider: row.provider,
    number: row.number,
    identifier: row.linearItem?.identifier ?? null,
    title: row.title,
    url: row.url
  }
}

export function useIssueRowActions(args: Args) {
  const openModal = useAppStore((s) => s.openModal)
  const { repo, worktreeId, setRows, selected } = args
  // The panel renders an empty state while the repo is still resolving.

  const openIssue = useCallback(
    (row: IssueRow) => {
      if (row.provider === 'github' && row.githubItem) {
        args.setSelectedGitLab(null)
        args.setSelectedLinear(null)
        args.setSelectedGitHub(row.githubItem)
        return
      }
      if (row.provider === 'gitlab' && row.gitlabItem) {
        args.setSelectedGitHub(null)
        args.setSelectedLinear(null)
        args.setSelectedGitLab(row.gitlabItem)
        return
      }
      if (row.provider === 'linear' && row.linearItem) {
        args.setSelectedGitHub(null)
        args.setSelectedGitLab(null)
        args.setSelectedLinear(row.linearItem)
      }
    },
    [args]
  )

  const askAiPlan = useCallback(
    async (row: IssueRow, agent: TuiAgent) => {
      if (!worktreeId || !repo) {
        return
      }
      args.setAiPlanningId(row.id)
      try {
        await launchIssueAiPlanCommenter({
          worktreeId,
          repo,
          agent,
          issue: { ...rowTarget(row), body: issueRowBody(row) }
        })
      } finally {
        args.setAiPlanningId((current) => (current === row.id ? null : current))
      }
    },
    [worktreeId, repo, args]
  )

  const askAiWork = useCallback(
    async (row: IssueRow, agent: TuiAgent, mode: IssueAiWorkMode) => {
      if (!worktreeId || !repo) {
        return
      }
      args.setAiWorkingId(row.id)
      try {
        await launchIssueAiWorker({
          worktreeId,
          repo,
          agent,
          mode,
          issue: {
            ...rowTarget(row),
            workspaceId: row.linearItem?.workspaceId ?? null,
            body: issueRowBody(row)
          }
        })
      } finally {
        args.setAiWorkingId((current) => (current === row.id ? null : current))
      }
    },
    [worktreeId, repo, args]
  )

  const closeIssue = useCallback(
    async (row: IssueRow) => {
      if (!repo || !(await confirmCloseIssue(args.confirm, row))) {
        return
      }
      args.setClosingId(row.id)
      try {
        if (!(await closeRepoIssue({ repo, row }))) {
          return
        }
        setRows((current) => current.filter((item) => item.id !== row.id))
        if (selected.githubId === row.id) {
          args.setSelectedGitHub(null)
        }
        if (selected.gitlabId === row.id) {
          args.setSelectedGitLab(null)
        }
        if (selected.linearId === row.id) {
          args.setSelectedLinear(null)
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        args.setClosingId((current) => (current === row.id ? null : current))
      }
    },
    [repo, args, selected, setRows]
  )

  const useGitHubItem = useCallback(
    (item: GitHubWorkItem) => repo && startGitHubIssueFromPanel(openModal, repo, item),
    [openModal, repo]
  )
  const useGitLabItem = useCallback(
    (item: GitLabWorkItem) => repo && startGitLabIssueFromPanel(openModal, repo, item),
    [openModal, repo]
  )
  const useLinearItem = useCallback(
    (item: LinearIssue) => repo && startLinearIssueFromPanel(openModal, repo, item),
    [openModal, repo]
  )

  // Why: one entry point per row — routes to the provider-specific worktree
  // starter (GitHub creates in background; GitLab/Linear open a prefilled
  // composer) so any issue can spin up a fresh worktree for an agent or a
  // discussion.
  const createWorktree = useCallback(
    (row: IssueRow) => {
      if (!repo) {
        return
      }
      if (row.provider === 'github' && row.githubItem) {
        startGitHubIssueFromPanel(openModal, repo, row.githubItem)
        return
      }
      if (row.provider === 'gitlab' && row.gitlabItem) {
        startGitLabIssueFromPanel(openModal, repo, row.gitlabItem)
        return
      }
      if (row.provider === 'linear' && row.linearItem) {
        startLinearIssueFromPanel(openModal, repo, row.linearItem)
      }
    },
    [openModal, repo]
  )

  const createIssue = useCallback(
    async (input: CreateIssueSubmitInput) => {
      if (!repo) {
        return
      }
      args.setCreateSubmitting(true)
      try {
        const created = await createRepoIssue({
          provider: args.providerTab,
          repo,
          input,
          linearBinding: args.linearBinding
        })
        if (!created) {
          return
        }
        args.setCreateOpen(false)
        if (created.provider === 'github') {
          args.setSelectedGitHub(created.item)
        } else if (created.provider === 'gitlab') {
          args.setSelectedGitLab(created.item)
        } else {
          args.setSelectedLinear(created.item)
        }
        args.bumpRefresh()
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err))
      } finally {
        args.setCreateSubmitting(false)
      }
    },
    [repo, args]
  )

  return {
    openIssue,
    askAiPlan,
    askAiWork,
    closeIssue,
    createWorktree,
    useGitHubItem,
    useGitLabItem,
    useLinearItem,
    createIssue
  }
}
