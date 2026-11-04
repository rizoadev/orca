import { Upload } from 'lucide-react'

// TODO: Integrate with FileExplorer context menu system
// For now, this is a placeholder for future context menu integration
export type SnippetContextMenuItem = {
  id: string
  label: string
  icon: typeof Upload
  onClick: () => void
  section: string
}

export function createSnippetContextMenuItem(
  filePath: string,
  relativePath: string,
  onSync: (relativePath: string) => void
): SnippetContextMenuItem | null {
  // Only show for .env files
  if (!relativePath.match(/^\.env(\.|$)/)) {
    return null
  }

  return {
    id: 'sync-to-gitlab-snippet',
    label: 'Sync to GitLab Snippet',
    icon: Upload,
    onClick: () => onSync(relativePath),
    section: 'file-actions'
  }
}
