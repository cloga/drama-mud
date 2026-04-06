import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import type { CharacterConfig, GameConfig, Message, Scene } from '@drama-mud/engine'
import { buildRecentNpcContext } from '../npc-context-window.js'

const moduleDir = fileURLToPath(new URL('.', import.meta.url))
export const DEFAULT_WORKSPACE_ROOT = resolve(moduleDir, '..', '..', '..')
export const DEFAULT_RUNTIME_CLI_PATH = join(DEFAULT_WORKSPACE_ROOT, '.optimus', 'dist', 'runtime-cli.js')
export const DEFAULT_RUNTIME_HTTP_BASE_URL = 'http://127.0.0.1:3100'

export interface RuntimeSessionRef {
  agentId?: string
  sessionId?: string
}

export interface NpcTurnDecision {
  decision: 'silent' | 'respond'
  reply?: string
  reason?: string
}

export interface NpcTurnResult extends NpcTurnDecision {
  runtimeSession: RuntimeSessionRef
}

export interface RunNpcTurnInput {
  roomId: string
  game: GameConfig
  scene: Scene
  worldMd: string
  npc: CharacterConfig
  recentMessages: Message[]
  latestPlayerMessage: {
    playerName: string
    characterName: string
    content: string
  }
}

export interface RuntimeCharacterTurnInput extends RunNpcTurnInput {
  agentId?: string
}

export interface CharacterTurnResult extends NpcTurnDecision {
  agentId?: string
  sessionId?: string
}

export interface NpcTurnAdapter {
  runTurn(input: RunNpcTurnInput, session?: RuntimeSessionRef): Promise<NpcTurnResult>
}

interface RuntimeRequest {
  role: string
  role_engine?: string
  role_model?: string
  agent_id?: string
  session_id?: string
  workspace_path: string
  instructions: string
  input: Record<string, unknown>
  output_schema?: Record<string, unknown>
  runtime_policy: {
    mode: 'sync'
    timeout_ms: number
    retries?: number
    fallback_engines?: string[]
  }
}

interface RuntimeEnvelope {
  status: string
  result?: unknown
  error_code?: string
  error_message?: string
  action_required?: string
  runtime_metadata?: {
    agent_id?: string
    session_id?: string
  }
}

export interface OptimusRuntimeAdapterConfig {
  workspaceRoot?: string
  transport?: 'http' | 'cli'
  baseUrl?: string
  fallbackTransport?: 'cli'
  cliPath?: string
  nodePath?: string
  timeoutMs?: number
  role?: string
  roleEngine?: string
  roleModel?: string
  fallbackModels?: string[]
  fallbackEngines?: string[]
  runner?: RuntimeRequestRunner
}

export type RuntimeRequestRunner = (request: RuntimeRequest) => Promise<RuntimeEnvelope>

const runtimeDecisionSchema = z
  .object({
    decision: z.enum(['silent', 'respond']),
    reply: z.string().optional(),
    reason: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.decision === 'respond' && !value.reply?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reply'],
        message: 'reply is required when decision is "respond"',
      })
    }
  })

const runtimeEnvelopeSchema = z.object({
  status: z.string(),
  result: z.unknown().optional(),
  error_code: z.string().optional(),
  error_message: z.string().optional(),
  action_required: z.string().optional(),
  runtime_metadata: z
    .object({
      agent_id: z.string().optional(),
      session_id: z.string().optional(),
    })
    .optional(),
})

export class OptimusRuntimeError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: { stderr?: string; status?: string; exitCode?: number; cause?: unknown },
  ) {
    super(message)
    this.name = 'OptimusRuntimeError'
  }
}

export class OptimusRuntimeNpcAdapter implements NpcTurnAdapter {
  protected readonly workspaceRoot: string
  private readonly timeoutMs: number
  private readonly role: string
  private readonly roleEngine?: string
  private readonly roleModels: string[]
  private readonly fallbackEngines?: string[]
  private readonly runner: RuntimeRequestRunner

