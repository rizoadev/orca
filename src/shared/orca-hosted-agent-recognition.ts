import type { TuiAgent } from './types'

type OrcaHostedAgentRecognition = { agent: TuiAgent; processName: string }

// Why: `orca` alone is not an agent; map known subcommands to their hosted agent ids.
export function refineOrcaHostedAgentRecognition(
  recognition: OrcaHostedAgentRecognition | null,
  subcommand: string | undefined
): OrcaHostedAgentRecognition | null {
  if (!recognition) {
    return null
  }
  const sub = subcommand?.toLowerCase()
  if (sub === 'strands') {
    return { agent: 'strands', processName: recognition.processName }
  }
  if (recognition.agent === 'claude-agent-teams' && sub !== 'claude-teams') {
    return null
  }
  if (recognition.agent === 'strands' && sub !== 'strands') {
    return null
  }
  return recognition
}
