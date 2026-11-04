/**
 * Electron IPC handlers for GitLab Snippets.
 */
import { ipcMain } from 'electron'
import type { Store } from '../../../main/persistence/loading-store/store'
import {
  listProjectSnippets,
  getProjectSnippet,
  createProjectSnippet,
  updateProjectSnippet,
  deleteProjectSnippet
} from './gitlab/snippets'
import {
  assertRegisteredRepo,
  localGitOptionArgs,
  repoConnectionId,
  type GitLabRepoSelectorArgs
} from '../../../main/ipc/source-control/gitlab-repo-access'
import type { GitLabSnippetCreateInput, GitLabSnippetUpdateInput } from '../shared/types'

export function registerGitLabSnippetHandlers(store: Store): void {
  ipcMain.removeHandler('gl:listProjectSnippets')
  ipcMain.removeHandler('gl:getProjectSnippet')
  ipcMain.removeHandler('gl:createProjectSnippet')
  ipcMain.removeHandler('gl:updateProjectSnippet')
  ipcMain.removeHandler('gl:deleteProjectSnippet')

  ipcMain.handle(
    'gl:listProjectSnippets',
    async (_event, args: GitLabRepoSelectorArgs & { limit?: number }) => {
      const repo = assertRegisteredRepo(args, store)
      return listProjectSnippets(
        repo.path,
        args.limit,
        repo.issueSourcePreference,
        repoConnectionId(repo),
        ...localGitOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle(
    'gl:getProjectSnippet',
    async (_event, args: GitLabRepoSelectorArgs & { snippetId: number }) => {
      const repo = assertRegisteredRepo(args, store)
      return getProjectSnippet(
        repo.path,
        args.snippetId,
        repo.issueSourcePreference,
        repoConnectionId(repo),
        ...localGitOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle(
    'gl:createProjectSnippet',
    async (_event, args: GitLabRepoSelectorArgs & GitLabSnippetCreateInput) => {
      const repo = assertRegisteredRepo(args, store)
      return createProjectSnippet(
        repo.path,
        args,
        repo.issueSourcePreference,
        repoConnectionId(repo),
        ...localGitOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle(
    'gl:updateProjectSnippet',
    async (
      _event,
      args: GitLabRepoSelectorArgs & { snippetId: number; updates: GitLabSnippetUpdateInput }
    ) => {
      const repo = assertRegisteredRepo(args, store)
      return updateProjectSnippet(
        repo.path,
        args.snippetId,
        args.updates,
        repo.issueSourcePreference,
        repoConnectionId(repo),
        ...localGitOptionArgs(store, repo)
      )
    }
  )

  ipcMain.handle(
    'gl:deleteProjectSnippet',
    async (_event, args: GitLabRepoSelectorArgs & { snippetId: number }) => {
      const repo = assertRegisteredRepo(args, store)
      return deleteProjectSnippet(
        repo.path,
        args.snippetId,
        repo.issueSourcePreference,
        repoConnectionId(repo),
        ...localGitOptionArgs(store, repo)
      )
    }
  )
}
