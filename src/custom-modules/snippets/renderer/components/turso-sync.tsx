import { toast } from 'sonner'
import { useAppStore } from '@/store/index'
import { branchName } from '@/lib/source-control/branches/branch-name'
import { encodeSnippetFileName, snippetTitle } from './snippet-encoding'

export function useIsTursoConfigured(): boolean {
  const url = useAppStore((s) => s.settings?.tursoDatabaseUrl?.trim() ?? '')
  const token = useAppStore((s) => s.settings?.tursoAuthToken?.trim() ?? '')
  return url !== '' && token !== ''
}

type SyncFileToTursoArgs = {
  repoId: string
  branch: string
  filePath: string
  relativePath: string
  connectionId?: string | null
}

export async function syncFileToTurso(args: SyncFileToTursoArgs): Promise<void> {
  const settings = useAppStore.getState().settings
  const url = settings?.tursoDatabaseUrl?.trim() ?? ''
  const authToken = settings?.tursoAuthToken?.trim() ?? ''
  if (url === '' || authToken === '') {
    return
  }

  const branch = branchName(args.branch)
  const { relativePath } = args
  const toastId = toast.loading('Syncing to Turso…', {
    description: (
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate">{relativePath}</span>
        <span className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
          <span className="block h-full w-1/2 animate-[turso-toast-progress_1.2s_ease-in-out_infinite] rounded-full bg-foreground/60" />
        </span>
      </div>
    )
  })

  try {
    const fileResult = await window.api.fs.readFile({
      filePath: args.filePath,
      connectionId: args.connectionId ?? undefined
    })
    if (fileResult.isBinary) {
      toast.error('Cannot sync binary file to Turso', { id: toastId, description: relativePath })
      return
    }
    const snippetResult = await window.api.turso.createSnippet({
      url,
      authToken,
      repoId: args.repoId,
      branch,
      title: snippetTitle(branch, relativePath),
      fileName: encodeSnippetFileName(relativePath),
      content: fileResult.content
    })
    if (snippetResult.ok) {
      toast.success('Synced to Turso', { id: toastId, description: relativePath })
    } else {
      toast.error('Failed to sync snippet', { id: toastId, description: snippetResult.error })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    toast.error('Failed to sync snippet', { id: toastId, description: msg })
  }
}
