import { useMemo } from 'react'
import type { OrchestrationBoardTask } from './orchestration-board-model'

export type OfficeAgent = {
  id: string
  name: string
  handle: string
  emoji: string
  color: string
  status: 'working' | 'idle' | 'blocked' | 'done'
  taskTitle: string
  taskId: string
}

export type OfficeRoom = {
  id: string
  label: string
  tasks: OrchestrationBoardTask[]
  agents: OfficeAgent[]
  activeCount: number
  doneCount: number
  blockedCount: number
  totalCount: number
}

export type OfficeStats = {
  totalTasks: number
  activeTasks: number
  completedTasks: number
  blockedTasks: number
  activeAgents: number
  roomCount: number
}

// Deterministic color per handle so same agent always gets same color
const AGENT_COLORS = [
  '#00f5ff',
  '#ff006e',
  '#9d4edd',
  '#ffd700',
  '#39ff14',
  '#00d9a5',
  '#ff6b35',
  '#a78bfa',
  '#34d399',
  '#f472b6'
]

const AGENT_EMOJIS = ['🤖', '💻', '🔬', '✍️', '📊', '🛡️', '⚙️', '🧪', '🎯', '🔧']

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

function agentColor(handle: string): string {
  return AGENT_COLORS[hashStr(handle) % AGENT_COLORS.length]
}

function agentEmoji(handle: string): string {
  return AGENT_EMOJIS[hashStr(handle) % AGENT_EMOJIS.length]
}

function taskToAgent(task: OrchestrationBoardTask): OfficeAgent {
  const handle = task.assignee_handle ?? task.id
  const status =
    task.status === 'dispatched'
      ? 'working'
      : task.status === 'blocked'
        ? 'blocked'
        : task.status === 'completed'
          ? 'done'
          : 'idle'
  return {
    id: task.id,
    name: handle,
    handle,
    emoji: agentEmoji(handle),
    color: agentColor(handle),
    status,
    taskTitle: task.task_title ?? task.display_name ?? task.spec.slice(0, 60),
    taskId: task.id
  }
}

export function useOfficeData(tasks: OrchestrationBoardTask[]): {
  rooms: OfficeRoom[]
  stats: OfficeStats
} {
  return useMemo(() => {
    // Group root tasks (no parent) by project_id; children go with their root
    const rootTasks = tasks.filter((t) => !t.parent_id)
    const byProject = new Map<string, OrchestrationBoardTask[]>()

    for (const task of rootTasks) {
      const key = task.project_id ?? task.repo_id ?? '__lobby__'
      const list = byProject.get(key)
      if (list) {
        list.push(task)
      } else {
        byProject.set(key, [task])
      }
    }

    // Build rooms — put lobby last
    const rooms: OfficeRoom[] = []
    let lobbyRoom: OfficeRoom | null = null

    for (const [key, roomTasks] of byProject.entries()) {
      const dispatched = roomTasks.filter((t) => t.status === 'dispatched')
      const agents = dispatched.map(taskToAgent)
      const room: OfficeRoom = {
        id: key,
        label: key === '__lobby__' ? 'Lobby' : (key.split('/').pop() ?? key),
        tasks: roomTasks,
        agents,
        activeCount: dispatched.length,
        doneCount: roomTasks.filter((t) => t.status === 'completed').length,
        blockedCount: roomTasks.filter((t) => t.status === 'blocked').length,
        totalCount: roomTasks.length
      }
      if (key === '__lobby__') {
        lobbyRoom = room
      } else {
        rooms.push(room)
      }
    }

    // Sort by activeCount desc
    rooms.sort((a, b) => b.activeCount - a.activeCount || b.totalCount - a.totalCount)
    if (lobbyRoom) {
      rooms.push(lobbyRoom)
    }

    const stats: OfficeStats = {
      totalTasks: rootTasks.length,
      activeTasks: rootTasks.filter((t) => t.status === 'dispatched').length,
      completedTasks: rootTasks.filter((t) => t.status === 'completed').length,
      blockedTasks: rootTasks.filter((t) => t.status === 'blocked').length,
      activeAgents: new Set(
        rootTasks
          .filter((t) => t.status === 'dispatched' && t.assignee_handle)
          .map((t) => t.assignee_handle!)
      ).size,
      roomCount: rooms.length
    }

    return { rooms, stats }
  }, [tasks])
}
