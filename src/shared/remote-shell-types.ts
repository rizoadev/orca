/** Interactive SSH shell sessions for the Remote view (M1).
 *  Transport: local PTY running the system `ssh` binary against an existing
 *  SshTarget, so auth/config/agent handling stays with the user's OpenSSH. */

export type RemoteShellSpawnArgs = {
  targetId: string
  cols?: number
  rows?: number
}

export type RemoteShellSpawnResult =
  | { ok: true; shellSessionId: string }
  | { ok: false; error: string }

export type RemoteShellDataEvent = {
  shellSessionId: string
  /** Base64-encoded chunk from the PTY. */
  chunkBase64: string
}

export type RemoteShellExitEvent = {
  shellSessionId: string
  exitCode: number | null
  signal?: string
}
