import { useMemo, useState } from 'react'
import { Plus, Trash2, Users } from 'lucide-react'
import type { GlobalSettings, TuiAgent } from '../../../../shared/types'
import {
  normalizeAgentSquads,
  type AgentSquad,
  type AgentSquadMember,
  type AgentSquadRouting
} from '../../../../shared/agent-squads'
import { getAgentCatalog } from '@/lib/agent-catalog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { translate } from '@/i18n/i18n'
import { SettingsSubsectionHeader } from './SettingsFormControls'

type AgentSquadsSettingsProps = {
  settings: GlobalSettings
  updateSettings: (updates: Partial<GlobalSettings>) => void | Promise<void>
}

function slugifyId(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned.slice(0, 40) || `squad-${Date.now().toString(36)}`
}

function uniqueSquadId(existing: readonly AgentSquad[], base: string): string {
  if (!existing.some((squad) => squad.id === base)) {
    return base
  }
  let n = 2
  while (existing.some((squad) => squad.id === `${base}-${n}`)) {
    n += 1
  }
  return `${base}-${n}`
}

export function AgentSquadsSettings({
  settings,
  updateSettings
}: AgentSquadsSettingsProps): React.JSX.Element {
  const squads = useMemo(
    () => normalizeAgentSquads(settings?.agentSquads ?? []),
    [settings?.agentSquads]
  )
  const agents = useMemo(() => getAgentCatalog().map((entry) => entry.id as TuiAgent), [])
  const [draftName, setDraftName] = useState('')
  const [draftLeader, setDraftLeader] = useState<TuiAgent>(agents[0] ?? 'claude')
  const [draftRouting, setDraftRouting] = useState<AgentSquadRouting>('leader_decide')

  const persist = (next: AgentSquad[]): void => {
    void updateSettings({ agentSquads: next })
  }

  const addSquad = (): void => {
    const name = draftName.trim() || 'New squad'
    const id = uniqueSquadId(squads, slugifyId(name))
    const next: AgentSquad = {
      id,
      name,
      leader: { agent: draftLeader },
      members: [{ agent: draftLeader }],
      routing: draftRouting
    }
    persist([...squads, next])
    setDraftName('')
  }

  const removeSquad = (id: string): void => {
    persist(squads.filter((squad) => squad.id !== id))
  }

  const updateSquad = (id: string, patch: Partial<AgentSquad>): void => {
    persist(
      squads.map((squad) => {
        if (squad.id !== id) {
          return squad
        }
        const leader = patch.leader ?? squad.leader
        const members = patch.members ?? squad.members
        // Why: leader must remain in the member list so idle_first routing can see them.
        const leaderKey = `${leader.agent}\0${leader.profile ?? ''}`
        const withLeader = members.some(
          (member) => `${member.agent}\0${member.profile ?? ''}` === leaderKey
        )
          ? members
          : [leader, ...members]
        return {
          ...squad,
          ...patch,
          leader,
          members: withLeader
        }
      })
    )
  }

  const toggleMember = (squad: AgentSquad, agent: TuiAgent): void => {
    const has = squad.members.some((member) => member.agent === agent)
    if (has) {
      if (squad.leader.agent === agent) {
        return
      }
      updateSquad(squad.id, {
        members: squad.members.filter((member) => member.agent !== agent)
      })
      return
    }
    updateSquad(squad.id, { members: [...squad.members, { agent }] })
  }

  const updateMember = (
    squad: AgentSquad,
    agent: TuiAgent,
    patch: Partial<AgentSquadMember>
  ): void => {
    updateSquad(squad.id, {
      members: squad.members.map((member) =>
        member.agent === agent ? { ...member, ...patch } : member
      )
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-3">
      <SettingsSubsectionHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Users className="size-4" />
            {translate('auto.components.settings.AgentSquadsSettings.title', 'Agent squads')}
          </span>
        }
        description={translate(
          'auto.components.settings.AgentSquadsSettings.description',
          'Named groups with a leader. Address them as @squad:<id> from orchestration send/dispatch.'
        )}
      />

      {squads.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          {translate(
            'auto.components.settings.AgentSquadsSettings.empty',
            'No squads yet. Create one to route work to a leader agent.'
          )}
        </p>
      ) : (
        <ul className="space-y-3">
          {squads.map((squad) => (
            <li key={squad.id} className="space-y-2 rounded-md border border-border/50 p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  <Input
                    value={squad.name}
                    onChange={(event) => updateSquad(squad.id, { name: event.target.value })}
                    aria-label={translate(
                      'auto.components.settings.AgentSquadsSettings.nameAria',
                      'Squad name'
                    )}
                    className="h-8"
                  />
                  <p className="font-mono text-[11px] text-muted-foreground">@squad:{squad.id}</p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => removeSquad(squad.id)}
                  aria-label={translate(
                    'auto.components.settings.AgentSquadsSettings.removeAria',
                    'Remove squad'
                  )}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1 text-[11px] text-muted-foreground">
                  {translate('auto.components.settings.AgentSquadsSettings.leader', 'Leader')}
                  <select
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                    value={squad.leader.agent}
                    onChange={(event) =>
                      updateSquad(squad.id, { leader: { agent: event.target.value as TuiAgent } })
                    }
                  >
                    {agents.map((agent) => (
                      <option key={agent} value={agent}>
                        {agent}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-[11px] text-muted-foreground">
                  {translate('auto.components.settings.AgentSquadsSettings.routing', 'Routing')}
                  <select
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
                    value={squad.routing}
                    onChange={(event) =>
                      updateSquad(squad.id, {
                        routing: event.target.value as AgentSquadRouting
                      })
                    }
                  >
                    <option value="leader_decide">leader_decide</option>
                    <option value="idle_first">idle_first</option>
                    <option value="round_robin">round_robin</option>
                  </select>
                </label>
              </div>

              <div className="space-y-1">
                <p className="text-[11px] text-muted-foreground">
                  {translate('auto.components.settings.AgentSquadsSettings.members', 'Members')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {agents.map((agent) => {
                    const active = squad.members.some((member) => member.agent === agent)
                    const isLeader = squad.leader.agent === agent
                    return (
                      <button
                        key={agent}
                        type="button"
                        disabled={isLeader}
                        onClick={() => toggleMember(squad, agent)}
                        className={
                          active
                            ? 'rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] text-foreground'
                            : 'rounded-full border border-border/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-accent'
                        }
                      >
                        {agent}
                        {isLeader ? ' ★' : ''}
                      </button>
                    )
                  })}
                </div>

                {/* Why: per-member config — role, preferred CLI, and a custom system prompt. */}
                <ul className="space-y-2 pt-1">
                  {squad.members.map((member) => (
                    <li
                      key={`${member.agent}${member.profile ?? ''}`}
                      className="space-y-1.5 rounded-md border border-border/50 bg-background/40 p-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-28 truncate text-[11px] font-medium text-foreground">
                          {member.agent}
                          {member.agent === squad.leader.agent ? ' ★' : ''}
                        </span>
                        <Input
                          value={member.role ?? ''}
                          onChange={(event) =>
                            updateMember(squad, member.agent, { role: event.target.value })
                          }
                          placeholder={translate(
                            'auto.components.settings.AgentSquadsSettings.rolePlaceholder',
                            'role (e.g. coder, tester, researcher)'
                          )}
                          aria-label={translate(
                            'auto.components.settings.AgentSquadsSettings.roleAria',
                            'Member role'
                          )}
                          className="h-7 flex-1 text-[11px]"
                        />
                        <Input
                          value={member.cli ?? ''}
                          onChange={(event) =>
                            updateMember(squad, member.agent, { cli: event.target.value })
                          }
                          placeholder={translate(
                            'auto.components.settings.AgentSquadsSettings.cliPlaceholder',
                            'cli binary'
                          )}
                          aria-label={translate(
                            'auto.components.settings.AgentSquadsSettings.cliAria',
                            'Preferred CLI'
                          )}
                          className="h-7 w-28 text-[11px]"
                        />
                      </div>
                      <textarea
                        value={member.systemPrompt ?? ''}
                        onChange={(event) =>
                          updateMember(squad, member.agent, {
                            systemPrompt: event.target.value
                          })
                        }
                        placeholder={translate(
                          'auto.components.settings.AgentSquadsSettings.systemPromptPlaceholder',
                          'Custom system prompt for this member'
                        )}
                        aria-label={translate(
                          'auto.components.settings.AgentSquadsSettings.systemPromptAria',
                          'Member system prompt'
                        )}
                        rows={2}
                        className="w-full resize-y rounded-md border border-input bg-background px-2 py-1 text-[11px] text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-2 rounded-md border border-dashed border-border/70 p-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
        <label className="space-y-1 text-[11px] text-muted-foreground">
          {translate('auto.components.settings.AgentSquadsSettings.newName', 'Name')}
          <Input
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            placeholder="Frontend Team"
            className="h-8"
          />
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          {translate('auto.components.settings.AgentSquadsSettings.leader', 'Leader')}
          <select
            className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={draftLeader}
            onChange={(event) => setDraftLeader(event.target.value as TuiAgent)}
          >
            {agents.map((agent) => (
              <option key={agent} value={agent}>
                {agent}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          {translate('auto.components.settings.AgentSquadsSettings.routing', 'Routing')}
          <select
            className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground"
            value={draftRouting}
            onChange={(event) => setDraftRouting(event.target.value as AgentSquadRouting)}
          >
            <option value="leader_decide">leader_decide</option>
            <option value="idle_first">idle_first</option>
            <option value="round_robin">round_robin</option>
          </select>
        </label>
        <Button type="button" size="sm" className="h-8 gap-1" onClick={addSquad}>
          <Plus className="size-3.5" />
          {translate('auto.components.settings.AgentSquadsSettings.add', 'Add squad')}
        </Button>
      </div>
    </div>
  )
}
