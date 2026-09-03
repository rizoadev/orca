/**
 * IPC handler for GoT (Graph of Thoughts) plan generation.
 * Spawns the tools/got-plan.mjs script to scan a repo, prompt the AI, and
 * return a GoT plan with Mermaid diagram.
 *
 * Why: kept as a separate file so the handler can be registered independently
 * from the main filesystem/runtime handlers — the feature is additive and
 * gated by the script's existence.
 */
import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const pExecFile = promisify(execFile)

// Why: the tools script is bundled with the repo in dev; in packaged builds
// it won't exist, so we degrade gracefully.
function resolveScriptPath(): string | null {
  const candidate = join(app.getAppPath(), 'tools', 'got-plan.mjs')
  return existsSync(candidate) ? candidate : null
}

export function registerGotPlanHandlers(): void {
  ipcMain.handle(
    'got:generatePlan',
    async (
      _event: IpcMainInvokeEvent,
      args: { repoPath: string; taskDescription: string }
    ): Promise<{ ok: true; plan: string } | { ok: false; error: string }> => {
      const { repoPath, taskDescription } = args

      if (!repoPath || !taskDescription?.trim()) {
        return { ok: false, error: 'repoPath and taskDescription are required.' }
      }

      const scriptPath = resolveScriptPath()
      if (!scriptPath) {
        return {
          ok: false,
          error:
            'GoT plan generator is not available in this build. Run `node tools/got-plan.mjs` from the Orca repo root.'
        }
      }

      // Why: spawn plain `node` (resolved via PATH) — `process.execPath` in an
      // Electron main process points at the Electron binary, which can't run an
      // .mjs script directly. The tools script itself also relies on PATH for
      // the `pi` binary, so inheriting the environment keeps both resolvable.
      try {
        const { stdout, stderr } = await pExecFile(
          'node',
          [scriptPath, taskDescription.trim(), '--cwd', repoPath, '--timeout', '180'],
          {
            cwd: app.getAppPath(),
            timeout: 190_000,
            maxBuffer: 4 * 1024 * 1024,
            env: {
              ...process.env,
              // Why: ensure the child process inherits PATH so `pi` is found.
              PATH: process.env.PATH ?? ''
            }
          }
        )

        const output = stdout.trim()
        if (!output) {
          const errorText = stderr?.trim() || 'No output from plan generator.'
          return { ok: false, error: errorText }
        }

        return { ok: true, plan: output }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        // Why: timeout errors are user-visible — surface them clearly.
        if (message.includes('timeout') || message.includes('ETIMEDOUT')) {
          return {
            ok: false,
            error:
              'GoT plan generation timed out after 3 minutes. The repo may be too large or the AI model is busy.'
          }
        }
        return { ok: false, error: message }
      }
    }
  )
}
