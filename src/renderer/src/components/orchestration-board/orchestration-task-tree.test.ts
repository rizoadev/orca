import { describe, expect, it } from 'vitest'
import type { OrchestrationBoardTask } from './orchestration-board-model'
import {
  buildOrchestrationTaskForest,
  countOrchestrationTreeNodes
} from './orchestration-task-tree'

function task(
  id: string,
  parentId: string | null,
  createdAt = '2026-01-01T00:00:00Z'
): OrchestrationBoardTask {
  return { id, spec: `spec-${id}`, status: 'ready', parent_id: parentId, created_at: createdAt }
}

describe('buildOrchestrationTaskForest', () => {
  it('returns empty forest for empty input', () => {
    expect(buildOrchestrationTaskForest([])).toEqual([])
  })

  it('makes tasks with missing parents into roots', () => {
    const forest = buildOrchestrationTaskForest([task('a', null), task('b', 'missing-parent')])
    expect(forest.map((n) => n.task.id).sort()).toEqual(['a', 'b'])
  })

  it('nests children under their parent', () => {
    const forest = buildOrchestrationTaskForest([
      task('root', null),
      task('child', 'root'),
      task('grandchild', 'child')
    ])
    expect(forest).toHaveLength(1)
    expect(forest[0]!.task.id).toBe('root')
    expect(forest[0]!.children.map((c) => c.task.id)).toEqual(['child'])
    expect(forest[0]!.children[0]!.children.map((c) => c.task.id)).toEqual(['grandchild'])
  })

  it('sorts children by created_at', () => {
    const forest = buildOrchestrationTaskForest([
      task('root', null),
      task('later', 'root', '2026-01-03T00:00:00Z'),
      task('earlier', 'root', '2026-01-01T00:00:00Z')
    ])
    expect(forest[0]!.children.map((c) => c.task.id)).toEqual(['earlier', 'later'])
  })

  it('counts all nodes in the forest', () => {
    const forest = buildOrchestrationTaskForest([
      task('r1', null),
      task('c1', 'r1'),
      task('c2', 'r1'),
      task('r2', null)
    ])
    expect(countOrchestrationTreeNodes(forest)).toBe(4)
  })
})
