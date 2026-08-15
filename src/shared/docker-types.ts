// Why: the window shows containers from both the local Docker daemon and
// any connected SSH hosts, so every row carries the host it was found on.
export type DockerContainerState = 'running' | 'exited' | 'paused' | 'restarting' | 'created' | 'dead' | 'removing'

/** Best-effort host-side project linkage derived from docker inspect. */
export type DockerContainerHostPaths = {
  /** Host paths mounted into the container (bind mounts only). */
  mounts: string[]
  /** Config.WorkingDir if it points at a host path name we can match by basename. */
  workingDir?: string
}

export type DockerContainer = {
  id: string
  image: string
  command: string
  /** Container name without the leading slash Docker prints. */
  name: string
  state: DockerContainerState
  status: string
  /** Ports line rendered by docker ps, e.g. "0.0.0.0:8080->80/tcp". */
  ports: string
  createdAt: number
  /** Present when docker inspect succeeded; drives "linked to active project" UI. */
  hostPaths?: DockerContainerHostPaths
}

export type DockerHostId = 'local' | `ssh:${string}`

export type DockerHostResult = {
  hostId: DockerHostId
  label: string
  containers: DockerContainer[]
  scannedAt: number
  /** Present when the daemon/SSH host could not be reached. */
  error?: string
}

export type DockerListResult = {
  results: DockerHostResult[]
  scannedAt: number
}

export type DockerContainerActionRequest = {
  hostId: DockerHostId
  containerId: string
}

export type DockerContainerActionResult = {
  ok: boolean
  reason?: string
}

export type DockerInspectResult = {
  ok: boolean
  reason?: string
  inspect?: Record<string, unknown>
}

export function isDockerHostId(value: unknown): value is DockerHostId {
  return value === 'local' || (typeof value === 'string' && value.startsWith('ssh:'))
}
