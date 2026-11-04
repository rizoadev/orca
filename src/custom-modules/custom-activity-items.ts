/**
 * Custom activity bar items for the right sidebar.
 * Each custom module registers its icon and title here.
 */
import { ListTodo } from 'lucide-react'
import type { ActivityBarItem } from '@/components/right-sidebar/activity-bar-buttons'
import { translate } from '@/i18n/i18n'

export function getCustomActivityItems(): ActivityBarItem[] {
  return [
    {
      id: 'issues' as ActivityBarItem['id'],
      icon: ListTodo,
      title: translate('custom.issues', 'Issues'),
      shortcut: ''
    }
    // voice (Pi Standby) disabled — lihat custom-right-sidebar-tabs.ts
  ]
}
