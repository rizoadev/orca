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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'
import type { AgentSquad } from '../../../../shared/agent-squads'

export function OrchestrationProductGoalDialog({
  open,
  onOpenChange,
  starting,
  squads,
  onSubmit
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  starting: boolean
  squads: AgentSquad[]
  onSubmit: (goal: string, squadId: string | null) => void
}): React.JSX.Element {
  const [goal, setGoal] = useState('')
  const [squadId, setSquadId] = useState<string>('')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (next) {
          setGoal('')
          setSquadId(squads[0]?.id ?? '')
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
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
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
                  onSubmit(goal, squadId || null)
                }
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              {translate('auto.components.orchestration.board.product.squadLabel', 'Manager squad')}
            </Label>
            <Select
              value={squadId || undefined}
              onValueChange={setSquadId}
              disabled={squads.length === 0}
            >
              <SelectTrigger className="w-full text-xs">
                <SelectValue
                  placeholder={translate(
                    'auto.components.orchestration.board.product.squadPlaceholder',
                    squads.length === 0 ? 'No squads configured' : 'Select a squad'
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
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {translate('auto.components.orchestration.board.product.cancel', 'Cancel')}
          </Button>
          <Button
            disabled={!goal.trim() || starting}
            onClick={() => onSubmit(goal, squadId || null)}
          >
            {starting ? <LoaderCircle className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
            {translate('auto.components.orchestration.board.product.submit', 'Start pipeline')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
