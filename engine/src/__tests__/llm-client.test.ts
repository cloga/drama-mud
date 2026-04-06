import { beforeEach, describe, expect, it, vi } from 'vitest'

const createCompletion = vi.fn()

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: createCompletion,
      },
    },
  })),
}))

import { createLlmClient } from '../llm/client.js'

describe('createLlmClient', () => {
  beforeEach(() => {
    createCompletion.mockReset()
  })

  it('defaults to gpt-5.4-mini and falls back to gpt-5.4 when mini fails', async () => {
    createCompletion
      .mockRejectedValueOnce(new Error('mini unavailable'))
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'fallback response' } }],
      })

    const client = createLlmClient({
      apiKey: 'test-key',
      fallbackModels: ['gpt-5.4'],
    })

    await expect(client.chat([])).resolves.toBe('fallback response')
    expect(createCompletion.mock.calls.map(([request]) => request.model)).toEqual(['gpt-5.4-mini', 'gpt-5.4'])
  })

  it('passes through a configured output token cap', async () => {
    createCompletion.mockResolvedValue({
      choices: [{ message: { content: 'capped response' } }],
    })

    const client = createLlmClient({
      apiKey: 'test-key',
      maxOutputTokens: 120,
    })

    await expect(client.chat([])).resolves.toBe('capped response')
    expect(createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        max_tokens: 120,
      }),
    )
  })
})
