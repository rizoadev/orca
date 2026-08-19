import { useState } from 'react'
import { CheckSquare, Pencil, Plus, Square, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { SubTaskBreakdownItem } from '../../../../shared/subtask-breakdown'

const ROLE_OPTIONS = ['implement', 'research', 'test', 'review', 'docs', 'devops', 'security']

export function OrchestrationPlanChecklist({
  items,
  checked,
  onToggle,
  onAdd,
  onDelete,
  onUpdate
}: {
  items: SubTaskBreakdownItem[]
  checked: ReadonlySet<number>
  onToggle: (index: number) => void
  onAdd: (title: string) => void
  onDelete: (index: number) => void
  onUpdate: (index: number, item: SubTaskBreakdownItem) => void
}): React.JSX.Element {
  return (
    <div className="flex max-h-[50vh] flex-col gap-2 py-2">
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto scrollbar-sleek">
        {items.map((item, index) => (
          <EditableRow
            key={index}
            item={item}
            checked={checked.has(index)}
            onToggle={() => onToggle(index)}
            onDelete={() => onDelete(index)}
            onUpdate={(next) => onUpdate(index, next)}
          />
        ))}
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

function EditableRow({
  item,
  checked,
  onToggle,
  onDelete,
  onUpdate
}: {
  item: SubTaskBreakdownItem
  checked: boolean
  onToggle: () => void
  onDelete: () => void
  onUpdate: (item: SubTaskBreakdownItem) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(item.title)
  const [role, setRole] = useState(item.role)
  const [description, setDescription] = useState(item.description)

  const save = (): void => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      return
    }
    onUpdate({
      title: trimmedTitle,
      role: role.trim() || 'implement',
      description: description.trim()
    })
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="space-y-1.5 rounded-md border border-border/50 bg-muted/20 px-2 py-2">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={translate(
            'auto.components.orchestration.board.product.itemTitle',
            'Subtask title'
          )}
          className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:border-ring"
        />
        <div className="flex items-center gap-1.5">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="h-7 rounded-md border border-input bg-background px-1.5 text-[11px] capitalize outline-none focus-visible:border-ring"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={translate(
              'auto.components.orchestration.board.product.itemDesc',
              'Description'
            )}
            className="h-7 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-[11px] outline-none focus-visible:border-ring"
          />
        </div>
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            className="h-6"
            onClick={() => setEditing(false)}
          >
            <X className="size-3" />
            {translate('auto.components.orchestration.board.product.cancelEdit', 'Cancel')}
          </Button>
          <Button type="button" size="xs" className="h-6" disabled={!title.trim()} onClick={save}>
            <CheckSquare className="size-3" />
            {translate('auto.components.orchestration.board.product.saveEdit', 'Save')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 rounded-md border border-border/50 bg-muted/20 px-2 py-1.5">
      <button
        type="button"
        onClick={onToggle}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        {checked ? (
          <CheckSquare className="size-4 text-emerald-500" />
        ) : (
          <Square className="size-4" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            'break-words text-[13px] whitespace-normal',
            !checked && 'text-muted-foreground'
          )}
        >
          {item.title}
        </div>
        {item.description ? (
          <div className="break-words text-[11px] text-muted-foreground whitespace-normal">
            {item.description}
          </div>
        ) : null}
      </div>
      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] capitalize text-muted-foreground">
        {item.role}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="shrink-0 text-muted-foreground hover:text-foreground"
        title="Edit"
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 text-muted-foreground hover:text-destructive"
        title="Delete"
      >
        <Trash2 className="size-3.5" />
      </button>
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
        className="h-7 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 py-1 text-xs outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring"
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
