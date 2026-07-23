import { ipcMain } from 'electron'
import type {
  ProjectTodoAddArgs,
  ProjectTodoClearDoneArgs,
  ProjectTodoDeleteArgs,
  ProjectTodoListArgs,
  ProjectTodoToggleArgs
} from '../../shared/project-todo-types'
import { ProjectTodoStore } from '../project-todo/store'

const store = new ProjectTodoStore()

export function registerProjectTodoHandlers(): void {
  ipcMain.handle('projectTodo:list', (_event, args?: ProjectTodoListArgs) =>
    store.getList(args?.projectKey ?? '')
  )
  ipcMain.handle('projectTodo:add', (_event, args?: ProjectTodoAddArgs) =>
    store.addItem(args?.projectKey ?? '', args?.text ?? '')
  )
  ipcMain.handle('projectTodo:toggle', (_event, args?: ProjectTodoToggleArgs) =>
    store.toggleItem(args?.projectKey ?? '', args?.id ?? '', args?.done)
  )
  ipcMain.handle('projectTodo:delete', (_event, args?: ProjectTodoDeleteArgs) =>
    store.deleteItem(args?.projectKey ?? '', args?.id ?? '')
  )
  ipcMain.handle('projectTodo:clearDone', (_event, args?: ProjectTodoClearDoneArgs) =>
    store.clearDone(args?.projectKey ?? '')
  )
}
