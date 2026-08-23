import React from 'react'
import { File as FileIcon, Folder } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import type { DirEntry } from './dir-entry'

type RemoteFileEntriesProps = {
  entries: DirEntry[]
  /** Directory the entries belong to; used to build absolute paths for actions. */
  parentPath: string
  selectedName: string | null
  onSelect: (entry: DirEntry) => void
  onDownload: (entry: DirEntry) => void
  onOpenFile?: (filePath: string) => void
}

/** Clickable remote rows with their right-click actions (open in editor, download). */
export function RemoteFileEntries({
  entries,
  parentPath,
  selectedName,
  onSelect,
  onDownload,
  onOpenFile
}: RemoteFileEntriesProps): React.JSX.Element {
  return (
    <ul className="space-y-0.5">
      {entries.map((entry) => (
        <li key={entry.name}>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                onClick={() => onSelect(entry)}
                onDoubleClick={() => {
                  if (!entry.isDirectory) {
                    return
                  }
                  onSelect(entry)
                }}
                aria-selected={selectedName === entry.name}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[13px]',
                  selectedName === entry.name
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                )}
              >
                {entry.isDirectory ? (
                  <Folder className="size-4 shrink-0 text-sky-500" />
                ) : (
                  <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate">{entry.name}</span>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              {!entry.isDirectory && onOpenFile ? (
                <ContextMenuItem onClick={() => onOpenFile(joinRemotePath(parentPath, entry.name))}>
                  {translate('auto.components.remote.RemoteFilesPane.openFile', 'Open file')}
                </ContextMenuItem>
              ) : null}
              <ContextMenuItem
                onClick={() => {
                  onSelect(entry)
                  onDownload(entry)
                }}
              >
                {translate('auto.components.remote.RemoteFilesPane.downloadCm', 'Download')}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </li>
      ))}
    </ul>
  )
}

function joinRemotePath(base: string, name: string): string {
  if (base.endsWith('/')) {
    return `${base}${name}`
  }
  return `${base}/${name}`
}
