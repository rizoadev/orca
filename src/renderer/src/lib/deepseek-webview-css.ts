/**
 * CSS injected into the embedded DeepSeek Harness UI.
 * Hides the add-workspace controls + top toolbar chrome so the session list
 * stays focused; the project chooser stays visible so new sessions can be
 * pointed at a project that matches the active worktree.
 */
export const DEEPSEEK_WEBVIEW_CSS = `
  [aria-label="Add workspace"],
  [data-slot="sidebar.workspaces"] [class*="_groupSection"] > :first-child,
  [data-slot="topbar"],
  header[role="banner"],
  [role="toolbar"] {
    display: none !important;
  }
`
