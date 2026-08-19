import { useCallback } from 'react'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { SubTaskBreakdownItem } from '../../../../shared/subtask-breakdown'

const LOCAL_RUNTIME_TARGET = { kind: 'local' as const }

export type PlanStartResult = { pipelineId: string; researchTaskId: string }

export function useOrchestrationProductPlan(): {
  startPlan: (
    goal: string,
    squadId: string | null,
    repoId: string | null
  ) => Promise<PlanStartResult>
  createPlan: (
    items: SubTaskBreakdownItem[],
    pipelineId: string,
    repoId: string | null
  ) => Promise<void>
} {
  const startPlan = useCallback(
    async (
      goal: string,
      squadId: string | null,
      repoId: string | null
    ): Promise<PlanStartResult> => {
      if (!repoId) {
        throw new Error('Select a repo filter (or open a worktree) first.')
      }
      const result = await callRuntimeRpc<{
        pipelineId: string
        stages: { id: string; pipeline_stage?: string | null }[]
      }>(
        LOCAL_RUNTIME_TARGET,
        'orchestration.productStart',
        {
          goal: goal.trim(),
          repo: `id:${repoId}`,
          createIssue: false,
          ensureSquads: true,
          autoDispatch: true,
          waitTimeoutMs: 90_000,
          planOnly: true,
          ...(squadId ? { squad: squadId } : {})
        },
        { timeoutMs: 180_000, skipCompatibilityCheck: true }
      )
      const research = result.stages.find((s) => s.pipeline_stage === 'research')
      if (!research) {
        throw new Error('Plan research stage was not created.')
      }
      return { pipelineId: result.pipelineId, researchTaskId: research.id }
    },
    []
  )

  const createPlan = useCallback(
    async (
      items: SubTaskBreakdownItem[],
      pipelineId: string,
      repoId: string | null
    ): Promise<void> => {
      // Why: plan-only never created a worktree; create one now that the draft
      // is submitted so the real subtasks have a checkout to execute in.
      let worktreeId: string | null = null
      if (repoId) {
        try {
          const created = await callRuntimeRpc<{
            worktree?: { id: string } | null
          }>(
            LOCAL_RUNTIME_TARGET,
            'worktree.create',
            {
              repo: `id:${repoId}`,
              name: `product-${Date.now().toString(36)}`,
              displayName: 'Product pipeline',
              comment: 'Created when the product plan draft was submitted.',
              activate: false
            },
            { timeoutMs: 120_000, skipCompatibilityCheck: true }
          )
          worktreeId = created.worktree?.id ?? null
        } catch {
          // Non-fatal: subtasks are still created; they just won't auto-dispatch
          // until a worktree is attached.
        }
      }
      for (const item of items) {
        await callRuntimeRpc(
          LOCAL_RUNTIME_TARGET,
          'orchestration.taskCreate',
          {
            spec: item.description ? `${item.title}\n\n${item.description}` : item.title,
            taskTitle: item.title,
            displayName: item.title,
            parent: pipelineId,
            // Why: don't let the default deps=[parent] strand these as pending
            // behind the root; they must be ready so the supervisor runs them.
            deps: '[]',
            priority: 'high',
            repoId: repoId ?? undefined,
            ...(worktreeId ? { worktreeId } : {}),
            pipelineId,
            pipelineStage: item.role,
            pipelineRole: item.role
          },
          { timeoutMs: 15_000, skipCompatibilityCheck: true }
        )
      }
      // Why: the plan-only pipeline isn't watched yet; watch it so the
      // supervisor discovers and delegates the newly created ready subtasks.
      await callRuntimeRpc(
        LOCAL_RUNTIME_TARGET,
        'orchestration.productWatch',
        { pipeline: pipelineId },
        { timeoutMs: 15_000, skipCompatibilityCheck: true }
      )
    },
    []
  )

  return { startPlan, createPlan }
}
