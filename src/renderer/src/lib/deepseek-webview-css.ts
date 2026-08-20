/**
 * CSS injected into the embedded DeepSeek Harness UI.
 *
 * Temporarily emptied: the workspace-hiding rules were disabled while
 * debugging the blank-webview / host-crash reports, so the sidebar workspace
 * list is visible again. Re-enable by restoring the rules below.
 *
 * Disabled rules:
 *   button[aria-label="Choose workspace"],
 *   [aria-label="Add workspace"] { display: none !important; }
 *   [data-slot="sidebar.workspaces"] [class*="_groupSection"] > :first-child {
 *     display: none !important;
 *   }
 */
export const DEEPSEEK_WEBVIEW_CSS = ``
