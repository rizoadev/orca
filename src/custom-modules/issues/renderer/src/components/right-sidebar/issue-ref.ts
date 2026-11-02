import type { IssueRow } from './issues-panel-rows'

export function issueRefLabel(args: {
  provider: string
  number: number | null
  identifier?: string | null
}): string {
  if (args.provider === 'linear' && args.identifier) {
    return args.identifier
  }
  if (args.number !== null) {
    return `#${args.number}`
  }
  return ''
}

export function issueRefFromRow(row: IssueRow): {
  provider: string
  number: number | null
  identifier?: string | null
} {
  return { provider: row.provider, number: row.number, identifier: row.linearItem?.identifier }
}