  constructor(config: OptimusRuntimeAdapterConfig = {}) {
    this.workspaceRoot = config.workspaceRoot ?? DEFAULT_WORKSPACE_ROOT
    this.timeoutMs = config.timeoutMs ?? 180_000
    this.role = config.role ?? 'dev'
    this.roleEngine = config.roleEngine
    this.roleModels = normalizeModelSequence(config.roleModel ?? 'gpt-5.4-mini', config.fallbackModels)
    this.fallbackEngines = config.fallbackEngines?.filter(Boolean)
    this.runner =
      config.runner ??
      createRuntimeRunner({
        workspaceRoot: this.workspaceRoot,
        transport: config.transport ?? 'http',
        baseUrl: config.baseUrl ?? DEFAULT_RUNTIME_HTTP_BASE_URL,
        fallbackTransport: config.fallbackTransport,
        cliPath: config.cliPath ?? DEFAULT_RUNTIME_CLI_PATH,
        nodePath: config.nodePath ?? process.execPath,
        timeoutMs: this.timeoutMs,
      })
  }

  async runTurn(input: RunNpcTurnInput, session?: RuntimeSessionRef): Promise<NpcTurnResult> {
    let lastError: unknown

    for (const [index, roleModel] of this.roleModels.entries()) {
      const activeSession = index === 0 ? session : undefined

      try {
        return this.toTurnResult(await this.executeRuntime(input, activeSession, roleModel), activeSession)
      } catch (error) {
        if (shouldRetryFreshSession(error, activeSession)) {
          try {
            return this.toTurnResult(await this.executeRuntime(input, undefined, roleModel), undefined)
          } catch (retryError) {
            error = retryError
          }
        }

        lastError = error
        if (index === this.roleModels.length - 1 || !shouldFallbackModel(error)) {
          throw error
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('No runtime model produced a usable response.')
  }

  protected async executeRuntime(
    input: RunNpcTurnInput,
    session?: RuntimeSessionRef,
    roleModel?: string,
  ): Promise<RuntimeEnvelope> {
    const recentMessages = buildRecentNpcContext(input.recentMessages)

    return runtimeEnvelopeSchema.parse(
      await this.runner({
        role: this.role,
        role_engine: this.roleEngine,
        role_model: roleModel,
        agent_id: session?.agentId,
        session_id: session?.sessionId,
        workspace_path: this.workspaceRoot,
        instructions: buildNpcTurnInstructions(input),
        input: {
          task: 'Decide whether this NPC should speak this turn. If speaking, provide the exact in-character reply.',
          roomId: input.roomId,
          game: {
            id: input.game.name,
            name: input.game.displayName,
            type: input.game.type,
            description: input.game.description,
          },
          scene: {
            id: input.scene.id,
            name: input.scene.name,
            description: input.scene.description,
          },
          npc: {
            id: input.npc.id,
            name: input.npc.name,
            description: input.npc.description,
            personality: input.npc.personality,
          },
          latestPlayerMessage: input.latestPlayerMessage,
          recentMessages: recentMessages.map((message) => ({
            senderId: message.senderId,
            senderName: message.senderName,
            type: message.type,
            content: message.content,
          })),
          worldSummary: input.worldMd.slice(0, 4_000),
        },
        runtime_policy: {
          // The websocket chat path is still request/response oriented today.
          // Keep runtime turns in sync mode and let the server emit npc_turn_start/end
          // so clients can show pending status before the first npc_chunk arrives.
          mode: 'sync',
          timeout_ms: this.timeoutMs,
          retries: 0,
          fallback_engines: this.fallbackEngines,
        },
      }),
    )
  }

  private toTurnResult(envelope: RuntimeEnvelope, session?: RuntimeSessionRef): NpcTurnResult {
    if (envelope.status !== 'completed') {
      throw toRuntimeError(envelope, this.workspaceRoot)
    }

    const decision = parseDecision(envelope.result)
    return {
      ...decision,
      runtimeSession: {
        agentId: envelope.runtime_metadata?.agent_id ?? session?.agentId,
        sessionId: envelope.runtime_metadata?.session_id ?? session?.sessionId,
      },
    }
  }

  async runNpcTurn(
    input: RunNpcTurnInput & { agentId?: string },
    session?: RuntimeSessionRef,
  ): Promise<CharacterTurnResult> {
    const result = await this.runTurn(input, session ?? { agentId: input.agentId })
    return {
      decision: result.decision,
      reply: result.reply,
      reason: result.reason,
      agentId: result.runtimeSession.agentId,
      sessionId: result.runtimeSession.sessionId,
    }
  }
}

export class OptimusRuntimeClient extends OptimusRuntimeNpcAdapter {}

interface RuntimeCliRunnerConfig {
  workspaceRoot: string
  cliPath: string
  nodePath: string
  timeoutMs: number
}

interface RuntimeHttpRunnerConfig {
  baseUrl: string
  timeoutMs: number
}

interface RuntimeRunnerFactoryConfig extends RuntimeCliRunnerConfig, RuntimeHttpRunnerConfig {
  transport: 'http' | 'cli'
  fallbackTransport?: 'cli'
  cliRunner?: RuntimeRequestRunner
  httpRunner?: RuntimeRequestRunner
}

export function createRuntimeRunner(config: RuntimeRunnerFactoryConfig): RuntimeRequestRunner {
  const fallbackTransport = config.transport === 'http' ? config.fallbackTransport ?? 'cli' : undefined
  const cliRunner = config.cliRunner ?? createRuntimeCliRunner(config)

  if (config.transport === 'cli') {
    return cliRunner
  }

  const httpRunner = config.httpRunner ?? createRuntimeHttpRunner(config)
  if (fallbackTransport !== 'cli') {
    return httpRunner
  }

  return async (request) => {
    try {
      return await httpRunner(request)
    } catch (error) {
      if (!isHttpTransportError(error)) {
        throw error
      }
      return cliRunner(request)
    }
  }
}

export function createRuntimeCliRunner(config: RuntimeCliRunnerConfig): RuntimeRequestRunner {
  return async (request) => {
    await access(config.cliPath, constants.R_OK).catch((error) => {
      throw new OptimusRuntimeError(
        'cli_not_found',
        `Optimus runtime CLI was not found at ${config.cliPath}. Verify .optimus\\dist\\runtime-cli.js exists in this repo.`,
        { cause: error },
      )
    })

    return new Promise<RuntimeEnvelope>((resolvePromise, rejectPromise) => {
      const child = spawn(config.nodePath, [config.cliPath, 'run', '--workspace', config.workspaceRoot], {
        cwd: config.workspaceRoot,
        stdio: ['pipe', 'pipe', 'pipe'],
      })

      let stdout = ''
      let stderr = ''
      let settled = false

      const finishReject = (error: Error) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeout)
        rejectPromise(error)
      }

      const finishResolve = (value: RuntimeEnvelope) => {
        if (settled) {
          return
        }
        settled = true
        clearTimeout(timeout)
        resolvePromise(value)
      }

      const safeKill = () => {
        if (!child.killed) {
          child.kill()
        }
      }

      const tryResolveFromStdout = (exitCode?: number | null): boolean => {
        const envelope = parseRuntimeEnvelopeOutput(stdout)
        if (!envelope) {
          return false
        }

        finishResolve(envelope)
        if (typeof exitCode !== 'number' && !child.killed) {
          safeKill()
        }

        return true
      }

      const timeout = setTimeout(() => {
        if (tryResolveFromStdout()) {
          return
        }

        safeKill()
        finishReject(
          new OptimusRuntimeError(
            'timeout',
            `Optimus runtime timed out after ${config.timeoutMs}ms before a valid runtime envelope could be recovered from CLI stdout. ${describeCapturedStreams(stdout, stderr)}`,
            {
              stderr: stderr.trim() || undefined,
              cause: stdout.trim() || undefined,
            },
          ),
        )
      }, config.timeoutMs + 5_000)

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString()
        tryResolveFromStdout()
      })

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      child.on('error', (error) => {
        finishReject(
          new OptimusRuntimeError(
            'process_error',
            `Failed to launch Optimus runtime CLI with ${config.nodePath}. ${error instanceof Error ? error.message : String(error)}`,
            { cause: error, stderr: stderr.trim() || undefined },
          ),
        )
      })

      child.on('close', (exitCode) => {
        if (tryResolveFromStdout(exitCode)) {
          return
        }

        const output = stdout.trim()
        if (!output) {
          finishReject(
            new OptimusRuntimeError(
              'empty_response',
              `Optimus runtime exited without JSON output (exit code ${exitCode ?? 'unknown'}). ${stderr.trim() || 'Check runtime stderr for details.'}`,
              { exitCode: exitCode ?? undefined, stderr: stderr.trim() || undefined },
            ),
          )
          return
        }

        finishReject(
          new OptimusRuntimeError(
            'invalid_json',
            `Optimus runtime returned stdout, but no valid runtime envelope JSON could be recovered (exit code ${exitCode ?? 'unknown'}). ${describeCapturedStreams(output, stderr)}`,
            { exitCode: exitCode ?? undefined, stderr: stderr.trim() || undefined, cause: output },
          ),
        )
      })

      child.stdin.write(JSON.stringify(request))
      child.stdin.end()
    })
  }
}

