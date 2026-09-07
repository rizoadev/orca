// Why: Vite's DEV flag is only true while `pnpm run dev` serves the module graph,
// so packaged/preview builds resolve this to false at compile time and the
// dev-only chrome (footer badge, …) disappears without an IPC round-trip.
export const isRendererDevBuild: boolean = import.meta.env.DEV
