/**
 * Collapsible per-project overview table for the DeepSeek Harness screen:
 * every worktree with the daemon's port, live state, session count, and a
 * per-row kill (stop daemon) action. Mirrors the OpenChamber overview table;
 * kept in its own component so DeepSeekPage stays small.
 */
import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Layers, Power, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import type { DeepSeekProjectStatus } from '../../../../shared/deepseek-web-types'

export function DeepSeekProjectsTable(props: {
  activeWorktreePath: string | null
  tableExpanded: boolean
  onToggleExpanded: () => void
}): React.JSX.Element {
  const { activeWorktreePath } = props
  const [projects, setProjects] = useState<DeepSeekProjectStatus[]>([])

  const refreshProjects = useCallback((): void => {
    void window.api.deepseekWeb.listProjects().then((list) => {
      setProjects(list)
    })
  }, [])

  // Why: keep the overview table in sync with start/stop/restart cycles.
  useEffect(() => {
    refreshProjects()
  }, [refreshProjects])
  // Why: keep session counts / statuses live while the view is open.
  useEffect(() => {
    const timer = window.setInterval(refreshProjects, 15_000)
    return () => window.clearInterval(timer)
  }, [refreshProjects])

  const handleKillProject = useCallback(
    (projectPath: string): void => {
      void window.api.deepseekWeb.stopProject(projectPath).then(refreshProjects)
    },
    [refreshProjects]
  )

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border/60 px-4 py-1.5">
        <Layers className="size-3.5 text-muted-foreground" />
        <span className="text-[11px] font-semibold">
          {translate('deepseek.view.projects', 'Projects / ports')}
        </span>
        <span className="text-[10px] text-muted-foreground/70">
          {projects.length} host{projects.length === 1 ? '' : 's'}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-5 w-5"
          onClick={refreshProjects}
          title={translate('deepseek.view.refresh', 'Refresh')}
        >
          <RefreshCw className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5"
          onClick={props.onToggleExpanded}
          title={
            props.tableExpanded
              ? translate('deepseek.view.collapse', 'Collapse table')
              : translate('deepseek.view.expand', 'Expand table')
          }
        >
          {props.tableExpanded ? (
            <ChevronUp className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
        </Button>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 border-b border-border/40 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        <span>{translate('deepseek.view.project', 'Project')}</span>
        <span>{translate('deepseek.view.port', 'Port')}</span>
        <span>{translate('deepseek.view.status', 'Status')}</span>
        <span className="text-right">{translate('deepseek.view.sessions', 'Sessions')}</span>
        <span className="text-right">{translate('deepseek.view.actions', 'Actions')}</span>
      </div>
      <div
        className={`flex-col overflow-y-auto border-b border-border/60 ${
          props.tableExpanded ? 'min-h-0 flex-1' : 'max-h-32'
        }`}
      >
        {projects.length === 0 ? (
          <span className="block px-4 py-2 text-[11px] text-muted-foreground">
            {translate('deepseek.view.no-projects', 'No DeepSeek hosts yet')}
          </span>
        ) : (
          projects.map((project) => {
            const isActive = project.projectPath === activeWorktreePath
            return (
              <div
                key={project.projectPath}
                title={project.error ?? project.projectPath}
                className={`grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-x-3 border-b border-border/30 px-4 py-1 text-[11px] last:border-b-0 ${
                  isActive ? 'bg-muted/40' : 'hover:bg-muted/30'
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  {isActive ? (
                    <span className="size-1.5 shrink-0 rounded-full bg-status-success" />
                  ) : null}
                  <span className="truncate font-mono">{project.projectPath}</span>
                </span>
                <span className="font-mono text-muted-foreground">:{project.port}</span>
                <span
                  className={
                    {
                      running: 'text-status-success',
                      starting: 'text-muted-foreground',
                      stopped: 'text-muted-foreground/70',
                      errored: 'text-destructive'
                    }[project.state]
                  }
                >
                  {project.state}
                </span>
                <span className="text-right font-mono text-muted-foreground">
                  {project.sessionCount}
                </span>
                <span className="flex items-center justify-end gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-destructive/80 hover:text-destructive"
                    onClick={() => handleKillProject(project.projectPath)}
                    title={translate('deepseek.view.kill', 'Kill daemon')}
                  >
                    <Power className="size-3" />
                  </Button>
                </span>
              </div>
            )
          })
        )}
      </div>
    </>
  )
}
