/**
 * CSS injected into the embedded DeepSeek Harness UI.
 * Hides only the top toolbar chrome so the pinned session stays focused;
 * the workspace sidebar stays visible so sessions can be switched manually.
 */
export const DEEPSEEK_WEBVIEW_CSS = `
  [data-slot="topbar"],
  header[role="banner"],
  [role="toolbar"] {
    display: none !important;
  }
`
