/**
 * Loopback listener startup primitives shared by Orca-managed web hosts
 * (Paseo daemon, OpenChamber server, DeepSeek harness host): pick a free
 * loopback port, then poll the composed URL until the HTTP listener answers.
 */
import { createServer } from 'node:net'

/** Resolve a free loopback port at or above `from`, walking upward on collision. */
export function resolveFreeLoopbackPort(from: number): Promise<number> {
  return new Promise((resolve) => {
    const probe = (candidate: number): void => {
      const server = createServer()
      server.once('error', () => {
        server.close()
        probe(candidate + 1)
      })
      server.listen(candidate, '127.0.0.1', () => {
        const { port } = server.address() as { port: number }
        server.close(() => resolve(port))
      })
    }
    probe(from)
  })
}

/**
 * Poll `url` until it answers with a sub-500 status, the child dies, or the
 * timeout lapses. Returns whether the listener should be treated as ready.
 */
export async function waitForHttpListener(options: {
  url: string
  timeoutMs: number
  isChildAlive: () => boolean
}): Promise<boolean> {
  const { url, timeoutMs, isChildAlive } = options
  const startedAt = Date.now()
  const probe = async (): Promise<boolean> => {
    try {
      const res = await fetch(url, {
        // Why: a listener that accepts but never responds must not hang the
        // webview load; abort each probe so the loop keeps moving.
        signal: AbortSignal.timeout(2_000)
      })
      return res.status < 500
    } catch {
      return false
    }
  }
  while (Date.now() - startedAt < timeoutMs) {
    // Why: child liveness, not the reported state — callers may still be
    // 'starting' until the first successful probe flips them to 'running'.
    if (!isChildAlive()) {
      return false
    }
    if (await probe()) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}
