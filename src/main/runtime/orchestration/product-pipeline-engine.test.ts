import { afterEach, describe, expect, it } from 'vitest'
import { OrchestrationDb } from './db'
import {
  advanceProductPipelineAfterTaskComplete,
  createProductPipelineTasks,
  createProductPlanTasks
} from './product-pipeline-engine'
import { parseRootAutopilotFlag } from '../../../shared/orchestration-autopilot'

describe('product-pipeline-engine', () => {
  let db: OrchestrationDb | undefined

  afterEach(() => {
    db?.close()
  })

  it('creates research→implement→test→review DAG under a root', () => {
    db = new OrchestrationDb(':memory:')
    const { root, stages } = createProductPipelineTasks(db, {
      productGoal: 'Add OTP email mockup dashboard page',
      title: 'OTP email',
      repoId: 'repo-1',
      worktreeId: 'repo-1::/tmp/wt'
    })

    expect(root.pipeline_id).toBe(root.id)
    expect(root.status).toBe('completed')
    expect(root.pipeline_stage).toBe('running')
    expect(stages).toHaveLength(4)
    expect(stages.map((s) => s.pipeline_stage)).toEqual(['research', 'implement', 'test', 'review'])
    expect(stages[0]?.status).toBe('ready')
    expect(stages[1]?.status).toBe('pending')
    expect(JSON.parse(stages[1]!.deps)).toEqual([stages[0]!.id])
  })

  it('sets plan-only root pipeline_id to itself so productWatch accepts it', () => {
    db = new OrchestrationDb(':memory:')
    const { root, research } = createProductPlanTasks(db, {
      productGoal: 'Add OTP email mockup dashboard page',
      repoId: 'repo-1',
      hostId: 'local',
      priority: 'high'
    })

    const rootAfter = db.getTask(root.id)!
    expect(rootAfter.pipeline_id).toBe(rootAfter.id)
    expect(rootAfter.status).toBe('completed')
    expect(parseRootAutopilotFlag(rootAfter.result)).toBe(true)
    expect(research.pipeline_id).toBe(root.id)
    expect(research.status).toBe('ready')
  })

  it('cascades delete to child tasks recursively', () => {
    db = new OrchestrationDb(':memory:')
    const parent = db.createTask({ spec: 'parent' })
    const child = db.createTask({ spec: 'child', parentId: parent.id })
    const grandchild = db.createTask({ spec: 'grandchild', parentId: child.id })
    const unrelated = db.createTask({ spec: 'unrelated' })
    const deleted = db.deleteTask(parent.id)
    expect(deleted?.deletedIds.sort()).toEqual([parent.id, child.id, grandchild.id].sort())
    expect(db.getTask(parent.id)).toBeUndefined()
    expect(db.getTask(child.id)).toBeUndefined()
    expect(db.getTask(grandchild.id)).toBeUndefined()
    expect(db.getTask(unrelated.id)).not.toBeUndefined()
  })

  it('rewrites implement+test on tester FAIL', () => {
    db = new OrchestrationDb(':memory:')
    const { root, stages } = createProductPipelineTasks(db, {
      productGoal: 'OTP email',
      worktreeId: 'repo-1::/tmp/wt',
      repoId: 'repo-1'
    })
    const research = stages[0]!
    const implement = stages[1]!
    const test = stages[2]!

    db.updateTaskStatus(research.id, 'completed', JSON.stringify({ body: 'Plan: use AuthCard' }))
    db.updateTaskStatus(implement.id, 'completed', JSON.stringify({ body: 'Implemented OTP' }))
    db.updateTaskStatus(
      test.id,
      'completed',
      JSON.stringify({ body: 'Missing resend.\nVERDICT: FAIL' })
    )

    advanceProductPipelineAfterTaskComplete(db, test.id)

    const all = db.listTasksByPipeline(root.id)
    const reworkImplement = all.find(
      (t) => t.pipeline_stage === 'implement' && t.pipeline_attempt === 2
    )
    const reworkTest = all.find((t) => t.pipeline_stage === 'test' && t.pipeline_attempt === 2)
    expect(reworkImplement?.status).toBe('ready')
    expect(reworkImplement?.spec).toContain('Missing resend')
    expect(reworkTest?.status).toBe('pending')
    expect(JSON.parse(reworkTest!.deps)).toEqual([reworkImplement!.id])
  })
})
