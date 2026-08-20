#!/usr/bin/env node

/**
 * Checks the external runtimes Orca needs for the in-app DeepSeek Harness and
 * Paseo views, and prints install instructions for whatever is missing.
 *
 * - `dsh` (DeepSeek Harness web host) — spawns `dsh --profile web`
 * - `node` (Paseo daemon entrypoint) — Electron's own binary can't run it
 * - `pnpm` (building the bundled paseo repo)
 * - the paseo repo (PASEO_REPO_DIR or ~/PROJECTS/SANDBOX/paseo) with its
 *   server build present (packages/server/dist/scripts/supervisor-entrypoint.*)
 *
 * Exit code is non-zero when anything is missing, so it can gate dev startup.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'

const paseoRepoDefault = join(homedir(), 'PROJECTS', 'SANDBOX', 'paseo')

const paseoCheck = checkPaseoRepo()
const checks = [checkDsh(), checkNode(), checkPnpm(paseoCheck), paseoCheck]

let missing = 0
for (const check of checks) {
  if (check.ok) {
    console.log(`  ok    ${check.label}: ${check.detail}`)
  } else {
    missing += 1
    console.error(`  MISS  ${check.label}: ${check.detail}`)
    for (const line of check.fix) {
      console.error(`        ${line}`)
    }
  }
}

if (missing > 0) {
  console.error(
    `\n[agent-runtimes] ${missing} requirement(s) missing — the DeepSeek Harness / Paseo views will show a start error until these are installed.`
  )
  process.exit(1)
}
console.log(
  '\n[agent-runtimes] All agent runtimes present: DeepSeek Harness and Paseo views are ready.'
)

function checkDsh() {
  const bin = resolveDshBin()
  if (bin) {
    return { ok: true, label: 'dsh (DeepSeek Harness)', detail: bin, fix: [] }
  }
  return {
    ok: false,
    label: 'dsh (DeepSeek Harness)',
    detail: 'binary not found (PATH / npm global prefix / DSH_BIN)',
    fix: [
      'Install:  npm install -g dsh-terminal-plugin',
      'Setup:    dsh setup <deepseek-harness-dir>   # e.g. git clone https://github.com/deepseek-ai/deepseek-harness',
      'Override: export DSH_BIN=/path/to/dsh'
    ]
  }
}

function checkNode() {
  const bin =
    process.env.PASEO_NODE_BIN?.trim() ||
    (process.env.PATH ?? '')
      .split(delimiter)
      .map((dir) => join(dir, 'node'))
      .find((candidate) => existsSync(candidate))
  if (bin) {
    return { ok: true, label: 'node (Paseo daemon)', detail: bin, fix: [] }
  }
  return {
    ok: false,
    label: 'node (Paseo daemon)',
    detail: 'not on PATH (PASEO_NODE_BIN override is honored)',
    fix: [
      'Install Node.js 24:  https://nodejs.org/',
      'Override: export PASEO_NODE_BIN=/path/to/node'
    ]
  }
}

// Why: pnpm is only needed to (re)build the paseo repo; a repo that already
// has its server build runs fine without pnpm on the machine.
function checkPnpm(paseoCheck) {
  const bin = (process.env.PATH ?? '')
    .split(delimiter)
    .map((dir) => join(dir, 'pnpm'))
    .find((c) => existsSync(c))
  if (bin) {
    return { ok: true, label: 'pnpm (paseo repo build)', detail: bin, fix: [] }
  }
  if (paseoCheck.ok) {
    return {
      ok: true,
      label: 'pnpm (paseo repo build)',
      detail: 'not needed (repo already built)',
      fix: []
    }
  }
  return {
    ok: false,
    label: 'pnpm (paseo repo build)',
    detail: 'not on PATH',
    fix: ['Install:  npm install -g pnpm']
  }
}

function checkPaseoRepo() {
  const repo = process.env.PASEO_REPO_DIR?.trim() || paseoRepoDefault
  const entrypoint = [
    join(repo, 'packages', 'server', 'dist', 'scripts', 'supervisor-entrypoint.js'),
    join(repo, 'packages', 'server', 'dist', 'scripts', 'supervisor-entrypoint.cjs')
  ].find((candidate) => existsSync(candidate))
  if (entrypoint) {
    return { ok: true, label: 'paseo repo', detail: `${repo} (${entrypoint})`, fix: [] }
  }
  if (!existsSync(repo)) {
    return {
      ok: false,
      label: 'paseo repo',
      detail: `not found at ${repo}`,
      fix: [
        `Clone it there, or point elsewhere:  export PASEO_REPO_DIR=/path/to/paseo`,
        `    git clone <your-paseo-repo> ${repo}`,
        `    cd ${repo} && pnpm install`
      ]
    }
  }
  return {
    ok: false,
    label: 'paseo repo',
    detail: `found at ${repo} but server build missing`,
    fix: [`Run inside ${repo}:  pnpm build:server && pnpm build:daemon-web-ui`]
  }
}

// Mirrors resolveDshBin() in src/main/deepseek/deepseek-web-manager.ts
function resolveDshBin() {
  const override = process.env.DSH_BIN?.trim()
  if (override && existsSync(override)) {
    return override
  }
  const names = process.platform === 'win32' ? ['dsh.cmd', 'dsh.exe', 'dsh'] : ['dsh']
  const pathDirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean)
  for (const dir of pathDirs) {
    for (const name of names) {
      const candidate = join(dir, name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  const npmGlobalCandidates = [
    process.env.NPM_CONFIG_PREFIX,
    join(homedir(), '.npm-global'),
    join(homedir(), 'node_modules')
  ].filter(Boolean)
  for (const prefix of npmGlobalCandidates) {
    for (const name of names) {
      const candidate = join(prefix, 'bin', name)
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }
  // Why: nvm-style installs put global bins under the nvm node prefix; the fixed
  // candidate list misses it, but `npm prefix -g` reports the real prefix.
  try {
    const prefix = execFileSync('npm', ['prefix', '-g'], {
      encoding: 'utf8',
      timeout: 3_000
    }).trim()
    if (prefix) {
      for (const name of names) {
        const candidate = join(prefix, 'bin', name)
        if (existsSync(candidate)) {
          return candidate
        }
      }
    }
  } catch {
    // npm unavailable — PATH/DSH_BIN still apply
  }
  return null
}
