import React, { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import type { AgentSquad } from '../../../../shared/agent-squads'
import {
  parseSubtaskBreakdown,
  type SubTaskBreakdownItem
} from '../../../../shared/subtask-breakdown'
import { OrchestrationPlanChecklist } from './OrchestrationPlanChecklist'
import { OrchestrationPlanRunning } from './OrchestrationPlanRunning'

const LOCAL_RUNTIME_TARGET = { kind: 'local' as const }
const PLAN_POLL_MS = 3_000

export type PlanStartResult = { pipelineId: string; researchTaskId: string }

export function OrchestrationProductGoalDialog({
  open,
  onOpenChange,
  starting,
  squads,
  onStartPlan,
  onCreatePlan
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  starting: boolean
  squads: AgentSquad[]
  onStartPlan: (goal: string, squadId: string | null) => Promise<PlanStartResult>
  onCreatePlan: (items: SubTaskBreakdownItem[], pipelineId: string) => Promise<void>
}): React.JSX.Element {
  const [phase, setPhase] = useState<'goal' | 'planning' | 'review' | 'running'>('goal')
  const [goal, setGoal] = useState('')
  const [squadId, setSquadId] = useState('')
  const [pipelineId, setPipelineId] = useState<string | null>(null)
  const [researchTaskId, setResearchTaskId] = useState<string | null>(null)
  const [items, setItems] = useState<SubTaskBreakdownItem[]>([])
  const [checked, setChecked] = useState<Set<number>>(() => new Set())
  const [planError, setPlanError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const reset = useCallback(() => {
    setPhase('goal')
    setGoal('')
    setSquadId('')
    setPipelineId(null)
    setResearchTaskId(null)
    setItems([])
    setChecked(new Set())
    setPlanError(null)
    setCreating(false)
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    setSquadId(squads[0]?.id ?? '')
  }, [open, squads])

  const start = useCallback(async () => {
    if (!goal.trim()) {
      return
    }
    setPlanError(null)
    setPhase('planning')
    try {
      const result = await onStartPlan(goal.trim(), squadId || null)
      setPipelineId(result.pipelineId)
      setResearchTaskId(result.researchTaskId)
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : String(err))
      setPhase('goal')
    }
  }, [goal, onStartPlan, squadId])

  useEffect(() => {
    if (phase !== 'planning' || !researchTaskId) {
      return
    }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const poll = async (): Promise<void> => {
      if (cancelled) {
        return
      }
      try {
        const result = await callRuntimeRpc<{
          task: { result?: string | null; status: string } | null
        }>(
          LOCAL_RUNTIME_TARGET,
          'orchestration.taskThread',
          { task: researchTaskId },
          { timeoutMs: 15_000, skipCompatibilityCheck: true }
        )
        const status = result.task?.status
        const body = result.task?.result ?? ''
        if (status === 'completed' || status === 'failed' || body.length > 0) {
          if (status === 'failed') {
            setPhase('goal')
            setPlanError(
              body.trim() ||
                translate(
                  'auto.components.orchestration.board.product.researchFailed',
                  'The research agent failed. Try again.'
                )
            )
            return
          }
          const parsed = parseSubtaskBreakdown(body)
          setItems(parsed)
          setChecked(new Set(parsed.map((_, i) => i)))
          if (parsed.length > 0) {
            setPhase('review')
          } else {
            setPhase('goal')
            setPlanError(
              translate(
                'auto.components.orchestration.board.product.emptyPlan',
                'The AI plan came back empty. Try again or write subtasks manually.'
              )
            )
          }
          return
        }
      } catch {
        // transient poll failure — keep waiting
      }
      timer = setTimeout(() => void poll(), PLAN_POLL_MS)
    }
    void poll()
    return () => {
      cancelled = true
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }, [phase, researchTaskId])

  const toggleChecked = (index: number): void => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  const deleteItem = (index: number): void => {
    setItems((prev) => prev.filter((_, i) => i !== index))
    setChecked((prev) => {
      const next = new Set<number>()
      for (const i of prev) {
        if (i < index) {
          next.add(i)
        } else if (i > index) {
          next.add(i - 1)
        }
      }
      return next
    })
  }

  const create = useCallback(async () => {
    if (!pipelineId) {
      return
    }
    const selected = items.filter((_, i) => checked.has(i))
    if (selected.length === 0) {
      return
    }
    setCreating(true)
    try {
      await onCreatePlan(selected, pipelineId)
      // Why: keep the modal open and switch to the live running view so the
      // operator sees subtask progress/results without leaving the dialog.
      setPhase('running')
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }, [checked, items, onCreatePlan, pipelineId])

  const hasSquads = squads.length > 0

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset()
        }
        onOpenChange(next)
      }}
    >
      <DialogContent
        className="max-w-2xl"
        // Why: the plan modal holds in-progress state (goal, checklist, live
        // run); an accidental outside click must not discard it.
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.orchestration.board.product.dialogTitle',
              'Start Product Pipeline'
            )}
          </DialogTitle>
          <DialogDescription>
            {phase === 'goal'
              ? translate(
                  'auto.components.orchestration.board.product.dialogDesc',
                  'AI will research the goal and draft a subtask plan. Review the checklist, then create & assign.'
                )
              : phase === 'planning'
                ? translate(
                    'auto.components.orchestration.board.product.planning',
                    'AI is drafting subtasks…'
                  )
                : translate(
                    'auto.components.orchestration.board.product.review',
                    'Review the draft subtasks, edit as needed, then start planning.'
                  )}
          </DialogDescription>
        </DialogHeader>

        {phase === 'goal' || phase === 'planning' ? (
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="product-goal">
                {translate('auto.components.orchestration.board.product.goalLabel', 'Product goal')}
              </Label>
              <Input
                id="product-goal"
                autoFocus={phase === 'goal'}
                placeholder={translate(
                  'auto.components.orchestration.board.product.goalPlaceholder',
                  'e.g. Add JWT authentication to the API'
                )}
                value={goal}
                disabled={phase === 'planning'}
                onChange={(e) => setGoal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && goal.trim()) {
                    void start()
                  }
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                {translate(
                  'auto.components.orchestration.board.product.squadLabel',
                  'Manager squad'
                )}
              </Label>
              <Select
                value={squadId || undefined}
                onValueChange={setSquadId}
                disabled={!hasSquads || phase === 'planning'}
              >
                <SelectTrigger className="w-full text-xs">
                  <SelectValue
                    placeholder={translate(
                      'auto.components.orchestration.board.product.squadPlaceholder',
                      hasSquads ? 'Select a squad' : 'No squads configured'
                    )}
                  />
                </SelectTrigger>
                <SelectContent>
                  {squads.map((squad) => (
                    <SelectItem key={squad.id} value={squad.id}>
                      {squad.name} ({squad.leader.agent})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {phase === 'planning' ? (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                <LoaderCircle className="size-4 shrink-0 animate-spin" />
                {translate(
                  'auto.components.orchestration.board.product.planningHint',
                  'Researcher agent is breaking the goal into subtasks…'
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {phase === 'review' ? (
          <OrchestrationPlanChecklist
            items={items}
            checked={checked}
            onToggle={toggleChecked}
            onAdd={(title) => {
              const idx = items.length
              setItems((prev) => [...prev, { title, role: 'implement', description: '' }])
              setChecked((prev) => new Set(prev).add(idx))
            }}
            onDelete={deleteItem}
            onUpdate={(index, next) => {
              setItems((prev) => prev.map((it, i) => (i === index ? next : it)))
            }}
          />
        ) : null}

        {phase === 'running' && pipelineId ? (
          <OrchestrationPlanRunning pipelineId={pipelineId} onDone={() => {}} />
        ) : null}

        {planError ? <p className="text-xs text-destructive">{planError}</p> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {translate('auto.components.orchestration.board.product.cancel', 'Cancel')}
          </Button>
          {phase === 'goal' ? (
            <Button disabled={!goal.trim() || starting} onClick={() => void start()}>
              {starting ? (
                <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Workflow className="mr-2 h-3.5 w-3.5" />
              )}
              {translate('auto.components.orchestration.board.product.createDraft', 'Create draft')}
            </Button>
          ) : null}
          {phase === 'review' ? (
            <Button disabled={creating || checked.size === 0} onClick={() => void create()}>
              {creating ? <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              {translate(
                'auto.components.orchestration.board.product.startPlanning',
                'Create & run'
              )}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
