import type { OrchestrationBoardTask } from './orchestration-board-model'

export type OrchestrationTaskNode = {
  task: OrchestrationBoardTask
  children: OrchestrationTaskNode[]
}

/**
 * Build a forest from a flat task list using parent_id links.
 * Tasks whose parent is missing from the list become roots.
 */
export function buildOrchestrationTaskForest(
  tasks: readonly OrchestrationBoardTask[]
): OrchestrationTaskNode[] {
  const byId = new Map<string, OrchestrationBoardTask>()
  const childrenByParent = new Map<string | null, OrchestrationBoardTask[]>()
  for (const task of tasks) {
    byId.set(task.id, task)
    const key = task.parent_id ?? null
    const list = childrenByParent.get(key)
    if (list) {
      list.push(task)
    } else {
      childrenByParent.set(key, [task])
    }
  }

  const roots = new Set<string>()
  for (const task of tasks) {
    // A task is a root when its parent is null or absent from this slice.
    if (!task.parent_id || !byId.has(task.parent_id)) {
      roots.add(task.id)
    }
  }

  const build = (id: string): OrchestrationTaskNode => {
    const task = byId.get(id)
    if (!task) {
      return { task: { id, spec: '' } as OrchestrationBoardTask, children: [] }
    }
    const children = (childrenByParent.get(id) ?? [])
      .slice()
      .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
      .map((child) => build(child.id))
    return { task, children }
  }

  return [...roots]
    .map((id) => byId.get(id))
    .filter((t): t is OrchestrationBoardTask => Boolean(t))
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
    .map((task) => build(task.id))
}

/** Total number of nodes in the forest (roots + all descendants). */
export function countOrchestrationTreeNodes(forest: readonly OrchestrationTaskNode[]): number {
  let count = 0
  const visit = (node: OrchestrationTaskNode): void => {
    count += 1
    for (const child of node.children) {
      visit(child)
    }
  }
  for (const root of forest) {
    visit(root)
  }
  return count
}
