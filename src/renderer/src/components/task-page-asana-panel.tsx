/**
 * Asana tasks list for the Tasks page — connect, pick project, list tasks.
 */
import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Circle, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { AsanaConnectDialog } from '@/components/asana-connect-dialog'
import { translate } from '@/i18n/i18n'
import type {
  AsanaConnectionStatus,
  AsanaProject,
  AsanaTask,
  AsanaTaskFilter
} from '../../../shared/asana-types'

type TaskPageAsanaPanelProps = {
  isVisible: boolean
}

export function TaskPageAsanaPanel({ isVisible }: TaskPageAsanaPanelProps): React.JSX.Element {
  const [status, setStatus] = useState<AsanaConnectionStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [connectOpen, setConnectOpen] = useState(false)
  const [projects, setProjects] = useState<AsanaProject[]>([])
  const [projectGid, setProjectGid] = useState<string>('all')
  const [filter, setFilter] = useState<AsanaTaskFilter>('assigned')
  const [tasks, setTasks] = useState<AsanaTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true)
    try {
      const next = await window.api.asana.getStatus()
      setStatus(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStatusLoading(false)
    }
  }, [])

  const loadProjects = useCallback(async () => {
    try {
      const list = await window.api.asana.listProjects()
      setProjects(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await window.api.asana.listTasks({
        projectGid: projectGid === 'all' ? undefined : projectGid,
        workspaceGid: status?.activeWorkspaceGid ?? undefined,
        filter,
        limit: 50
      })
      setTasks(list)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [filter, projectGid, status?.activeWorkspaceGid])

  useEffect(() => {
    if (!isVisible) {
      return
    }
    void refreshStatus()
  }, [isVisible, refreshStatus])

  useEffect(() => {
    if (!isVisible || !status?.connected) {
      return
    }
    void loadProjects()
    void loadTasks()
  }, [isVisible, status?.connected, status?.activeWorkspaceGid, loadProjects, loadTasks])

  const handleDisconnect = async (): Promise<void> => {
    try {
      const next = await window.api.asana.disconnect()
      setStatus(next)
      setTasks([])
      setProjects([])
      toast.success(translate('auto.components.TaskPageAsanaPanel.disconnected', 'Disconnected from Asana'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const handleWorkspaceChange = async (workspaceGid: string): Promise<void> => {
    try {
      const next = await window.api.asana.selectWorkspace(workspaceGid)
      setStatus(next)
      setProjectGid('all')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const handleToggleComplete = async (task: AsanaTask): Promise<void> => {
    const result = await window.api.asana.updateTask({
      taskGid: task.gid,
      update: { completed: !task.completed }
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setTasks((prev) =>
      prev.map((t) => (t.gid === task.gid ? { ...t, completed: !t.completed } : t))
    )
  }

  if (statusLoading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <LoaderCircle className="size-5 animate-spin" />
      </div>
    )
  }

  if (!status?.connected) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="space-y-1">
          <p className="text-sm font-medium">
            {translate('auto.components.TaskPageAsanaPanel.notConnected', 'Connect Asana')}
          </p>
          <p className="max-w-sm text-xs text-muted-foreground">
            {translate(
              'auto.components.TaskPageAsanaPanel.notConnectedDesc',
              'Use a Personal Access Token to pull your Asana tasks into Orca.'
            )}
          </p>
          {status?.credentialError ? (
            <p className="text-xs text-destructive">{status.credentialError}</p>
          ) : null}
        </div>
        <Button onClick={() => setConnectOpen(true)}>
          {translate('auto.components.TaskPageAsanaPanel.connect', 'Connect Asana')}
        </Button>
        <AsanaConnectDialog
          open={connectOpen}
          onOpenChange={setConnectOpen}
          onConnected={(next) => {
            setStatus(next)
          }}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
        {status.workspaces.length > 1 ? (
          <Select
            value={status.activeWorkspaceGid ?? undefined}
            onValueChange={(v) => void handleWorkspaceChange(v)}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Workspace" />
            </SelectTrigger>
            <SelectContent>
              {status.workspaces.map((ws) => (
                <SelectItem key={ws.gid} value={ws.gid}>
                  {ws.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-xs text-muted-foreground">
            {status.viewer?.name}
            {status.workspaces[0] ? ` · ${status.workspaces[0].name}` : ''}
          </span>
        )}

        <Select
          value={projectGid}
          onValueChange={(value) => {
            setProjectGid(value)
            // Why: project scope is where "Assigned to me" is most useful — default to it.
            if (value !== 'all' && filter === 'all') {
              setFilter('assigned')
            }
          }}
        >
          <SelectTrigger className="h-8 w-[180px] text-xs">
            <SelectValue placeholder="Project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {translate('auto.components.TaskPageAsanaPanel.allProjects', 'My tasks')}
            </SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.gid} value={p.gid}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filter} onValueChange={(v) => setFilter(v as AsanaTaskFilter)}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="assigned">
              {translate(
                'auto.components.TaskPageAsanaPanel.filterAssignedToMe',
                'Assigned to me'
              )}
            </SelectItem>
            <SelectItem value="all">
              {translate('auto.components.TaskPageAsanaPanel.filterAllOpen', 'All open')}
            </SelectItem>
            <SelectItem value="completed">
              {translate('auto.components.TaskPageAsanaPanel.filterCompleted', 'Completed')}
            </SelectItem>
          </SelectContent>
        </Select>

        <Button variant="ghost" size="icon" className="size-8" onClick={() => void loadTasks()}>
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => void handleDisconnect()}>
            {translate('auto.components.TaskPageAsanaPanel.disconnect', 'Disconnect')}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && tasks.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : tasks.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">
            {translate('auto.components.TaskPageAsanaPanel.empty', 'No tasks found.')}
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {tasks.map((task) => (
              <li key={task.gid} className="flex items-start gap-2 px-3 py-2.5 hover:bg-muted/40">
                <button
                  type="button"
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => void handleToggleComplete(task)}
                  aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
                >
                  {task.completed ? (
                    <CheckCircle2 className="size-4 text-emerald-500" />
                  ) : (
                    <Circle className="size-4" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm ${task.completed ? 'text-muted-foreground line-through' : ''}`}
                  >
                    {task.name}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    {task.projectName ? <span>{task.projectName}</span> : null}
                    {task.sectionName ? <span>· {task.sectionName}</span> : null}
                    {task.dueOn ? <span>· due {task.dueOn}</span> : null}
                    {task.assignee ? <span>· {task.assignee.name}</span> : null}
                  </div>
                </div>
                <a
                  href={task.permalinkUrl}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.preventDefault()
                    void window.api.shell.openUrl(task.permalinkUrl)
                  }}
                >
                  <ExternalLink className="size-3.5" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AsanaConnectDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        onConnected={(next) => setStatus(next)}
      />
    </div>
  )
}
