import { useMemo } from 'react'
import { useAppStore } from '@/store'
import { useDetectedAgents } from '@/hooks/useDetectedAgents'
import { filterEnabledTuiAgents } from '../../../../shared/tui-agent-selection'
import type { TuiAgent } from '../../../../shared/types'
import { orderAgents } from './issues-panel-agent-order'

export function useIssueListAgents(connectionId: string | null | undefined): {
  agents: TuiAgent[]
  detectingAgents: boolean
} {
  const defaultAgent = useAppStore((s) => s.settings?.defaultTuiAgent ?? null)
  const disabledAgents = useAppStore((s) => s.settings?.disabledTuiAgents ?? [])
  // Why: undefined freezes useDetectedAgents in "hydration unknown" loading;
  // local hosts omit connectionId and must probe as null (local).
  const { detectedIds, isLoading: detectingAgents } = useDetectedAgents(connectionId ?? null)

  const agents = useMemo(() => {
    if (!detectedIds) {
      return [] as TuiAgent[]
    }
    return orderAgents(defaultAgent, filterEnabledTuiAgents(detectedIds, disabledAgents))
  }, [defaultAgent, detectedIds, disabledAgents])

  return { agents, detectingAgents }
}
