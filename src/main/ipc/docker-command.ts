import { spawn, type ChildProcess } from 'node:child_process'
import type { Store } from '../persistence'
import { getSshConnectionManager } from './ssh'
import type {
  DockerContainer,
  DockerContainerHostPaths,
  DockerHostId,
  DockerHostResult,
  DockerListResult
} from '../../shared/docker-types'

const DOCKER_COMMAND_TIMEOUT_MS = 15_000
const MAX_DOCKER_OUTPUT_CHARS = 1_000_000

export type DockerExecResult = {
  exitCode: number | null
  stdout: string
  stderr: string
  error: string | null
}

function runLocalDocker(args: string[]): Promise<DockerExecResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let child: ChildProcess | null = null
    const timeout = setTimeout(() => {
      child?.kill('SIGKILL')
    }, DOCKER_COMMAND_TIMEOUT_MS)

    const settle = (result: DockerExecResult): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      resolve(result)
    }

    try {
      // Why: on Windows the docker binary may be a .cmd shim; shell:true lets
      // cmd.exe resolve it the same way the user's terminal would.
      child = spawn('docker', args, { shell: process.platform === 'win32' })
    } catch (error) {
      settle({
        exitCode: null,
        stdout: '',
        stderr: '',
        error: error instanceof Error ? error.message : String(error)
      })
      return
    }

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk: string) => {
      stdout = (stdout + chunk).slice(-MAX_DOCKER_OUTPUT_CHARS)
    })
    child.stderr?.on('data', (chunk: string) => {
      stderr = (stderr + chunk).slice(-MAX_DOCKER_OUTPUT_CHARS)
    })
    child.on('error', (error) => {
      settle({ exitCode: null, stdout, stderr, error: error.message })
    })
    child.on('close', (code) => {
      settle({ exitCode: code, stdout, stderr, error: null })
    })
  })
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function runSshDocker(connectionId: string, args: string[]): Promise<DockerExecResult> {
  return new Promise((resolve) => {
    const manager = getSshConnectionManager()
    const connection = manager?.getConnection(connectionId)
    if (!connection || connection.getState().status !== 'connected') {
      resolve({
        exitCode: null,
        stdout: '',
        stderr: '',
        error: 'SSH target is not connected.'
      })
      return
    }

    let stdout = ''
    let stderr = ''
    let exitCode: number | null = null
    let settled = false
    let timeout: ReturnType<typeof setTimeout> | null = null

    const settle = (error: string | null): void => {
      if (settled) {
        return
      }
      settled = true
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      resolve({ exitCode, stdout, stderr, error })
    }

    const command = ['docker', ...args].map(shellQuote).join(' ')
    void connection
      .exec(command)
      .then((ch) => {
        if (settled) {
          ch.close()
          return
        }
        timeout = setTimeout(() => {
          ch.close()
        }, DOCKER_COMMAND_TIMEOUT_MS)
        ch.on('data', (data: Buffer | string) => {
          stdout = (stdout + data.toString()).slice(-MAX_DOCKER_OUTPUT_CHARS)
        })
        ch.stderr.on('data', (data: Buffer | string) => {
          stderr = (stderr + data.toString()).slice(-MAX_DOCKER_OUTPUT_CHARS)
        })
        ch.on('exit', (code: number | null) => {
          exitCode = code
        })
        ch.on('close', (code?: number | null) => {
          if (typeof code === 'number') {
            exitCode = code
          }
          settle(null)
        })
        ch.on('error', (error) => {
          settle(error.message)
        })
      })
      .catch((error) => {
        settle(error instanceof Error ? error.message : String(error))
      })
  })
}

export async function runDockerCommand(
  hostId: DockerHostId,
  args: string[]
): Promise<DockerExecResult> {
  if (hostId === 'local') {
    return runLocalDocker(args)
  }
  return runSshDocker(hostId.slice('ssh:'.length), args)
}

export function buildDockerPsArgs(includeStopped: boolean): string[] {
  const SEP = '\u001f'
  const format = [
    '{{.ID}}',
    '{{.Image}}',
    '{{.Command}}',
    '{{.Names}}',
    '{{.State}}',
    '{{.Status}}',
    '{{.Ports}}',
    '{{.CreatedAt}}'
  ].join(SEP)
  return ['ps', ...(includeStopped ? ['-a'] : []), `--format=${format}`]
}

function parseContainerLine(line: string): DockerContainer | null {
  const SEP = '\u001f'
  const parts = line.split(SEP)
  if (parts.length < 7) {
    return null
  }
  const [id, image, command, name, state, status, ports, createdAtRaw] = parts
  const createdAt = Number(createdAtRaw)
  return {
    id,
    image,
    command,
    name,
    state: state as DockerContainer['state'],
    status,
    ports,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0
  }
}

function parseDockerPsOutput(stdout: string): DockerContainer[] {
  const containers: DockerContainer[] = []
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }
    const container = parseContainerLine(line)
    if (container) {
      containers.push(container)
    }
  }
  return containers
}

