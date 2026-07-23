import { describe, expect, it } from 'vitest'
import {
  classifyCommentSource,
  classifyDelegation,
  classifyDirectHuman,
  classifyOwnerFallback,
  classifyTriggerOwner,
  isPreciseOriginatorSource,
  reattributeForMergedFollowUp
} from './agent-run-attribution'

describe('agent-run-attribution', () => {
  it('classifies direct human with originator == accountable', () => {
    const attr = classifyDirectHuman({ originatorId: 'user-a', evidenceRefId: 'launch-1' })
    expect(attr).toMatchObject({
      originatorId: 'user-a',
      accountableId: 'user-a',
      source: 'direct_human',
      evidenceKind: 'launch',
      evidenceRefId: 'launch-1'
    })
    expect(isPreciseOriginatorSource(attr.source)).toBe(true)
  })

  it('copies parent human on delegation without chaining originator', () => {
    const parent = classifyDirectHuman({ originatorId: 'user-a' })
    const child = classifyDelegation({
      parent,
      delegatedFromTaskId: 'task-1',
      evidenceKind: 'dispatch',
      evidenceRefId: 'ctx-1',
      isLeaderTask: false
    })
    expect(child).toMatchObject({
      originatorId: 'user-a',
      accountableId: 'user-a',
      source: 'delegation',
      delegatedFromTaskId: 'task-1',
      isLeaderTask: false
    })
  })

  it('classifies member comment as direct_human and agent comment via parent chain', () => {
    const member = classifyCommentSource({
      authorType: 'member',
      authorId: 'user-b',
      evidenceRefId: 'c1'
    })
    expect(member.source).toBe('direct_human')
    expect(member.originatorId).toBe('user-b')

    const parent = classifyDirectHuman({ originatorId: 'user-a' })
    const agentComment = classifyCommentSource({
      authorType: 'agent',
      parent,
      evidenceRefId: 'c2'
    })
    expect(agentComment).toMatchObject({
      source: 'comment_source',
      originatorId: 'user-a',
      accountableId: 'user-a'
    })
  })

  it('marks trigger owner audit-only (null originator)', () => {
    const attr = classifyTriggerOwner({ ownerId: 'owner-1', evidenceRefId: 'auto-1' })
    expect(attr).toMatchObject({
      originatorId: null,
      accountableId: 'owner-1',
      source: 'trigger_owner'
    })
    expect(isPreciseOriginatorSource(attr.source)).toBe(true)
  })

  it('degrades to owner_fallback / unattributed', () => {
    expect(classifyOwnerFallback({ ownerId: 'owner-1' }).source).toBe('owner_fallback')
    expect(classifyOwnerFallback({}).source).toBe('unattributed')
    expect(isPreciseOriginatorSource('owner_fallback')).toBe(false)
  })

  it('reattributes the whole snapshot on merge', () => {
    const previous = classifyDirectHuman({ originatorId: 'user-a', evidenceRefId: 'c1' })
    const next = classifyDirectHuman({
      originatorId: 'user-b',
      evidenceKind: 'followup',
      evidenceRefId: 'c2',
      squadId: 'frontend'
    })
    const merged = reattributeForMergedFollowUp({ previous, next })
    expect(merged).toMatchObject({
      originatorId: 'user-b',
      accountableId: 'user-b',
      source: 'direct_human',
      evidenceKind: 'followup',
      evidenceRefId: 'c2',
      squadId: 'frontend'
    })
  })
})
