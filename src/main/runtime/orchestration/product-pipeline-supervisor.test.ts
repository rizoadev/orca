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

const { runPiRpcDraftTaskMock } = vi.hoisted(() => ({
  runPiRpcDraftTaskMock: vi.fn().mockResolvedValue({
    result:
      '1: Add login form — implement — build a sign-in flow\n2: Write tests — test — cover auth',
    modelId: 'pi-test',
    provider: 'pi'
  })
}))

vi.mock('./pi-rpc-task-runner', () => ({
  runPiRpcDraftTask: runPiRpcDraftTaskMock
}))

describe('product-pipeline-supervisor', () => {
  let db: OrchestrationDb | undefined

  afterEach(() => {
    resetProductSupervisorForTests()
    db?.close()
    vi.clearAllMocks()
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
      getAgentStatusForHandle: vi.fn().mockReturnValue('idle'),
      resolveWorktreePath: vi.fn().mockResolvedValue('/tmp/wt')
    }

    watchProductPipeline(root.id, db, runtime, { pollIntervalMs: 60_000 })
    const snap = getProductSupervisorSnapshot()
    expect(snap.running).toBe(true)
    expect(snap.activePipelines).toContain(root.id)
    expect(root.pipeline_stage).toBe('running')

    stopProductSupervisor()
    expect(getProductSupervisorSnapshot().running).toBe(false)
  })

  it('dispatches research via headless pi RPC and marks it completed', async () => {
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
      getAgentStatusForHandle: vi.fn().mockReturnValue('idle'),
      resolveWorktreePath: vi.fn().mockResolvedValue('/tmp/wt')
    }

    // research depends on manage; make it ready directly so dispatch targets it
    const research = db.listTasksByPipeline(root.id).find((t) => t.pipeline_stage === 'research')
    if (research) {
      db.setTaskPipelineMeta(research.id, { status: 'ready' })
    }

    const results = await dispatchAllReadyPipelineStages(db, runtime, root.id)
    expect(runPiRpcDraftTaskMock).toHaveBeenCalled()
    // research goes through pi RPC; manage still uses the terminal path
    expect(results.some((r) => r.role === 'researcher' && r.to === 'pi-rpc')).toBe(true)
    const after = db.listTasksByPipeline(root.id).find((t) => t.pipeline_stage === 'research')
    expect(after?.status).toBe('completed')
    expect(after?.result).toContain('Add login form')
  })
})
