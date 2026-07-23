/** Local per-project checklist (right sidebar). Not synced to Linear/GitHub. */

export type ProjectTodoItem = {
  id: string
  text: string
  done: boolean
  createdAt: number
  updatedAt: number
}

export type ProjectTodoList = {
  projectKey: string
  items: ProjectTodoItem[]
  updatedAt: number
}

export type ProjectTodoListArgs = {
  projectKey: string
}

export type ProjectTodoAddArgs = {
  projectKey: string
  text: string
}

export type ProjectTodoToggleArgs = {
  projectKey: string
  id: string
  done?: boolean
}

export type ProjectTodoDeleteArgs = {
  projectKey: string
  id: string
}

export type ProjectTodoClearDoneArgs = {
  projectKey: string
}
