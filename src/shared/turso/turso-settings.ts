/** Turso/libSQL snippet-sync settings. Custom: src/custom-modules/snippets. */
export type TursoSettings = {
  /** Turso/libSQL database URL (libsql://…) used by the snippet sync integration. */
  tursoDatabaseUrl?: string
  /** Turso auth token for the database above; stored alongside the URL in settings. */
  tursoAuthToken?: string
}
