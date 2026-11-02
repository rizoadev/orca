/**
 * Custom right-sidebar tab registry.
 * Add new tab IDs here, then wire in custom-activity-items.ts and custom-panel-content.tsx.
 */
import type { ActiveRightSidebarTab } from '@/store/slices/editor'

export const CUSTOM_SIDEBAR_TAB_IDS = ['issues'] as const

export type CustomSidebarTabId = (typeof CUSTOM_SIDEBAR_TAB_IDS)[number]

export function isCustomSidebarTab(tab: ActiveRightSidebarTab): tab is CustomSidebarTabId {
  return (CUSTOM_SIDEBAR_TAB_IDS as readonly string[]).includes(tab)
}
