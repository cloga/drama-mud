import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadDotenv } from 'dotenv'
import { DEFAULT_RUNTIME_HTTP_BASE_URL } from './runtime/optimus-runtime.js'

const defaultWorkspaceRoot = fileURLToPath(new URL('../..', import.meta.url))
loadDotenv({
  path: resolve(defaultWorkspaceRoot, '.env'),
  override: false,
})

export interface ServerConfig {
  port: number
  roomStorePath: string
  authEnabled: boolean
  accessCode: string
  npcBackend: 'agent-runtime' | 'llm'
  llmConfigured: boolean
  llmApiKey: string
  llmBaseUrl: string
  llmModel: string
  llmFallbackModels: string[]
  llmMaxOutputTokens: number
  workspaceRoot: string
  optimusRuntimeTransport: 'http' | 'cli'
  optimusRuntimeBaseUrl: string
  optimusRuntimeFallbackTransport?: 'cli'
  optimusRuntimeCliPath: string
  optimusRuntimeTimeoutMs: number
  optimusRuntimeRoleEngine?: string
  optimusRuntimeRoleModel?: string
  optimusRuntimeFallbackModels: string[]
  optimusRuntimeFallbackEngines: string[]
}

export function loadConfig(): ServerConfig {
  const workspaceRoot = process.env.OPTIMUS_WORKSPACE_ROOT ?? defaultWorkspaceRoot
  const accessCode = process.env.DRAMA_MUD_ACCESS_CODE?.trim() ?? ''
  const llmModel = readFirstEnv('LLM_MODEL', 'OPENAI_MODEL', 'MODEL_ID_SEED_1_6') ?? 'doubao-seed-1-6-flash-250828'
  const llmApiKey = readFirstEnv('OPENAI_API_KEY', 'VOLC_ARK_API_KEY') ?? ''
  const llmConfigured = Boolean(llmApiKey)
  const requestedNpcBackend = process.env.NPC_BACKEND === 'agent-runtime' ? 'agent-runtime' : 'llm'
  const optimusRuntimeRoleModel = process.env.OPTIMUS_RUNTIME_ROLE_MODEL?.trim() || 'gpt-5.4-mini'
  const optimusRuntimeFallbackEngines = (process.env.OPTIMUS_RUNTIME_FALLBACK_ENGINES ?? '')
    .split(',')
    .map((engine) => engine.trim())
    .filter(Boolean)
  const optimusRuntimeTransport: ServerConfig['optimusRuntimeTransport'] =
    process.env.OPTIMUS_RUNTIME_TRANSPORT === 'cli' ? 'cli' : 'http'
  const optimusRuntimeFallbackTransport: ServerConfig['optimusRuntimeFallbackTransport'] =
    process.env.OPTIMUS_RUNTIME_FALLBACK_TRANSPORT === 'cli' ? 'cli' : undefined
  const config: ServerConfig = {
    port: parseInt(process.env.PORT ?? '3001', 10),
    roomStorePath:
      process.env.ROOM_STORE_PATH?.trim() || resolve(workspaceRoot, 'server', '.runtime-data', 'rooms.json'),
    authEnabled: Boolean(accessCode),
    accessCode,
    npcBackend: requestedNpcBackend,
    llmConfigured,
    llmApiKey,
    llmBaseUrl: readFirstEnv('LLM_BASE_URL', 'OPENAI_BASE_URL', 'VOLC_ARK_BASE_URL') ?? 'https://api.openai.com/v1',
    llmModel,
    llmFallbackModels: parseModelFallbacks(process.env.LLM_FALLBACK_MODELS, llmModel),
    llmMaxOutputTokens: parsePositiveInt(process.env.LLM_MAX_OUTPUT_TOKENS, 160),
    workspaceRoot,
    optimusRuntimeTransport,
    optimusRuntimeBaseUrl: process.env.OPTIMUS_RUNTIME_BASE_URL?.trim() || DEFAULT_RUNTIME_HTTP_BASE_URL,
    optimusRuntimeFallbackTransport:
      optimusRuntimeTransport === 'http' ? optimusRuntimeFallbackTransport ?? 'cli' : undefined,
    optimusRuntimeCliPath:
      process.env.OPTIMUS_RUNTIME_CLI_PATH ??
      resolve(workspaceRoot, '.optimus', 'dist', 'runtime-cli.js'),
    optimusRuntimeTimeoutMs: parseInt(process.env.OPTIMUS_RUNTIME_TIMEOUT_MS ?? '180000', 10),
    optimusRuntimeRoleEngine: process.env.OPTIMUS_RUNTIME_ROLE_ENGINE?.trim() || 'github-copilot',
    optimusRuntimeRoleModel,
    optimusRuntimeFallbackModels: parseModelFallbacks(
      process.env.OPTIMUS_RUNTIME_FALLBACK_MODELS,
      optimusRuntimeRoleModel,
    ),
    optimusRuntimeFallbackEngines,
  }

  if (requestedNpcBackend === 'llm' && !config.llmConfigured) {
    console.warn('[config] No LLM API key is set. NPC responses will fail until the LLM is configured.')
  }

  return config
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function readFirstEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) {
      return value
    }
  }

  return undefined
}

function parseModelFallbacks(raw: string | undefined, primaryModel: string): string[] {
  const source =
    raw ??
    (primaryModel === 'doubao-seed-1-6-flash-250828'
      ? 'gpt-5.4-mini'
      : primaryModel === 'gpt-5.4-mini'
        ? 'gpt-5.4'
        : '')

  return source
    .split(',')
    .map((model) => model.trim())
    .filter((model, index, items) => Boolean(model) && model !== primaryModel && items.indexOf(model) === index)
}