export function createRuntimeHttpRunner(config: RuntimeHttpRunnerConfig): RuntimeRequestRunner {
  const baseUrl = config.baseUrl.replace(/\/+$/u, '')

  return async (request) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs + 5_000)

    try {
      const response = await fetch(`${baseUrl}/api/v1/agent/run`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      })

      const rawBody = await response.text()
      if (!response.ok) {
        const details = formatRuntimeHttpError(response.status, response.statusText, rawBody)
        throw new OptimusRuntimeError(
          response.status === 404 || response.status === 405 || response.status >= 500 ? 'http_unavailable' : 'process_error',
          `Optimus runtime HTTP endpoint at ${baseUrl} returned ${details}.`,
          { status: String(response.status), cause: rawBody || undefined },
        )
      }

      if (!rawBody.trim()) {
        throw new OptimusRuntimeError(
          'empty_response',
          `Optimus runtime HTTP endpoint at ${baseUrl} returned an empty response.`,
        )
      }

      try {
        return runtimeEnvelopeSchema.parse(JSON.parse(rawBody) as RuntimeEnvelope)
      } catch (error) {
        throw new OptimusRuntimeError(
          'invalid_json',
          `Optimus runtime HTTP endpoint at ${baseUrl} returned invalid JSON. ${error instanceof Error ? error.message : String(error)}`,
          { cause: rawBody },
        )
      }
    } catch (error) {
      if (error instanceof OptimusRuntimeError) {
        throw error
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new OptimusRuntimeError(
          'timeout',
          `Optimus runtime HTTP request to ${baseUrl} timed out after ${config.timeoutMs}ms.`,
        )
      }

      throw new OptimusRuntimeError(
        'http_unavailable',
        `Failed to reach Optimus runtime HTTP server at ${baseUrl}. ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      )
    } finally {
      clearTimeout(timeout)
    }
  }
}

function formatRuntimeHttpError(status: number, statusText: string, rawBody: string): string {
  const bodyMessage = extractRuntimeHttpErrorMessage(rawBody)
  const statusSummary = [String(status), statusText.trim()].filter(Boolean).join(' ')
  return [statusSummary, bodyMessage].filter(Boolean).join(' ').trim()
}

function extractRuntimeHttpErrorMessage(rawBody: string): string | null {
  const trimmed = rawBody.trim()
  if (!trimmed) {
    return null
  }

  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    const message = [parsed.message, parsed.error, parsed.error_message].find(
      (value): value is string => typeof value === 'string' && value.trim().length > 0,
    )
    return message?.trim() ?? null
  } catch {
    return trimmed
  }
}

function parseDecision(result: unknown): NpcTurnDecision {
  try {
    const parsed = runtimeDecisionSchema.parse(normalizeRuntimeDecision(result))

    return {
      decision: parsed.decision,
      reply: parsed.reply?.trim() || undefined,
      reason: parsed.reason?.trim() || undefined,
    }
  } catch (error) {
    throw new OptimusRuntimeError(
      'invalid_result',
      `Optimus runtime returned an invalid NPC decision payload. ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    )
  }
}

