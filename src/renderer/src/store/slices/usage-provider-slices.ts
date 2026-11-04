import type {
  ClaudeUsageRange,
  ClaudeUsageScope,
  ClaudeUsageSnapshot
} from '../../../../shared/claude-usage-types'
import type {
  CodexUsageRange,
  CodexUsageScope,
  CodexUsageSnapshot
} from '../../../../shared/codex-usage-types'
import type {
  OpenCodeUsageRange,
  OpenCodeUsageScope,
  OpenCodeUsageSnapshot
} from '../../../../shared/opencode-usage-types'
import type {
  MuseUsageRange,
  MuseUsageScope,
  MuseUsageSnapshot
} from '../../../../shared/muse-usage-types'
import type { PiUsageRange, PiUsageScope, PiUsageSnapshot } from '../../../../shared/pi-usage-types'
import {
  createUsageProviderSlice,
  type ProviderUsageSlice,
  type UsageProviderTypes
} from './usage-provider-slice-factory'

type ClaudeUsageTypes = UsageProviderTypes<ClaudeUsageScope, ClaudeUsageRange, ClaudeUsageSnapshot>
type CodexUsageTypes = UsageProviderTypes<CodexUsageScope, CodexUsageRange, CodexUsageSnapshot>
type OpenCodeUsageTypes = UsageProviderTypes<
  OpenCodeUsageScope,
  OpenCodeUsageRange,
  OpenCodeUsageSnapshot
>

type MuseUsageTypes = UsageProviderTypes<MuseUsageScope, MuseUsageRange, MuseUsageSnapshot>

type PiUsageTypes = UsageProviderTypes<PiUsageScope, PiUsageRange, PiUsageSnapshot>

export type ClaudeUsageSlice = ProviderUsageSlice<'claude', 'Claude', ClaudeUsageTypes>
export type CodexUsageSlice = ProviderUsageSlice<'codex', 'Codex', CodexUsageTypes>
export type OpenCodeUsageSlice = ProviderUsageSlice<'openCode', 'OpenCode', OpenCodeUsageTypes>
export type MuseUsageSlice = ProviderUsageSlice<'muse', 'Muse', MuseUsageTypes>
export type PiUsageSlice = ProviderUsageSlice<'pi', 'Pi', PiUsageTypes>

export const createClaudeUsageSlice = createUsageProviderSlice<
  'claude',
  'Claude',
  ClaudeUsageTypes
>({
  prefix: 'claude',
  name: 'Claude',
  initialScope: 'orca',
  initialRange: '30d',
  getApi: () => window.api.claudeUsage,
  hasCachedData: (state) => state.hasAnyClaudeData
})

export const createCodexUsageSlice = createUsageProviderSlice<'codex', 'Codex', CodexUsageTypes>({
  prefix: 'codex',
  name: 'Codex',
  initialScope: 'orca',
  initialRange: '30d',
  getApi: () => window.api.codexUsage,
  hasCachedData: (state) => state.hasAnyCodexData
})

export const createOpenCodeUsageSlice = createUsageProviderSlice<
  'openCode',
  'OpenCode',
  OpenCodeUsageTypes
>({
  prefix: 'openCode',
  name: 'OpenCode',
  initialScope: 'orca',
  initialRange: '30d',
  getApi: () => window.api.openCodeUsage,
  hasCachedData: (state) => state.hasAnyOpenCodeData
})

export const createMuseUsageSlice = createUsageProviderSlice<'muse', 'Muse', MuseUsageTypes>({
  prefix: 'muse',
  name: 'Muse',
  initialScope: 'orca',
  initialRange: '30d',
  getApi: () => window.api.museUsage,
  hasCachedData: (state) => state.hasAnyMuseData
})

export const createPiUsageSlice = createUsageProviderSlice<'pi', 'Pi', PiUsageTypes>({
  prefix: 'pi',
  name: 'Pi',
  // Pi sessions start from any directory, so worktree-only scope would hide most real usage.
  initialScope: 'all',
  initialRange: '30d',
  getApi: () => window.api.piUsage,
  hasCachedData: (state) => state.hasAnyPiData
})
