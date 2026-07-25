/** Asana Personal Access Token auth + REST v1 types. */

export type AsanaViewer = {
  gid: string
  name: string
  email: string | null
  photoUrl?: string
}

export type AsanaWorkspace = {
  gid: string
  name: string
}

export type AsanaConnectionStatus = {
  connected: boolean
  viewer: AsanaViewer | null
  workspaces: AsanaWorkspace[]
  activeWorkspaceGid: string | null
  credentialError?: string
}

export type AsanaProject = {
  gid: string
  name: string
  color?: string
  archived?: boolean
  workspaceGid?: string
}

export type AsanaSection = {
  gid: string
  name: string
}

export type AsanaUser = {
  gid: string
  name: string
  email?: string | null
  photoUrl?: string
}

export type AsanaTask = {
  gid: string
  name: string
  notes?: string
  completed: boolean
  assignee?: AsanaUser | null
  dueOn?: string | null
  permalinkUrl: string
  sectionName?: string | null
  projectGid?: string
  projectName?: string
  modifiedAt: string
  createdAt: string
}

export type AsanaTaskFilter = 'assigned' | 'all' | 'completed'

export type AsanaConnectArgs = {
  personalAccessToken: string
}

export type AsanaCreateTaskArgs = {
  projectGid: string
  name: string
  notes?: string
  assigneeGid?: string
  dueOn?: string
}

export type AsanaTaskUpdate = {
  name?: string
  notes?: string
  completed?: boolean
  assigneeGid?: string | null
  dueOn?: string | null
}

export type AsanaMutationResult = { ok: true } | { ok: false; error: string }

export type AsanaCreateTaskResult =
  | { ok: true; gid: string; permalinkUrl: string }
  | { ok: false; error: string }
