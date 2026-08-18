import React, { useState } from 'react'
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
import { translate } from '@/i18n/i18n'

export function OrchestrationProductGoalDialog({
  open,
  onOpenChange,
  starting,
  onSubmit
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  starting: boolean
  onSubmit: (goal: string) => void
}): React.JSX.Element {
  const [goal, setGoal] = useState('')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next) {
          setGoal('')
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.orchestration.board.product.dialogTitle',
              'Start Product Pipeline'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.orchestration.board.product.dialogDesc',
              'Orca will create a worktree and run a research → implement → test → review loop.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="product-goal">
            {translate('auto.components.orchestration.board.product.goalLabel', 'Product goal')}
          </Label>
          <Input
            id="product-goal"
            autoFocus
            placeholder={translate(
              'auto.components.orchestration.board.product.goalPlaceholder',
              'e.g. Add JWT authentication to the API'
            )}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && goal.trim()) {
                onSubmit(goal)
              }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {translate('auto.components.orchestration.board.product.cancel', 'Cancel')}
          </Button>
          <Button disabled={!goal.trim() || starting} onClick={() => onSubmit(goal)}>
            {starting ? <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            {translate('auto.components.orchestration.board.product.submit', 'Start pipeline')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
