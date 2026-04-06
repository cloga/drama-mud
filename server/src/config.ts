import 'dotenv/config'

export interface ServerConfig {
  port: number
  llmApiKey: string
  llmBaseUrl: string
  llmModel: string
}

export function loadConfig(): ServerConfig {
  return {
    port: parseInt(process.env.PORT ?? '3001', 10),
    llmApiKey: process.env.OPENAI_API_KEY ?? '',
    llmBaseUrl: process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1',
    llmModel: process.env.LLM_MODEL ?? 'gpt-4o',
  }
}
