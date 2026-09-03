#!/usr/bin/env node
/**
 * got-plan — Graph of Thoughts planner for a task.
 *
 * Context is adaptive:
 *   - default: build a compact DOCS INDEX from docs/ + README (file list +
 *     headings). If the repo has no docs, plan is fully general (real-world
 *     problem reasoning, no codebase assumptions).
 *   - --codebase: old behavior — walk the source tree and ground the plan in
 *     actual file/folder layout.
 *
 * Usage:
 *   node tools/got-plan.mjs "create payment gateway module"
 *   node tools/got-plan.mjs "add retry to glab calls" --save plan.md
 *   node tools/got-plan.mjs --task-file task.txt --codebase
 *
 * Flags:
 *   --cwd <path>    set the repo root to scan (default: current dir)
 *   --save <path>   write the full plan (markdown) to a file
 *   --tree          print the scanned context (docs or codebase) and exit
 *   --dry-run       print the prompt and exit (no pi call)
 *   --codebase      ground the plan in source-tree structure (not docs)
 *   --max-depth N   limit codebase tree depth (default 2; only with --codebase)
 *   --timeout N     pi call timeout in seconds (default 120)
 *   --model M       pi --model override (e.g. cx/gpt-5.6-luna, deepseek-v4-flash)
 *   --thinking T    pi thinking level (default low)
 */

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const CWD = process.cwd()

// ── args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2)
function flag(name) {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const hasFlag = (name) => argv.includes(`--${name}`)
const savePath = flag('save')
const maxDepth = Number(flag('max-depth') ?? '2')
const timeoutSec = Number(flag('timeout') ?? '120')
const taskFromFile = flag('task-file')
const positional = argv.filter((a) => !a.startsWith('--'))
const modelOverride = flag('model')
const thinkingLevel = flag('thinking') ?? 'low'
const SCAN_ROOT = flag('cwd') ? resolve(flag('cwd')) : CWD

// ── codebase scan (opt-in via --codebase) ──────────────────────────────
const IGNORED = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  'build',
  'coverage',
  '.cache',
  'resources',
  'native',
  'mobile',
  'tests',
  '.github',
  'Casks',
  'sandbox',
  '.commandcode',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock'
])
const MAX_ENTRIES_PER_DIR = 18
const TEST_RE = /\.(test|spec)\.(ts|tsx|js|mjs)$/

function walkTree(dir, depth) {
  if (depth > maxDepth) {
    return null
  }
  let names
  try {
    names = readdirSync(dir, { withFileTypes: true }).map((d) => d.name)
  } catch {
    return null
  }
  names.sort()
  const children = []
  for (const name of names) {
    if (IGNORED.has(name)) {
      continue
    }
    const p = join(dir, name)
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) {
      const sub = walkTree(p, depth + 1)
      if (sub) {
        children.push({ name, type: 'dir', children: sub })
      }
    } else if (/\.(ts|tsx|js|mjs|json|css)$/.test(name) && !TEST_RE.test(name)) {
      children.push({ name, type: 'file' })
    }
  }
  if (children.length > MAX_ENTRIES_PER_DIR) {
    const shown = children.slice(0, MAX_ENTRIES_PER_DIR)
    shown.push({ name: `… (+${children.length - MAX_ENTRIES_PER_DIR} more)`, type: 'ellipsis' })
    return shown
  }
  return children
}

function renderTree(nodes, prefix = '') {
  const lines = []
  for (const node of nodes) {
    const isLast = nodes.at(-1) === node
    const branch = isLast ? '└── ' : '├── '
    lines.push(`${prefix}${branch}${node.name}${node.type === 'dir' ? '/' : ''}`)
    if (node.type === 'dir' && node.children?.length) {
      lines.push(renderTree(node.children, prefix + (isLast ? '    ' : '│   ')).join('\n'))
    }
  }
  return lines
}

function scanCodebase() {
  const looksLikeRepoRoot =
    existsSync(join(SCAN_ROOT, '.git')) || existsSync(join(SCAN_ROOT, 'package.json'))
  const named = ['src', 'config', 'scripts', 'tools', 'docs']
  const dirs = looksLikeRepoRoot
    ? named
        .map((name) => join(SCAN_ROOT, name))
        .filter((p) => existsSync(p) && statSync(p).isDirectory())
    : [SCAN_ROOT]
  const blocks = []
  for (const dir of dirs) {
    const tree = walkTree(dir, 0)
    if (tree?.length) {
      const rel = relative(SCAN_ROOT, dir) || '.'
      blocks.push(`## ${rel}/\n\`\`\`\n${renderTree(tree).join('\n')}\n\`\`\``)
    }
  }
  return blocks.join('\n\n')
}

