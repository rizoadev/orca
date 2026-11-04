/**
 * Linear project chooser for the Issues panel. Reuses Orca's existing Linear
 * connection (token in settings): lists the connected teams, then a searchable
 * project dropdown. Selecting a project saves the repo binding automatically.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronsUpDown, FolderKanban, LoaderCircle, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import { translate } from '@/i18n/i18n'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host'
import type { LinearProjectSummary } from '../../../../../../shared/linear/project-types'
import type { LinearTeam } from '../../../../../../shared/linear/workspace-types'

type Props = { onAttached: () => void }

export function LinearProjectPicker({ onAttached }: Props): React.JSX.Element {
  const linearStatus = useAppStore((s) => s.linearStatus)
  const listLinearTeams = useAppStore((s) => s.listLinearTeams)
  const listLinearProjects = useAppStore((s) => s.listLinearProjects)
  const updateRepo = useAppStore((s) => s.updateRepo)
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)

  const [teams, setTeams] = useState<LinearTeam[]>([])
  const [teamsLoading, setTeamsLoading] = useState(false)
  const [teamId, setTeamId] = useState<string>('')
  const [projects, setProjects] = useState<LinearProjectSummary[]>([])
  const [projectsLoading, setProjectsLoading] = useState(false)
  const [projectQuery, setProjectQuery] = useState('')
  const [projectOpen, setProjectOpen] = useState(false)
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null)
  const searchRequestIdRef = useRef(0)

  const connected = linearStatus.connected

  useEffect(() => {
    if (!connected) {
      return
    }
    let cancelled = false
    setTeamsLoading(true)
    void listLinearTeams(undefined)
      .then((items) => {
        if (!cancelled) {
          setTeams(items)
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setTeamsLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [connected, listLinearTeams])

  useEffect(() => {
    if (!teamId && teams.length > 0) {
      setTeamId(teams[0]?.id ?? '')
    }
  }, [teamId, teams])

  const selectedTeam = teams.find((team) => team.id === teamId) ?? null
  const workspaceId =
    selectedTeam?.workspaceId ??
    linearStatus.selectedWorkspaceId ??
    linearStatus.activeWorkspaceId ??
    undefined

  useEffect(() => {
    if (!connected || !projectOpen) {
      searchRequestIdRef.current += 1
      return () => undefined
    }
    const requestId = ++searchRequestIdRef.current
    const timeout = window.setTimeout(() => {
      setProjectsLoading(true)
      void listLinearProjects(projectQuery.trim() || undefined, 50, workspaceId)
        .then((result) => {
          if (searchRequestIdRef.current === requestId) {
            setProjects(result.items)
          }
        })
        .catch(() => undefined)
        .finally(() => {
          if (searchRequestIdRef.current === requestId) {
            setProjectsLoading(false)
          }
        })
    }, 200)
    return () => {
      searchRequestIdRef.current += 1
      window.clearTimeout(timeout)
    }
  }, [connected, listLinearProjects, projectOpen, projectQuery, workspaceId])

  const attach = useCallback(
    async (project: LinearProjectSummary) => {
      if (!activeRepo || !project.id) {
        return
      }
      const resolvedWorkspaceId = project.workspaceId ?? workspaceId
      if (!resolvedWorkspaceId) {
        toast.error(
          translate(
            'auto.components.right.sidebar.issuesPanel.linearNoWorkspace',
            'No Linear workspace selected'
          )
        )
        return
      }
      setSavingProjectId(project.id)
      try {
        await updateRepo(
          activeRepo.id,
          {
            linear: {
              projectId: project.id,
              workspaceId: resolvedWorkspaceId,
              projectName: project.name
            }
          },
          // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: RepoUpdate cannot express the nested linear binding, and hostId is recomputed from the repo.
          { hostId: getRepoExecutionHostId(activeRepo) as never }
        )
        toast.success(
          translate(
            'auto.components.right.sidebar.issuesPanel.linearProjectAttached',
            'Linear project connected'
          )
        )
        onAttached()
      } finally {
        setSavingProjectId(null)
      }
    },
    [activeRepo, onAttached, updateRepo, workspaceId]
  )

  if (!connected) {
    return (
      <div className="flex flex-col gap-2 p-4 text-sm">
        <p className="text-muted-foreground">
          {translate(
            'auto.components.right.sidebar.issuesPanel.linearNotConnected',
            'Connect Linear in Settings → Integrations to browse Linear issues here.'
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <div className="flex items-center gap-2">
        <Users className="size-3.5 text-muted-foreground" />
        <Select
          value={teamId}
          onValueChange={setTeamId}
          disabled={teamsLoading || teams.length === 0}
        >
          <SelectTrigger className="h-8 flex-1">
            <SelectValue
              placeholder={
                teamsLoading
                  ? translate('auto.common.loading', 'Loading…')
                  : translate('auto.components.right.sidebar.issuesPanel.linearTeam', 'Team')
              }
            />
          </SelectTrigger>
          <SelectContent>
            {teams.map((team) => (
              <SelectItem key={team.id} value={team.id}>
                {team.name}
                <span className="ml-2 text-xs text-muted-foreground">{team.key}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Popover open={projectOpen} onOpenChange={setProjectOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-between font-normal"
            disabled={!teamId}
          >
            <span className="flex items-center gap-2 truncate">
              <FolderKanban className="size-3.5 text-muted-foreground" />
              {translate(
                'auto.components.right.sidebar.issuesPanel.linearPickProject',
                'Pick a project'
              )}
            </span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={translate(
                'auto.components.right.sidebar.issuesPanel.linearSearchProjects',
                'Search projects…'
              )}
              value={projectQuery}
              onValueChange={setProjectQuery}
            />
            <CommandList>
              {projectsLoading ? (
                <div className="flex items-center justify-center py-4">
                  <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : null}
              {!projectsLoading && projects.length === 0 ? (
                <CommandEmpty>
                  {translate(
                    'auto.components.right.sidebar.issuesPanel.linearNoProjects',
                    'No projects found'
                  )}
                </CommandEmpty>
              ) : null}
              <CommandGroup>
                {projects.map((project) => (
                  <CommandItem
                    key={project.id}
                    value={project.id}
                    onSelect={() => {
                      setProjectOpen(false)
                      void attach(project)
                    }}
                  >
                    {savingProjectId === project.id ? (
                      <LoaderCircle className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5 opacity-0" />
                    )}
                    <span className="truncate">{project.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}
