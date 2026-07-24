/**
 * Tenant/account + project link UI for Hive sidebar panel.
 */
import React from 'react'
import { ChevronDown, Plus, Unlink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type {
  HiveCredentialPublic,
  HiveProjectSummary,
  HiveRepoBinding
} from '../../../../shared/hive-types'

type HivePanelAccountSectionProps = {
  binding: HiveRepoBinding | null
  credentials: HiveCredentialPublic[]
  activeCredential: HiveCredentialPublic | undefined
  setupCredentialId: string
  setupProjectId: string
  projects: HiveProjectSummary[]
  loadingProjects: boolean
  suggestedProjectId: string
  showAddAccount: boolean
  label: string
  baseUrl: string
  token: string
  onShowAddAccountChange: (open: boolean) => void
  onSwitchCredential: (credentialId: string) => void
  onSetupProjectIdChange: (projectId: string) => void
  onLabelChange: (value: string) => void
  onBaseUrlChange: (value: string) => void
  onTokenChange: (value: string) => void
  onAddCredential: () => void
  onSaveBinding: () => void
  onUnlink: () => void
}

export function HivePanelAccountSection({
  binding,
  credentials,
  activeCredential,
  setupCredentialId,
  setupProjectId,
  projects,
  loadingProjects,
  suggestedProjectId,
  showAddAccount,
  label,
  baseUrl,
  token,
  onShowAddAccountChange,
  onSwitchCredential,
  onSetupProjectIdChange,
  onLabelChange,
  onBaseUrlChange,
  onTokenChange,
  onAddCredential,
  onSaveBinding,
  onUnlink
}: HivePanelAccountSectionProps): React.JSX.Element {
  return (
    <>
      <section className="space-y-1.5">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Tenant / account
        </div>
        {binding ? (
          <div className="rounded-md border border-border/60 bg-card/40 px-2.5 py-2 text-xs">
            <div className="font-medium text-foreground">
              {activeCredential?.label ?? 'Linked account'}
              {activeCredential?.tenantName ? ` · ${activeCredential.tenantName}` : ''}
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {activeCredential?.baseUrl ?? activeCredential?.tokenPrefix ?? binding.credentialId}
              {activeCredential?.status === 'invalid' ? ' · invalid' : ''}
            </div>
          </div>
        ) : (
          <>
            <div className="flex gap-1.5">
              <div className="relative min-w-0 flex-1">
                <select
                  className="h-8 w-full appearance-none rounded-md border border-input bg-background px-2 pr-7 text-xs"
                  value={setupCredentialId}
                  onChange={(e) => onSwitchCredential(e.target.value)}
                >
                  <option value="">Select account…</option>
                  {credentials.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                      {c.tenantName ? ` · ${c.tenantName}` : ''} ({c.tokenPrefix}…)
                      {c.status === 'invalid' ? ' · invalid' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-2 size-3.5 text-muted-foreground" />
              </div>
              <Button
                variant="outline"
                size="icon-sm"
                className="size-8 shrink-0"
                onClick={() => onShowAddAccountChange(!showAddAccount)}
                title="Add Hive token"
              >
                <Plus className="size-3.5" />
              </Button>
            </div>
            {activeCredential ? (
              <p className="text-[10px] text-muted-foreground">
                {activeCredential.baseUrl}
                {activeCredential.tenantName ? ` · ${activeCredential.tenantName}` : ''}
              </p>
            ) : null}
          </>
        )}
      </section>

      {showAddAccount && !binding ? (
        <section className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Add token (shown once on Hive)
          </div>
          <Input
            value={label}
            onChange={(e) => onLabelChange(e.target.value)}
            placeholder="Label (e.g. Acme)"
            className="h-8 text-xs"
          />
          <Input
            value={baseUrl}
            onChange={(e) => onBaseUrlChange(e.target.value)}
            placeholder="https://hive.example.com"
            className="h-8 text-xs"
          />
          <Input
            value={token}
            onChange={(e) => onTokenChange(e.target.value)}
            placeholder="hive_…"
            type="password"
            className="h-8 font-mono text-xs"
          />
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => onShowAddAccountChange(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!label.trim() || !baseUrl.trim() || !token.trim()}
              onClick={onAddCredential}
            >
              Save account
            </Button>
          </div>
        </section>
      ) : null}

      <section className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Project
          </div>
          {binding ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[10px]"
              onClick={onUnlink}
            >
              <Unlink className="size-3" />
              Unlink
            </Button>
          ) : null}
        </div>

        {binding ? (
          <div className="rounded-md border border-border/60 bg-card/40 px-2.5 py-2 text-xs">
            <div className="font-medium text-foreground">
              {binding.projectName ?? binding.projectId}
            </div>
            <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
              {binding.projectId}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="relative">
              <select
                className="h-8 w-full appearance-none rounded-md border border-input bg-background px-2 pr-7 text-xs"
                value={setupProjectId}
                disabled={!setupCredentialId || loadingProjects}
                onChange={(e) => onSetupProjectIdChange(e.target.value)}
              >
                <option value="">
                  {loadingProjects ? 'Loading projects…' : 'Select Hive project…'}
                </option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.pathWithNamespace || p.name}
                    {suggestedProjectId === p.id ? ' · suggested' : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-2 size-3.5 text-muted-foreground" />
            </div>
            {!loadingProjects && setupCredentialId && projects.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                No projects returned for this account. Refresh, or verify the token can access GET
                /project.
              </p>
            ) : null}
            <Button
              size="sm"
              className="w-full"
              disabled={!setupCredentialId || !setupProjectId}
              onClick={onSaveBinding}
            >
              Link to this repo
            </Button>
          </div>
        )}
      </section>
    </>
  )
}
