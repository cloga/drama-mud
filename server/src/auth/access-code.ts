import type { IncomingHttpHeaders } from 'node:http'

export const ACCESS_CODE_HEADER = 'x-drama-access-code'
export const ACCESS_CODE_ERROR_MESSAGE = '访问码无效，请先输入访问码。'

export interface AccessCodeAuthConfig {
  authEnabled: boolean
  accessCode: string
}

export function normalizeAccessCode(value: unknown) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim()
}

export function resolveHeaderAccessCode(headers: IncomingHttpHeaders) {
  const headerValue = headers[ACCESS_CODE_HEADER]
  if (Array.isArray(headerValue)) {
    return normalizeAccessCode(headerValue[0])
  }

  return normalizeAccessCode(headerValue)
}

export function isAccessCodeAuthorized(candidate: unknown, config: AccessCodeAuthConfig) {
  if (!config.authEnabled) {
    return true
  }

  return normalizeAccessCode(candidate) === config.accessCode
}
