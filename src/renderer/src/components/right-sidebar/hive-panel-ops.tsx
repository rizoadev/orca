/**
 * Bound-repo Hive ops: latest build actions + clickable environment list.
 */
import React from 'react'
import { CheckCircle2, Cloud, LoaderCircle, Server } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  HiveBuildSummary,
  HiveEnvironmentSummary,
  HiveRepoBinding
} from '../../../../shared/hive-types'

export function commitStatusTone(status: string | null | undefined): string {
  switch (status) {
    case 'up_to_date':
      return 'text-emerald-600 dark:text-emerald-400'
    case 'behind':
      return 'text-amber-600 dark:text-amber-400'
    case 'never_deployed':
      return 'text-muted-foreground'
    default:
      return 'text-muted-foreground'
  }
}

type HivePanelOpsProps = {
  binding: HiveRepoBinding
  build: HiveBuildSummary | null
  envs: HiveEnvironmentSummary[]
  busyAction: string | null
  runAction: (key: string, fn: () => Promise<void>) => Promise<void>
  onOpenEnv: (env: HiveEnvironmentSummary) => void
}

export function HivePanelOps({
  binding,
  build,
  envs,
  busyAction,
  runAction,
  onOpenEnv
}: HivePanelOpsProps): React.JSX.Element {
  return (
    <>
      <section className="space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Latest build
        </div>
        {build ? (
          <div className="rounded-md border border-border/60 px-2.5 py-2 text-xs">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-muted-foreground" />
              <span className="font-medium">{build.status ?? 'unknown'}</span>
            </div>
            {build.msg ? (
              <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{build.msg}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">No builds yet.</p>
        )}
        <div className="flex gap-1.5">
          <Button
            size="sm"
            className="flex-1 gap-1"
            disabled={busyAction !== null}
            onClick={() =>
              void runAction('build', async () => {
                const result = await window.api.hive.triggerBuild({
                  credentialId: binding.credentialId,
                  projectId: binding.projectId
                })
                if (!result.ok) {
                  throw new Error(result.error)
                }
                toast.success('Build triggered')
              })
            }
          >
            {busyAction === 'build' ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Cloud className="size-3.5" />
            )}
            Build
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1 gap-1"
            disabled={busyAction !== null}
            onClick={() =>
              void runAction('dispatch', async () => {
                const result = await window.api.hive.dispatch({
                  credentialId: binding.credentialId,
                  projectId: binding.projectId,
                  tipe: 'build'
                })
                if (!result.ok) {
                  throw new Error(result.error)
                }
                toast.success('Workflow dispatched')
              })
            }
          >
            Dispatch
          </Button>
        </div>
      </section>

      <section className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Environments
          </div>
          <span className="text-[10px] text-muted-foreground">{envs.length}</span>
        </div>
        {envs.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No environments.</p>
        ) : (
          <div className="space-y-1.5">
            {envs.map((env) => (
              <button
                key={env.id}
                type="button"
                className="w-full rounded-md border border-border/60 bg-card/30 px-2.5 py-2 text-left text-xs transition-colors hover:border-violet-500/40 hover:bg-muted/30"
                onClick={() => onOpenEnv(env)}
              >
                <div className="flex items-center gap-1.5">
                  <Server className="size-3 shrink-0 text-muted-foreground" />
                  <span className="font-medium">{env.name}</span>
                  <span className={cn('ml-auto text-[10px]', commitStatusTone(env.commitStatus))}>
                    {env.commitStatus ?? env.status ?? ''}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {env.branch ? `branch ${env.branch}` : null}
                  {env.serverHostname ? ` · ${env.serverHostname}` : null}
                  {env.domains?.[0] ? ` · ${env.domains[0]}` : null}
                </div>
                <div className="mt-1.5 text-[10px] text-violet-600 dark:text-violet-400">
                  Open details · env files · logs
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
