import { afterEach, describe, expect, it, vi } from 'vitest'
import { OrchestrationDb } from './db'
import { createProductPipelineTasks } from './product-pipeline-engine'
import { dispatchAllReadyPipelineStages } from './product-pipeline-dispatch'
import {
  getProductSupervisorSnapshot,
  resetProductSupervisorForTests,
  stopProductSupervisor,
  watchProductPipeline
} from './product-pipeline-supervisor'

describe('product-pipeline-supervisor', () => {
  let db: OrchestrationDb | undefined

  afterEach(() => {
    resetProductSupervisorForTests()
    db?.close()
  })

  it('registers pipelines for set-and-forget watching', () => {
    db = new OrchestrationDb(':memory:')
    const { root } = createProductPipelineTasks(db, {
      productGoal: 'OTP email mockup',
      worktreeId: 'repo-1::/tmp/wt',
      repoId: 'repo-1'
    })

    const runtime = {
      getClientSettings: () => ({ agentSquads: [], defaultTuiAgent: 'pi' }),
      listTerminals: vi.fn().mockResolvedValue({ terminals: [] }),
      launchAgentTerminal: vi.fn().mockResolvedValue({ handle: 'term_spawned' }),
      waitForTerminal: vi.fn().mockResolvedValue({}),
      isTerminalRunningAgent: vi.fn().mockResolvedValue(true),
      getTerminalPaneKey: vi.fn().mockReturnValue('tab:leaf'),
      getTerminalOrchestrationCliCommand: vi.fn().mockReturnValue('orca' as const),
      sendTerminalAgentPrompt: vi.fn().mockResolvedValue(undefined),
      getAgentStatusForHandle: vi.fn().mockReturnValue('idle')
    }

    watchProductPipeline(root.id, db, runtime, { pollIntervalMs: 60_000 })
    const snap = getProductSupervisorSnapshot()
    expect(snap.running).toBe(true)
    expect(snap.activePipelines).toContain(root.id)
    expect(root.pipeline_stage).toBe('running')

    stopProductSupervisor()
    expect(getProductSupervisorSnapshot().running).toBe(false)
  })

  it('dispatches ready research stage via pipeline dispatch helper', async () => {
    db = new OrchestrationDb(':memory:')
    const { root } = createProductPipelineTasks(db, {
      productGoal: 'OTP email mockup',
      worktreeId: 'repo-1::/tmp/wt',
      repoId: 'repo-1'
    })

    const launchAgentTerminal = vi.fn().mockResolvedValue({ handle: 'term_spawned' })
    const runtime = {
      getClientSettings: () => ({ agentSquads: [], defaultTuiAgent: 'pi' }),
      listTerminals: vi.fn().mockResolvedValue({ terminals: [] }),
      launchAgentTerminal,
      waitForTerminal: vi.fn().mockResolvedValue({}),
      isTerminalRunningAgent: vi.fn().mockResolvedValue(true),
      getTerminalPaneKey: vi.fn().mockReturnValue('tab:leaf'),
      getTerminalOrchestrationCliCommand: vi.fn().mockReturnValue('orca' as const),
      sendTerminalAgentPrompt: vi.fn().mockResolvedValue(undefined),
      getAgentStatusForHandle: vi.fn().mockReturnValue('idle')
    }

    const results = await dispatchAllReadyPipelineStages(db, runtime, root.id)
    expect(launchAgentTerminal).toHaveBeenCalled()
    expect(results.some((r) => r.role === 'researcher' && r.to === 'term_spawned')).toBe(true)
    const research = db.listTasksByPipeline(root.id).find((t) => t.pipeline_stage === 'research')
    expect(research?.status).toBe('dispatched')
  })
})
