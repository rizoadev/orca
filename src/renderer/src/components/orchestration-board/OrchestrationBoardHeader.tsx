import React from 'react'
import { ArrowLeft, LoaderCircle, Plus, RefreshCw, Workflow } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { translate } from '@/i18n/i18n'

export function OrchestrationBoardHeader({
  taskCount,
  truncated,
  loading,
  repoFilter,
  allReposId,
  repoOptions,
  repoLabel,
  selectedSquadId,
  squads,
  productStarting,
  onBack,
  onRepoFilterChange,
  onSquadChange,
  onRefresh,
  onStartProduct,
  onNewTask
}: {
  taskCount: number
  truncated: boolean
  loading: boolean
  repoFilter: string
  allReposId: string
  repoOptions: string[]
  repoLabel: (repoId: string) => string
  selectedSquadId: string
  squads: { id: string; name: string }[]
  productStarting: boolean
  onBack: () => void
  onRepoFilterChange: (value: string) => void
  onSquadChange: (value: string) => void
  onRefresh: () => void
  onStartProduct: () => void
  onNewTask: () => void
}): React.JSX.Element {
  return (
    <header className="flex shrink-0 items-center gap-3 border-b border-border/60 px-4 py-3">
      <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2" onClick={onBack}>
        <ArrowLeft className="size-4" />
        {translate('auto.components.orchestration.board.back', 'Back')}
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Workflow className="size-4 shrink-0 text-muted-foreground" />
        <h1 className="truncate text-sm font-semibold tracking-tight">
          {translate('auto.components.orchestration.board.title', 'Orchestration Board')}
        </h1>
        <span className="text-xs text-muted-foreground tabular-nums">
          {taskCount}
          {truncated ? '+' : ''}
        </span>
      </div>
      <Select value={repoFilter} onValueChange={onRepoFilterChange}>
        <SelectTrigger className="h-8 w-[200px] text-xs">
          <SelectValue
            placeholder={translate('auto.components.orchestration.board.repoFilter', 'Repo')}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={allReposId}>
            {translate('auto.components.orchestration.board.allRepos', 'All repos')}
          </SelectItem>
          {repoOptions.map((repoId) => (
            <SelectItem key={repoId} value={repoId}>
              {repoLabel(repoId)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={selectedSquadId || undefined}
        onValueChange={onSquadChange}
        disabled={squads.length === 0}
      >
        <SelectTrigger className="h-8 w-[180px] text-xs">
          <SelectValue
            placeholder={translate(
              'auto.components.orchestration.board.squadFilter',
              squads.length === 0 ? 'No squads' : 'Squad'
            )}
          />
        </SelectTrigger>
        <SelectContent>
          {squads.map((squad) => (
            <SelectItem key={squad.id} value={squad.id}>
              {squad.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={onRefresh}>
        {loading ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <RefreshCw className="size-3.5" />
        )}
        {translate('auto.components.orchestration.board.refresh', 'Refresh')}
      </Button>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-8 gap-1.5"
        disabled={productStarting}
        onClick={onStartProduct}
      >
        {productStarting ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <Workflow className="size-3.5" />
        )}
        {translate('auto.components.orchestration.board.startProduct', 'Start product')}
      </Button>
      <Button type="button" size="sm" className="h-8 gap-1.5" onClick={onNewTask}>
        <Plus className="size-3.5" />
        {translate('auto.components.orchestration.board.newTask', 'New task')}
      </Button>
    </header>
  )
}
