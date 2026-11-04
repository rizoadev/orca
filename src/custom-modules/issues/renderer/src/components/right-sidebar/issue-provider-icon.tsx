/** Provider brand icon for an issue row: which tracker sourced this issue. */
import { Gitlab } from 'lucide-react'
import { GitHubIcon } from '@/components/icons/GitHubIcon'
import { LinearIcon } from '@/components/icons/LinearIcon'
import type { RepoIssueProvider } from './repo-issue-provider'

export function IssueProviderIcon({
  provider,
  className
}: {
  provider: RepoIssueProvider
  className?: string
}): React.JSX.Element | null {
  if (provider === 'github') {
    return <GitHubIcon className={className} />
  }
  if (provider === 'gitlab') {
    return <Gitlab className={className} />
  }
  if (provider === 'linear') {
    return <LinearIcon className={className} />
  }
  return null
}
