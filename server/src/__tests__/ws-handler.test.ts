import { describe, expect, it } from 'vitest'
import { formatWsError } from '../ws/handler.js'

describe('formatWsError', () => {
  it('maps runtime endpoint errors to the HTTP unavailable diagnosis', () => {
    expect(formatWsError(new Error('Cannot POST /api/v1/agent/run'))).toBe(
      'Optimus runtime HTTP 服务不可用，请确认 http-runtime 已启动并监听正确端口。',
    )
    expect(formatWsError({ code: 'route_not_found' })).toBe(
      'Optimus runtime HTTP 服务不可用，请确认 http-runtime 已启动并监听正确端口。',
    )
  })

  it('keeps model 404 errors mapped to the model diagnosis', () => {
    expect(
      formatWsError({
        status: 404,
        message: 'The model gpt-5.4 does not exist',
      }),
    ).toBe('LLM 模型不可用，请检查 LLM_MODEL 配置。')
  })

  it('keeps generic 404s on the LLM side instead of misclassifying them as runtime failures', () => {
    expect(
      formatWsError({
        status: 404,
        message: 'Resource not found',
      }),
    ).toBe('LLM 服务返回 404，请检查 OPENAI_BASE_URL 或供应商兼容接口路径配置。')
    expect(
      formatWsError({
        status: 404,
        message: 'Not Found',
      }),
    ).toBe('LLM 服务返回 404，请检查 OPENAI_BASE_URL 或供应商兼容接口路径配置。')
  })
})
