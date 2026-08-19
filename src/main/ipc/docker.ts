import { ipcMain } from 'electron'
import type { Store } from '../persistence'
import type {
  DockerContainerActionRequest,
  DockerContainerActionResult,
  DockerHostId,
  DockerInspectResult,
  DockerListResult
} from '../../shared/docker-types'
import { isDockerHostId } from '../../shared/docker-types'
import {
  listDockerContainers as listContainers,
  runDockerCommand
} from './docker-command'

export function registerDockerHandlers(
  store: Pick<Store, 'getSshTargets'>
): void {
  ipcMain.removeHandler('docker:listContainers')
  ipcMain.removeHandler('docker:inspect')
  ipcMain.removeHandler('docker:startContainer')
  ipcMain.removeHandler('docker:stopContainer')
  ipcMain.removeHandler('docker:restartContainer')
  ipcMain.removeHandler('docker:removeContainer')

  ipcMain.handle(
    'docker:listContainers',
    (_event, rawArgs?: unknown): Promise<DockerListResult> => {
      const args = parseListArgs(rawArgs)
      return listContainers({ ...args, store })
    }
  )

  ipcMain.handle(
    'docker:inspect',
    async (_event, rawArgs?: unknown): Promise<DockerInspectResult> => {
      const args = parseActionArgs(rawArgs)
      if (!args) {
        return { ok: false, reason: 'Invalid docker inspect request.' }
      }
      const result = await runDockerCommand(args.hostId, ['inspect', args.containerId])
      if (result.error) {
        return { ok: false, reason: result.error }
      }
      if (result.exitCode !== 0) {
        return {
          ok: false,
          reason:
            result.stderr.trim() ||
            result.stdout.trim() ||
            `docker exited with ${result.exitCode}`
        }
      }
      try {
        return { ok: true, inspect: JSON.parse(result.stdout) as Record<string, unknown> }
      } catch {
        return { ok: false, reason: 'Failed to parse docker inspect output.' }
      }
    }
  )

  for (const [channel, dockerArgs, label] of [
    ['docker:startContainer', ['start'], 'docker start'],
    ['docker:stopContainer', ['stop'], 'docker stop'],
    ['docker:restartContainer', ['restart'], 'docker restart'],
    ['docker:removeContainer', ['rm', '-f'], 'docker rm']
  ] as const) {
    ipcMain.handle(
      channel,
      async (_event, rawArgs?: unknown): Promise<DockerContainerActionResult> => {
        const args = parseActionArgs(rawArgs)
        if (!args) {
          return { ok: false, reason: `Invalid ${label} request.` }
        }
        const result = await runDockerCommand(args.hostId, [...dockerArgs, args.containerId])
        if (result.error) {
          return { ok: false, reason: result.error }
        }
        if (result.exitCode !== 0) {
          return {
            ok: false,
            reason:
              result.stderr.trim() ||
              result.stdout.trim() ||
              `${label} exited with ${result.exitCode}`
          }
        }
        return { ok: true }
      }
    )
  }
}

function parseListArgs(value: unknown): {
  hostIds?: DockerHostId[]
  includeStopped?: boolean
  enrich?: boolean
} {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const raw = value as { hostIds?: unknown; includeStopped?: unknown; enrich?: unknown }
  const hostIds = Array.isArray(raw.hostIds) ? raw.hostIds.filter(isDockerHostId) : undefined
  return {
    ...(hostIds && hostIds.length > 0 ? { hostIds } : {}),
    ...(typeof raw.includeStopped === 'boolean' ? { includeStopped: raw.includeStopped } : {}),
    ...(typeof raw.enrich === 'boolean' ? { enrich: raw.enrich } : {})
  }
}

function parseActionArgs(value: unknown): DockerContainerActionRequest | null {
  if (!value || typeof value !== 'object') {
    return null
  }
  const raw = value as { hostId?: unknown; containerId?: unknown }
  if (
    !isDockerHostId(raw.hostId) ||
    typeof raw.containerId !== 'string' ||
    !raw.containerId.trim()
  ) {
    return null
  }
  return { hostId: raw.hostId, containerId: raw.containerId.trim() }
}
