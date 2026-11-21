import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'
import type {
  TursoSnippetCreateInput,
  TursoSnippetDeleteResult,
  TursoSnippetIdArgs,
  TursoSnippetListArgs,
  TursoSnippetListResult,
  TursoSnippetResult
} from '../../shared/turso/turso-snippet-types'

export const tursoApi = {
  createSnippet: (args: TursoSnippetCreateInput): Promise<TursoSnippetResult> =>
    ipcRenderer.invoke('turso:snippets:create', args),

  listSnippets: (args: TursoSnippetListArgs): Promise<TursoSnippetListResult> =>
    ipcRenderer.invoke('turso:snippets:list', args),

  getSnippet: (args: TursoSnippetIdArgs): Promise<TursoSnippetResult> =>
    ipcRenderer.invoke('turso:snippets:get', args),

  deleteSnippet: (args: TursoSnippetIdArgs): Promise<TursoSnippetDeleteResult> =>
    ipcRenderer.invoke('turso:snippets:delete', args)
} satisfies PreloadApi['turso']
