/**
 * Modal detail for a Hive environment: overview, env files, stream logs, deploy.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { FileCode2, LoaderCircle, RefreshCw, Rocket, ScrollText, Server } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type {
  HiveEnvFile,
  HiveEnvironmentSummary,
  HiveStreamLogLine
} from '../../../../shared/hive-types'
import { HiveEnvFilesEditor } from './hive-env-files-editor'
import { HiveEnvOverview } from './hive-env-overview'

type HiveEnvDetailDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  credentialId: string
  projectId: string
  projectName?: string
  env: HiveEnvironmentSummary | null
  onDeployed?: () => void
}

export function HiveEnvDetailDialog({
  open,
  onOpenChange,
  credentialId,
  projectId,
  projectName,
  env,
  onDeployed
}: HiveEnvDetailDialogProps): React.JSX.Element {
  const [tab, setTab] = useState('overview')
  const [files, setFiles] = useState<HiveEnvFile[]>([])
  const [fileDrafts, setFileDrafts] = useState<Record<string, string>>({})
  const [activeFilePath, setActiveFilePath] = useState<string>('')
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [savingFiles, setSavingFiles] = useState(false)
  const [lines, setLines] = useState<HiveStreamLogLine[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [deploying, setDeploying] = useState(false)

  const loadFiles = useCallback(async () => {
    if (!env || !window.api.hive) {
      return
    }
    setLoadingFiles(true)
    try {
      const result = await window.api.hive.getEnvFiles({
        credentialId,
        projectId,
        envId: env.id
      })
      if (!result.ok) {
        toast.error(result.error)
        setFiles([])
        setFileDrafts({})
        return
      }
      const nextFiles = Array.isArray(result.data) ? result.data : []
      setFiles(nextFiles)
      const drafts: Record<string, string> = {}
      for (const file of nextFiles) {
        // Why: always string-coerce so Monaco never receives undefined/null content.
        drafts[file.path] =
          typeof file.content === 'string' ? file.content : String(file.content ?? '')
      }
      setFileDrafts(drafts)
      setActiveFilePath((prev) => {
        if (prev && nextFiles.some((f) => f.path === prev)) {
          return prev
        }
        return nextFiles[0]?.path ?? ''
      })
    } finally {
      setLoadingFiles(false)
    }
  }, [credentialId, env, projectId])

  const loadLogs = useCallback(async () => {
    if (!env || !window.api.hive) {
      return
    }
    setLoadingLogs(true)
    try {
      const result = await window.api.hive.streamHistory({
        credentialId,
        projectId,
        env: env.name,
        limit: 150
      })
      if (!result.ok) {
        toast.error(result.error)
        setLines([])
        return
      }
      setLines(result.data)
    } finally {
      setLoadingLogs(false)
    }
  }, [credentialId, env, projectId])

  useEffect(() => {
    if (!open || !env) {
      return
    }
    setTab('overview')
    setFiles([])
    setFileDrafts({})
    setLines([])
    setActiveFilePath('')
  }, [env, open])

  useEffect(() => {
    if (!open || !env) {
      return
    }
    if (tab === 'env-files') {
      void loadFiles()
    }
    if (tab === 'logs') {
      void loadLogs()
    }
  }, [env, loadFiles, loadLogs, open, tab])

  const dirty = useMemo(() => {
    return files.some((f) => (fileDrafts[f.path] ?? '') !== f.content)
  }, [fileDrafts, files])

  const handleSaveFiles = async (): Promise<void> => {
    if (!env || !window.api.hive) {
      return
    }
    setSavingFiles(true)
    try {
      const payload = files.map((f) => ({
        path: f.path,
        content: fileDrafts[f.path] ?? f.content
      }))
      for (const [path, content] of Object.entries(fileDrafts)) {
        if (!payload.some((p) => p.path === path)) {
          payload.push({ path, content })
        }
      }
      const result = await window.api.hive.saveEnvFiles({
        credentialId,
        projectId,
        envId: env.id,
        files: payload
      })
      if (!result.ok) {
        throw new Error(result.error)
      }
      setFiles(result.data)
      const drafts: Record<string, string> = {}
      for (const file of result.data) {
        drafts[file.path] = file.content
      }
      setFileDrafts(drafts)
      toast.success('Env files saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSavingFiles(false)
    }
  }

  const handleDeploy = async (): Promise<void> => {
    if (!env || !window.api.hive) {
      return
    }
    setDeploying(true)
    try {
      const result = await window.api.hive.deployEnvironment({
        credentialId,
        projectId,
        envId: env.id,
        async: true
      })
      if (!result.ok) {
        throw new Error(result.error)
      }
      toast.success(`Deploy ${env.name} started`)
      onDeployed?.()
      setTab('logs')
      window.setTimeout(() => {
        void loadLogs()
      }, 1200)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setDeploying(false)
    }
  }

  return (
    <Dialog open={open && Boolean(env)} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(920px,92vh)] max-h-[min(920px,92vh)] w-[min(1040px,calc(100%-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/50 px-5 py-4 pr-12 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Server className="size-4 text-violet-500" />
            {env?.name ?? 'Environment'}
            {env?.status ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {env.status}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {projectName ? `${projectName} · ` : null}
            {env?.branch ? `branch ${env.branch}` : 'Hive environment'}
            {env?.serverHostname ? ` · ${env.serverHostname}` : null}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-5 pb-5 pt-3">
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
          >
            <div className="flex shrink-0 items-center gap-2">
              <TabsList variant="line" className="h-8">
                <TabsTrigger value="overview" className="text-xs">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="env-files" className="gap-1 text-xs">
                  <FileCode2 className="size-3" />
                  Env files
                </TabsTrigger>
                <TabsTrigger value="logs" className="gap-1 text-xs">
                  <ScrollText className="size-3" />
                  Stream logs
                </TabsTrigger>
              </TabsList>
              <div className="ml-auto flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1 text-xs"
                  disabled={deploying || !env}
                  onClick={() => void handleDeploy()}
                >
                  {deploying ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <Rocket className="size-3.5" />
                  )}
                  Deploy
                </Button>
              </div>
            </div>

            <TabsContent
              value="overview"
              className="mt-0 min-h-0 flex-1 overflow-y-auto scrollbar-sleek data-[state=inactive]:hidden"
            >
              {env ? <HiveEnvOverview env={env} /> : null}
            </TabsContent>

            <TabsContent
              value="env-files"
              className="mt-0 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden data-[state=inactive]:hidden"
            >
              <HiveEnvFilesEditor
                files={files}
                fileDrafts={fileDrafts}
                activeFilePath={activeFilePath}
                loadingFiles={loadingFiles}
                savingFiles={savingFiles}
                dirty={dirty}
                onActivePathChange={setActiveFilePath}
                onDraftChange={(path, content) => {
                  setFileDrafts((prev) => ({ ...prev, [path]: content }))
                }}
                onReload={() => void loadFiles()}
                onSave={() => void handleSaveFiles()}
              />
            </TabsContent>

            <TabsContent
              value="logs"
              className="mt-0 flex min-h-0 flex-1 flex-col gap-2 overflow-hidden data-[state=inactive]:hidden"
            >
              <div className="flex shrink-0 items-center gap-2">
                <div className="text-[11px] text-muted-foreground">
                  {loadingLogs ? 'Loading…' : `${lines.length} step(s)`} · history bootstrap (live
                  WS not wired yet)
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-7 gap-1 px-2 text-xs"
                  disabled={loadingLogs}
                  onClick={() => void loadLogs()}
                >
                  <RefreshCw className={cn('size-3', loadingLogs && 'animate-spin')} />
                  Refresh
                </Button>
              </div>
              <div className="min-h-[560px] flex-1 overflow-y-auto rounded-md border border-border/60 bg-[#0c0c0e] p-2 font-mono text-[11px] leading-relaxed text-zinc-200 scrollbar-sleek">
                {loadingLogs && lines.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-zinc-500">
                    <LoaderCircle className="mr-2 size-3.5 animate-spin" />
                    Loading stream history…
                  </div>
                ) : lines.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-zinc-500">
                    No stream history for this env yet.
                  </div>
                ) : (
                  lines.map((line, index) => {
                    const tone =
                      line.level === 'error' || line.outcome === 'failure'
                        ? 'text-red-400'
                        : line.level === 'warn' || line.outcome === 'cancelled'
                          ? 'text-amber-300'
                          : line.outcome === 'success'
                            ? 'text-emerald-300'
                            : 'text-zinc-200'
                    return (
                      <div
                        key={line.id ?? `${line.createdAt ?? 'line'}-${index}`}
                        className={cn('whitespace-pre-wrap break-words', tone)}
                      >
                        <span className="text-zinc-500">
                          {line.createdAt ? `${line.createdAt.slice(11, 19)} ` : ''}
                          {line.task ? `[${line.task}] ` : ''}
                        </span>
                        {line.msg || '—'}
                      </div>
                    )
                  })
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}
