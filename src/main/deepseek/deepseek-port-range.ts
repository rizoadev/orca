/**
 * Port constants for the DeepSeek Harness host, kept out of the manager for
 * its line budget. The manager owns a single daemon; this module only shares
 * the base of the port range the registry allocates from.
 */
// Why: the base of the per-project port range; actual allocation is a
// persistent registry (see deepseek-port-registry.ts) so ports stay unique
// and stable across restarts instead of colliding via path hashing.
export const PREFERRED_PORT = 3580
