// Why: Orca-native provenance for agent runs. Labels "who this is on behalf of"
// for audit/visibility only — never authorization.

export const ORIGINATOR_SOURCES = [
  'direct_human',
  'delegation',
  'comment_source',
  'trigger_owner',
  'owner_fallback',
  'unattributed'
] as const

export type OriginatorSource = (typeof ORIGINATOR_SOURCES)[number]

export const ATTRIBUTION_EVIDENCE_KINDS = [
  'comment',
  'dispatch',
  'launch',
  'automation',
  'followup',
  'squad',
  'rerun'
] as const

export type AttributionEvidenceKind = (typeof ATTRIBUTION_EVIDENCE_KINDS)[number]

export type AgentRunAttribution = {
  /** Human/session that authorized the run when known. */
  originatorId?: string | null
  /** Audit-responsible human; equals originator when originator is set. */
  accountableId?: string | null
  source: OriginatorSource
  delegatedFromTaskId?: string | null
  evidenceKind?: AttributionEvidenceKind
  evidenceRefId?: string | null
  squadId?: string | null
  isLeaderTask?: boolean
}

export type DirectHumanAttributionInput = {
  originatorId: string
  evidenceKind?: AttributionEvidenceKind
  evidenceRefId?: string | null
  squadId?: string | null
  isLeaderTask?: boolean
}

export type DelegationAttributionInput = {
  parent: AgentRunAttribution
  evidenceKind?: AttributionEvidenceKind
  evidenceRefId?: string | null
  delegatedFromTaskId?: string | null
  squadId?: string | null
  isLeaderTask?: boolean
}

export type CommentSourceAttributionInput = {
  /** Member author → direct_human; agent/system author walks parent. */
  authorType: 'member' | 'agent' | 'system' | string
  authorId?: string | null
  parent?: AgentRunAttribution | null
  evidenceRefId?: string | null
  squadId?: string | null
  isLeaderTask?: boolean
}

export type TriggerOwnerAttributionInput = {
  ownerId: string
  evidenceKind?: AttributionEvidenceKind
  evidenceRefId?: string | null
  squadId?: string | null
}

export type OwnerFallbackAttributionInput = {
  ownerId?: string | null
  evidenceKind?: AttributionEvidenceKind
  evidenceRefId?: string | null
  squadId?: string | null
  isLeaderTask?: boolean
}

function finalize(attr: AgentRunAttribution): AgentRunAttribution {
  if (attr.originatorId) {
    return { ...attr, accountableId: attr.originatorId }
  }
  return attr
}

export function isPreciseOriginatorSource(source: OriginatorSource): boolean {
  return (
    source === 'direct_human' ||
    source === 'delegation' ||
    source === 'comment_source' ||
    source === 'trigger_owner'
  )
}

export function classifyDirectHuman(input: DirectHumanAttributionInput): AgentRunAttribution {
  return finalize({
    originatorId: input.originatorId,
    source: 'direct_human',
    evidenceKind: input.evidenceKind ?? 'launch',
    evidenceRefId: input.evidenceRefId ?? null,
    squadId: input.squadId ?? null,
    isLeaderTask: input.isLeaderTask
  })
}

export function classifyDelegation(input: DelegationAttributionInput): AgentRunAttribution {
  // Why: copy parent human, don't chain indefinitely — cycles stay harmless.
  const parentHuman = input.parent.accountableId ?? input.parent.originatorId ?? null
  return finalize({
    originatorId: parentHuman,
    accountableId: parentHuman,
    source: parentHuman ? 'delegation' : 'unattributed',
    delegatedFromTaskId: input.delegatedFromTaskId ?? null,
    evidenceKind: input.evidenceKind ?? 'dispatch',
    evidenceRefId: input.evidenceRefId ?? null,
    squadId: input.squadId ?? input.parent.squadId ?? null,
    isLeaderTask: input.isLeaderTask
  })
}

export function classifyCommentSource(input: CommentSourceAttributionInput): AgentRunAttribution {
  if (input.authorType === 'member' && input.authorId) {
    return finalize({
      originatorId: input.authorId,
      source: 'direct_human',
      evidenceKind: 'comment',
      evidenceRefId: input.evidenceRefId ?? null,
      squadId: input.squadId ?? null,
      isLeaderTask: input.isLeaderTask
    })
  }

  if (input.parent) {
    const parentHuman = input.parent.accountableId ?? input.parent.originatorId ?? null
    return finalize({
      originatorId: parentHuman,
      accountableId: parentHuman,
      source: parentHuman ? 'comment_source' : 'unattributed',
      delegatedFromTaskId: input.parent.delegatedFromTaskId ?? null,
      evidenceKind: 'comment',
      evidenceRefId: input.evidenceRefId ?? null,
      squadId: input.squadId ?? input.parent.squadId ?? null,
      isLeaderTask: input.isLeaderTask
    })
  }

  return finalize({
    source: 'unattributed',
    evidenceKind: 'comment',
    evidenceRefId: input.evidenceRefId ?? null,
    squadId: input.squadId ?? null,
    isLeaderTask: input.isLeaderTask
  })
}

export function classifyTriggerOwner(input: TriggerOwnerAttributionInput): AgentRunAttribution {
  return finalize({
    // Why: autonomous fire has no live authorizer; owner is audit-only.
    originatorId: null,
    accountableId: input.ownerId,
    source: 'trigger_owner',
    evidenceKind: input.evidenceKind ?? 'automation',
    evidenceRefId: input.evidenceRefId ?? null,
    squadId: input.squadId ?? null
  })
}

export function classifyOwnerFallback(input: OwnerFallbackAttributionInput): AgentRunAttribution {
  if (!input.ownerId) {
    return finalize({
      source: 'unattributed',
      evidenceKind: input.evidenceKind,
      evidenceRefId: input.evidenceRefId ?? null,
      squadId: input.squadId ?? null,
      isLeaderTask: input.isLeaderTask
    })
  }
  return finalize({
    originatorId: null,
    accountableId: input.ownerId,
    source: 'owner_fallback',
    evidenceKind: input.evidenceKind,
    evidenceRefId: input.evidenceRefId ?? null,
    squadId: input.squadId ?? null,
    isLeaderTask: input.isLeaderTask
  })
}

/** Re-stamp a pending run to the newest follow-up's attribution (coalesce path). */
export function reattributeForMergedFollowUp(args: {
  previous: AgentRunAttribution
  next: AgentRunAttribution
}): AgentRunAttribution {
  // Why: whole snapshot moves together so source/evidence don't lag person columns.
  return finalize({
    ...args.next,
    squadId: args.next.squadId ?? args.previous.squadId ?? null,
    isLeaderTask: args.next.isLeaderTask ?? args.previous.isLeaderTask
  })
}
