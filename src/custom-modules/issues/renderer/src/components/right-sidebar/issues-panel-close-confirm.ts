import { translate } from '@/i18n/i18n'
import type { IssueRow } from './issues-panel-rows'

type ConfirmFn = (options: {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: 'default' | 'destructive'
}) => Promise<boolean>

// Why: close is irreversible on the host forge; require an explicit confirm so
// a stray click on the compact row action cannot close issues.
export async function confirmCloseIssue(confirm: ConfirmFn, row: IssueRow): Promise<boolean> {
  const providerLabel =
    row.provider === 'github' ? 'GitHub' : row.provider === 'gitlab' ? 'GitLab' : 'Linear'
  return confirm({
    title: translate(
      'auto.components.right.sidebar.issuesPanel.closeConfirmTitle',
      'Close issue {{value0}}?',
      { value0: row.label }
    ),
    description: translate(
      'auto.components.right.sidebar.issuesPanel.closeConfirmBody',
      'This closes "{{value0}}" on {{value1}}. You can reopen it later from the provider.',
      {
        value0: row.title,
        value1: providerLabel
      }
    ),
    confirmLabel: translate('auto.components.right.sidebar.issuesPanel.closeIssue', 'Close issue'),
    confirmVariant: 'destructive'
  })
}