export function parseRuntimeEnvelopeOutput(output: string): RuntimeEnvelope | null {
  const trimmed = output.trim()
  if (!trimmed) {
    return null
  }

  for (const jsonCandidate of extractJsonCandidates(trimmed)) {
    try {
      return runtimeEnvelopeSchema.parse(JSON.parse(jsonCandidate) as RuntimeEnvelope)
    } catch {
      // Keep scanning mixed stdout for the actual runtime envelope.
    }
  }

  return null
}

function normalizeRuntimeDecision(result: unknown): unknown {
  if (typeof result !== 'string') {
    return result
  }

  const trimmed = result.trim()
  if (!trimmed) {
    return result
  }

  const jsonCandidate = extractJsonCandidate(trimmed)
  if (jsonCandidate) {
    return JSON.parse(jsonCandidate) as unknown
  }

  return {
    decision: 'respond',
    reply: trimmed,
  }
}

function extractJsonCandidate(input: string): string | null {
  for (const candidate of extractJsonCandidates(input)) {
    try {
      JSON.parse(candidate)
      return candidate
    } catch {
      // Keep searching.
    }
  }

  return null
}

function extractJsonCandidates(input: string): string[] {
  const candidates = [input, input.replace(/^```(?:json)?\s*/iu, '').replace(/\s*```$/u, '')]
  const seen = new Set<string>()
  const jsonCandidates: string[] = []

  for (const candidate of candidates) {
    const normalized = candidate.trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    jsonCandidates.push(normalized)

    for (const objectSlice of extractBalancedObjects(normalized)) {
      const objectCandidate = objectSlice.trim()
      if (!objectCandidate || seen.has(objectCandidate)) {
        continue
      }

      seen.add(objectCandidate)
      jsonCandidates.push(objectCandidate)
    }
  }

  return jsonCandidates
}

