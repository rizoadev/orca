/**
 * Shared types for the "Service Cooldown" feature: a global on/off switch per
 * background service so the user can shed CPU/memory load from the long-lived
 * processes Orca keeps running (agent-harness engines, SSH port scanners,
 * notes sync, …).
 *
 * Why: reasonix/openchamber/deepseek/paseo each keep a child process alive for
 * as long as a tab is open, and reasonix/openchamber never stopped servers on
 * view close or worktree switch — so merely visiting projects accumulated
 * running engines. Cooldown lets the user kill them all at once and block
 * re-spawns until re-enabled.
 */

/** Background services Orca can cool down (stop + block re-spawn). */
export type ServiceCooldownId =
  | 'reasonix'
  | 'openchamber'
  | 'deepseek'
  | 'paseo'
  | 'ssh'
  | 'notes'
  | 'docker'
  | 'sftp'

export type ServiceCooldownState = Record<ServiceCooldownId, boolean>

export const SERVICE_COOLDOWN_IDS: readonly ServiceCooldownId[] = [
  'reasonix',
  'openchamber',
  'deepseek',
  'paseo',
  'ssh',
  'notes',
  'docker',
  'sftp'
] as const

/** Human-readable labels for the UI (i18n keys are resolved in the renderer). */
export const SERVICE_COOLDOWN_LABELS: Record<ServiceCooldownId, string> = {
  reasonix: 'Reasonix',
  openchamber: 'OpenChamber',
  deepseek: 'DeepSeek Harness',
  paseo: 'Paseo',
  ssh: 'SSH remotes',
  notes: 'Notes sync',
  docker: 'Docker',
  sftp: 'SFTP'
}

export const SERVICE_COOLDOWN_IPC = {
  getState: 'service-cooldown:getState',
  setService: 'service-cooldown:setService',
  coolDownAll: 'service-cooldown:coolDownAll',
  resumeAll: 'service-cooldown:resumeAll'
} as const

/** Every service enabled (the default — nothing is cooled down). */
export function defaultServiceCooldownState(): ServiceCooldownState {
  return SERVICE_COOLDOWN_IDS.reduce((acc, id) => {
    acc[id] = true
    return acc
  }, {} as ServiceCooldownState)
}

export function isServiceCooldownAllEnabled(state: ServiceCooldownState): boolean {
  return SERVICE_COOLDOWN_IDS.every((id) => state[id])
}
