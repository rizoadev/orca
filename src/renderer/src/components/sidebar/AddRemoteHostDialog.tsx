import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import {
  EMPTY_FORM,
  getEditingTargetForSshTarget,
  getSshTargetDraftConnectionFields,
  isRelayGracePeriodValid,
  parseRelayGracePeriodSeconds,
  type EditingTarget
} from '../settings/ssh-target-draft'
import { MAX_SSH_RELAY_GRACE_PERIOD_SECONDS, type SshTarget } from '../../../../shared/ssh-types'
import { RemoteServerFields, SshHostFields } from './AddRemoteHostFields'

export type AddRemoteHostMode = 'ssh' | 'server'

type AddRemoteHostDialogProps = {
  mode: AddRemoteHostMode | null
  onOpenChange: (mode: AddRemoteHostMode | null) => void
  /** When set together with mode='ssh', the dialog edits this target instead of adding a new one. */
  editingTarget?: SshTarget | null
}

export function AddRemoteHostDialog({
  mode,
  onOpenChange,
  editingTarget = null
}: AddRemoteHostDialogProps): React.JSX.Element {
  const open = mode !== null
  // Why: `mode` drives both open-state and which form renders. On close it goes null while the
  // dialog is still animating out, so the title/fields would flash to the SSH default. Latch the
  // last non-null mode for rendering so the closing dialog keeps showing what the user saw.
  const [renderMode, setRenderMode] = useState<AddRemoteHostMode>(mode ?? 'ssh')
  if (mode !== null && mode !== renderMode) {
    setRenderMode(mode)
  }
  const [sshForm, setSshForm] = useState<EditingTarget>(EMPTY_FORM)
  const [serverName, setServerName] = useState('')
  const [pairingCode, setPairingCode] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const setSshTargetsMetadata = useAppStore((s) => s.setSshTargetsMetadata)
  const recordSshRepoReadoptions = useAppStore((s) => s.recordSshRepoReadoptions)
  const setRuntimeEnvironments = useAppStore((s) => s.setRuntimeEnvironments)
  const refreshRuntimeEnvironmentStatus = useAppStore((s) => s.refreshRuntimeEnvironmentStatus)
  const recordFeatureInteraction = useAppStore((s) => s.recordFeatureInteraction)

  // Why: prefill/reset when the dialog (re)opens so edit sessions don't leak fields into a later add.
  useEffect(() => {
    if (mode === 'ssh') {
      setSshForm(editingTarget ? getEditingTargetForSshTarget(editingTarget) : EMPTY_FORM)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on open/target change, not on every render
  }, [mode, editingTarget])

  const close = () => {
    if (isSaving || isImporting || isTesting) {
      return
    }
    onOpenChange(null)
  }

  const reset = () => {
    setSshForm(EMPTY_FORM)
    setServerName('')
    setPairingCode('')
  }

  const refreshSshTargetMetadata = async () => {
    const targets = (await window.api.ssh.listTargets()) as SshTarget[]
    setSshTargetsMetadata(targets)
  }

  /** Validates the SSH form and builds the persistable target payload; shared by save and test. */
  const buildSshTargetPayload = ():
    | { ok: true; payload: Omit<SshTarget, 'id'> }
    | { ok: false } => {
    const { host, configHost, username, port } = getSshTargetDraftConnectionFields(sshForm)
    if (!host) {
      toast.error(
        translate(
          'auto.components.sidebar.AddRemoteHostDialog.sshHostRequired',
          'Host or SSH config alias is required.'
        )
      )
      return { ok: false }
    }
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      toast.error(
        translate(
          'auto.components.sidebar.AddRemoteHostDialog.sshPortInvalid',
          'Port must be between 1 and 65535.'
        )
      )
      return { ok: false }
    }
    const graceSeconds = parseRelayGracePeriodSeconds(sshForm)
    if (!isRelayGracePeriodValid(sshForm, graceSeconds)) {
      toast.error(
        translate(
          'auto.components.sidebar.AddRemoteHostDialog.sshRelayGraceInvalid',
          'Terminal timeout must be between 60 and {{value0}} seconds.',
          { value0: MAX_SSH_RELAY_GRACE_PERIOD_SECONDS }
        )
      )
      return { ok: false }
    }

    const identityFile = sshForm.identityFile.trim() || undefined
    const proxyCommand = sshForm.proxyCommand.trim() || undefined
    const jumpHost = sshForm.jumpHost.trim() || undefined
    const systemSshConnectionReuse = sshForm.systemSshConnectionReuse ? undefined : false
    return {
      ok: true,
      payload: {
        label: sshForm.label.trim() || (username ? `${username}@${host}` : configHost),
        configHost,
        host,
        port,
        username,
        relayGracePeriodSeconds: graceSeconds,
        ...(identityFile ? { identityFile } : {}),
        ...(proxyCommand ? { proxyCommand } : {}),
        ...(jumpHost ? { jumpHost } : {}),
        ...(systemSshConnectionReuse === false ? { systemSshConnectionReuse } : {})
      }
    }
  }

  const saveSshHost = async () => {
    const built = buildSshTargetPayload()
    if (!built.ok) {
      return
    }
    const target = built.payload

    setIsSaving(true)
    try {
      if (editingTarget) {
        await window.api.ssh.updateTarget({ id: editingTarget.id, updates: target })
      } else {
        const result = await window.api.ssh.addTarget({ target })
        recordSshRepoReadoptions(result.repoReadoptions)
      }
      await refreshSshTargetMetadata()
      recordFeatureInteraction('ssh')
      toast.success(
        editingTarget
          ? translate('auto.components.sidebar.AddRemoteHostDialog.sshUpdated', 'SSH host updated.')
          : translate('auto.components.sidebar.AddRemoteHostDialog.sshSaved', 'SSH host added.')
      )
      reset()
      onOpenChange(null)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              editingTarget
                ? 'auto.components.sidebar.AddRemoteHostDialog.sshUpdateFailed'
                : 'auto.components.sidebar.AddRemoteHostDialog.sshSaveFailed',
              editingTarget ? 'Failed to update SSH host.' : 'Failed to add SSH host.'
            )
      )
    } finally {
      setIsSaving(false)
    }
  }

  const testSshConnection = async () => {
    const built = buildSshTargetPayload()
    if (!built.ok) {
      return
    }
    setIsTesting(true)
    try {
      // Why: always preview-test the form fields so the user tests exactly what they see, saved or not.
      const result = await window.api.ssh.testConnectionPreview({ target: built.payload })
      if (result.success) {
        toast.success(
          translate('auto.components.sidebar.AddRemoteHostDialog.testOk', 'Connection successful')
        )
      } else {
        toast.error(
          result.error ??
            translate(
              'auto.components.sidebar.AddRemoteHostDialog.testFailed',
              'Connection test failed'
            )
        )
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setIsTesting(false)
    }
  }

  const importSshConfig = async () => {
    setIsImporting(true)
    try {
      const result = await window.api.ssh.importConfig()
      const synced = result.targets
      recordSshRepoReadoptions(result.repoReadoptions)
      await refreshSshTargetMetadata()
      recordFeatureInteraction('ssh')
      if (synced.length === 0) {
        toast(
          translate(
            'auto.components.sidebar.AddRemoteHostDialog.sshImportAlreadySynced',
            '~/.ssh/config already in sync.'
          )
        )
      } else {
        toast.success(
          translate(
            'auto.components.sidebar.AddRemoteHostDialog.sshImportSynced',
            'Synced {{value0}} host{{value1}}.',
            { value0: synced.length, value1: synced.length > 1 ? 's' : '' }
          )
        )
        reset()
        onOpenChange(null)
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.sidebar.AddRemoteHostDialog.sshImportFailed',
              'Failed to import SSH config.'
            )
      )
    } finally {
      setIsImporting(false)
    }
  }

  const saveRemoteServer = async () => {
    const trimmedName = serverName.trim()
    const trimmedPairingCode = pairingCode.trim()
    if (!trimmedName || !trimmedPairingCode) {
      toast.error(
        translate(
          'auto.components.sidebar.AddRemoteHostDialog.serverFieldsRequired',
          'Server name and pairing code are required.'
        )
      )
      return
    }

    setIsSaving(true)
    try {
      const result = await window.api.runtimeEnvironments.addFromPairingCode({
        name: trimmedName,
        pairingCode: trimmedPairingCode
      })
      const environments = await window.api.runtimeEnvironments.list()
      setRuntimeEnvironments(environments)
      await refreshRuntimeEnvironmentStatus(result.environment.id)
      toast.success(
        translate('auto.components.sidebar.AddRemoteHostDialog.serverSaved', 'Remote server added.')
      )
      reset()
      onOpenChange(null)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : translate(
              'auto.components.sidebar.AddRemoteHostDialog.serverSaveFailed',
              'Failed to add remote server.'
            )
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          close()
        }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {renderMode === 'server'
              ? translate(
                  'auto.components.sidebar.AddRemoteHostDialog.serverTitle',
                  'Add remote server'
                )
              : editingTarget
                ? translate(
                    'auto.components.sidebar.AddRemoteHostDialog.sshEditTitle',
                    'Edit SSH host'
                  )
                : translate('auto.components.sidebar.AddRemoteHostDialog.sshTitle', 'Add SSH host')}
          </DialogTitle>
          <DialogDescription>
            {renderMode === 'server'
              ? translate(
                  'auto.components.sidebar.AddRemoteHostDialog.serverDescription',
                  'Pair with Orca running on another computer.'
                )
              : translate(
                  'auto.components.sidebar.AddRemoteHostDialog.sshDescription',
                  'Add a persistent machine you can log into over SSH.'
                )}
          </DialogDescription>
        </DialogHeader>

        {renderMode === 'server' ? (
          <RemoteServerFields
            name={serverName}
            pairingCode={pairingCode}
            disabled={isSaving}
            onNameChange={setServerName}
            onPairingCodeChange={setPairingCode}
            onSubmit={() => void saveRemoteServer()}
          />
        ) : (
          <SshHostFields
            form={sshForm}
            disabled={isSaving}
            onFormChange={setSshForm}
            onSubmit={() => void saveSshHost()}
          />
        )}

        <DialogFooter className="sm:justify-between">
          {renderMode === 'ssh' ? (
            <button
              type="button"
              className="self-center text-left text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void importSshConfig()}
              disabled={isSaving || isImporting}
            >
              {isImporting
                ? translate('auto.components.sidebar.AddRemoteHostDialog.importing', 'Importing...')
                : translate(
                    'auto.components.sidebar.AddRemoteHostDialog.importSshConfig',
                    'or import ~/.ssh/config'
                  )}
            </button>
          ) : (
            <span />
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={isSaving || isImporting}
            >
              {translate('auto.components.sidebar.AddRemoteHostDialog.cancel', 'Cancel')}
            </Button>
            {renderMode === 'ssh' ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void testSshConnection()}
                disabled={isSaving || isTesting || isImporting}
              >
                {isTesting
                  ? translate('auto.components.sidebar.AddRemoteHostDialog.testing', 'Testing...')
                  : translate(
                      'auto.components.sidebar.AddRemoteHostDialog.testConnection',
                      'Test connection'
                    )}
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={
                renderMode === 'server' ? () => void saveRemoteServer() : () => void saveSshHost()
              }
              disabled={isSaving || isTesting || isImporting}
            >
              {isSaving
                ? translate('auto.components.sidebar.AddRemoteHostDialog.saving', 'Saving...')
                : renderMode === 'ssh' && editingTarget
                  ? translate(
                      'auto.components.sidebar.AddRemoteHostDialog.saveChanges',
                      'Save changes'
                    )
                  : translate('auto.components.sidebar.AddRemoteHostDialog.save', 'Save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