function extractBalancedObjects(input: string): string[] {
  const objects: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let isEscaped = false

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]

    if (inString) {
      if (isEscaped) {
        isEscaped = false
        continue
      }
      if (char === '\\') {
        isEscaped = true
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === '{') {
      if (depth === 0) {
        start = index
      }
      depth += 1
      continue
    }

    if (char !== '}') {
      continue
    }

    if (depth === 0) {
      continue
    }

    depth -= 1
    if (depth === 0 && start >= 0) {
      objects.push(input.slice(start, index + 1))
      start = -1
    }
  }

  return objects
}

function describeCapturedStreams(stdout: string, stderr: string): string {
  const parts = [
    describeCapturedStream('stdout', stdout),
    describeCapturedStream('stderr', stderr),
  ]

  return parts.join(' ')
}

function describeCapturedStream(label: 'stdout' | 'stderr', output: string): string {
  const preview = formatCapturedOutputPreview(output)
  if (!preview) {
    return `No ${label} output was captured.`
  }

  return `${label} preview: ${preview}`
}

function formatCapturedOutputPreview(output: string): string | null {
  const normalized = output.replace(/\s+/gu, ' ').trim()
  if (!normalized) {
    return null
  }

  return normalized.length > 200 ? `${normalized.slice(0, 197)}...` : normalized
}

function buildNpcTurnInstructions(input: RunNpcTurnInput): string {
  return [
    `You are roleplaying ${input.npc.name}, an NPC in ${input.game.displayName}.`,
    `Character description: ${input.npc.description}`,
    `Character personality: ${input.npc.personality}`,
    `Scene: ${input.scene.name} — ${input.scene.description}`,
    '',
    'Decide whether this NPC should reply to the latest player message right now based on this NPC alone.',
    'Use "silent" when this NPC should hold back or has nothing useful to add right now.',
    'Do not wait for a single "best" speaker or assume another character should lead; each NPC decides independently whether to speak.',
    'Use "respond" only when this NPC should speak immediately in-character.',
    'If you respond, provide reply as the exact line to send in chat.',
    'If you respond, write reply in natural Simplified Chinese only—never in English—and keep the output schema unchanged.',
    'Keep replies concise, vivid, and directly usable without narration wrappers.',
    'Keep language broadcast-safe: no profanity, vulgar insults, slurs, or sexual obscenity.',
    'If the NPC is angry, express force through tone instead of swear words.',
    'Return only valid JSON that matches the provided output schema.',
  ].join('\n')
}

