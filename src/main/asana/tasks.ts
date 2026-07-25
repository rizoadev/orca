/**
 * Asana task/project list operations via REST v1.
 */
import { asanaFetch, AsanaApiError, getActiveWorkspaceGid, getToken } from './client'
import type {
  AsanaCreateTaskArgs,
  AsanaCreateTaskResult,
  AsanaMutationResult,
  AsanaProject,
  AsanaSection,
  AsanaTask,
  AsanaTaskFilter,
  AsanaTaskUpdate
} from '../../shared/asana-types'

type AsanaListResponse<T> = {
  data: T[]
  next_page?: { offset: string; path: string; uri: string } | null
}

type RawProject = {
  gid: string
  name: string
  color?: string
  archived?: boolean
  workspace?: { gid: string }
}

type RawSection = { gid: string; name: string }

type RawTask = {
  gid: string
  name: string
  notes?: string
  completed: boolean
  assignee?: { gid: string; name: string; email?: string; photo?: { image_128x128?: string } } | null
  due_on?: string | null
  permalink_url: string
  memberships?: Array<{ section?: { name?: string }; project?: { gid?: string; name?: string } }>
  modified_at: string
  created_at: string
}

function mapTask(t: RawTask): AsanaTask {
  const membership = t.memberships?.[0]
  return {
    gid: t.gid,
    name: t.name,
    notes: t.notes,
    completed: t.completed,
    assignee: t.assignee
      ? {
          gid: t.assignee.gid,
          name: t.assignee.name,
          email: t.assignee.email ?? null,
          photoUrl: t.assignee.photo?.image_128x128
        }
      : null,
    dueOn: t.due_on ?? null,
    permalinkUrl: t.permalink_url,
    sectionName: membership?.section?.name ?? null,
    projectGid: membership?.project?.gid,
    projectName: membership?.project?.name,
    modifiedAt: t.modified_at,
    createdAt: t.created_at
  }
}

export async function listProjects(workspaceGid?: string): Promise<AsanaProject[]> {
  const ws = workspaceGid ?? getActiveWorkspaceGid()
  if (!ws) {
    throw new AsanaApiError('No active Asana workspace. Connect and select a workspace first.')
  }
  const result = await asanaFetch<AsanaListResponse<RawProject>>(
    `/workspaces/${ws}/projects?opt_fields=gid,name,color,archived,workspace.gid&archived=false&limit=100`
  )
  return result.data.map((p) => ({
    gid: p.gid,
    name: p.name,
    color: p.color,
    archived: p.archived,
    workspaceGid: p.workspace?.gid ?? ws
  }))
}

export async function listSections(projectGid: string): Promise<AsanaSection[]> {
  const result = await asanaFetch<AsanaListResponse<RawSection>>(
    `/projects/${projectGid}/sections?opt_fields=gid,name&limit=100`
  )
  return result.data.map((s) => ({ gid: s.gid, name: s.name }))
}

export async function listTasks(args: {
  projectGid?: string
  workspaceGid?: string
  filter?: AsanaTaskFilter
  limit?: number
}): Promise<AsanaTask[]> {
  if (!getToken()) {
    throw new AsanaApiError('Not connected to Asana.')
  }
  const limit = Math.min(Math.max(1, args.limit ?? 50), 100)
  const filter = args.filter ?? 'assigned'
  const fields =
    'gid,name,notes,completed,assignee.gid,assignee.name,assignee.email,assignee.photo.image_128x128,due_on,permalink_url,memberships.section.name,memberships.project.gid,memberships.project.name,modified_at,created_at'

  let path: string
  if (args.projectGid) {
    // Why: project task lists return completed tasks too; filter client-side below.
    path = `/projects/${args.projectGid}/tasks?opt_fields=${fields}&limit=${limit}`
  } else {
    // Why: user task list is available on free plans (unlike workspace task search).
    const me = await asanaFetch<{ data: { gid: string } }>('/users/me?opt_fields=gid')
    const utl = await asanaFetch<{ data: { gid: string } }>(
      `/users/${me.data.gid}/user_task_list?opt_fields=gid`
    )
    path = `/user_task_lists/${utl.data.gid}/tasks?opt_fields=${fields}&limit=${limit}`
  }

  const result = await asanaFetch<AsanaListResponse<RawTask>>(path)
  let tasks = result.data.map(mapTask)
  if (filter === 'assigned' || filter === 'all') {
    tasks = tasks.filter((t) => !t.completed)
  } else if (filter === 'completed') {
    tasks = tasks.filter((t) => t.completed)
  }
  return tasks
}

export async function getTask(taskGid: string): Promise<AsanaTask> {
  const fields =
    'gid,name,notes,completed,assignee.gid,assignee.name,assignee.email,assignee.photo.image_128x128,due_on,permalink_url,memberships.section.name,memberships.project.gid,memberships.project.name,modified_at,created_at'
  const result = await asanaFetch<{ data: RawTask }>(`/tasks/${taskGid}?opt_fields=${fields}`)
  return mapTask(result.data)
}

export async function createTask(args: AsanaCreateTaskArgs): Promise<AsanaCreateTaskResult> {
  try {
    const body: Record<string, unknown> = {
      name: args.name,
      projects: [args.projectGid]
    }
    if (args.notes) {
      body.notes = args.notes
    }
    if (args.assigneeGid) {
      body.assignee = args.assigneeGid
    }
    if (args.dueOn) {
      body.due_on = args.dueOn
    }
    const result = await asanaFetch<{ data: { gid: string; permalink_url: string } }>(
      '/tasks?opt_fields=gid,permalink_url',
      { method: 'POST', body: { data: body } }
    )
    return { ok: true, gid: result.data.gid, permalinkUrl: result.data.permalink_url }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function updateTask(
  taskGid: string,
  update: AsanaTaskUpdate
): Promise<AsanaMutationResult> {
  try {
    const body: Record<string, unknown> = {}
    if (update.name !== undefined) {
      body.name = update.name
    }
    if (update.notes !== undefined) {
      body.notes = update.notes
    }
    if (update.completed !== undefined) {
      body.completed = update.completed
    }
    if (update.assigneeGid !== undefined) {
      body.assignee = update.assigneeGid
    }
    if (update.dueOn !== undefined) {
      body.due_on = update.dueOn
    }
    await asanaFetch(`/tasks/${taskGid}`, { method: 'PUT', body: { data: body } })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
