/**
 * Interactive Strands coding agent hosted by `orca strands`.
 * Why: gives Orca a non-Claude/non-Pi agent that can chat, call tools, and edit the repo.
 */
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import {
  resolveStrandsApiKey,
  resolveStrandsModelId,
  resolveStrandsOpenAiBaseUrl,
  resolveStrandsProvider,
  type StrandsProvider
} from '../shared/strands-model-config'
import { ensureStrandsEnvLoaded } from '../shared/strands-env-load'

function extractStreamText(event: {
  type?: string
  event?: { type?: string; delta?: unknown }
}): string {
  if (event.type !== 'modelStreamUpdateEvent') {
    return ''
  }
  const inner = event.event
  if (!inner || inner.type !== 'modelContentBlockDeltaEvent') {
    return ''
  }
  const delta = inner.delta as { type?: string; text?: string } | undefined
  if (delta?.type === 'textDelta' && typeof delta.text === 'string') {
    return delta.text
  }
  return ''
}

function toolLabel(event: {
  type?: string
  toolUse?: { name?: string; input?: unknown }
}): string | null {
  if (event.type === 'beforeToolCallEvent' && event.toolUse?.name) {
    return event.toolUse.name
  }
  return null
}

async function createAgent(cwd: string): Promise<{
  agent: {
    stream: (prompt: string) => AsyncIterable<{ type?: string; event?: unknown; toolUse?: unknown }>
  }
  provider: StrandsProvider
  modelId: string
}> {
  ensureStrandsEnvLoaded()
  // Why: load Strands only when launching — keeps the main CLI surface free of the SDK weight.
  const { Agent } = await import('@strands-agents/sdk')
  const { fileEditor } = await import('@strands-agents/sdk/vended-tools/file-editor')
  const { bash } = await import('@strands-agents/sdk/vended-tools/bash')
  const { httpRequest } = await import('@strands-agents/sdk/vended-tools/http-request')
  const { notebook } = await import('@strands-agents/sdk/vended-tools/notebook')

  const provider = resolveStrandsProvider()
  const modelId = resolveStrandsModelId(provider)
  let model: unknown

  if (provider === 'anthropic') {
    const { AnthropicModel } = await import('@strands-agents/sdk/models/anthropic')
    model = new AnthropicModel({
      apiKey: resolveStrandsApiKey('anthropic'),
      modelId,
      maxTokens: 16_384
    })
  } else if (provider === 'openai') {
    const { OpenAIModel } = await import('@strands-agents/sdk/models/openai')
    model = new OpenAIModel({
      api: 'chat',
      apiKey: resolveStrandsApiKey('openai'),
      modelId,
      maxTokens: 16_384,
      clientConfig: {
        baseURL: resolveStrandsOpenAiBaseUrl()
      }
    })
  }
  // bedrock: omit model so Agent uses default Bedrock provider + modelId string when set

  const systemPrompt = [
    'You are Strands, a coding agent inside Orca.',
    'You can chat with the user, call tools, edit files, and run shell commands in the project.',
    `Working directory: ${cwd}`,
    'Prefer small, reviewable edits. Do not force-push or open PRs unless asked.',
    'When fixing a GitLab/GitHub issue, stay scoped to that issue and explain what you change.'
  ].join('\n')

  const agent = new Agent({
    ...(model ? { model: model as never } : modelId ? { model: modelId } : {}),
    tools: [fileEditor, bash, httpRequest, notebook],
    systemPrompt,
    // Why: we stream deltas ourselves so tool lines stay readable in the Orca terminal.
    printer: false
  })

  return { agent, provider, modelId }
}

async function runPrompt(
  agent: {
    stream: (prompt: string) => AsyncIterable<{ type?: string; event?: unknown; toolUse?: unknown }>
  },
  prompt: string
): Promise<void> {
  let wroteText = false
  for await (const event of agent.stream(prompt)) {
    const tool = toolLabel(event as { type?: string; toolUse?: { name?: string } })
    if (tool) {
      if (wroteText) {
        output.write('\n')
        wroteText = false
      }
      output.write(`\x1b[36m▸ tool\x1b[0m ${tool}\n`)
      continue
    }
    const text = extractStreamText(
      event as { type?: string; event?: { type?: string; delta?: unknown } }
    )
    if (text) {
      output.write(text)
      wroteText = true
    }
  }
  if (wroteText) {
    output.write('\n')
  }
}

function printBanner(provider: StrandsProvider, modelId: string, cwd: string): void {
  output.write(`\x1b[1mStrands\x1b[0m · ${provider}/${modelId}\n`)
  output.write(`cwd ${cwd}\n`)
  output.write('Chat, tools, and project edits are enabled. Type /exit to quit.\n\n')
}

/**
 * Entry used by `orca strands [prompt...]`.
 * Positional args become a one-shot prompt; otherwise opens a REPL.
 */
export async function runStrandsAgent(argv: string[], cwd = process.cwd()): Promise<void> {
  if (argv.some((arg) => arg === '--help' || arg === '-h')) {
    output.write(
      'Usage: orca strands [prompt...]\n\n' +
        'Interactive coding agent powered by the Strands Agents SDK.\n' +
        'Tools: file-editor, bash, http-request, notebook.\n\n' +
        'Auth (prefer .env.local):\n' +
        '  ORCA_STRANDS_API_KEY / OPENAI_API_KEY   OpenAI-compatible (default)\n' +
        '  ORCA_STRANDS_BASE_URL                   default https://llmproxy.ikamai.com/v1\n' +
        '  ORCA_STRANDS_MODEL                      default cline2/deepseek/deepseek-v4-flash\n' +
        '  ANTHROPIC_API_KEY                       Anthropic\n' +
        '  AWS credentials                         Amazon Bedrock\n\n' +
        'Optional:\n' +
        '  ORCA_STRANDS_PROVIDER=openai|anthropic|bedrock\n'
    )
    return
  }

  const promptArgs = argv.filter((arg) => arg !== '--' && !arg.startsWith('-'))
  const oneShot = promptArgs.join(' ').trim()

  let created: Awaited<ReturnType<typeof createAgent>>
  try {
    created = await createAgent(cwd)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    output.write(`Failed to start Strands agent: ${message}\n`)
    output.write(
      'Set ORCA_STRANDS_API_KEY (or OPENAI_API_KEY) for the llmproxy gateway,\n' +
        'or ANTHROPIC_API_KEY / AWS credentials. See `orca strands --help`.\n'
    )
    process.exitCode = 1
    return
  }

  const { agent, provider, modelId } = created
  printBanner(provider, modelId, cwd)

  if (oneShot) {
    try {
      await runPrompt(agent, oneShot)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      output.write(`\nStrands error: ${message}\n`)
      process.exitCode = 1
    }
    return
  }

  if (!input.isTTY) {
    output.write('No prompt provided and stdin is not a TTY.\n')
    process.exitCode = 1
    return
  }

  const rl = readline.createInterface({ input, output, terminal: true })
  try {
    for (;;) {
      const line = (await rl.question('\x1b[32myou>\x1b[0m ')).trim()
      if (!line) {
        continue
      }
      if (line === '/exit' || line === '/quit' || line === 'exit' || line === 'quit') {
        break
      }
      try {
        output.write('\x1b[35mstrands>\x1b[0m ')
        await runPrompt(agent, line)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        output.write(`\nStrands error: ${message}\n`)
      }
    }
  } finally {
    rl.close()
  }
}
