/**
 * GitLab Snippets Custom Module
 *
 * Features:
 * - Sync .env files to GitLab private snippets
 * - Branch-aware snippet naming
 * - Right-click context menu on .env files
 * - Snippet list block in file explorer
 */

export { registerGitLabSnippetHandlers } from './main/snippets-ipc'
export { SnippetBlock } from './renderer/components/SnippetBlock'
export { createSnippetContextMenuItem } from './renderer/components/context-menu'
export * from './shared/types'
