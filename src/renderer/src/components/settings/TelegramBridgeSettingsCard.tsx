import { useCallback, useEffect, useState } from 'react'
import { MessageCircle, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import type {
  TelegramBridgeEvent,
  TelegramBridgeStatus
} from '../../../../shared/telegram-bridge-types'
import { IntegrationCardDetails, IntegrationCardShell } from './integration-card-shell'

function parseUserIds(raw: string): number[] {
  return raw
    .split(/[\s,;]+/)
    .map((part) => Number(part.trim()))
    .filter((id) => Number.isInteger(id) && id !== 0)
}

function statusTone(status: TelegramBridgeStatus | null): 'connected' | 'attention' | 'neutral' {
  if (!status) {
    return 'neutral'
  }
  if (
    status.running &&
    status.config.enabled &&
    status.config.botTokenConfigured &&
    status.config.telegramGroupId !== null
  ) {
    return 'connected'
  }
  if (
    status.lastError ||
    (status.config.enabled &&
      (!status.config.botTokenConfigured || status.config.telegramGroupId === null))
  ) {
    return 'attention'
  }
  return 'neutral'
}

function statusLabel(status: TelegramBridgeStatus | null): string {
  if (!status) {
    return translate('settings.telegramBridge.status.unknown', 'Unknown')
  }
  if (status.running) {
    return translate('settings.telegramBridge.status.running', 'Running')
  }
  if (status.config.enabled) {
    return translate('settings.telegramBridge.status.enabled', 'Enabled')
  }
  return translate('settings.telegramBridge.status.off', 'Off')
}

function ToggleSwitch(props: {
  checked: boolean
  disabled?: boolean
  onToggle: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      disabled={props.disabled}
      onClick={props.onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${props.checked ? 'bg-foreground' : 'bg-muted-foreground/30'}`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-background shadow-sm transition-transform ${props.checked ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

export function TelegramBridgeSettingsCard(): React.JSX.Element {
  const [status, setStatus] = useState<TelegramBridgeStatus | null>(null)
  const [events, setEvents] = useState<TelegramBridgeEvent[]>([])
  const [tokenDraft, setTokenDraft] = useState('')
  const [allowlistDraft, setAllowlistDraft] = useState('')
  const [groupIdDraft, setGroupIdDraft] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const [nextStatus, nextEvents] = await Promise.all([
      window.api.telegramBridge.getStatus(),
      window.api.telegramBridge.getEvents({ limit: 20 })
    ])
    setStatus(nextStatus)
    setEvents(nextEvents)
    setAllowlistDraft(nextStatus.config.allowedTelegramUserIds.join(', '))
    setGroupIdDraft(
      nextStatus.config.telegramGroupId !== null ? String(nextStatus.config.telegramGroupId) : ''
    )
  }, [])

  useEffect(() => {
    void refresh().catch(() => {})
    const offStatus = window.api.telegramBridge.onStatus((next) => {
      setStatus(next)
      setAllowlistDraft(next.config.allowedTelegramUserIds.join(', '))
      setGroupIdDraft(
        next.config.telegramGroupId !== null ? String(next.config.telegramGroupId) : ''
      )
    })
    const offEvent = window.api.telegramBridge.onEvent((event) => {
      setEvents((prev) => [...prev.slice(-19), event])
    })
    return () => {
      offStatus()
      offEvent()
    }
  }, [refresh])

  const saveToken = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await window.api.telegramBridge.setBotToken({ token: tokenDraft })
      setStatus(next)
      setTokenDraft('')
      toast.success(translate('settings.telegramBridge.tokenSaved', 'Telegram bot token saved'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const clearToken = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await window.api.telegramBridge.clearBotToken()
      setStatus(next)
      toast.success(translate('settings.telegramBridge.tokenCleared', 'Telegram bot token cleared'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const applyConfig = async (patch?: { enabled?: boolean }): Promise<void> => {
    setBusy(true)
    try {
      const groupRaw = groupIdDraft.trim()
      const telegramGroupId =
        groupRaw === '' ? null : Number.isFinite(Number(groupRaw)) ? Number(groupRaw) : undefined
      if (groupRaw !== '' && telegramGroupId === undefined) {
        toast.error(translate('settings.telegramBridge.groupInvalid', 'Group id must be a number'))
        return
      }
      const next = await window.api.telegramBridge.setConfig({
        ...(typeof patch?.enabled === 'boolean' ? { enabled: patch.enabled } : {}),
        allowedTelegramUserIds: parseUserIds(allowlistDraft),
        ...(telegramGroupId !== undefined ? { telegramGroupId } : {})
      })
      setStatus(next)
      toast.success(translate('settings.telegramBridge.configSaved', 'Telegram bridge updated'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const syncAllTopics = async (): Promise<void> => {
    setBusy(true)
    try {
      const result = await window.api.telegramBridge.ensureTopicsForAllRepos()
      await refresh()
      toast.success(
        translate(
          'settings.telegramBridge.syncAllDone',
          'Topics synced: {{created}} created, {{existing}} existing, {{failed}} failed',
          {
            created: String(result.created.length),
            existing: String(result.existing.length),
            failed: String(result.failed.length)
          }
        )
      )
      if (result.failed[0]) {
        toast.error(`${result.failed[0].repoId}: ${result.failed[0].reason}`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const deleteMapping = async (id: string): Promise<void> => {
    setBusy(true)
    try {
      await window.api.telegramBridge.deleteMapping({ id })
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <IntegrationCardShell
      icon={<MessageCircle size={16} />}
      name={translate('settings.telegramBridge.name', 'Telegram bridge')}
      description={translate(
        'settings.telegramBridge.description',
        'Global setup only: bot token, allowed users, and one forum group. Every repo auto-creates its own topic.'
      )}
      statusLabel={statusLabel(status)}
      statusTone={statusTone(status)}
      checking={busy && !status}
      actions={
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">
            {translate('settings.telegramBridge.enabled', 'Enabled')}
          </span>
          <ToggleSwitch
            checked={status?.config.enabled === true}
            disabled={busy}
            onToggle={() => void applyConfig({ enabled: !(status?.config.enabled === true) })}
          />
        </div>
      }
    >
      <IntegrationCardDetails>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">
              {translate('settings.telegramBridge.botToken', '1. Bot token')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                type="password"
                value={tokenDraft}
                onChange={(event) => setTokenDraft(event.target.value)}
                placeholder={
                  status?.config.botTokenConfigured
                    ? translate(
                        'settings.telegramBridge.tokenConfigured',
                        'Configured — paste to replace'
                      )
                    : translate('settings.telegramBridge.tokenPlaceholder', '123456:ABC-DEF...')
                }
                className="min-w-[16rem] flex-1"
              />
              <Button
                size="sm"
                disabled={busy || !tokenDraft.trim()}
                onClick={() => void saveToken()}
              >
                {translate('settings.telegramBridge.saveToken', 'Save')}
              </Button>
              {status?.config.botTokenConfigured ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void clearToken()}
                >
                  {translate('settings.telegramBridge.clearToken', 'Clear')}
                </Button>
              ) : null}
            </div>
            {status?.botUsername ? (
              <p className="text-[11px] text-muted-foreground">@{status.botUsername}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">
              {translate('settings.telegramBridge.allowlist', '2. Allowed Telegram user IDs')}
            </p>
            <Input
              value={allowlistDraft}
              onChange={(event) => setAllowlistDraft(event.target.value)}
              placeholder="123456789, 987654321"
            />
            <p className="text-[11px] text-muted-foreground">
              {translate(
                'settings.telegramBridge.allowlistHint',
                'Empty allowlist blocks all inbound Telegram commands.'
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium text-foreground">
              {translate('settings.telegramBridge.groupId', '3. Forum group id')}
            </p>
            <Input
              value={groupIdDraft}
              onChange={(event) => setGroupIdDraft(event.target.value)}
              placeholder={translate(
                'settings.telegramBridge.groupPlaceholder',
                'Forum supergroup id (-100…)'
              )}
            />
            <p className="text-[11px] text-muted-foreground">
              {translate(
                'settings.telegramBridge.groupHint',
                'Bot must be admin with manage topics. Each repo auto-creates one topic in this group.'
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={busy} onClick={() => void applyConfig()}>
              {translate('settings.telegramBridge.saveConfig', 'Save config')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={
                busy ||
                !status?.config.enabled ||
                !status.config.botTokenConfigured ||
                status.config.telegramGroupId === null
              }
              onClick={() => void syncAllTopics()}
            >
              {translate('settings.telegramBridge.syncAll', 'Sync topics for all repos')}
            </Button>
          </div>

          {(status?.config.mappings.length ?? 0) > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-foreground">
                {translate('settings.telegramBridge.linkedRepos', 'Auto-created topics')}
              </p>
              <ul className="space-y-1">
                {status?.config.mappings.map((mapping) => (
                  <li
                    key={mapping.id}
                    className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{mapping.label || mapping.repoId}</p>
                      <p className="truncate text-muted-foreground">
                        topic {mapping.messageThreadId}
                      </p>
                    </div>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void deleteMapping(mapping.id)}
                      aria-label={translate('settings.telegramBridge.unlink', 'Remove mapping')}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {status?.lastError ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">{status.lastError}</p>
          ) : null}

          {events.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-medium text-foreground">
                {translate('settings.telegramBridge.recent', 'Recent bridge events')}
              </p>
              <ul className="max-h-32 space-y-1 overflow-y-auto text-[11px] text-muted-foreground">
                {events.toReversed().map((event) => (
                  <li key={event.id} className="truncate">
                    [{event.direction}] {event.repoId ? `${event.repoId}: ` : ''}
                    {event.text}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </IntegrationCardDetails>
    </IntegrationCardShell>
  )
}
