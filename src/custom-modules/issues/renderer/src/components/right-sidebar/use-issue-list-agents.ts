import { useEffect, useRef, useState } from 'react'
import { filterEnabledTuiAgents } from '../../../../../../shared/agent-launch/catalog/tui-agent-selection'
import type { TuiAgent } from '../../../../../../shared/agent-launch/catalog/tui-agent'
import { useAppStore } from '@/store'

/**
 * Agents available on the issue's host, enabled by settings.
 * Remote hosts probe server-side; a failure leaves the list empty rather than
 * inferring absence from client-local detection.
 */
export function useIssueListAgents(connectionId: string | null | undefined): {
  agents: TuiAgent[]
  detectingAgents: boolean
} {
  const disabledAgents = useAppStore((s) => s.settings?.disabledTuiAgents)
  const [detected, setDetected] = useState<TuiAgent[]>([])
  const [detectingAgents, setDetectingAgents] = useState(true)
  const generationRef = useRef(0)

  useEffect(() => {
    const generation = ++generationRef.current
    const isCurrent = (): boolean => generation === generationRef.current
    setDetectingAgents(true)
    const probe = async (): Promise<TuiAgent[]> => {
      if (connectionId) {
        const result = await window.api.preflight.detectRemoteAgents({ connectionId })
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the preflight API types the payload as string[]; its values are TuiAgent ids.
        return result as TuiAgent[]
      }
      const result = await window.api.preflight.detectAgents()
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the preflight API types the payload as string[]; its values are TuiAgent ids.
      return result as TuiAgent[]
    }
    void probe()
      .then((agents) => {
        if (isCurrent()) {
          setDetected(agents)
        }
      })
      .catch((cause) => {
        console.warn('[issues] agent detection failed:', cause)
        if (isCurrent()) {
          setDetected([])
        }
      })
      .finally(() => {
        if (isCurrent()) {
          setDetectingAgents(false)
        }
      })
    return () => {
      generationRef.current += 1
    }
  }, [connectionId])

  const agents = filterEnabledTuiAgents(detected, disabledAgents ?? [])
  return { agents, detectingAgents }
}
