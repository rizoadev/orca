import { CheckSquare, Plus, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { SubTaskBreakdownItem } from '../../../../shared/subtask-breakdown'

export function OrchestrationPlanChecklist({
  items,
  checked,
  onToggle,
  onAdd,
  onDelete
}: {
  items: SubTaskBreakdownItem[]
  checked: ReadonlySet<number>
  onToggle: (index: number) => void
  onAdd: (title: string) => void
  onDelete: (index: number) => void
}): React.JSX.Element {
  return (
    <div className="flex max-h-[50vh] flex-col gap-2 py-2">
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto scrollbar-sleek">
        {items.map((item, index) => {
          const isChecked = checked.has(index)
          return (
            <div
              key={index}
              className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5"
            >
              <button
                type="button"
                onClick={() => onToggle(index)}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                {isChecked ? (
                  <CheckSquare className="size-4 text-emerald-500" />
                ) : (
                  <Square className="size-4" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className={cn('truncate text-[13px]', !isChecked && 'text-muted-foreground')}>
                  {item.title}
                </div>
                {item.description ? (
                  <div className="truncate text-[11px] text-muted-foreground">
                    {item.description}
                  </div>
                ) : null}
              </div>
              <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
                {item.role}
              </span>
              <button
                type="button"
                onClick={() => onDelete(index)}
                className="shrink-0 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          )
        })}
        {items.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            {translate(
              'auto.components.orchestration.board.product.noItems',
              'No subtasks yet. Add them manually below.'
            )}
          </p>
        ) : null}
      </div>
      <AddItemRow onAdd={onAdd} />
    </div>
  )
}

function AddItemRow({ onAdd }: { onAdd: (title: string) => void }): React.JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <input
        id="plan-new-item"
        placeholder={translate(
          'auto.components.orchestration.board.product.addItemPlaceholder',
          'Add a subtask…'
        )}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
            onAdd(e.currentTarget.value.trim())
            e.currentTarget.value = ''
          }
        }}
        className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 py-1 text-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <Button
        type="button"
        size="xs"
        variant="outline"
        className="h-7 gap-1"
        onClick={() => {
          const input = document.getElementById('plan-new-item') as HTMLInputElement | null
          if (input?.value.trim()) {
            onAdd(input.value.trim())
            input.value = ''
          }
        }}
      >
        <Plus className="size-3" />
        {translate('auto.components.orchestration.board.product.addItem', 'Add')}
      </Button>
    </div>
  )
}
