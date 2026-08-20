/**
 * Harness user-settings helpers for the DeepSeek web host. The host keeps a
 * durable YAML document at <harnessHome>/settings.yaml and re-reads it at
 * boot, so callers that need a change live restart the host afterwards.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

// Why: the host returns preset names/descriptions in its own locale
// (zh-CN by default); keep the picker readable for the well-known system ids.
export const LOCALIZED_AGENT_PRESETS: Record<string, { name: string; description: string }> = {
  standard: {
    name: 'Standard',
    description:
      'Full coding agent: file editing, Shell, file & web retrieval, Skills, plans, goals, sub-agents and workflows.'
  },
  code: {
    name: 'Code (PTC)',
    description:
      'All Standard capabilities, with tools exposed via the Code Mode SDK so the model composes multi-step operations as a single TypeScript program.'
  },
  minimal: {
    name: 'Minimal',
    description: 'Two tools only: a persistent bash shell and the str_replace_editor.'
  },
  cordis: {
    name: 'Create (Cordis)',
    description:
      'For authoring custom presets: Standard capabilities plus runtime checks, plugin experiments and preset authoring guidance.'
  }
}

/** Merge a patch into the host's user-settings document (creates the file when absent). */
export function mergeHarnessSettings(
  harnessHomePath: string,
  apply: (doc: Record<string, unknown>) => void
): void {
  const settingsPath = join(harnessHomePath, 'settings.yaml')
  // Why: a fresh harness home has no settings file yet; create the dir so
  // the host bootstraps with our preferences on first run.
  mkdirSync(dirname(settingsPath), { recursive: true })
  let doc: Record<string, unknown> = {}
  if (existsSync(settingsPath)) {
    try {
      doc = (parseYaml(readFileSync(settingsPath, 'utf8')) ?? {}) as Record<string, unknown>
    } catch {
      doc = {}
    }
  }
  apply(doc)
  writeFileSync(settingsPath, stringifyYaml(doc))
}

// Why: the harness browser client defaults to zh-CN; Orca always asks for
// English so the embedded UI matches the rest of the app.
export function ensureEnglishHarnessLocale(harnessHomePath: string): void {
  mergeHarnessSettings(harnessHomePath, (doc) => {
    const locale =
      doc.locale && typeof doc.locale === 'object' ? (doc.locale as Record<string, unknown>) : {}
    if (locale.preference === 'en') {
      return
    }
    locale.preference = 'en'
    doc.locale = locale
  })
}
