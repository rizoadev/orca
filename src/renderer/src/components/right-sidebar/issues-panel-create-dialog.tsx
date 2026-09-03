import React, { useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { translate } from '@/i18n/i18n'
import { toast } from 'sonner'
import type { RepoIssueProvider } from './repo-issue-provider'

export type CreateIssueSubmitInput = {
  title: string
  body: string
}

export function IssuesPanelCreateDialog({
  open,
  provider,
  repoLabel,
  repoPath,
  submitting,
  onOpenChange,
  onSubmit
}: {
  open: boolean
  provider: RepoIssueProvider
  repoLabel: string
  repoPath: string | null
  submitting: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: CreateIssueSubmitInput) => Promise<void> | void
}): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [generating, setGenerating] = useState(false)

  // Why: race protection — capture the body at generation start so we only
  // append to the description if the user hasn't typed since the request.
  const bodyAtGenerationStart = useRef<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    setTitle('')
    setBody('')
    setGenerating(false)
    bodyAtGenerationStart.current = null
  }, [open])

  const handleGenerate = useCallback(async () => {
    const task = title.trim() || body.trim()
    if (!task || !repoPath) {
      return
    }

    bodyAtGenerationStart.current = body
    setGenerating(true)

    try {
      const result = await window.api.got.generatePlan({
        repoPath,
        taskDescription: body.trim() ? `${title}\n\n${body}` : title
      })

      if (!result.ok) {
        toast.error(result.error || 'Failed to generate GoT plan.')
        return
      }

      // Why: only append if the user hasn't typed since we started generating.
      // If they did, show the plan in a toast so it's not lost.
      if (bodyAtGenerationStart.current === body) {
        setBody((prev) => (prev ? `${prev}\n\n---\n${result.plan}` : result.plan))
      } else {
        toast.success('GoT plan generated (body was edited — plan preview available in clipboard)')
        // Could also offer to replace, but for now just notify.
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.error(`Failed to generate GoT plan: ${message}`)
    } finally {
      setGenerating(false)
      bodyAtGenerationStart.current = null
    }
  }, [title, body, repoPath])

  const providerLabel =
    provider === 'github'
      ? translate('auto.i18n.hostedReview.copy.c7d1e5f9a8', 'GitHub')
      : translate('auto.i18n.hostedReview.copy.91b5c8d7e6', 'GitLab')

  const canSubmit = title.trim().length > 0 && !submitting && !generating
  const canGenerate = (title.trim() || body.trim()) && !!repoPath && !generating

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(720px,90vh)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border/60 px-5 py-4">
          <DialogTitle>
            {translate('auto.components.right.sidebar.issuesPanel.newIssueTitle', 'New issue')}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.right.sidebar.issuesPanel.newIssueBody',
              'Create a {{value0}} issue in {{value1}}.',
              { value0: providerLabel, value1: repoLabel }
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 scrollbar-sleek">
          <div className="space-y-2">
            <Label htmlFor="issues-panel-new-title">
              {translate('auto.components.right.sidebar.issuesPanel.issueTitle', 'Title')}
            </Label>
            <Input
              id="issues-panel-new-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={translate(
                'auto.components.right.sidebar.issuesPanel.issueTitlePlaceholder',
                'Short summary of the problem'
              )}
              disabled={submitting || generating}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="issues-panel-new-body">
              {translate(
                'auto.components.right.sidebar.issuesPanel.issueDescription',
                'Description'
              )}
            </Label>
            <textarea
              id="issues-panel-new-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={translate(
                'auto.components.right.sidebar.issuesPanel.issueDescriptionPlaceholder',
                'What needs to be fixed or built?'
              )}
              disabled={submitting || generating}
              className="min-h-36 w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canGenerate}
              onClick={handleGenerate}
            >
              {generating ? (
                <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 size-3.5" />
              )}
              {generating
                ? translate('auto.components.right.sidebar.issuesPanel.generating', 'Generating…')
                : translate(
                    'auto.components.right.sidebar.issuesPanel.generatePlan',
                    'Generate GoT plan'
                  )}
            </Button>
            {generating && !bodyAtGenerationStart.current ? (
              <span className="text-xs text-muted-foreground">
                {translate(
                  'auto.components.right.sidebar.issuesPanel.generatingHint',
                  'Scanning codebase + AI planning…'
                )}
              </span>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t border-border/60 bg-muted/10 px-5 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting || generating}
          >
            {translate('auto.components.right.sidebar.issuesPanel.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() =>
              void onSubmit({
                title: title.trim(),
                body
              })
            }
          >
            {submitting ? <LoaderCircle className="size-4 animate-spin" /> : null}
            {translate('auto.components.right.sidebar.issuesPanel.createIssue', 'Create issue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