// Why: isolate the envelope shape of `docker inspect` behind one function so the
// weak-field validation lives in one place. Each container's mount list rarely
// exceeds a handful of entries, so the per-container parse is cheap.
export function parseDockerInspect(stdout: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(stdout)
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
      return parsed[0] as Record<string, unknown>
    }
    return null
  } catch {
    return null
  }
}

export function extractHostPathsFromInspect(inspect: Record<string, unknown>): DockerContainerHostPaths {
  const mounts: string[] = []
  const mountsRaw = inspect.Mounts
  if (Array.isArray(mountsRaw)) {
    for (const mount of mountsRaw) {
      if (typeof mount !== 'object' || mount === null) {
        continue
      }
      const source = (mount as Record<string, unknown>).Source
      // Why: only bind mounts carry a host Source; named/anonymous volumes and
      // tmpfs entries have no host path to match against a project checkout.
      if (typeof source === 'string' && source.trim()) {
        mounts.push(source.trim())
      }
    }
  }

  const config = inspect.Config as Record<string, unknown> | undefined
  const workingDir =
    typeof config?.WorkingDir === 'string' && config.WorkingDir.trim()
      ? config.WorkingDir.trim()
      : undefined

  // Why: compose sets the project working dir label; expose it so the renderer
  // can match a compose project to a checkout even when no bind mount exists.
  const labels = config?.Labels as Record<string, unknown> | undefined
  const composeWorkingDir =
    typeof labels?.['com.docker.compose.project.working_dir'] === 'string' &&
    (labels['com.docker.compose.project.working_dir'] as string).trim()
      ? (labels['com.docker.compose.project.working_dir'] as string).trim()
      : undefined

  if (workingDir || composeWorkingDir || mounts.length > 0) {
    return {
      mounts,
      ...(composeWorkingDir ? { workingDir: composeWorkingDir } : {})
    }
  }
  return { mounts }
}

export function dockerResultForHost(
  hostId: DockerHostId,
  label: string,
  result: DockerExecResult,
  includeStopped: boolean
): DockerHostResult {
  const base = {
    hostId,
    label,
    containers: [] as DockerContainer[],
    scannedAt: Date.now()
  }
  if (result.error) {
    return { ...base, error: result.error }
  }
  if (result.exitCode !== 0) {
    const detail =
      result.stderr.trim() || result.stdout.trim() || `docker exited with ${result.exitCode}`
    return { ...base, error: detail }
  }
  // Why: older docker versions print "Cannot connect to the Docker daemon"
  // to stderr with a non-zero exit; a zero-exit empty list is a legit empty daemon.
  const containers = parseDockerPsOutput(result.stdout)
  const visible = includeStopped
    ? containers
    : containers.filter((c) => c.state === 'running')
  return { ...base, containers: visible }
}

// Why: inspecting every container serially would serialize the whole list behind
// one slow daemon call. Run inspects concurrently per host so a long-running
// container doesn't stall the others.
function enrichWithHostPaths(
  containers: DockerContainer[],
  inspect: (id: string) => Promise<DockerExecResult>
): Promise<DockerContainer[]> {
  return Promise.all(
    containers.map(async (container) => {
      const result = await inspect(container.id)
      if (result.error || result.exitCode !== 0) {
        return container
      }
      const inspectData = parseDockerInspect(result.stdout)
      if (!inspectData) {
        return container
      }
      const hostPaths = extractHostPathsFromInspect(inspectData)
      if (hostPaths.mounts.length > 0 || hostPaths.workingDir) {
        return { ...container, hostPaths }
      }
      return container
    })
  )
}

export async function listDockerContainers(args: {
  hostIds?: DockerHostId[]
  includeStopped?: boolean
  enrich?: boolean
  store: Pick<Store, 'getSshTargets'>
}): Promise<DockerListResult> {
  const { hostIds, includeStopped, enrich, store } = args
  const wantEnrich = enrich ?? false
  const scanArgs = buildDockerPsArgs(includeStopped ?? false)
  const results: DockerHostResult[] = []

  const wantHost = (hostId: DockerHostId): boolean => {
    if (!hostIds || hostIds.length === 0) {
      return true
    }
    return hostIds.includes(hostId)
  }

  if (wantHost('local')) {
    const base = dockerResultForHost(
      'local',
      'Local',
      await runLocalDocker(scanArgs),
      includeStopped ?? false
    )
    if (wantEnrich && !base.error) {
      base.containers = await enrichWithHostPaths(base.containers, (id) =>
        runLocalDocker(['inspect', id])
      )
    }
    results.push(base)
  }

  const allTargets = store.getSshTargets()
  for (const target of allTargets) {
    const hostId: DockerHostId = `ssh:${target.id}`
    if (!wantHost(hostId)) {
      continue
    }
    const base = dockerResultForHost(
      hostId,
      target.label,
      await runSshDocker(target.id, scanArgs),
      includeStopped ?? false
    )
    if (wantEnrich && !base.error) {
      base.containers = await enrichWithHostPaths(base.containers, (id) =>
        runSshDocker(target.id, ['inspect', id])
      )
    }
    results.push(base)
  }

  return { results, scannedAt: Date.now() }
}
