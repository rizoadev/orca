/**
 * Right-sidebar Hive deploy panel: multi-tenant credentials + per-repo project binding.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Rocket } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  HiveBuildSummary,
  HiveCredentialPublic,
  HiveEnvironmentSummary,
  HiveProjectSummary,
  HiveRepoBinding
} from '../../../../shared/hive-types'
import { translate } from '@/i18n/i18n'
import { HiveEnvDetailDialog } from './hive-env-detail-dialog'
import { HivePanelAccountSection } from './hive-panel-account-section'
import { HivePanelOps } from './hive-panel-ops'
import { remoteHintFromRepo } from './hive-panel-remote-hint'

export default function HivePanel({ isVisible }: { isVisible: boolean }): React.JSX.Element {
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)
  const updateRepo = useAppStore((s) => s.updateRepo)

  const [credentials, setCredentials] = useState<HiveCredentialPublic[]>([])
  const [loadingCreds, setLoadingCreds] = useState(false)
  const [projects, setProjects] = useState<HiveProjectSummary[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [envs, setEnvs] = useState<HiveEnvironmentSummary[]>([])
  const [build, setBuild] = useState<HiveBuildSummary | null>(null)
  const [loadingOps, setLoadingOps] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [selectedEnv, setSelectedEnv] = useState<HiveEnvironmentSummary | null>(null)
  const [envDialogOpen, setEnvDialogOpen] = useState(false)

  // Setup form
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [label, setLabel] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://quasar.ikamai.com')
  const [token, setToken] = useState('')
  const [setupCredentialId, setSetupCredentialId] = useState<string>('')
  const [setupProjectId, setSetupProjectId] = useState<string>('')

  const binding = activeRepo?.hive ?? null

  const refreshCredentials = useCallback(async () => {
    if (!window.api.hive) {
      return
    }
    setLoadingCreds(true)
    try {
      setCredentials(await window.api.hive.listCredentials())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setLoadingCreds(false)
    }
  }, [])

  useEffect(() => {
    if (!isVisible) {
      return
    }
    void refreshCredentials()
  }, [isVisible, refreshCredentials])

  const loadProjects = useCallback(async (credentialId: string) => {
    if (!credentialId || !window.api.hive) {
      setProjects([])
      return
    }
    setLoadingProjects(true)
    try {
      const result = await window.api.hive.listProjects({ credentialId })
      if (!result.ok) {
        toast.error(result.error)
        setProjects([])
        return
      }
      setProjects(result.data)
    } finally {
      setLoadingProjects(false)
    }
  }, [])

  useEffect(() => {
    if (!isVisible) {
      return
    }
    const credId = binding?.credentialId || setupCredentialId
    if (credId) {
      void loadProjects(credId)
    } else {
      setProjects([])
    }
  }, [binding?.credentialId, isVisible, loadProjects, setupCredentialId])

  const refreshBoundData = useCallback(async () => {
    if (!binding || !window.api.hive) {
      setEnvs([])
      setBuild(null)
      return
    }
    setLoadingOps(true)
    try {
      const [envResult, buildResult] = await Promise.all([
        window.api.hive.listEnvironments({
          credentialId: binding.credentialId,
          projectId: binding.projectId
        }),
        window.api.hive.latestBuild({
          credentialId: binding.credentialId,
          projectId: binding.projectId
        })
      ])
      if (envResult.ok) {
        setEnvs(envResult.data)
      } else {
        toast.error(envResult.error)
        setEnvs([])
      }
      if (buildResult.ok) {
        setBuild(buildResult.data)
      } else {
        setBuild(null)
      }
    } finally {
      setLoadingOps(false)
    }
  }, [binding])

  useEffect(() => {
    if (!isVisible || !binding) {
      return
    }
    void refreshBoundData()
  }, [binding, isVisible, refreshBoundData])

  const suggestedProjectId = useMemo(() => {
    if (!activeRepo || projects.length === 0) {
      return ''
    }
    const hint = remoteHintFromRepo(activeRepo)?.toLowerCase()
    if (!hint) {
      return ''
    }
    const match = projects.find(
      (p) =>
        p.pathWithNamespace?.toLowerCase() === hint ||
        p.name.toLowerCase() === hint ||
        p.pathWithNamespace?.toLowerCase().endsWith(`/${hint.split('/').pop()}`)
    )
    return match?.id ?? ''
  }, [activeRepo, projects])

  useEffect(() => {
    if (!setupProjectId && suggestedProjectId) {
      setSetupProjectId(suggestedProjectId)
    }
  }, [setupProjectId, suggestedProjectId])

  const handleAddCredential = async (): Promise<void> => {
    if (!window.api.hive) {
      toast.error('Hive API unavailable — restart Orca')
      return
    }
    try {
      const created = await window.api.hive.addCredential({ label, baseUrl, token })
      toast.success(translate('auto.hive.credentialAdded', 'Hive account saved'))
      setToken('')
      setLabel('')
      setShowAddAccount(false)
      await refreshCredentials()
      setSetupCredentialId(created.id)
      void window.api.hive.probeCredential(created.id).then(() => refreshCredentials())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  const handleSaveBinding = async (): Promise<void> => {
    if (!activeRepo || !setupCredentialId || !setupProjectId) {
      return
    }
    const project = projects.find((p) => p.id === setupProjectId)
    const next: HiveRepoBinding = {
      credentialId: setupCredentialId,
      projectId: setupProjectId,
      projectName: project?.name,
      defaultEnv: 'dev',
      remoteHint: remoteHintFromRepo(activeRepo)
    }
    const ok = await updateRepo(activeRepo.id, { hive: next })
    if (ok) {
      toast.success(translate('auto.hive.linked', 'Repo linked to Hive project'))
    } else {
      toast.error(translate('auto.hive.linkFailed', 'Failed to save Hive binding'))
    }
  }

  const handleUnlink = async (): Promise<void> => {
    if (!activeRepo) {
      return
    }
    // Why: keep the previous tenant selected so unlink returns to project-picker, not empty account state.
    if (binding?.credentialId) {
      setSetupCredentialId(binding.credentialId)
      void loadProjects(binding.credentialId)
    }
    setSetupProjectId('')
    await updateRepo(activeRepo.id, { hive: null })
    setEnvs([])
    setBuild(null)
    toast.success(translate('auto.hive.unlinked', 'Hive unlinked from this repo'))
  }

  const handleSwitchCredential = async (credentialId: string): Promise<void> => {
    setSetupCredentialId(credentialId)
    setSetupProjectId('')
    setProjects([])
    if (!credentialId) {
      return
    }
    // Why: load projects immediately on select so the Project dropdown is not empty until remount.
    void loadProjects(credentialId)
    if (activeRepo && binding && binding.credentialId !== credentialId) {
      // Switching tenant requires re-picking project for this repo.
      await updateRepo(activeRepo.id, { hive: null })
      toast.message(translate('auto.hive.pickProject', 'Select a project for this tenant'))
    }
  }

  const runAction = async (key: string, fn: () => Promise<void>): Promise<void> => {
    setBusyAction(key)
    try {
      await fn()
      await refreshBoundData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction(null)
    }
  }

  if (!activeRepo) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-xs text-muted-foreground">
        {translate('auto.hive.noRepo', 'Select a worktree to manage Hive deploys.')}
      </div>
    )
  }

  const activeCredential = credentials.find(
    (c) => c.id === (binding?.credentialId ?? setupCredentialId)
  )

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2">
        <Rocket className="size-3.5 text-violet-500" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-foreground">Hive</div>
          <div className="truncate text-[10px] text-muted-foreground">{activeRepo.displayName}</div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7"
          onClick={() => {
            void refreshCredentials()
            const credId = binding?.credentialId || setupCredentialId
            if (credId) {
              void loadProjects(credId)
            }
            if (binding) {
              void refreshBoundData()
            }
          }}
          aria-label="Refresh"
        >
          <RefreshCw className={cn('size-3.5', (loadingCreds || loadingOps) && 'animate-spin')} />
        </Button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 scrollbar-sleek">
        <HivePanelAccountSection
          binding={binding}
          credentials={credentials}
          activeCredential={activeCredential}
          setupCredentialId={setupCredentialId}
          setupProjectId={setupProjectId}
          projects={projects}
          loadingProjects={loadingProjects}
          suggestedProjectId={suggestedProjectId}
          showAddAccount={showAddAccount}
          label={label}
          baseUrl={baseUrl}
          token={token}
          onShowAddAccountChange={setShowAddAccount}
          onSwitchCredential={(id) => void handleSwitchCredential(id)}
          onSetupProjectIdChange={setSetupProjectId}
          onLabelChange={setLabel}
          onBaseUrlChange={setBaseUrl}
          onTokenChange={setToken}
          onAddCredential={() => void handleAddCredential()}
          onSaveBinding={() => void handleSaveBinding()}
          onUnlink={() => void handleUnlink()}
        />

        {binding ? (
          <HivePanelOps
            binding={binding}
            build={build}
            envs={envs}
            busyAction={busyAction}
            runAction={runAction}
            onOpenEnv={(env) => {
              setSelectedEnv(env)
              setEnvDialogOpen(true)
            }}
          />
        ) : null}
      </div>

      {binding ? (
        <HiveEnvDetailDialog
          open={envDialogOpen}
          onOpenChange={(open) => {
            setEnvDialogOpen(open)
            if (!open) {
              setSelectedEnv(null)
            }
          }}
          credentialId={binding.credentialId}
          projectId={binding.projectId}
          projectName={binding.projectName}
          env={selectedEnv}
          onDeployed={() => {
            void refreshBoundData()
          }}
        />
      ) : null}
    </div>
  )
}
