import OpenAI from 'openai'

export interface LlmClientConfig {
  apiKey: string
  baseURL?: string
  model?: string
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
  const openai = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  })

  const model = config.model ?? 'gpt-4o'

  return {
    async chat(messages) {
      const response = await openai.chat.completions.create({
        model,
        messages,
      })
      return response.choices[0]?.message?.content ?? ''
    },

    async chatStream(messages, onChunk) {
      const stream = await openai.chat.completions.create({
        model,
        messages,
        stream: true,
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
    },
  }
}
