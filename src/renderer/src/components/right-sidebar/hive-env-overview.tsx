import React from 'react'
import { ExternalLink } from 'lucide-react'
import type { HiveEnvironmentSummary } from '../../../../shared/hive-types'

function shortSha(sha: string | null | undefined): string {
  if (!sha) {
    return '—'
  }
  return sha.length > 8 ? sha.slice(0, 8) : sha
}

function MetaRow({ label, value }: { label: string; value: React.ReactNode }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-all font-medium text-foreground">{value || '—'}</div>
    </div>
  )
}

export function HiveEnvOverview({ env }: { env: HiveEnvironmentSummary }): React.JSX.Element {
  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-card/30 p-3">
      <MetaRow label="Name" value={env.name} />
      <MetaRow label="Branch" value={env.branch} />
      <MetaRow label="Commit status" value={env.commitStatus} />
      <MetaRow label="Deploy commit" value={shortSha(env.deployCommit)} />
      <MetaRow label="Latest commit" value={shortSha(env.latestCommit)} />
      <MetaRow
        label="Ports"
        value={
          env.port != null
            ? `${env.port}${env.containerPort != null ? ` → ${env.containerPort}` : ''}`
            : null
        }
      />
      <MetaRow label="Server" value={env.serverHostname || env.serverIp} />
      <MetaRow label="Server IP" value={env.serverIp} />
      <MetaRow
        label="Domains"
        value={
          env.domains && env.domains.length > 0 ? (
            <div className="flex flex-col gap-1">
              {env.domains.map((d) => (
                <a
                  key={d}
                  href={d.startsWith('http') ? d : `https://${d}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-violet-600 hover:underline dark:text-violet-400"
                >
                  {d}
                  <ExternalLink className="size-3" />
                </a>
              ))}
            </div>
          ) : null
        }
      />
      <MetaRow label="Image" value={env.image} />
      <MetaRow label="Dockerfile" value={env.dockerfile} />
      <MetaRow label="Build context" value={env.buildContext} />
      <MetaRow label="Updated" value={env.updatedAt} />
      <MetaRow label="Env id" value={<span className="font-mono text-[11px]">{env.id}</span>} />
    </div>
  )
}
