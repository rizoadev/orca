/**
 * CSS injected into the embedded OpenChamber UI (spawned by Orca).
 *
 * Hides the left sidebar workspace/session list so the user cannot
 * accidentally switch away from the worktree Orca attached. The sidebar's
 * scroll container uses the generic ScrollableOverlay classes plus the
 * `oc-sidebar-scroller` marker; targeting the marker keeps the chat history
 * (which reuses the same overlay classes) visible.
 *
 * Falls back to the "Add project" button when the sidebar marker is absent
 * (e.g. different OpenChamber build), so the switch entry point is still
 * hidden.
 */
export const OPENCHAMBER_WEBVIEW_CSS = `
  .oc-sidebar-scroller,
  [aria-label="Add project"],
  [aria-label="Add workspace"] {
    display: none !important;
  }
`
