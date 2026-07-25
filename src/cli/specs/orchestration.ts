import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS } from '../args'

export const ORCHESTRATION_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['orchestration', 'send'],
    summary: 'Send an inter-agent message',
    usage:
      'orca orchestration send --to <handle> --subject <text> [--from <handle>] [--body <text>] [--type <type>] [--priority <level>] [--thread-id <id>] [--payload <json>] [--task-id <id>] [--dispatch-id <id>] [--files-modified <csv>] [--report-path <path>] [--phase <text>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'to',
      'from',
      'subject',
      'body',
      'type',
      'priority',
      'thread-id',
      'payload',
      'task-id',
      'dispatch-id',
      'files-modified',
      'report-path',
      'phase'
    ],
    notes: [
      'On Windows PowerShell, quote group addresses such as --to "@all" or --to "@worktree:<id>".',
      'worker_done and heartbeat must target a concrete coordinator terminal handle; use status for broadcast updates.',
      'A worker_done with the active task/dispatch IDs completes that task only from the dispatched pane. When stable pane identity is unavailable, the sender handle must exactly match the dispatch assignee; injected preambles include the correct --from value.',
      'Prefer --task-id/--dispatch-id/etc. over raw --payload JSON in worker commands; PowerShell strips JSON quotes easily.'
    ]
  },
  {
    path: ['orchestration', 'check'],
    summary: 'Check messages for a terminal',
    usage:
      'orca orchestration check [--terminal <handle>] [--unread | --peek | --all] [--types <type,...>] [--inject] [--wait] [--timeout-ms <n>] [--json]\n' +
      '  --unread (default): return only unread messages and mark them read.\n' +
      '  --peek: return only unread messages without marking them read.\n' +
      '  --all: return every message for the handle; does not mark read.\n' +
      '  --wait: block until a matching message arrives or --timeout-ms expires.\n' +
      '          Emits JSON keepalive lines to stderr every 15s so the caller can\n' +
      '          tell the process is alive. `_keepalive` is unrelated to heartbeat\n' +
      '          messages; `_heartbeat` remains as a deprecated compatibility alias.\n' +
      '          Filter with `jq "select(._keepalive|not)"` when merging streams.',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'terminal',
      'unread',
      'peek',
      'all',
      'types',
      'inject',
      'wait',
      'timeout-ms'
    ],
    notes: [
      'On Windows PowerShell, quote comma-separated type filters, e.g. --types "worker_done,escalation".'
    ]
  },
  {
    path: ['orchestration', 'reply'],
    summary: 'Reply to a message',
    usage: 'orca orchestration reply --id <msg_id> --body <text> [--from <handle>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'body', 'from']
  },
  {
    path: ['orchestration', 'inbox'],
    summary: 'Show messages across (or for) recipients',
    usage: 'orca orchestration inbox [--limit <n>] [--terminal <handle>] [--full] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'limit', 'terminal', 'full']
  },
  {
    path: ['orchestration', 'task-create'],
    summary: 'Create an orchestration task',
    usage:
      'orca orchestration task-create --spec <text> [--task-title <text>] [--display-name <text>] [--deps <json_array>] [--parent <task_id>] [--priority <level>] [--repo <id>] [--project <id>] [--worktree <id>] [--host <id>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'spec',
      'task-title',
      'display-name',
      'deps',
      'parent',
      'priority',
      'repo',
      'project',
      'worktree',
      'host'
    ],
    notes: [
      'Tasks live in app userData (orchestration.db), not inside the worktree folder.',
      '--repo/--project are stable subject scope; --worktree/--host are mutable execution bindings.',
      'Valid --priority values: low, medium, high, urgent (default medium).'
    ]
  },
  {
    path: ['orchestration', 'task-list'],
    summary: 'List orchestration tasks',
    usage:
      'orca orchestration task-list [--status <status>] [--ready] [--brief] [--priority <level>] [--repo <id>] [--project <id>] [--worktree <id>] [--host <id>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'status',
      'ready',
      'brief',
      'priority',
      'repo',
      'project',
      'worktree',
      'host'
    ],
    notes: [
      '--brief collapses whitespace and caps each spec at 160 characters.',
      'Results are ordered by priority (urgent→low) then created_at.'
    ]
  },
  {
    path: ['orchestration', 'task-update'],
    summary: 'Update a task status',
    usage:
      'orca orchestration task-update --id <task_id> --status <status> [--result <json>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'status', 'result'],
    notes: ['Valid --status values: pending, ready, dispatched, completed, failed, blocked.']
  },
  {
    path: ['orchestration', 'task-stop'],
    summary: 'Stop a task (or whole product pipeline) and release active dispatch',
    usage: 'orca orchestration task-stop --id <task_id> [--reason <text>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'reason'],
    notes: [
      'Marks the task failed and fails any active dispatch so it will not complete later.',
      'If --id is a product-pipeline root, all active child stages are stopped and the supervisor unwatches it.'
    ]
  },
  {
    path: ['orchestration', 'task-delete'],
    summary: 'Delete a task (or whole product pipeline) from orchestration.db',
    usage: 'orca orchestration task-delete --id <task_id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id'],
    notes: [
      'Hard-deletes the task row plus related dispatch contexts and gates.',
      'Deleting a product-pipeline root also deletes all stage children.'
    ]
  },
  {
    path: ['orchestration', 'task-retry'],
    summary: 'Retry a stopped/failed/hung task (reopen + re-dispatch)',
    usage:
      'orca orchestration task-retry --id <task_id> [--reason <text>] [--squad <id>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'reason', 'squad', 'assign', 'inject'],
    notes: [
      'Reopens failed/stopped tasks (and failed pipeline stages for roots).',
      'Re-watches product supervisor for pipeline roots.',
      'Spawns a squad agent and injects the dispatch preamble by default.'
    ]
  },
  {
    path: ['orchestration', 'task-comment'],
    summary: 'Add a comment to a task thread (notifies in-charge agent / @mentions by default)',
    usage:
      'orca orchestration task-comment --task <task_id> --body <text> [--author <name>] [--role <role>] [--parent <comment_id>] [--reassign] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'task',
      'body',
      'author',
      'role',
      'parent',
      'from',
      'reassign'
    ],
    notes: [
      'Mentions: @term_handle, @squad:backend, @role:tester.',
      'Default: inject follow-up into the in-charge agent terminal.',
      'Completed/failed tasks reopen + re-dispatch; --reassign forces a fresh dispatch when ready.'
    ]
  },
  {
    path: ['orchestration', 'task-thread'],
    summary: 'Show task thread (comments + agents in charge / pipeline roster)',
    usage: 'orca orchestration task-thread --task <task_id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'task']
  },
  {
    path: ['orchestration', 'task-scope'],
    summary: 'Update task priority or scope pointers (repo/project/worktree/host)',
    usage:
      'orca orchestration task-scope --id <task_id> [--priority <level>] [--repo <id>] [--project <id>] [--worktree <id>] [--host <id>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'id',
      'priority',
      'repo',
      'project',
      'worktree',
      'host'
    ],
    notes: [
      'Pass an empty string for --repo/--project/--worktree/--host to clear that pointer.',
      'Use this to rebind execution after a worktree is deleted; do not recreate the task.'
    ]
  },
  {
    path: ['orchestration', 'task-assign-squad'],
    summary: 'Assign a ready task to a squad (resolve/spawn agent + inject dispatch)',
    usage:
      'orca orchestration task-assign-squad --task <task_id> --squad <id|name> [--worktree <selector>] [--from <handle>] [--no-inject] [--no-spawn] [--wait-timeout-ms <n>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'task',
      'squad',
      'worktree',
      'from',
      'no-inject',
      'no-spawn',
      'wait-timeout-ms'
    ],
    notes: [
      'Uses Settings → Orchestration squads (routing: leader_decide | idle_first | round_robin).',
      'Default: spawn a squad agent terminal in the task worktree if none is live, wait for tui-idle, then inject.',
      'Task must be ready and should have worktree scope (or pass --worktree).'
    ]
  },
  {
    path: ['orchestration', 'product-start'],
    summary:
      'Full product pipeline: worktree (+ optional issue) + research→implement→test→review loop',
    usage:
      'orca orchestration product-start --goal <text> --repo <selector> [--title <text>] [--worktree <selector>] [--base-branch <ref>] [--create-issue] [--no-auto-dispatch] [--no-ensure-squads] [--wait-timeout-ms <n>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'goal',
      'repo',
      'title',
      'worktree',
      'base-branch',
      'create-issue',
      'no-auto-dispatch',
      'no-ensure-squads',
      'wait-timeout-ms',
      'priority'
    ],
    notes: [
      'Creates an isolated worktree (unless --worktree is set), optional GitHub issue, and a multi-role DAG.',
      'Stages: researcher → implementer → tester → reviewer. FAIL reworks implement (max 3).',
      'Seeds Settings squads researcher/backend/tester/reviewer when missing.',
      'Default auto-dispatches ready stages (research first). Use product-tick after worker_done to continue.'
    ]
  },
  {
    path: ['orchestration', 'product-tick'],
    summary: 'Dispatch any ready product-pipeline stages (continue the loop)',
    usage:
      'orca orchestration product-tick --pipeline <pipeline_id> [--wait-timeout-ms <n>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'pipeline', 'wait-timeout-ms'],
    notes: [
      'Usually unnecessary: product-start installs a supervisor that ticks automatically.',
      'pipeline id is the root task id returned by product-start.'
    ]
  },
  {
    path: ['orchestration', 'product-watch'],
    summary: 'Watch a product pipeline (auto-tick + hung recovery until done)',
    usage:
      'orca orchestration product-watch --pipeline <pipeline_id> [--poll-interval-ms <n>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'pipeline', 'poll-interval-ms']
  },
  {
    path: ['orchestration', 'product-unwatch'],
    summary: 'Stop watching one product pipeline',
    usage: 'orca orchestration product-unwatch --pipeline <pipeline_id> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'pipeline']
  },
  {
    path: ['orchestration', 'product-supervisor'],
    summary: 'Show product supervisor status (active pipelines, last tick)',
    usage: 'orca orchestration product-supervisor [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['orchestration', 'product-stop'],
    summary: 'Stop the product supervisor loop (all pipelines)',
    usage: 'orca orchestration product-stop [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['orchestration', 'dispatch'],
    summary: 'Dispatch a task to a terminal',
    usage:
      'orca orchestration dispatch --task <task_id> --to <handle> [--from <handle>] [--inject] [--dry-run] [--return-preamble] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'task', 'to', 'from', 'inject', 'dry-run', 'return-preamble']
  },
  {
    path: ['orchestration', 'dispatch-show'],
    summary: 'Show dispatch context for a task',
    usage:
      'orca orchestration dispatch-show --task <task_id> [--preamble] [--from <handle>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'task', 'preamble', 'from']
  },
  {
    path: ['orchestration', 'ask'],
    summary: 'Ask the coordinator a question and block until answered',
    usage:
      'orca orchestration ask --to <handle> --question <text> [--options <csv>] [--timeout-ms <n>] [--from <handle>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'to', 'question', 'options', 'timeout-ms', 'from']
  },
  {
    path: ['orchestration', 'run'],
    summary: 'Start the coordinator loop',
    usage:
      'orca orchestration run --spec <text> [--from <handle>] [--poll-interval-ms <n>] [--max-concurrent <n>] [--worktree <selector>] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'spec',
      'from',
      'poll-interval-ms',
      'max-concurrent',
      'worktree'
    ]
  },
  {
    path: ['orchestration', 'run-stop'],
    summary: 'Stop the active coordinator run',
    usage: 'orca orchestration run-stop [--json]',
    allowedFlags: [...GLOBAL_FLAGS]
  },
  {
    path: ['orchestration', 'gate-create'],
    summary: 'Create a decision gate blocking a task',
    usage:
      'orca orchestration gate-create --task <task_id> --question <text> [--options <json_array>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'task', 'question', 'options']
  },
  {
    path: ['orchestration', 'gate-resolve'],
    summary: 'Resolve a pending decision gate',
    usage: 'orca orchestration gate-resolve --id <gate_id> --resolution <text> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'id', 'resolution']
  },
  {
    path: ['orchestration', 'gate-list'],
    summary: 'List decision gates',
    usage: 'orca orchestration gate-list [--task <task_id>] [--status <status>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'task', 'status']
  },
  {
    path: ['orchestration', 'reset'],
    summary: 'Reset orchestration state (one scope; bare command resets all)',
    usage: 'orca orchestration reset [--all | --tasks | --messages] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'all', 'tasks', 'messages']
  }
]