function readManifest() {
  const p = join(SCAN_ROOT, 'package.json')
  if (!existsSync(p)) {
    return null
  }
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function buildSnapshot() {
  const pkg = readManifest()
  const lines = []
  lines.push(`Project root: ${SCAN_ROOT}`)
  if (pkg?.dependencies) {
    const deps = Object.keys(pkg.dependencies)
    lines.push(
      `Dependencies (${deps.length}): ${deps.slice(0, 20).join(', ')}${deps.length > 20 ? ', …' : ''}`
    )
  }
  return lines.join('\n')
}

// ── prompt build ────────────────────────────────────────────────────────
function buildGeneralPrompt(task) {
  return [
    `You are a planning assistant. Produce a Graph of Thoughts (GoT) plan for the task below as a GENERAL REAL-WORLD PROBLEM.`,
    task.trim(),
    ``,
    `=== INSTRUCTIONS ===`,
    `1. Brief problem framing (2-3 sentences): what the task needs, key constraints, and the main design tensions.`,
    `2. Build a Graph of Thoughts: 3-6 thought-NODES. Each node is one self-contained unit:`,
    `   id, short title, one-line goal, what it produces, and dependencies (edges).`,
    `   Use distinct PARALLEL branches where nodes are independent, and MERGE points where`,
    `   branches feed a common decision. Cover options/alternatives as separate nodes when`,
    `   the choice matters (e.g. provider A vs B, sync vs async, monolith vs split).`,
    `3. Evaluate each node: verdict (PASS / FAIL / REWORK) + one-line reasoning.`,
    `4. Aggregate: pick the recommended path (topological order) and list the final deliverables.`,
    `5. END your answer with a fenced \`\`\`mermaid block ONLY containing the GoT flowchart:`,
    `   graph TD, one node per thought-node (label: id + short title + verdict), edges for`,
    `   dependencies, style the recommended-path nodes. No text outside the mermaid fence.`,
    ``,
    `### Required final section:`,
    `\`\`\`mermaid`,
    `graph TD`,
    `    ...`,
    `\`\`\``,
    ``,
    `Keep the whole answer under 130 lines.`
  ].join('\n')
}

function buildCodebasePrompt(task, snapshot, tree) {
  return [
    `You are planning in an existing codebase. Produce a Graph of Thoughts (GoT) plan for the task below, grounded in the ACTUAL repository structure provided.`,
    ``,
    `=== TASK ===`,
    task.trim(),
    ``,
    `=== CODEBASE SNAPSHOT ===`,
    snapshot,
    ``,
    `=== CODEBASE STRUCTURE (tree) ===`,
    tree,
    ``,
    `=== INSTRUCTIONS ===`,
    `1. Briefly scan-reason over the structure: identify layers/folders, module patterns, conventions. State in 2-3 sentences HOW the new work should slot in.`,
    `2. Build a Graph of Thoughts: 3-6 thought-NODES (schema/types, core logic, bridge, UI, tests, docs…). Each node: id, title, one-line goal, concrete files/paths, dependencies.`,
    `3. Evaluate each node: verdict (PASS / FAIL / REWORK) + one-line reasoning.`,
    `4. Aggregate: recommended execution path (topological order).`,
    `5. END with a fenced \`\`\`mermaid block ONLY containing the GoT flowchart (graph TD, one node per thought-node with verdict, edges for deps, style recommended path).`,
    ``,
    `### Required final section:`,
    `\`\`\`mermaid`,
    `graph TD`,
    `    ...`,
    `\`\`\``,
    ``,
    `Keep the whole answer under 130 lines.`
  ].join('\n')
}

// ── main ────────────────────────────────────────────────────────────────
function main() {
  const task = taskFromFile
    ? readFileSync(resolve(taskFromFile), 'utf8').trim()
    : positional.join(' ').trim()

  if (!task) {
    console.error(
      'usage: node tools/got-plan.mjs "task description" [--save out.md] [--codebase] [--tree]'
    )
    process.exit(1)
  }

  const codebaseMode = hasFlag('codebase')

  if (codebaseMode) {
    const snapshot = buildSnapshot()
    const tree = scanCodebase()
    if (hasFlag('tree')) {
      console.log(snapshot)
      console.log('')
      console.log(tree)
      return
    }
    const prompt = buildCodebasePrompt(task, snapshot, tree)
    if (hasFlag('dry-run')) {
      console.log(prompt)
      return
    }
    return runPi(task, prompt)
  }

  // Default: fully general real-world planning — no repo scan at all.
  if (hasFlag('tree')) {
    console.log('Default mode: fully general real-world planning (no repo scan).')
    console.log('Use --codebase --tree to scan the codebase structure.')
    return
  }
  const prompt = buildGeneralPrompt(task)
  if (hasFlag('dry-run')) {
    console.log(prompt)
    return
  }
  return runPi(task, prompt)
}

function runPi(task, prompt) {
  const hasPi = (() => {
    const r = spawnSync('which', ['pi'], { stdio: 'ignore' })
    return r.status === 0
  })()

  if (!hasPi) {
    // No pi binary — print the prompt so it can be pasted anywhere.
    console.log('// no `pi` binary found — here is the GoT planning prompt:\n')
    console.log(prompt)
    return
  }

  const piArgs = ['-p', prompt, '--thinking', thinkingLevel]
  if (modelOverride) {
    piArgs.push('--model', modelOverride)
  }

  const result = spawnSync('pi', piArgs, {
    cwd: CWD,
    encoding: 'utf8',
    timeout: timeoutSec * 1000,
    maxBuffer: 4 * 1024 * 1024
  })

  if (result.status !== 0) {
    console.error('pi exited with', result.status)
    console.error(result.stderr)
    process.exit(result.status ?? 1)
  }

  const output = result.stdout.trim()

  if (savePath) {
    const header = [
      `# GoT Plan — ${task}`,
      ``,
      `_Generated: ${new Date().toISOString()}_`,
      `_Repo: ${SCAN_ROOT}_`,
      ``,
      `---`,
      ``
    ].join('\n')
    writeFileSync(resolve(savePath), `${header + output}\n`)
    console.log(`\nSaved to ${savePath}`)
  }

  console.log(output)
}

main()
