/**
 * Debounced coalesce for operator→agent comment injects.
 * Bursts of comments on the same task+handle become one prompt.
 */

export type CoalesceFlushResult<T> = {
  mergedBodies: string[]
  result: T
}

type Bucket<T> = {
  bodies: string[]
  timer: ReturnType<typeof setTimeout> | null
  waiters: {
    resolve: (value: CoalesceFlushResult<T>) => void
    reject: (err: unknown) => void
  }[]
  flushing: boolean
}

const DEFAULT_DEBOUNCE_MS = 2_000
const DEFAULT_MAX_BODIES = 8

export class CommentDeliveryCoalescer {
  private readonly buckets = new Map<string, Bucket<unknown>>()

  constructor(
    private readonly debounceMs = DEFAULT_DEBOUNCE_MS,
    private readonly maxBodies = DEFAULT_MAX_BODIES
  ) {}

  /** Merge key: taskId + primary handle + mode. */
  static key(taskId: string, handle: string, mode: string): string {
    return `${taskId}\0${handle}\0${mode}`
  }

  /**
   * Enqueue a comment body; after debounce, call deliver(mergedBodies) once.
   * All waiters in the window receive the same flush result.
   */
  enqueue<T>(
    key: string,
    body: string,
    deliver: (mergedBodies: string[]) => Promise<T>
  ): Promise<CoalesceFlushResult<T>> {
    const cleaned = body.trim()
    if (!cleaned) {
      return Promise.reject(new Error('empty comment body'))
    }

    let bucket = this.buckets.get(key) as Bucket<T> | undefined
    if (!bucket) {
      bucket = { bodies: [], timer: null, waiters: [], flushing: false }
      this.buckets.set(key, bucket as Bucket<unknown>)
    }

    // Dedup identical consecutive bodies.
    if (bucket.bodies.at(-1) !== cleaned) {
      bucket.bodies.push(cleaned)
      if (bucket.bodies.length > this.maxBodies) {
        bucket.bodies = bucket.bodies.slice(-this.maxBodies)
      }
    }

    return new Promise<CoalesceFlushResult<T>>((resolve, reject) => {
      bucket!.waiters.push({ resolve, reject })
      if (bucket!.timer) {
        clearTimeout(bucket!.timer)
      }
      bucket!.timer = setTimeout(() => {
        void this.flush(key, deliver as (b: string[]) => Promise<unknown>)
      }, this.debounceMs)
    })
  }

  /** Force-flush (tests / shutdown). */
  async flushNow<T>(
    key: string,
    deliver: (mergedBodies: string[]) => Promise<T>
  ): Promise<void> {
    const bucket = this.buckets.get(key)
    if (bucket?.timer) {
      clearTimeout(bucket.timer)
      bucket.timer = null
    }
    await this.flush(key, deliver as (b: string[]) => Promise<unknown>)
  }

  private async flush(
    key: string,
    deliver: (mergedBodies: string[]) => Promise<unknown>
  ): Promise<void> {
    const bucket = this.buckets.get(key)
    if (!bucket || bucket.flushing) {
      return
    }
    if (bucket.timer) {
      clearTimeout(bucket.timer)
      bucket.timer = null
    }
    if (bucket.bodies.length === 0 || bucket.waiters.length === 0) {
      this.buckets.delete(key)
      return
    }

    bucket.flushing = true
    const mergedBodies = [...bucket.bodies]
    const waiters = [...bucket.waiters]
    bucket.bodies = []
    bucket.waiters = []
    this.buckets.delete(key)

    try {
      const result = await deliver(mergedBodies)
      const payload = { mergedBodies, result }
      for (const w of waiters) {
        w.resolve(payload)
      }
    } catch (err) {
      for (const w of waiters) {
        w.reject(err)
      }
    }
  }

  /** Test helper */
  pendingCount(): number {
    return this.buckets.size
  }

  clear(): void {
    for (const bucket of this.buckets.values()) {
      if (bucket.timer) {
        clearTimeout(bucket.timer)
      }
      for (const w of bucket.waiters) {
        w.reject(new Error('coalescer cleared'))
      }
    }
    this.buckets.clear()
  }
}

/** Process-wide coalescer for comment delivery (shared across RPC calls). */
export const globalCommentDeliveryCoalescer = new CommentDeliveryCoalescer()
