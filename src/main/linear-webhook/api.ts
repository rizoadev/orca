/** Linear API helpers for the native webhook gateway. */
import { acquire, release, getClients } from '../linear/client'
import type { LinearClient } from '@linear/sdk'

function getClient(): LinearClient | null {
  const clients = getClients()
  if (clients.length === 0) {
    return null
  }
  return clients[0].client
}

export async function postLinearComment(params: {
  issueId: string
  body: string
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = getClient()
  if (!client) {
    return { ok: false, reason: 'Linear not connected' }
  }
  try {
    await acquire()
    await client.createComment({ issueId: params.issueId, body: params.body })
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  } finally {
    release()
  }
}

export async function updateLinearIssue(params: {
  issueId: string
  stateId?: string
  assigneeId?: string | null
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const client = getClient()
  if (!client) {
    return { ok: false, reason: 'Linear not connected' }
  }
  try {
    await acquire()
    await client.updateIssue(params.issueId, {
      stateId: params.stateId,
      assigneeId: params.assigneeId
    })
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) }
  } finally {
    release()
  }
}

export async function getLinearIssue(issueId: string): Promise<{
  id: string
  identifier: string
  title: string
  description?: string | null
  stateName?: string | null
  teamId?: string | null
  assigneeId?: string | null
  url: string
} | null> {
  const client = getClient()
  if (!client) {
    return null
  }
  try {
    await acquire()
    const issue = await client.issue(issueId)
    if (!issue) {
      return null
    }
    return {
      id: issue.id,
      identifier: issue.identifier ?? '',
      title: issue.title ?? '',
      description: issue.description ?? null,
      stateName: (issue.state as { name?: string } | null | undefined)?.name ?? null,
      teamId: (issue.team as { id?: string } | null | undefined)?.id ?? null,
      assigneeId: (issue.assignee as { id?: string } | null | undefined)?.id ?? null,
      url: issue.url ?? ''
    }
  } catch {
    return null
  } finally {
    release()
  }
}

export async function getLinearTeams(): Promise<{ id: string; key: string; name: string }[]> {
  const client = getClient()
  if (!client) {
    return []
  }
  try {
    await acquire()
    const page = await client.teams({ first: 50 })
    const nodes = page?.nodes ?? []
    return nodes.map((t) => ({
      id: t.id,
      key: t.key ?? '',
      name: t.name ?? ''
    }))
  } catch {
    return []
  } finally {
    release()
  }
}
