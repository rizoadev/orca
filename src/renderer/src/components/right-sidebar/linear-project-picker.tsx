import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronDown, LoaderCircle, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { LinearIcon } from '@/components/icons/LinearIcon'
import { useAppStore } from '@/store'
import { useActiveRepo } from '@/store/selectors'
import { translate } from '@/i18n/i18n'
import type { LinearProjectSummary, LinearWorkspace } from '../../../../shared/types'

/**
 * Attach-a-Linear-project control for the Issues tab.
 *
 * Linear issues are not repo-scoped like GitHub/GitLab — they live in a
 * workspace/project the user picks. Until a project is attached we render this
 * picker instead of a list, and once attached the parent reads `Repo.linear`.
 */
export function LinearProjectPicker({
  onAttached
}: {
  onAttached: (binding: {
    workspaceId: string
    workspaceName?: string
    projectId: string
    projectName?: string
  }) => void
}): React.JSX.Element {
  const activeRepo = useActiveRepo()
  const linearStatus = useAppStore((s) => s.linearStatus)
  const checkLinearConnection = useAppStore((s) => s.checkLinearConnection)
  const listLinearProjects = useAppStore((s) => s.listLinearProjects)
  const updateRepo = useAppStore((s) => s.updateRepo)

  const workspaces = useMemo(() => linearStatus.workspaces ?? [], [linearStatus.workspaces])
  const [workspaceId, setWorkspaceId] = useState<string | null>(
    linearStatus.selectedWorkspaceId && linearStatus.selectedWorkspaceId !== 'all'
      ? linearStatus.selectedWorkspaceId
      : (workspaces[0]?.id ?? null)
  )
  const [query, setQuery] = useState('')
  const [projects, setProjects] = useState<LinearProjectSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attaching, setAttaching] = useState<string | null>(null)

  useEffect(() => {
    void checkLinearConnection()
  }, [checkLinearConnection])

  useEffect(() => {
    if (workspaceId || workspaces.length === 0) {
      return
    }
    setWorkspaceId(workspaces[0].id)
  }, [workspaceId, workspaces])

  useEffect(() => {
    if (!workspaceId) {
      setProjects([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void listLinearProjects(query.trim() || undefined, 40, workspaceId)
      .then((result) => {
        if (cancelled) {
          return
        }
        setProjects(result.items)
        if (result.errors?.length) {
          setError(result.errors[0]?.message ?? null)
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setProjects([])
          setError(err instanceof Error ? err.message : String(err))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [listLinearProjects, query, workspaceId])

  const workspaceById = useMemo(() => {
    const map = new Map<string, LinearWorkspace>()
    for (const workspace of workspaces) {
      map.set(workspace.id, workspace)
    }
    return map
  }, [workspaces])

  const handleAttach = useCallback(
    async (project: LinearProjectSummary) => {
      if (!activeRepo || !workspaceId) {
        return
      }
      setAttaching(project.id)
      try {
        const workspaceName = workspaceById.get(workspaceId)?.organizationName
        const ok = await updateRepo(activeRepo.id, {
          linear: {
            workspaceId,
            ...(workspaceName ? { workspaceName } : {}),
            projectId: project.id,
            projectName: project.name
          }
        })
        if (ok) {
          onAttached({
            workspaceId,
            workspaceName,
            projectId: project.id,
            projectName: project.name
          })
        }
      } finally {
        setAttaching(null)
      }
    },
    [activeRepo, onAttached, updateRepo, workspaceById, workspaceId]
  )

  if (!linearStatus.connected) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
        <LinearIcon className="size-6 text-muted-foreground/70" />
        <div className="text-sm font-medium text-foreground">
          {translate(
            'auto.components.right.sidebar.issuesPanel.linearNotConnectedTitle',
            'Connect Linear'
          )}
        </div>
        <p className="max-w-[240px] text-xs text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.issuesPanel.linearNotConnectedBody',
            'Add a Linear API key to browse and attach projects from this repo.'
          )}
        </p>
      </div>
    )
  }

  const activeWorkspace = workspaceId ? workspaceById.get(workspaceId) : undefined

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="space-y-2 border-b border-border px-3 py-3">
        <div className="text-sm font-medium text-foreground">
          {translate(
            'auto.components.right.sidebar.issuesPanel.linearAttachTitle',
            'Attach a Linear project'
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.issuesPanel.linearAttachBody',
            'Pick the workspace and project this repo should track. Its open issues will show here.'
          )}
        </p>
        {workspaces.length > 1 ? (
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="w-full justify-between">
                <span className="truncate">
                  {activeWorkspace?.organizationName ??
                    translate(
                      'auto.components.right.sidebar.issuesPanel.linearWorkspace',
                      'Workspace'
                    )}
                </span>
                <ChevronDown className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width]">
              <DropdownMenuLabel>
                {translate(
                  'auto.components.right.sidebar.issuesPanel.linearWorkspace',
                  'Workspace'
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {workspaces.map((workspace) => (
                <DropdownMenuItem
                  key={workspace.id}
                  onSelect={() => {
                    setQuery('')
                    setWorkspaceId(workspace.id)
                  }}
                >
                  <span className="truncate">
                    {workspace.organizationName ?? workspace.displayName}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate(
              'auto.components.right.sidebar.issuesPanel.linearSearchProjects',
              'Search projects…'
            )}
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      {error ? (
        <div className="border-b border-border px-3 py-2 text-xs text-destructive">{error}</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek">
        {loading && projects.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-3 py-8 text-xs text-muted-foreground">
            <LoaderCircle className="size-3.5 animate-spin" />
            {translate(
              'auto.components.right.sidebar.issuesPanel.linearLoadingProjects',
              'Loading projects…'
            )}
          </div>
        ) : projects.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-muted-foreground">
            {translate(
              'auto.components.right.sidebar.issuesPanel.linearNoProjects',
              'No projects found.'
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                disabled={attaching !== null}
                onClick={() => {
                  void handleAttach(project)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent disabled:opacity-60"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full border"
                  style={{
                    backgroundColor: project.color ?? 'transparent',
                    borderColor: project.color ?? 'var(--border)'
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {project.name}
                </span>
                {attaching === project.id ? (
                  <LoaderCircle className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
                ) : null}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
