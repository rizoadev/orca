import { useCallback, useState } from 'react'
import { Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store'
import { useActiveWorktree, useRepoById } from '@/store/selectors'
import { getRepoExecutionHostId } from '../../../../../../shared/execution-host'

type Props = { onAttached: () => void }

export function LinearProjectPicker({ onAttached }: Props): React.JSX.Element {
  const [projectId, setProjectId] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [saving, setSaving] = useState(false)
  const updateRepo = useAppStore((s) => s.updateRepo)
  const activeWorktree = useActiveWorktree()
  const activeRepo = useRepoById(activeWorktree?.repoId ?? null)

  const attach = useCallback(async () => {
    if (!activeRepo || !projectId.trim() || !workspaceId.trim()) {
      return
    }
    setSaving(true)
    try {
      await updateRepo(
        activeRepo.id,
        { linear: { projectId: projectId.trim(), workspaceId: workspaceId.trim() } },
        // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: RepoUpdate cannot express the nested linear binding, and hostId is recomputed from the repo.
        { hostId: getRepoExecutionHostId(activeRepo) as never }
      )
      onAttached()
    } finally {
      setSaving(false)
    }
  }, [activeRepo, projectId, workspaceId, updateRepo, onAttached])

  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <p className="text-muted-foreground">
        Attach a Linear project to this repo to browse issues.
      </p>
      <Input
        placeholder="Linear workspace ID"
        value={workspaceId}
        onChange={(e) => setWorkspaceId(e.target.value)}
      />
      <Input
        placeholder="Linear project ID"
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
      />
      <Button
        size="sm"
        disabled={saving || !projectId.trim() || !workspaceId.trim()}
        onClick={() => void attach()}
      >
        <Link2 className="size-3.5" /> Attach project
      </Button>
    </div>
  )
}
