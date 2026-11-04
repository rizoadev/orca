import { initClaudeUsagePath } from '../claude-usage/store'
import { initCodexUsagePath } from '../codex-usage/store'
import { initMuseUsagePath } from '../muse-usage/store'
import { initOpenCodeUsagePath } from '../opencode-usage/store'
import { initPiUsagePath } from '../pi-usage/store'

/** Pin every usage cache to the canonical userData path before app naming can shift it. */
export function initUsageProviderPaths(): void {
  initClaudeUsagePath()
  initCodexUsagePath()
  initOpenCodeUsagePath()
  initMuseUsagePath()
  initPiUsagePath()
}
