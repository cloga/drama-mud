import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../config.js'

describe('loadConfig', () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    vi.unstubAllEnvs()
    process.env = { ...originalEnv }
  })

  it('defaults the Optimus runtime to HTTP with CLI fallback enabled', () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.VOLC_ARK_API_KEY
    delete process.env.NPC_BACKEND
    delete process.env.LLM_MODEL
    delete process.env.OPENAI_MODEL
    delete process.env.MODEL_ID_SEED_1_6
    delete process.env.OPENAI_BASE_URL
    delete process.env.VOLC_ARK_BASE_URL
    delete process.env.LLM_BASE_URL
    delete process.env.BASE_URL
    delete process.env.LLM_FALLBACK_MODELS
    delete process.env.OPTIMUS_RUNTIME_TRANSPORT
    delete process.env.OPTIMUS_RUNTIME_BASE_URL
    delete process.env.OPTIMUS_RUNTIME_FALLBACK_TRANSPORT
    delete process.env.OPTIMUS_RUNTIME_ROLE_ENGINE
    delete process.env.OPTIMUS_RUNTIME_ROLE_MODEL
    delete process.env.OPTIMUS_RUNTIME_FALLBACK_MODELS
    delete process.env.OPTIMUS_RUNTIME_FALLBACK_ENGINES

    const config = loadConfig()

    expect(config.npcBackend).toBe('llm')
    expect(config.llmConfigured).toBe(false)
    expect(config.llmModel).toBe('doubao-seed-1-6-flash-250828')
    expect(config.llmFallbackModels).toEqual(['gpt-5.4-mini'])
    expect(config.llmMaxOutputTokens).toBe(160)
    expect(config.optimusRuntimeTransport).toBe('http')
    expect(config.optimusRuntimeBaseUrl).toBe('http://127.0.0.1:3100')
    expect(config.optimusRuntimeFallbackTransport).toBe('cli')
    expect(config.optimusRuntimeRoleEngine).toBe('github-copilot')
    expect(config.optimusRuntimeRoleModel).toBe('gpt-5.4-mini')
    expect(config.optimusRuntimeFallbackModels).toEqual(['gpt-5.4'])
    expect(config.optimusRuntimeFallbackEngines).toEqual([])
  })

  it('parses explicit runtime transport and engine overrides from env', () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.VOLC_ARK_API_KEY
    delete process.env.NPC_BACKEND
    delete process.env.OPENAI_BASE_URL
    delete process.env.VOLC_ARK_BASE_URL
    delete process.env.LLM_BASE_URL
    delete process.env.BASE_URL
    delete process.env.MODEL_ID_SEED_1_6
    process.env.LLM_MODEL = 'doubao-seed-1-6-flash-250828'
    process.env.LLM_FALLBACK_MODELS = 'gpt-5.4-mini'
    process.env.LLM_MAX_OUTPUT_TOKENS = '96'
    process.env.OPTIMUS_RUNTIME_TRANSPORT = 'cli'
    process.env.OPTIMUS_RUNTIME_BASE_URL = 'http://runtime.internal:3200'
    process.env.OPTIMUS_RUNTIME_FALLBACK_TRANSPORT = 'cli'
    process.env.OPTIMUS_RUNTIME_ROLE_ENGINE = 'claude-code'
    process.env.OPTIMUS_RUNTIME_ROLE_MODEL = 'claude-opus-4.6-1m'
    process.env.OPTIMUS_RUNTIME_FALLBACK_MODELS = 'gpt-5.4-mini, claude-opus-4.6-1m, gemini-2.5-pro'
    process.env.OPTIMUS_RUNTIME_FALLBACK_ENGINES = 'github-copilot, qwen-code ,,'

    const config = loadConfig()

    expect(config.npcBackend).toBe('llm')
    expect(config.llmConfigured).toBe(false)
    expect(config.llmModel).toBe('doubao-seed-1-6-flash-250828')
    expect(config.llmFallbackModels).toEqual(['gpt-5.4-mini'])
    expect(config.llmMaxOutputTokens).toBe(96)
    expect(config.optimusRuntimeTransport).toBe('cli')
    expect(config.optimusRuntimeBaseUrl).toBe('http://runtime.internal:3200')
    expect(config.optimusRuntimeFallbackTransport).toBeUndefined()
    expect(config.optimusRuntimeRoleEngine).toBe('claude-code')
    expect(config.optimusRuntimeRoleModel).toBe('claude-opus-4.6-1m')
    expect(config.optimusRuntimeFallbackModels).toEqual(['gpt-5.4-mini', 'gemini-2.5-pro'])
    expect(config.optimusRuntimeFallbackEngines).toEqual(['github-copilot', 'qwen-code'])
  })

  it('preserves llm backend when credentials are configured', () => {
    delete process.env.VOLC_ARK_API_KEY
    process.env.OPENAI_API_KEY = 'test-key'
    process.env.NPC_BACKEND = 'llm'

    const config = loadConfig()

    expect(config.npcBackend).toBe('llm')
    expect(config.llmConfigured).toBe(true)
  })

  it('accepts volcengine-style env aliases for the llm client', () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.OPENAI_BASE_URL
    delete process.env.OPENAI_MODEL
    delete process.env.LLM_BASE_URL
    delete process.env.LLM_MODEL
    delete process.env.BASE_URL
    process.env.VOLC_ARK_API_KEY = 'ark-key'
    process.env.VOLC_ARK_BASE_URL = 'https://ark.example.test/api/v3'
    process.env.MODEL_ID_SEED_1_6 = 'doubao-seed-alias'

    const config = loadConfig()

    expect(config.llmConfigured).toBe(true)
    expect(config.llmApiKey).toBe('ark-key')
    expect(config.llmBaseUrl).toBe('https://ark.example.test/api/v3')
    expect(config.llmModel).toBe('doubao-seed-alias')
  })

  it('ignores unrelated generic BASE_URL values for the llm client', () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.VOLC_ARK_API_KEY
    delete process.env.OPENAI_BASE_URL
    delete process.env.VOLC_ARK_BASE_URL
    delete process.env.LLM_BASE_URL
    process.env.BASE_URL = 'https://unrelated.example.test/audio/speech'

    const config = loadConfig()

    expect(config.llmBaseUrl).toBe('https://api.openai.com/v1')
  })

  it('keeps the requested backend even when credentials are missing', () => {
    delete process.env.OPENAI_API_KEY
    delete process.env.VOLC_ARK_API_KEY
    process.env.NPC_BACKEND = 'llm'

    const config = loadConfig()

    expect(config.npcBackend).toBe('llm')
    expect(config.llmConfigured).toBe(false)
  })
})
