const ACCESS_CODE_STORAGE_KEY = 'drama-mud-access-code'

function isBrowserReady() {
  return typeof window !== 'undefined'
}

export function getStoredAccessCode() {
  if (!isBrowserReady()) {
    return ''
  }

  return window.localStorage.getItem(ACCESS_CODE_STORAGE_KEY)?.trim() ?? ''
}

export function setStoredAccessCode(accessCode: string) {
  if (!isBrowserReady()) {
    return
  }

  window.localStorage.setItem(ACCESS_CODE_STORAGE_KEY, accessCode.trim())
}

export function clearStoredAccessCode() {
  if (!isBrowserReady()) {
    return
  }

  window.localStorage.removeItem(ACCESS_CODE_STORAGE_KEY)
}