function toRuntimeError(envelope: RuntimeEnvelope, workspaceRoot: string): OptimusRuntimeError {
  const code = envelope.error_code ?? envelope.status
  const baseMessage = envelope.error_message ?? `Optimus runtime returned status "${envelope.status}".`

  switch (code) {
    case 'auth_failed':
      return new OptimusRuntimeError(
        code,
        `Optimus runtime authentication failed. Run 'gh auth login' for github-copilot or refresh the engine login, then retry. ${baseMessage}`,
        { status: envelope.status },
      )
    case 'engine_not_available':
      return new OptimusRuntimeError(
        code,
        `Optimus runtime engine is unavailable. Confirm the configured engine CLI is installed and accessible. ${baseMessage}`,
        { status: envelope.status },
      )
    case 'http_unavailable':
      return new OptimusRuntimeError(
        code,
        `Optimus runtime HTTP server is unavailable. Start or restore the HTTP runtime service, then retry. ${baseMessage}`,
        { status: envelope.status },
      )
    case 'workspace_not_initialized':
      return new OptimusRuntimeError(
        code,
        `Optimus runtime could not find a valid .optimus workspace at ${workspaceRoot}. Reinitialize the workspace before retrying. ${baseMessage}`,
        { status: envelope.status },
      )
    case 'blocked_manual_intervention':
      return new OptimusRuntimeError(
        code,
        `Optimus runtime needs manual intervention. ${envelope.action_required ?? baseMessage}`,
        { status: envelope.status },
      )
    case 'task_timeout':
      return new OptimusRuntimeError(
        'timeout',
        `Optimus runtime timed out waiting for the selected engine to produce activity. ${baseMessage}`,
        { status: envelope.status },
      )
    default:
      return new OptimusRuntimeError(code, `Optimus runtime failed (${code}). ${baseMessage}`, {
        status: envelope.status,
      })
  }
}

function isRetryableStateError(error: unknown): error is OptimusRuntimeError {
  if (!(error instanceof Error)) {
    return false
  }

  return (
    (error instanceof OptimusRuntimeError &&
      (error.code === 'run_not_found' ||
        error.code === 'task_not_found' ||
        isCorruptedContinuationError(error.message))) ||
    isCorruptedContinuationError(error.message)
  )
}

function isCorruptedContinuationError(message: string): boolean {
  return /Cannot read properties of undefined \(reading ['"]value['"]\)/u.test(message)
}

function shouldRetryFreshSession(error: unknown, session?: RuntimeSessionRef): boolean {
  if (!session?.agentId && !session?.sessionId) {
    return false
  }

  return isRetryableStateError(error) || isRetryableSessionResumeError(error)
}

function isRetryableSessionResumeError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    /Cannot read properties of undefined \(reading 'value'\)/u.test(error.message)
  )
}

function normalizeModelSequence(primaryModel: string, fallbackModels: string[] = []): string[] {
  return [primaryModel, ...fallbackModels].filter((model, index, items) => Boolean(model) && items.indexOf(model) === index)
}

function shouldFallbackModel(error: unknown): boolean {
  return !(
    error instanceof OptimusRuntimeError &&
    ['auth_failed', 'workspace_not_initialized', 'cli_not_found'].includes(error.code)
  )
}

function isHttpTransportError(error: unknown): error is OptimusRuntimeError {
  return (
    error instanceof OptimusRuntimeError &&
    (error.code === 'http_unavailable' || error.code === 'timeout')
  )
}
