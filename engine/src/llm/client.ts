import OpenAI from 'openai'

export interface LlmClientConfig {
  apiKey: string
  baseURL?: string
  model?: string
  fallbackModels?: string[]
  maxOutputTokens?: number
}

export interface LlmClient {
  chat(messages: OpenAI.Chat.ChatCompletionMessageParam[]): Promise<string>
  chatStream(
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    onChunk: (chunk: string) => void,
  ): Promise<string>
}

/**
 * Create an OpenAI-compatible LLM client.
 * Works with OpenAI, Azure, local models, or any compatible provider.
 */
export function createLlmClient(config: LlmClientConfig): LlmClient {
  const apiKey = config.apiKey.trim()
  const openai = new OpenAI({
    apiKey,
    baseURL: config.baseURL,
  })

  const models = normalizeModels(config.model ?? 'gpt-5.4-mini', config.fallbackModels)
  const maxOutputTokens = normalizeMaxOutputTokens(config.maxOutputTokens)
  const ensureConfigured = () => {
    if (!apiKey) {
      throw new Error('Missing credentials: OPENAI_API_KEY is required.')
    }
  }

  return {
    async chat(messages) {
      ensureConfigured()
      return tryModels(models, async (model) => {
        const response = await openai.chat.completions.create({
          model,
          messages,
          ...(maxOutputTokens ? { max_tokens: maxOutputTokens } : {}),
        })
        return response.choices[0]?.message?.content ?? ''
      })
    },

    async chatStream(messages, onChunk) {
      ensureConfigured()
      return tryModels(models, async (model) => {
        const stream = await openai.chat.completions.create({
          model,
          messages,
          stream: true,
          ...(maxOutputTokens ? { max_tokens: maxOutputTokens } : {}),
        })

        let full = ''
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content ?? ''
          if (content) {
            onChunk(content)
            full += content
          }
        }
        return full
      })
    },
  }
}

async function tryModels<T>(models: string[], run: (model: string) => Promise<T>): Promise<T> {
  let lastError: unknown

  for (const [index, model] of models.entries()) {
    try {
      const result = await run(model)
      if (isUsableResult(result) || index === models.length - 1) {
        return result
      }
    } catch (error) {
      lastError = error
      if (index === models.length - 1 || !shouldFallbackModel(error)) {
        throw error
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('No model produced a usable response.')
}

function normalizeModels(primaryModel: string, fallbackModels: string[] = []): string[] {
  return [primaryModel, ...fallbackModels].filter((model, index, items) => Boolean(model) && items.indexOf(model) === index)
}

function normalizeMaxOutputTokens(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  const normalized = Math.trunc(value)
  return normalized > 0 ? normalized : undefined
}

function isUsableResult<T>(result: T): boolean {
  return typeof result !== 'string' || result.trim().length > 0
}

function shouldFallbackModel(error: unknown): boolean {
  const apiError = OpenAI.APIError
  if (!apiError || !(error instanceof apiError)) {
    return true
  }

  return error.status !== 401 && error.status !== 403
}
