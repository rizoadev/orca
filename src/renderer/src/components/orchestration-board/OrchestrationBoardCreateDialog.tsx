import React, { useEffect, useMemo, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { shortWorktreeLabel, type OrchestrationBoardTaskPriority } from './orchestration-board-model'

export type OrchestrationBoardCreateDraft = {
  spec: string
  title: string
  priority: OrchestrationBoardTaskPriority
  repoId: string | null
  worktreeId: string | null
}

export type OrchestrationBoardCreateScopeOption = {
  worktreeId: string
  repoId: string
  repoLabel: string
  worktreeLabel: string
}

const PRIORITIES: OrchestrationBoardTaskPriority[] = ['low', 'medium', 'high', 'urgent']
const NONE = '__none__'

export function OrchestrationBoardCreateDialog({
  open,
  onOpenChange,
  scopeOptions,
  defaultRepoId,
  defaultWorktreeId,
  submitting,
  error,
  onSubmit
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  scopeOptions: OrchestrationBoardCreateScopeOption[]
  defaultRepoId: string | null
  defaultWorktreeId: string | null
  submitting: boolean
  error: string | null
  onSubmit: (draft: OrchestrationBoardCreateDraft) => void
}): React.JSX.Element {
  const [spec, setSpec] = useState('')
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<OrchestrationBoardTaskPriority>('medium')
  const [worktreeId, setWorktreeId] = useState<string>(NONE)

  useEffect(() => {
    if (!open) {
      return
    }
    setSpec('')
    setTitle('')
    setPriority('medium')
    setWorktreeId(defaultWorktreeId ?? NONE)
  }, [open, defaultWorktreeId])

  const selectedOption = useMemo(
    () => scopeOptions.find((option) => option.worktreeId === worktreeId) ?? null,
    [scopeOptions, worktreeId]
  )

  const canSubmit = spec.trim().length > 0 && !submitting

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4 sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {translate('auto.components.orchestration.board.create.title', 'New orchestration task')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.orchestration.board.create.description',
              'Tasks are stored in app userData, not inside the worktree folder. Scope is a soft pointer for the board and dispatch.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="orch-task-spec">
              {translate('auto.components.orchestration.board.create.spec', 'Spec')}
            </Label>
            <textarea
              id="orch-task-spec"
              value={spec}
              onChange={(event) => setSpec(event.target.value)}
              rows={5}
              placeholder={translate(
                'auto.components.orchestration.board.create.specPlaceholder',
                'What should the agent do?'
              )}
              className={cn(
                'w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none',
                'placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
                'dark:bg-input/30'
              )}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="orch-task-title">
                {translate('auto.components.orchestration.board.create.displayName', 'Title')}
              </Label>
              <Input
                id="orch-task-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={translate(
                  'auto.components.orchestration.board.create.titlePlaceholder',
                  'Optional short label'
                )}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>
                {translate('auto.components.orchestration.board.create.priority', 'Priority')}
              </Label>
              <Select
                value={priority}
                onValueChange={(value) => setPriority(value as OrchestrationBoardTaskPriority)}
              >
                <SelectTrigger className="h-9 w-full text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>
              {translate('auto.components.orchestration.board.create.worktree', 'Worktree scope')}
            </Label>
            <Select value={worktreeId} onValueChange={setWorktreeId}>
              <SelectTrigger className="h-9 w-full text-sm">
                <SelectValue
                  placeholder={translate(
                    'auto.components.orchestration.board.create.noWorktree',
                    'No worktree'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>
                  {translate(
                    'auto.components.orchestration.board.create.noWorktree',
                    'No worktree'
                  )}
                </SelectItem>
                {scopeOptions.map((option) => (
                  <SelectItem key={option.worktreeId} value={option.worktreeId}>
                    {option.repoLabel} · {option.worktreeLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {selectedOption
                ? translate(
                    'auto.components.orchestration.board.create.scopeHintBound',
                    'Will bind repo {repo} and worktree {worktree}.',
                    {
                      repo: selectedOption.repoLabel,
                      worktree: shortWorktreeLabel(selectedOption.worktreeId) ?? selectedOption.worktreeLabel
                    }
                  )
                : defaultRepoId
                  ? translate(
                      'auto.components.orchestration.board.create.scopeHintRepoOnly',
                      'No worktree selected — repo filter context may still apply on list.'
                    )
                  : translate(
                      'auto.components.orchestration.board.create.scopeHintNone',
                      'Unscoped task — visible under All repos.'
                    )}
            </p>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            {translate('auto.components.orchestration.board.create.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) {
                return
              }
              onSubmit({
                spec: spec.trim(),
                title: title.trim(),
                priority,
                repoId: selectedOption?.repoId ?? null,
                worktreeId: selectedOption?.worktreeId ?? null
              })
            }}
          >
            {submitting ? <LoaderCircle className="size-3.5 animate-spin" /> : null}
            {translate('auto.components.orchestration.board.create.submit', 'Create task')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
