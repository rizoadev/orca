/**
 * CSS injected into the embedded DeepSeek Harness UI.
 * Hides the workspace list + add workspace controls + top toolbar so users
 * stay in the session that matches Orca's active worktree.
 */
export const DEEPSEEK_WEBVIEW_CSS = `
  button[aria-label="Choose workspace"],
  [aria-label="Add workspace"],
  [data-slot="sidebar.workspaces"] [class*="_groupSection"] > :first-child,
  [data-slot="topbar"],
  header[role="banner"],
  [role="toolbar"] {
    display: none !important;
  }
`
